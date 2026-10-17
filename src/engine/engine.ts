import type {
  AebStage,
  Action,
  Level,
  Side,
  SimState,
  Target,
  TargetKind,
} from "./types";

/**
 * Motor de regras do simulador.
 *
 * Os números abaixo (velocidades mínimas e máximas de cada assistente) vêm do
 * manual do proprietário e são fatos técnicos. Os tempos de reação do AEB e a
 * física do carro são APENAS ILUSTRATIVOS: o manual não os informa.
 */
export const LIMITS = {
  accMin: 30,
  accMax: 150,
  accPresetFromStop: 30,
  accArmSeconds: 3,
  limitMin: 20,
  limitMax: 200,
  limitDefault: 20,
  ldwOn: 65,
  ldwOff: 60,
  bsdOn: 15,
  bsdOff: 10,
  ihcOn: 40,
  ihcOff: 30,
  avmOpen: 20,
  avmClose: 30,
  fcwMinSpeed: 30,
  fcwStaticMaxSpeed: 85,
  aebMin: 4,
  aebStaticMax: 53,
  aebMovingMax: 80,
  aebPedestrianMax: 64,
} as const;

/** Tempo até o impacto (s) em que cada etapa começa. ILUSTRATIVO. */
const TTC_BASE = { warn: 2.6, partial: 1.9, emergency: 1.2 };
const SENSITIVITY = { low: 0.8, standard: 1, high: 1.25 } as const;
/** Distância de seguimento do ACC em segundos. ILUSTRATIVO. */
const GAP_SECONDS = [1.0, 1.6, 2.3] as const;

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function createInitialState(hasMaxDrive = true): SimState {
  return {
    hasMaxDrive,
    ignitionOn: false,
    speed: 0,
    gear: "P",
    esp: true,
    seatbelt: true,
    doorClosed: true,
    parkingBrake: true,
    hdc: false,
    brake: false,
    accel: 0,
    absActive: false,
    evasiveSteer: false,
    turnSignal: "none",
    hazard: false,
    lightAuto: true,
    ihcRequested: false,
    ihcActive: false,
    roadLit: false,
    oncoming: false,
    settings: {
      bsd: true,
      fdm: true,
      aeb: true,
      fcwSensitivity: "standard",
      ihc: true,
      avmOnSignal: true,
      avmOnSteer: true,
    },
    faults: { acc: false, aeb: false, ldw: false, bsd: false, ihc: false },
    acc: { mode: "off", setSpeed: 80, gap: 2, arm: 0 },
    limit: { mode: "off", value: LIMITS.limitDefault },
    ldw: "off",
    laneDeparture: false,
    bsd: "off",
    blind: { left: false, right: false },
    cross: { left: false, right: false },
    avmManual: false,
    avmOn: false,
    target: { kind: "none", distance: 80, speed: 40 },
    aeb: "idle",
    aebStopped: false,
    collided: false,
    clock: 0,
  };
}

/* ------------------------------------------------------------------ */
/* Regras de leitura (sem efeitos colaterais)                          */
/* ------------------------------------------------------------------ */

/** Os assistentes só funcionam na versão Max Drive, com o carro ligado e o ESP ativo. */
export function adasOperational(s: SimState): boolean {
  return s.hasMaxDrive && s.ignitionOn && s.esp;
}

export type AccConditionId = "brake" | "door" | "belt" | "gear" | "parking" | "hdc" | "esp" | "abs";

export function accConditions(s: SimState): { id: AccConditionId; ok: boolean }[] {
  return [
    { id: "brake", ok: !s.brake },
    { id: "door", ok: s.doorClosed },
    { id: "belt", ok: s.seatbelt },
    { id: "gear", ok: s.gear === "D" },
    { id: "parking", ok: !s.parkingBrake },
    { id: "hdc", ok: !s.hdc },
    { id: "esp", ok: s.esp },
    { id: "abs", ok: !s.absActive },
  ];
}

export function accReady(s: SimState): boolean {
  return adasOperational(s) && !s.faults.acc && accConditions(s).every((c) => c.ok);
}

/** Distância de seguimento desejada, em metros. */
export function desiredGapMeters(s: SimState): number {
  return (s.speed / 3.6) * GAP_SECONDS[s.acc.gap - 1] + 5;
}

function hysteresis(prev: Level, speed: number, on: number, off: number): Level {
  if (speed >= on) return "active";
  if (prev !== "off" && speed >= off) return "standby";
  return "off";
}

function closingSpeedMs(s: SimState): number {
  const t = s.target;
  if (t.kind === "none") return 0;
  if (t.kind === "movingVehicle") return (s.speed - t.speed) / 3.6;
  return s.speed / 3.6;
}

function aebRangeMax(kind: TargetKind): number {
  switch (kind) {
    case "staticVehicle":
      return LIMITS.aebStaticMax;
    case "movingVehicle":
      return LIMITS.aebMovingMax;
    case "pedestrian":
      return LIMITS.aebPedestrianMax;
    default:
      return 0;
  }
}

export interface AebAssessment {
  stage: AebStage;
  /** O alarme do FCW pode soar nesta velocidade? */
  fcwInRange: boolean;
  /** O AEB pode frear nesta velocidade? */
  aebInRange: boolean;
  /** O motorista cancelou a frenagem (volante brusco ou acelerador a fundo)? */
  cancelledByDriver: boolean;
  ttc: number;
}

export function assessAeb(s: SimState): AebAssessment {
  const none: AebAssessment = {
    stage: "idle",
    fcwInRange: false,
    aebInRange: false,
    cancelledByDriver: false,
    ttc: Infinity,
  };
  const t = s.target;
  if (!adasOperational(s) || !s.settings.aeb || s.faults.aeb || t.kind === "none") return none;
  if (!s.seatbelt || !s.doorClosed) return none;

  const closing = closingSpeedMs(s);
  if (closing <= 0.3) return none;
  const ttc = t.distance / closing;

  const fcwInRange =
    s.speed >= LIMITS.fcwMinSpeed &&
    (t.kind !== "staticVehicle" || s.speed <= LIMITS.fcwStaticMaxSpeed);
  const aebInRange = s.speed >= LIMITS.aebMin && s.speed <= aebRangeMax(t.kind);

  const k = SENSITIVITY[s.settings.fcwSensitivity];
  let stage: AebStage = "idle";
  if (fcwInRange && ttc < TTC_BASE.warn * k) stage = "warn";
  if (aebInRange && ttc < TTC_BASE.partial * k) stage = "partial";
  if (aebInRange && ttc < TTC_BASE.emergency * k) stage = "emergency";

  const cancelledByDriver = s.accel === 2 || s.evasiveSteer;
  if (cancelledByDriver && (stage === "partial" || stage === "emergency")) {
    stage = fcwInRange ? "warn" : "idle";
  }
  return { stage, fcwInRange, aebInRange, cancelledByDriver, ttc };
}

export type MessageId =
  | "takeover"
  | "accTapAccelerator"
  | "accTargetLost"
  | "aebWarn"
  | "aebActing"
  | "aebStopped"
  | "collided"
  | "espOff"
  | "ldwWarn"
  | "fdmWarn"
  | "limitOverride"
  | "needMaxDrive";

export interface Derived {
  operational: boolean;
  conditions: ReturnType<typeof accConditions>;
  accReady: boolean;
  following: boolean;
  highBeam: boolean;
  bsdWarn: Record<Side, 0 | 1 | 2>;
  rctaWarn: Record<Side, boolean>;
  ldwWarn: boolean;
  fdmWarn: boolean;
  gapMeters: number;
  messages: MessageId[];
}

export function evaluate(s: SimState): Derived {
  const operational = adasOperational(s);
  const conditions = accConditions(s);
  const ready = accReady(s);
  const following =
    operational && s.acc.mode === "active" && s.target.kind === "movingVehicle" && s.target.distance < 150;

  const highBeam =
    s.ignitionOn &&
    s.lightAuto &&
    s.ihcRequested &&
    s.settings.ihc &&
    !s.faults.ihc &&
    s.hasMaxDrive &&
    s.ihcActive &&
    !s.roadLit &&
    !s.oncoming &&
    s.turnSignal === "none";

  const bsdWarn: Record<Side, 0 | 1 | 2> = { left: 0, right: 0 };
  if (operational && s.bsd === "active") {
    (["left", "right"] as const).forEach((side) => {
      if (s.blind[side]) bsdWarn[side] = s.turnSignal === side ? 2 : 1;
    });
  }
  const rctaWarn: Record<Side, boolean> = { left: false, right: false };
  if (operational && s.settings.bsd && !s.faults.bsd && s.gear === "R") {
    rctaWarn.left = s.cross.left;
    rctaWarn.right = s.cross.right;
  }

  const ldwWarn =
    operational && s.ldw === "active" && s.laneDeparture && s.turnSignal === "none" && !s.hazard;

  const t = s.target;
  const timeGap =
    s.speed > 5 && (t.kind === "movingVehicle" || t.kind === "staticVehicle")
      ? t.distance / (s.speed / 3.6)
      : Infinity;
  const fdmWarn = operational && s.settings.fdm && timeGap < 1.0;

  const aeb = assessAeb(s);
  const messages: MessageId[] = [];
  if (!s.hasMaxDrive) messages.push("needMaxDrive");
  if (s.ignitionOn && s.hasMaxDrive && !s.esp) messages.push("espOff");
  if (s.collided) messages.push("collided");
  else if (s.aeb === "partial" || s.aeb === "emergency") messages.push("aebActing");
  else if (aeb.stage === "warn") messages.push("aebWarn");
  if (s.aebStopped && s.speed === 0 && !s.collided) messages.push("aebStopped");
  if (ldwWarn) messages.push("ldwWarn");
  if (fdmWarn && aeb.stage === "idle") messages.push("fdmWarn");
  if (
    operational &&
    s.acc.mode === "active" &&
    s.accel > 0 &&
    t.kind === "movingVehicle" &&
    t.distance < desiredGapMeters(s) * 0.7
  ) {
    messages.push("takeover");
  }
  if (s.acc.arm < 0) messages.push("accTapAccelerator");
  if (operational && s.acc.mode === "active" && t.kind !== "movingVehicle" && t.kind !== "none" && t.distance < 60)
    messages.push("accTargetLost");
  if (s.limit.mode === "active" && s.accel === 2 && s.speed > s.limit.value) messages.push("limitOverride");

  return {
    operational,
    conditions,
    accReady: ready,
    following,
    highBeam,
    bsdWarn,
    rctaWarn,
    ldwWarn,
    fdmWarn,
    gapMeters: desiredGapMeters(s),
    messages,
  };
}

/* ------------------------------------------------------------------ */
/* Transições                                                          */
/* ------------------------------------------------------------------ */

function suspendAcc(s: SimState): SimState {
  if (s.acc.mode !== "active") return s;
  return { ...s, acc: { ...s.acc, mode: "suspended", arm: 0 } };
}

function withAcc(s: SimState, patch: Partial<SimState["acc"]>): SimState {
  return { ...s, acc: { ...s.acc, ...patch } };
}

function setButton(s: SimState, long: boolean): SimState {
  if (!adasOperational(s)) return s;
  if (s.limit.mode !== "off") {
    if (s.limit.mode === "standby") {
      if (s.speed < LIMITS.fcwMinSpeed) return { ...s, limit: { mode: "active", value: LIMITS.limitDefault } };
      if (s.speed >= LIMITS.limitMin && s.speed <= LIMITS.limitMax)
        return { ...s, limit: { mode: "active", value: Math.round(s.speed) } };
      return s;
    }
    return {
      ...s,
      limit: { ...s.limit, value: clamp(s.limit.value - (long ? 5 : 1), LIMITS.limitMin, LIMITS.limitMax) },
    };
  }
  if (s.faults.acc) return s;
  if (s.acc.mode === "active") {
    const step = long ? (s.acc.setSpeed > 80 ? 10 : 5) : 1;
    return withAcc(s, { setSpeed: clamp(s.acc.setSpeed - step, LIMITS.accMin, LIMITS.accMax) });
  }
  if (s.acc.mode === "standby" || s.acc.mode === "suspended") {
    if (!accConditions(s).every((c) => c.ok)) return s;
    if (s.speed >= LIMITS.accMin && s.speed <= LIMITS.accMax)
      return withAcc(s, { mode: "active", setSpeed: Math.round(s.speed), arm: 0 });
  }
  return s;
}

function resButton(s: SimState, long: boolean): SimState {
  if (!adasOperational(s)) return s;
  if (s.limit.mode === "active") {
    return {
      ...s,
      limit: { ...s.limit, value: clamp(s.limit.value + (long ? 5 : 1), LIMITS.limitMin, LIMITS.limitMax) },
    };
  }
  if (s.limit.mode !== "off" || s.faults.acc) return s;
  if (s.acc.mode === "active") {
    const step = long ? (s.acc.setSpeed >= 80 ? 10 : 5) : 1;
    return withAcc(s, { setSpeed: clamp(s.acc.setSpeed + step, LIMITS.accMin, LIMITS.accMax) });
  }
  if (s.acc.mode === "suspended" && accConditions(s).every((c) => c.ok)) {
    return withAcc(s, { mode: "active", arm: 0 });
  }
  return s;
}

export function reduce(s: SimState, a: Action): SimState {
  switch (a.type) {
    case "tick":
      return tick(s, a.dt);
    case "set":
      return { ...s, [a.key]: a.value } as SimState;
    case "setting":
      return { ...s, settings: { ...s.settings, [a.key]: a.value } };
    case "fault":
      return { ...s, faults: { ...s.faults, [a.key]: a.value } };
    case "ignition": {
      if (s.ignitionOn) {
        if (s.speed > 1) return s;
        return {
          ...s,
          ignitionOn: false,
          acc: { ...s.acc, mode: "off", arm: 0 },
          limit: { ...s.limit, mode: "off" },
          ihcRequested: false,
          ihcActive: false,
          ldw: "off",
          bsd: "off",
          avmOn: false,
          avmManual: false,
          aeb: "idle",
        };
      }
      return { ...s, ignitionOn: true };
    }
    case "gear":
      if ((a.gear === "P" || a.gear === "R") && s.speed > 3) return s;
      return { ...s, gear: a.gear };
    case "brake": {
      const next = { ...s, brake: a.down };
      return a.down ? suspendAcc({ ...next, aebStopped: false }) : next;
    }
    case "accel":
      return { ...s, accel: a.level };
    case "accPower": {
      if (!adasOperational(s) || s.faults.acc) return s;
      if (s.acc.mode !== "off") return withAcc(s, { mode: "off", arm: 0 });
      return { ...withAcc(s, { mode: "standby", arm: 0 }), limit: { ...s.limit, mode: "off" } };
    }
    case "setButton":
      return setButton(s, a.long);
    case "resButton":
      return resButton(s, a.long);
    case "accSetFromStop": {
      if (!adasOperational(s) || s.faults.acc || s.acc.mode === "off" || s.limit.mode !== "off") return s;
      const othersOk = accConditions(s).every((c) => c.id === "brake" || c.ok);
      if (s.speed === 0 && s.brake && othersOk) return withAcc(s, { arm: LIMITS.accArmSeconds });
      return s;
    }
    case "accCancel":
      return suspendAcc(s);
    case "accGap":
      return withAcc(s, { gap: (s.acc.gap === 3 ? 1 : s.acc.gap + 1) as 1 | 2 | 3 });
    case "limitToggle": {
      if (!adasOperational(s)) return s;
      if (s.limit.mode !== "off") return { ...s, limit: { ...s.limit, mode: "off" } };
      return { ...s, limit: { mode: "standby", value: LIMITS.limitDefault }, acc: { ...s.acc, mode: "off", arm: 0 } };
    }
    case "ihcPush":
      return s.lightAuto ? { ...s, ihcRequested: true } : s;
    case "ihcPull":
      return { ...s, ihcRequested: !s.ihcRequested };
    case "turn":
      return { ...s, turnSignal: s.turnSignal === a.side ? "none" : a.side };
    case "avmButton":
      return { ...s, avmManual: !s.avmManual };
    case "target": {
      const target: Target = { ...s.target, ...a.target };
      return { ...s, target, collided: false };
    }
    case "resetTarget":
      return {
        ...s,
        target: { kind: "none", distance: 80, speed: 40 },
        collided: false,
        aebStopped: false,
        aeb: "idle",
      };
    case "variant":
      return createInitialState(a.hasMaxDrive);
    case "reset":
      return createInitialState(s.hasMaxDrive);
    default:
      return s;
  }
}

/* ------------------------------------------------------------------ */
/* Passo de simulação                                                  */
/* ------------------------------------------------------------------ */

function tick(prev: SimState, dt: number): SimState {
  let s: SimState = { ...prev, clock: prev.clock + dt };

  if (!s.ignitionOn) {
    return { ...s, speed: Math.max(0, s.speed - 4 * dt), accel: 0 };
  }

  const operational = adasOperational(s);

  // Estados que dependem da velocidade (com histerese).
  s.ldw = operational && !s.faults.ldw ? hysteresis(prev.ldw, s.speed, LIMITS.ldwOn, LIMITS.ldwOff) : "off";
  s.bsd =
    operational && s.settings.bsd && !s.faults.bsd
      ? hysteresis(prev.bsd, s.speed, LIMITS.bsdOn, LIMITS.bsdOff)
      : "off";

  if (s.speed > LIMITS.ihcOn) s.ihcActive = true;
  else if (s.speed < LIMITS.ihcOff) s.ihcActive = false;

  // Câmera 360°: abre abaixo de 20 km/h, fecha acima de 30 km/h.
  const wantsAvm =
    s.avmManual ||
    s.gear === "R" ||
    (s.settings.avmOnSignal && s.turnSignal !== "none") ||
    (s.settings.avmOnSteer && s.evasiveSteer);
  if (s.speed > LIMITS.avmClose) s.avmOn = false;
  else if (s.speed < LIMITS.avmOpen && wantsAvm) s.avmOn = true;
  else if (!wantsAvm && s.gear !== "R") s.avmOn = s.avmOn && s.avmManual;

  // ACC: armado a partir do repouso (soltar o freio em até 3 s).
  if (s.acc.arm > 0) {
    if (!s.brake) {
      s = withAcc(s, { mode: "active", setSpeed: LIMITS.accPresetFromStop, arm: 0 });
    } else {
      const left = s.acc.arm - dt;
      s = withAcc(s, { arm: left <= 0 ? -1 : left });
    }
  } else if (s.acc.arm < 0 && !s.brake && s.accel > 0 && accConditions(s).every((c) => c.ok)) {
    s = withAcc(s, { mode: "active", setSpeed: LIMITS.accPresetFromStop, arm: 0 });
  } else if (s.acc.arm < 0 && s.acc.mode === "off") {
    s = withAcc(s, { arm: 0 });
  }

  // Condições que derrubam o ACC.
  if (s.acc.mode === "active") {
    const broken =
      !operational || s.faults.acc || s.brake || !accConditions(s).every((c) => c.ok);
    if (broken) s = suspendAcc(s);
  }
  if (s.limit.mode !== "off" && !operational) s = { ...s, limit: { ...s.limit, mode: "off" } };

  // AEB
  const aeb = assessAeb(s);
  s.aeb = aeb.stage;
  if (aeb.stage === "partial" || aeb.stage === "emergency") s = suspendAcc(s);

  // Aceleração (km/h por segundo) — modelo ILUSTRATIVO.
  const driveable = s.gear === "D" || s.gear === "R";
  let accelRate = -1.5;
  if (aeb.stage === "emergency") accelRate = -90;
  else if (aeb.stage === "partial") accelRate = -35;
  else if (s.brake) accelRate = -15;
  else if (s.accel > 0 && driveable) accelRate = s.accel === 2 ? 14 : 8;
  else if (s.acc.mode === "active") accelRate = accControl(s);
  else if (!driveable) accelRate = -3;

  let speed = clamp(s.speed + accelRate * dt, 0, s.gear === "R" ? 15 : 200);
  if (s.limit.mode === "active" && s.accel < 2 && speed > s.limit.value) speed = Math.max(s.limit.value, s.speed - 6 * dt);
  if (s.parkingBrake && s.speed <= 1 && s.accel === 0) speed = 0;

  // Alvo à frente.
  const t = s.target;
  let distance = t.distance;
  if (t.kind === "movingVehicle") distance += ((t.speed - speed) / 3.6) * dt;
  else if (t.kind === "staticVehicle" || t.kind === "pedestrian") distance -= (speed / 3.6) * dt;
  let collided = s.collided;
  if (t.kind !== "none" && distance <= 0.5 && closingSpeedMs({ ...s, speed }) > 0) {
    collided = true;
    speed = 0;
    distance = 0.5;
  }
  if (t.kind !== "none") distance = clamp(distance, 0.5, 400);

  // "aebStopped" fica ligado depois que o AEB freou, até o motorista agir.
  const aebActing = aeb.stage === "partial" || aeb.stage === "emergency";
  const aebStopped = aebActing || (s.aebStopped && !s.brake && s.accel === 0);

  return {
    ...s,
    speed,
    target: { ...t, distance },
    collided,
    aebStopped,
  };
}

function accControl(s: SimState): number {
  let targetSpeed = s.acc.setSpeed;
  const t = s.target;
  if (t.kind === "movingVehicle") {
    const gap = desiredGapMeters(s);
    if (t.distance < gap * 3) {
      const follow = t.speed + (t.distance - gap) * 0.4;
      targetSpeed = Math.min(targetSpeed, Math.max(0, follow));
    }
  }
  return clamp((targetSpeed - s.speed) * 1.2, -10, 6);
}

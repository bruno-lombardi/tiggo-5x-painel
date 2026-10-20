import { GEO, SERRA_LENGTH, SERRA_VILLAGE_END, SERRA_VILLAGE_START, laneX, roadAt } from "./route";
import type { WorldId } from "./route";
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

export function createInitialState(hasMaxDrive = true, world: WorldId = "highway"): SimState {
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
    night: false,
    lateral: 0,
    steer: 0,
    odo: 6673,
    trip: { km: 0, seconds: 0, liters: 0 },
    world,
    route: { s: 0, finished: false },
    throttle: 0,
    brakeP: 0,
    ax: 0,
    ay: 0,
    slip: 0,
    espActive: false,
    crashKind: "none",
    crashT: 0,
    oncomingList: [],
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

export const LANE_WIDTH = 3.5;
const MAX_LATERAL = 3.9;

/** Largura da faixa no mundo atual. */
export const laneWidth = (s: SimState) => GEO[s.world].lane;

/** O alvo está na trajetória do carro? (a menos de ~2 m do centro da sua faixa) */
export function inPath(s: SimState): boolean {
  const t = s.target;
  if (t.kind === "none" || t.distance < -2) return false;
  return Math.abs(s.lateral - laneX(s.world, t.lane ?? 0)) < 2.0;
}

/** Alvo que os sensores frontais consideram: só o que está na trajetória. */
export function pathTarget(s: SimState): SimState["target"] {
  return inPath(s) ? s.target : { ...s.target, kind: "none" };
}

function closingSpeedMs(s: SimState): number {
  const t = pathTarget(s);
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
  const t = pathTarget(s);
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
  /** valores ILUSTRATIVOS para o painel */
  rpm: number;
  fuelLevel: number;
  rangeKm: number;
  tripAvgSpeed: number;
  tripKmPerLiter: number;
}

const TANK_LITERS = 48;
const START_FUEL = 0.62;

/** Rotação aproximada. ILUSTRATIVA: o manual não informa a relação de marchas do CVT. */
export function estimateRpm(s: SimState): number {
  if (!s.ignitionOn) return 0;
  const base = 800;
  const load = s.accel === 2 ? 1.5 : s.accel === 1 ? 1.15 : 1;
  const driveable = s.gear === "D" || s.gear === "R";
  const fromSpeed = driveable ? s.speed * 22 * load : 0;
  const rev = s.accel > 0 && !driveable ? 2200 : 0;
  return Math.min(7200, base + fromSpeed + rev);
}

export function evaluate(s: SimState): Derived {
  const operational = adasOperational(s);
  const conditions = accConditions(s);
  const ready = accReady(s);
  const following =
    operational && s.acc.mode === "active" && pathTarget(s).kind === "movingVehicle" && s.target.distance < 150;

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

  const t = pathTarget(s);
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

  const fuelLevel = clamp(START_FUEL - s.trip.liters / TANK_LITERS, 0, 1);
  const kmPerLiter = s.trip.liters > 0.01 ? s.trip.km / s.trip.liters : 0;
  const rangeKm = Math.round(fuelLevel * TANK_LITERS * (kmPerLiter > 3 ? kmPerLiter : 11));
  const hours = s.trip.seconds / 3600;
  return {
    rpm: estimateRpm(s),
    fuelLevel,
    rangeKm,
    tripAvgSpeed: hours > 0.0005 ? s.trip.km / hours : 0,
    tripKmPerLiter: kmPerLiter,
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
      return createInitialState(a.hasMaxDrive, s.world);
    case "newGame":
    {
      const g = createInitialState(a.hasMaxDrive, a.world);
      return { ...g, night: a.night, route: { ...g.route, s: a.at ?? 0 } };
    }
    case "load":
      return a.state;
    case "steer":
      return { ...s, steer: a.dir, evasiveSteer: a.dir !== 0 && s.speed > 1 };
    case "clearTarget":
      return {
        ...s,
        target: { kind: "none", distance: 80, speed: 40 },
        collided: false,
        aebStopped: false,
        aeb: "idle",
      };
    case "tripReset":
      return { ...s, trip: { km: 0, seconds: 0, liters: 0 } };
    case "reset":
      return createInitialState(s.hasMaxDrive, s.world);
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
    const sp = Math.max(0, s.speed - 4 * dt);
    return { ...s, speed: sp, accel: 0, throttle: 0, brakeP: 0, route: { ...s.route, s: s.route.s + (sp / 3.6) * dt } };
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
  let aeb = assessAeb(s);
  // Depois que o AEB começa a frear, ele segue até parar (ou até o motorista assumir).
  const wasActing = prev.aeb === "partial" || prev.aeb === "emergency";
  if (wasActing && aeb.stage !== "partial" && aeb.stage !== "emergency") {
    const driverTook = s.brake || aeb.cancelledByDriver || s.accel > 0;
    if (!driverTook && pathTarget(s).kind !== "none" && s.speed > 0.5 && adasOperational(s)) aeb = { ...aeb, stage: prev.aeb };
  }
  s.aeb = aeb.stage;
  if (aeb.stage === "partial" || aeb.stage === "emergency") s = suspendAcc(s);

  /* ---------------- Física (valores ILUSTRATIVOS) ---------------- */
  const geo = GEO[s.world];
  const road = roadAt(s.world, s.route.s);
  const v0 = s.speed / 3.6;
  const driveable = s.gear === "D" || s.gear === "R";
  const aebStage = aeb.stage;

  // Pedais com inércia: o pé não vai de 0 a 100% instantaneamente.
  const driverThrottle = s.accel === 2 ? 1 : s.accel === 1 ? 0.5 : 0;
  const approach = (cur: number, target: number, rate: number) =>
    cur < target ? Math.min(target, cur + rate * dt) : Math.max(target, cur - rate * dt);
  const throttle = approach(s.throttle, driveable ? driverThrottle : s.accel > 0 ? 0.25 : 0, driverThrottle > s.throttle ? 3.2 : 7);
  const brakeTarget = aebStage === "emergency" ? 1 : aebStage === "partial" ? 0.55 : s.brake ? 1 : 0;
  const brakeP = approach(s.brakeP, brakeTarget, brakeTarget > s.brakeP ? (aebStage === "emergency" ? 14 : 6) : 9);

  // Forças longitudinais.
  const driving = driveable && s.gear === "D" ? 1 : 0.7;
  const fAvail = Math.min(PH.fMax * driving, (PH.power * driving) / Math.max(v0, 3));
  const resistance = 0.5 * PH.rho * PH.cdA * v0 * v0 + PH.crr * PH.mass * PH.g;
  const slope = s.gear === "R" ? 0 : road.grade * PH.mass * PH.g;
  let a = 0;
  let driverOn = throttle > 0.02;
  if (driverOn && driveable) {
    a = (throttle * fAvail - resistance - slope) / PH.mass;
  } else if (!s.brake && s.acc.mode === "active" && aebStage === "idle" && driveable) {
    // O ACC pede uma aceleração; o motor entrega só o que a potência e a ladeira permitem.
    const want = accControl(s) / 3.6;
    const avail = (fAvail - resistance - slope) / PH.mass;
    a = Math.min(want, avail);
    if (want < 0) a = want;
    driverOn = true;
  } else {
    // Sem acelerador: resistência, freio-motor e (em D) o "arrasto" de marcha lenta do câmbio.
    const eb = driveable && v0 > 1 ? 0.5 * smoothstep(1, 6, v0) : 0;
    a = -(resistance * (v0 > 0.05 ? 1 : 0)) / PH.mass - eb - slope / PH.mass;
    if (s.gear === "D" && !s.parkingBrake && brakeP < 0.05 && v0 < 1.8) a += 1.0 * (1 - v0 / 1.8) - (v0 < 0.05 ? 0 : 0);
    if (s.gear === "R" && !s.parkingBrake && brakeP < 0.05 && v0 < 1.2) a += 0.9 * (1 - v0 / 1.2);
    if (s.gear === "P") a = -3;
  }
  // Freios (o limite é a aderência do pneu; o ABS segura o carro na borda dela).
  const gripNow = PH.brakeMax * (s.world === "serra" && s.night ? 0.96 : 1);
  a -= brakeP * gripNow;
  if (s.parkingBrake && s.speed > 1) a -= 2.8;
  // HDC: segura o carro em descidas fortes (Hill Descent Control).
  if (s.hdc && road.grade < -0.03 && !driverOn && brakeP < 0.05 && v0 > 2.6) a -= Math.min(3, (v0 - 2.6) * 1.6);

  // Curva: aceleração lateral necessária e o limite de aderência (círculo de atrito).
  const kappa = road.kappa;
  const ayReq = v0 * v0 * kappa; // + = curva à esquerda
  const aLimit = Math.sqrt(Math.max(0.6, PH.latLimit * PH.latLimit - (a * 0.85) * (a * 0.85)));
  const excess = Math.max(0, Math.abs(ayReq) - aLimit);
  let espActive = false;
  if (s.esp && s.ignitionOn && Math.abs(ayReq) > aLimit * 0.82 && s.speed > 25) {
    espActive = true;
    a -= Math.min(3.2, (Math.abs(ayReq) - aLimit * 0.8) * 0.9 + 0.6);
  }

  let speed = clamp((v0 + a * dt) * 3.6, 0, s.gear === "R" ? 15 : 200);
  if (s.limit.mode === "active" && s.accel < 2 && speed > s.limit.value) speed = Math.max(s.limit.value, s.speed - 6 * dt);
  if (s.parkingBrake && s.speed <= 1 && s.accel === 0) speed = 0;
  const ax = (speed - s.speed) / 3.6 / Math.max(dt, 1e-3);

  // Escorregada para fora da curva quando o limite é ultrapassado.
  const slip = Math.max(0, s.slip + (excess * 1.1 - s.slip * 0.9) * dt);
  const outward = Math.sign(kappa);

  // Alvo à frente.
  const t = s.target;
  const inLane = inPath(s);
  let distance = t.distance;
  if (t.kind === "movingVehicle") distance += ((t.speed - speed) / 3.6) * dt;
  else if (t.kind === "staticVehicle" || t.kind === "pedestrian") distance -= (speed / 3.6) * dt;
  let collided = s.collided;
  let crashKind = s.crashKind;
  let crashT = s.crashT;
  if (inLane && distance <= 0.5 && closingSpeedMs({ ...s, speed }) > 0) {
    collided = true;
    crashKind = s.world === "serra" ? "traffic" : crashKind;
    crashT = s.world === "serra" ? 4 : crashT;
    speed = 0;
    distance = 0.5;
  }
  if (t.kind !== "none") distance = clamp(distance, inLane ? 0.5 : -80, 400);

  // Posição lateral: o volante só faz efeito com o carro em movimento e perde agilidade com a velocidade.
  const lateralRate = (clamp(speed / 25, 0, 1) * 2.6) / (1 + (speed / 100) ** 2);
  let lateral = s.lateral + s.steer * lateralRate * dt + outward * slip * dt;
  if (s.world === "highway") lateral = clamp(lateral, -MAX_LATERAL, MAX_LATERAL);
  else lateral = clamp(lateral, geo.crashLeft - 0.6, geo.crashRight + 0.6);
  const offset = lateral - Math.round(lateral / geo.lane) * geo.lane;
  const laneDeparture = Math.abs(offset) > geo.departAt;

  // Carros do sentido oposto (Serra) e batidas na lateral da pista.
  let oncomingList = s.oncomingList;
  if (s.world === "serra") {
    const mv = speed / 3.6;
    oncomingList = [];
    for (const o of s.oncomingList) {
      const d = o.d - (mv + o.v / 3.6) * dt;
      if (d < -70) continue;
      oncomingList.push({ ...o, d });
      const swept = o.d > 0 && d <= 0;
      if (!collided && (swept || (d <= 0 && d > -4.6)) && Math.abs(lateral - laneX("serra", -1)) < 1.75) {
        collided = true;
        crashKind = "traffic";
        crashT = 4.5;
        speed = 0;
      }
    }
    if (!collided && (lateral > geo.crashRight || lateral < geo.crashLeft) && speed > 3) {
      collided = true;
      crashKind = "barrier";
      crashT = 4;
      speed = 0;
    }
  }
  let target = { ...t, distance };
  let nextLateral = lateral;
  let nextAeb = aeb.stage;
  if (s.world === "serra" && collided && crashKind !== "none") {
    speed = 0;
    crashT = crashT - dt;
    if (crashT <= 0) {
      // Recomeça no meio da faixa, com a pista livre.
      collided = false;
      crashKind = "none";
      nextLateral = 0;
      oncomingList = [];
      target = { kind: "none", distance: 80, speed: 40 };
      nextAeb = "idle";
    }
  }

  // "aebStopped" fica ligado depois que o AEB freou, até o motorista agir.
  const aebActing = aeb.stage === "partial" || aeb.stage === "emergency";
  const aebStopped = aebActing || (s.aebStopped && !s.brake && s.accel === 0);

  // Percurso e viagem (consumo ILUSTRATIVO: litros por hora crescem com a velocidade e com o acelerador).
  const km = (speed / 3600) * dt;
  const dir = s.gear === "R" ? -1 : 1;
  const sNext = clamp(s.route.s + (speed / 3.6) * dt * dir, 0, s.world === "serra" ? SERRA_LENGTH : Infinity);
  const litersPerHour = (0.9 + speed * 0.055) * (throttle > 0.02 ? 1.4 : 1);
  const trip = {
    km: s.trip.km + km,
    seconds: s.trip.seconds + dt,
    liters: s.trip.liters + (litersPerHour * dt) / 3600,
  };
  const finished = s.route.finished || (s.world === "serra" && sNext >= SERRA_LENGTH - 60);
  // As vilas da Serra têm iluminação pública.
  const roadLit = s.world === "serra" ? sNext < SERRA_VILLAGE_START + 40 || sNext > SERRA_VILLAGE_END - 40 : s.roadLit;
  const oncoming = s.world === "serra" ? oncomingList.some((o) => o.d > 0 && o.d < 140) && s.night : s.oncoming;

  return {
    ...s,
    speed,
    aeb: nextAeb,
    target,
    lateral: nextLateral,
    laneDeparture,
    collided,
    aebStopped,
    odo: s.odo + km,
    trip,
    throttle,
    brakeP,
    ax: Number.isFinite(ax) ? ax : 0,
    ay: ayReq,
    slip: collided ? 0 : slip,
    espActive,
    absActive: brakeP > 0.85 && speed > 8 && !collided,
    crashKind,
    crashT,
    oncomingList,
    route: { s: sNext, finished },
    roadLit,
    oncoming,
  };
}

const PH = {
  mass: 1560, // carro + motorista (kg)
  power: 92000, // potência efetiva nas rodas (W)
  fMax: 3700, // força máxima de tração (N)
  cdA: 0.72, // coeficiente de arrasto x área frontal (m²)
  crr: 0.012,
  rho: 1.2,
  g: 9.81,
  brakeMax: 9.2, // m/s² no limite da aderência, pista seca
  latLimit: 6.6, // aceleração lateral máxima antes de o carro "abrir" a curva
} as const;

function smoothstep(a: number, b: number, x: number) {
  const k = clamp((x - a) / (b - a), 0, 1);
  return k * k * (3 - 2 * k);
}

function accControl(s: SimState): number {
  let targetSpeed = s.acc.setSpeed;
  const t = pathTarget(s);
  if (t.kind === "movingVehicle") {
    const gap = desiredGapMeters(s);
    if (t.distance < gap * 3) {
      const follow = t.speed + (t.distance - gap) * 0.4;
      targetSpeed = Math.min(targetSpeed, Math.max(0, follow));
    }
  }
  return clamp((targetSpeed - s.speed) * 1.2, -10, 6);
}

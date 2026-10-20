export type Gear = "P" | "R" | "N" | "D";
export type TargetKind = "none" | "staticVehicle" | "movingVehicle" | "pedestrian";
export type Level = "off" | "standby" | "active";
export type Side = "left" | "right";
export type FcwSensitivity = "low" | "standard" | "high";
export type AebStage = "idle" | "warn" | "partial" | "emergency";
export type FaultKey = "acc" | "aeb" | "ldw" | "bsd" | "ihc";
export type AccMode = "off" | "standby" | "active" | "suspended";
export type TurnSignal = "none" | Side;

export interface Settings {
  /** Monitor de ponto cego (e alerta de tráfego cruzado traseiro) */
  bsd: boolean;
  /** Alerta de distância frontal */
  fdm: boolean;
  /** Frenagem automática de emergência + alerta de colisão frontal */
  aeb: boolean;
  fcwSensitivity: FcwSensitivity;
  /** Farol alto inteligente */
  ihc: boolean;
  /** Câmera 360° abre sozinha ao ligar a seta */
  avmOnSignal: boolean;
  /** Câmera 360° abre sozinha ao girar o volante em manobra */
  avmOnSteer: boolean;
}

export type { WorldId } from "./route";
import type { WorldId } from "./route";

export type CrashKind = "none" | "traffic" | "barrier";

/** Carro vindo em sentido contrário (só na Serra). */
export interface Oncoming {
  /** metros entre o seu para-choque e o dele (negativo = já passou) */
  d: number;
  /** km/h */
  v: number;
}

export interface Target {
  kind: TargetKind;
  /** metros até o alvo */
  distance: number;
  /** faixa do alvo: -1 esquerda, 0 a sua, 1 direita (padrão 0) */
  lane?: -1 | 0 | 1;
  /** aparência (só visual): carro, caminhão ou estilo do pedestre */
  variant?: number;
  /** km/h do alvo (só vale para veículo em movimento) */
  speed: number;
}

export interface SimState {
  hasMaxDrive: boolean;
  ignitionOn: boolean;
  speed: number;
  gear: Gear;
  esp: boolean;
  seatbelt: boolean;
  doorClosed: boolean;
  parkingBrake: boolean;
  hdc: boolean;
  /** pedais: freio e acelerador (0 solto, 1 normal, 2 a fundo) */
  brake: boolean;
  accel: 0 | 1 | 2;
  absActive: boolean;
  evasiveSteer: boolean;
  turnSignal: TurnSignal;
  hazard: boolean;
  lightAuto: boolean;
  ihcRequested: boolean;
  ihcActive: boolean;
  roadLit: boolean;
  oncoming: boolean;
  settings: Settings;
  faults: Record<FaultKey, boolean>;

  acc: { mode: AccMode; setSpeed: number; gap: 1 | 2 | 3; arm: number };
  limit: { mode: Level; value: number };
  ldw: Level;
  laneDeparture: boolean;
  bsd: Level;
  blind: Record<Side, boolean>;
  cross: Record<Side, boolean>;
  avmManual: boolean;
  avmOn: boolean;
  target: Target;
  aeb: AebStage;
  aebStopped: boolean;
  collided: boolean;
  /** relógio de simulação, para animações no painel */
  clock: number;
  /** cena noturna (só visual; ajuda a ver o farol alto) */
  night: boolean;
  /** posição lateral do carro na pista, em metros (0 = centro da faixa do meio) */
  lateral: number;
  /** volante: -1 esquerda, 0 reto, 1 direita */
  steer: -1 | 0 | 1;
  /** hodômetro total (km) e dados da viagem — consumo ILUSTRATIVO */
  odo: number;
  trip: { km: number; seconds: number; liters: number };

  /** mundo em que se dirige */
  world: WorldId;
  /** posição no percurso (m) e se já chegou ao fim (só na Serra) */
  route: { s: number; finished: boolean };
  /** pedais suavizados (0 a 1) */
  throttle: number;
  brakeP: number;
  /** aceleração longitudinal e lateral (m/s²), para a sensação de peso e os sons */
  ax: number;
  ay: number;
  /** velocidade de escorregada para fora da curva (m/s) */
  slip: number;
  /** o ESP está atuando agora */
  espActive: boolean;
  crashKind: CrashKind;
  crashT: number;
  oncomingList: Oncoming[];
}

export type Action =
  | { type: "tick"; dt: number }
  | { type: "set"; key: keyof SimState; value: unknown }
  | { type: "setting"; key: keyof Settings; value: unknown }
  | { type: "fault"; key: FaultKey; value: boolean }
  | { type: "ignition" }
  | { type: "gear"; gear: Gear }
  | { type: "brake"; down: boolean }
  | { type: "accel"; level: 0 | 1 | 2 }
  | { type: "accPower" }
  | { type: "setButton"; long: boolean }
  | { type: "resButton"; long: boolean }
  | { type: "accSetFromStop" }
  | { type: "accCancel" }
  | { type: "accGap" }
  | { type: "limitToggle" }
  | { type: "ihcPush" }
  | { type: "ihcPull" }
  | { type: "turn"; side: TurnSignal }
  | { type: "avmButton" }
  | { type: "target"; target: Partial<Target> }
  | { type: "resetTarget" }
  | { type: "variant"; hasMaxDrive: boolean }
  | { type: "newGame"; hasMaxDrive: boolean; world: WorldId; night: boolean; at?: number }
  | { type: "load"; state: SimState }
  | { type: "tripReset" }
  | { type: "steer"; dir: -1 | 0 | 1 }
  | { type: "clearTarget" }
  | { type: "reset" };

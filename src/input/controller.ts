import type { Dispatch } from "react";
import type { Action, SimState } from "../engine/types";

/**
 * Controle único do carro: teclado e botões na tela chamam as mesmas funções.
 * Cada controle tem um id lógico (ex.: "accel", "set"), uma tecla e um rótulo.
 */

export type ControlId =
  | "accel"
  | "accelFull"
  | "full"
  | "brake"
  | "left"
  | "right"
  | "ignition"
  | "epb"
  | "gearP"
  | "gearR"
  | "gearN"
  | "gearD"
  | "turnL"
  | "turnR"
  | "hazard"
  | "acc"
  | "set"
  | "res"
  | "cancel"
  | "gap"
  | "limit"
  | "push"
  | "pull"
  | "avm"
  | "belt"
  | "door"
  | "hdc"
  | "esp"
  | "setStop";

export interface ControlDef {
  id: ControlId;
  /** código de tecla (KeyboardEvent.code) */
  code?: string;
  /** texto curto da tecla */
  cap: string;
  label: string;
  /** id de explicação (features.ts) */
  feature?: string;
}

export const CONTROLS: Record<ControlId, ControlDef> = {
  accel: { id: "accel", code: "ArrowUp", cap: "↑", label: "Acelerar" },
  accelFull: { id: "accelFull", cap: "⇧↑", label: "A fundo" },
  full: { id: "full", code: "ShiftLeft", cap: "⇧", label: "A fundo" },
  brake: { id: "brake", code: "ArrowDown", cap: "↓", label: "Frear" },
  left: { id: "left", code: "ArrowLeft", cap: "←", label: "Volante à esquerda" },
  right: { id: "right", code: "ArrowRight", cap: "→", label: "Volante à direita" },
  ignition: { id: "ignition", code: "Enter", cap: "Enter", label: "Ligar / desligar" },
  epb: { id: "epb", code: "Space", cap: "Espaço", label: "Freio de estacionamento", feature: "epb" },
  gearP: { id: "gearP", code: "KeyP", cap: "P", label: "Estacionar" },
  gearR: { id: "gearR", code: "KeyR", cap: "R", label: "Ré" },
  gearN: { id: "gearN", code: "KeyN", cap: "N", label: "Neutro" },
  gearD: { id: "gearD", code: "KeyD", cap: "D", label: "Drive" },
  turnL: { id: "turnL", code: "KeyQ", cap: "Q", label: "Seta esquerda", feature: "bsd" },
  turnR: { id: "turnR", code: "KeyE", cap: "E", label: "Seta direita", feature: "bsd" },
  hazard: { id: "hazard", code: "KeyH", cap: "H", label: "Pisca-alerta" },
  acc: { id: "acc", code: "KeyA", cap: "A", label: "ACC", feature: "acc" },
  set: { id: "set", code: "KeyS", cap: "S", label: "SET–", feature: "accSet" },
  res: { id: "res", code: "KeyW", cap: "W", label: "RES+", feature: "accRes" },
  cancel: { id: "cancel", code: "KeyX", cap: "X", label: "Cancelar", feature: "accCancel" },
  gap: { id: "gap", code: "KeyG", cap: "G", label: "Distância", feature: "accGap" },
  limit: { id: "limit", code: "KeyL", cap: "L", label: "Limitador", feature: "limit" },
  push: { id: "push", code: "KeyB", cap: "B", label: "Farol alto auto", feature: "ihc" },
  pull: { id: "pull", code: "KeyV", cap: "V", label: "Puxar haste", feature: "ihc" },
  avm: { id: "avm", code: "KeyK", cap: "K", label: "Câmera 360°", feature: "avm" },
  belt: { id: "belt", code: "KeyT", cap: "T", label: "Cinto", feature: "tt_belt" },
  door: { id: "door", code: "KeyO", cap: "O", label: "Porta", feature: "tt_door" },
  hdc: { id: "hdc", code: "KeyU", cap: "U", label: "HDC", feature: "hdc" },
  esp: { id: "esp", code: "KeyM", cap: "M", label: "ESP OFF", feature: "esp" },
  setStop: { id: "setStop", code: "KeyZ", cap: "Z", label: "SET– parado", feature: "acc" },
};

const BY_CODE: Record<string, ControlId> = Object.fromEntries(
  Object.values(CONTROLS)
    .filter((c) => c.code)
    .map((c) => [c.code as string, c.id]),
);
BY_CODE.ShiftRight = "full";

export interface Controller {
  down(id: ControlId): void;
  up(id: ControlId): void;
  releaseAll(): void;
  codeToId(code: string): ControlId | undefined;
  held(): ReadonlySet<ControlId>;
  dispose(): void;
}

const LONG_MS = 500;
const REPEAT_MS = 450;

export function createController(
  dispatch: Dispatch<Action>,
  getState: () => SimState,
  onChange: () => void,
): Controller {
  const held = new Set<ControlId>();
  const timers = new Map<ControlId, { t: number; r?: number; fired: boolean }>();
  let last = { brake: false, accel: 0 as 0 | 1 | 2, steer: 0 as -1 | 0 | 1 };

  const syncDrive = () => {
    const brake = held.has("brake");
    const accel: 0 | 1 | 2 = held.has("accelFull") ? 2 : held.has("accel") ? (held.has("full") ? 2 : 1) : 0;
    const steer = ((held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0)) as -1 | 0 | 1;
    if (brake !== last.brake) dispatch({ type: "brake", down: brake });
    if (accel !== last.accel) dispatch({ type: "accel", level: accel });
    if (steer !== last.steer) dispatch({ type: "steer", dir: steer });
    last = { brake, accel, steer };
  };

  const toggle = (key: keyof SimState) => dispatch({ type: "set", key, value: !getState()[key] });

  const tap = (id: ControlId) => {
    switch (id) {
      case "ignition":
        return dispatch({ type: "ignition" });
      case "epb":
        return toggle("parkingBrake");
      case "gearP":
        return dispatch({ type: "gear", gear: "P" });
      case "gearR":
        return dispatch({ type: "gear", gear: "R" });
      case "gearN":
        return dispatch({ type: "gear", gear: "N" });
      case "gearD":
        return dispatch({ type: "gear", gear: "D" });
      case "turnL":
        return dispatch({ type: "turn", side: "left" });
      case "turnR":
        return dispatch({ type: "turn", side: "right" });
      case "hazard":
        return toggle("hazard");
      case "acc":
        return dispatch({ type: "accPower" });
      case "cancel":
        return dispatch({ type: "accCancel" });
      case "gap":
        return dispatch({ type: "accGap" });
      case "limit":
        return dispatch({ type: "limitToggle" });
      case "push":
        return dispatch({ type: "ihcPush" });
      case "pull":
        return dispatch({ type: "ihcPull" });
      case "avm":
        return dispatch({ type: "avmButton" });
      case "belt":
        return toggle("seatbelt");
      case "door":
        return toggle("doorClosed");
      case "hdc":
        return toggle("hdc");
      case "esp":
        return toggle("esp");
      case "setStop":
        return dispatch({ type: "accSetFromStop" });
      default:
        return undefined;
    }
  };

  const isHold = (id: ControlId) =>
    id === "accel" || id === "accelFull" || id === "full" || id === "brake" || id === "left" || id === "right";
  const isLong = (id: ControlId) => id === "set" || id === "res";

  const clearTimer = (id: ControlId) => {
    const t = timers.get(id);
    if (t) {
      window.clearTimeout(t.t);
      if (t.r) window.clearInterval(t.r);
    }
    return t;
  };

  const longAction = (id: ControlId) =>
    dispatch(id === "set" ? { type: "setButton", long: true } : { type: "resButton", long: true });

  return {
    down(id) {
      if (held.has(id)) return;
      held.add(id);
      onChange();
      if (isHold(id)) return syncDrive();
      if (isLong(id)) {
        const rec = { t: 0, r: undefined as number | undefined, fired: false };
        rec.t = window.setTimeout(() => {
          rec.fired = true;
          longAction(id);
          rec.r = window.setInterval(() => longAction(id), REPEAT_MS);
        }, LONG_MS);
        timers.set(id, rec);
        return;
      }
      tap(id);
    },
    up(id) {
      if (!held.delete(id)) return;
      onChange();
      if (isHold(id)) return syncDrive();
      if (isLong(id)) {
        const rec = clearTimer(id);
        timers.delete(id);
        if (rec && !rec.fired) dispatch(id === "set" ? { type: "setButton", long: false } : { type: "resButton", long: false });
      }
    },
    releaseAll() {
      for (const id of [...held]) {
        if (isLong(id)) {
          clearTimer(id);
          timers.delete(id);
        }
      }
      held.clear();
      syncDrive();
      onChange();
    },
    codeToId: (code) => BY_CODE[code],
    held: () => held,
    dispose() {
      for (const id of [...timers.keys()]) clearTimer(id);
      timers.clear();
    },
  };
}

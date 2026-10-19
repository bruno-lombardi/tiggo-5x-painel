import { describe, expect, it } from "vitest";
import { createDirector, directorStep } from "./director";
import { createInitialState, reduce } from "./engine";
import type { SimState } from "./types";

function drive(s: SimState, seconds: number, dirIn = createDirector(s.clock)) {
  let dir = dirIn;
  let state = s;
  const seen = new Set<string>();
  for (let i = 0; i < seconds * 10; i++) {
    state = reduce(state, { type: "tick", dt: 0.1 });
    if (i % 5 === 0) {
      const r = directorStep(state, dir);
      dir = r.dir;
      for (const a of r.actions) {
        seen.add(a.type === "target" ? String(a.target.kind) : a.type === "set" ? String(a.key) : a.type);
        state = reduce(state, a);
      }
    }
  }
  return { state, seen };
}

describe("diretor da estrada livre", () => {
  const base: SimState = { ...createInitialState(true), ignitionOn: true, gear: "D", parkingBrake: false, speed: 80, accel: 1 };

  it("faz aparecer vários tipos de situação ao longo do tempo", () => {
    const { seen } = drive(base, 400);
    expect(seen.has("movingVehicle") || seen.has("staticVehicle") || seen.has("pedestrian")).toBe(true);
    expect(seen.size).toBeGreaterThanOrEqual(3);
  });

  it("não faz nada com o carro desligado", () => {
    const { seen } = drive({ ...base, ignitionOn: false }, 60);
    expect(seen.size).toBe(0);
  });

  it("limpa o alvo que ficou para trás", () => {
    const s: SimState = { ...base, lateral: -3.5, target: { kind: "staticVehicle", distance: 20, speed: 0, lane: 0 } };
    const { state } = drive(s, 12);
    expect(state.target.kind === "none" || state.target.distance > -40).toBe(true);
  });
});

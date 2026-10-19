import { describe, expect, it } from "vitest";
import { SCENARIOS } from "../content/scenarios";
import { narrate } from "../content/narration";
import { createInitialState, evaluate, reduce } from "./engine";

describe("cenários guiados", () => {
  for (const sc of SCENARIOS) {
    it(`${sc.id}: começa com o primeiro passo ainda por fazer`, () => {
      const s = sc.build();
      expect(sc.steps[0].done(s, evaluate(s))).toBe(false);
      expect(narrate(s, evaluate(s)).length).toBeGreaterThan(0);
    });
  }

  it("AEB em carro parado a 45 km/h freia sem colidir", () => {
    let s = reduce(createInitialState(true), { type: "load", state: SCENARIOS.find((x) => x.id === "aeb-static")!.build() });
    for (let i = 0; i < 400; i++) s = reduce(s, { type: "tick", dt: 0.05 });
    expect(s.collided).toBe(false);
    expect(s.speed).toBeLessThan(1);
  });
});

describe("viagem", () => {
  it("acumula distância e tempo e zera", () => {
    let s = reduce(createInitialState(true), { type: "load", state: { ...createInitialState(true), ignitionOn: true, gear: "D", parkingBrake: false, speed: 72 } });
    for (let i = 0; i < 100; i++) s = reduce(s, { type: "tick", dt: 0.1 });
    expect(s.trip.km).toBeGreaterThan(0.15);
    expect(s.trip.seconds).toBeGreaterThan(9);
    s = reduce(s, { type: "tripReset" });
    expect(s.trip.km).toBe(0);
  });
});

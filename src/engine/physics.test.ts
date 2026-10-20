import { describe, expect, it } from "vitest";
import { createInitialState, reduce } from "./engine";
import { SERRA_CURVES, SERRA_LENGTH, laneX, nextCurve, pathOffset, roadAt } from "./route";
import type { SimState } from "./types";

const base = (over: Partial<SimState> = {}): SimState => ({
  ...createInitialState(true),
  ignitionOn: true,
  gear: "D",
  parkingBrake: false,
  ...over,
});
const run = (s: SimState, sec: number, dt = 0.05) => {
  for (let i = 0; i < Math.round(sec / dt); i++) s = reduce(s, { type: "tick", dt });
  return s;
};

describe("física: longitudinal", () => {
  it("0 a 100 km/h leva cerca de 10,3 s com o pé a fundo (ficha do carro)", () => {
    let s = base({ accel: 2 });
    let t = 0;
    while (s.speed < 100 && t < 30) {
      s = reduce(s, { type: "tick", dt: 0.05 });
      t += 0.05;
    }
    expect(t).toBeGreaterThan(9.6);
    expect(t).toBeLessThan(11);
  });

  it("a velocidade final fica perto de 193 km/h", () => {
    const s = run(base({ speed: 120, accel: 2 }), 240, 0.1);
    expect(s.speed).toBeGreaterThan(188);
    expect(s.speed).toBeLessThan(198);
  });

  it("o volante gira aos poucos: o efeito cresce com o tempo de tecla apertada", () => {
    let s = base({ speed: 60, steer: 1 });
    s = run(s, 0.1);
    const early = s.wheel;
    s = run(s, 0.6);
    expect(early).toBeGreaterThan(0);
    expect(early).toBeLessThan(0.4);
    expect(s.wheel).toBe(1);
  });

  it("freada total de 100 km/h para em 38 a 60 m", () => {
    let s = base({ speed: 100, brake: true });
    let d = 0;
    while (s.speed > 0.1 && d < 200) {
      s = reduce(s, { type: "tick", dt: 0.05 });
      d += (s.speed / 3.6) * 0.05;
    }
    expect(d).toBeGreaterThan(38);
    expect(d).toBeLessThan(60);
    expect(s.absActive || s.speed === 0).toBe(true);
  });

  it("o freio tem inércia: não chega a 100% no primeiro instante", () => {
    const s = reduce(base({ speed: 80, brake: true }), { type: "tick", dt: 0.05 });
    expect(s.brakeP).toBeGreaterThan(0);
    expect(s.brakeP).toBeLessThan(0.6);
  });

  it("solto o acelerador, o carro desacelera devagar (freio-motor e arrasto)", () => {
    const s = run(base({ speed: 100 }), 3);
    expect(s.speed).toBeLessThan(97);
    expect(s.speed).toBeGreaterThan(85);
  });

  it("em D, sem pedais, o carro anda sozinho em marcha lenta (~6 km/h)", () => {
    const s = run(base({ speed: 0 }), 6);
    expect(s.speed).toBeGreaterThan(3);
    expect(s.speed).toBeLessThan(8);
  });

  it("subida forte tira ritmo e descida ajuda", () => {
    const up = run({ ...base({ accel: 1, speed: 60 }), world: "serra", route: { s: 2000, finished: false } }, 4);
    const down = run({ ...base({ accel: 1, speed: 60 }), world: "serra", route: { s: 8000, finished: false } }, 4);
    expect(down.speed).toBeGreaterThan(up.speed + 4);
  });
});

describe("rota da Serra", () => {
  it("tem 10 km, curvas com raio realista e placas de velocidade", () => {
    expect(SERRA_LENGTH).toBe(10000);
    expect(SERRA_CURVES.length).toBeGreaterThan(30);
    for (const c of SERRA_CURVES) {
      expect(c.radius).toBeGreaterThan(50);
      expect(c.advised).toBeGreaterThanOrEqual(20);
    }
  });

  it("a estrada sobe e depois desce", () => {
    expect(roadAt("serra", 2500).grade).toBeGreaterThan(0.04);
    expect(roadAt("serra", 8500).grade).toBeLessThan(-0.04);
    expect(roadAt("serra", 6000).elev).toBeGreaterThan(100);
  });

  it("a rodovia é reta e plana", () => {
    expect(roadAt("highway", 1234)).toEqual({ kappa: 0, grade: 0, heading: 0, elev: 0 });
    expect(pathOffset("highway", 0, 100)).toEqual({ x: 0, y: 0 });
  });

  it("achar a próxima curva e deslocar o traçado para o lado certo", () => {
    const c = SERRA_CURVES[3];
    expect(nextCurve("serra", c.start - 100)?.start).toBe(c.start);
    const off = pathOffset("serra", c.start + 20, 60);
    // curva à esquerda (+1) leva o traçado para x negativo
    expect(Math.sign(off.x)).toBe(-c.dir);
  });

  it("a faixa do sentido oposto fica à esquerda", () => {
    expect(laneX("serra", -1)).toBeLessThan(-3);
    expect(laneX("serra", 1)).toBeGreaterThan(1.5);
  });
});

describe("física: curvas e batidas na Serra", () => {
  const curve = SERRA_CURVES[2];
  const inCurve = (speed: number, over: Partial<SimState> = {}): SimState => ({
    ...base({ speed, accel: 1 }),
    world: "serra",
    route: { s: curve.start + 30, finished: false },
    ...over,
  });

  it("em velocidade segura a curva é feita sem sair da faixa", () => {
    const s = run(inCurve(Math.min(curve.advised, 55), { accel: 0 }), 3);
    expect(s.collided).toBe(false);
    expect(Math.abs(s.lateral)).toBeLessThan(0.5);
    expect(s.espActive).toBe(false);
  });

  it("rápido demais: o ESP freia e o carro abre a curva", () => {
    const s = run(inCurve(130, { accel: 0, brake: false }), 2);
    expect(s.espActive).toBe(true);
    expect(s.speed).toBeLessThan(125);
    expect(Math.abs(s.slip) + Math.abs(s.lateral)).toBeGreaterThan(0.05);
  });

  it("sem ESP e muito rápido, o carro bate na lateral e recomeça", () => {
    let s = inCurve(150, { esp: false, accel: 0 });
    for (let i = 0; i < 400 && !s.collided; i++) s = reduce(s, { type: "tick", dt: 0.05 });
    expect(s.collided).toBe(true);
    expect(s.crashKind).toBe("barrier");
    expect(s.speed).toBe(0);
    const after = run(s, 6);
    expect(after.collided).toBe(false);
    expect(after.lateral).toBe(0);
  });

  it("carro vindo de frente na sua faixa causa batida; na dele, passa", () => {
    const straight = (lateral: number): SimState => ({
      ...base({ speed: 60, accel: 1, lateral }),
      world: "serra",
      route: { s: 100, finished: false },
      oncomingList: [{ d: 80, v: 60 }],
    });
    expect(run(straight(-3.3), 3).collided).toBe(true);
    expect(run(straight(0), 3).collided).toBe(false);
  });

  it("rodovia não tem curva nem escorregada", () => {
    const s = run(base({ speed: 150, accel: 0 }), 3);
    expect(s.ay).toBe(0);
    expect(s.slip).toBe(0);
  });
});

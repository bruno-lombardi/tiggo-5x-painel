import { describe, expect, it } from "vitest";
import { assessAeb, createInitialState, evaluate, reduce } from "./engine";
import type { Action, SimState } from "./types";

const run = (s: SimState, ...actions: Action[]) => actions.reduce(reduce, s);
const advance = (s: SimState, seconds: number, step = 0.1) => {
  let cur = s;
  for (let t = 0; t < seconds; t += step) cur = reduce(cur, { type: "tick", dt: step });
  return cur;
};

/** Carro ligado, em D, freio de mão solto, andando na velocidade pedida. */
function driving(speed: number, patch: Partial<SimState> = {}): SimState {
  return {
    ...run(createInitialState(), { type: "ignition" }),
    gear: "D",
    parkingBrake: false,
    speed,
    ...patch,
  };
}

describe("ACC — condições de ativação", () => {
  it("ativa a 100 km/h quando todas as condições estão atendidas", () => {
    const s = run(driving(100), { type: "accPower" }, { type: "setButton", long: false });
    expect(s.acc.mode).toBe("active");
    expect(s.acc.setSpeed).toBe(100);
  });

  it.each([
    ["porta aberta", { doorClosed: false }],
    ["cinto solto", { seatbelt: false }],
    ["câmbio fora de D", { gear: "N" as const }],
    ["freio de estacionamento aplicado", { parkingBrake: true }],
    ["HDC ligado", { hdc: true }],
    ["freio pressionado", { brake: true }],
    ["ABS atuando", { absActive: true }],
  ])("não ativa com %s", (_nome, patch) => {
    const s = run(driving(100, patch), { type: "accPower" }, { type: "setButton", long: false });
    expect(s.acc.mode).toBe("standby");
  });

  it("não ativa abaixo de 30 km/h nem acima de 150 km/h", () => {
    expect(run(driving(25), { type: "accPower" }, { type: "setButton", long: false }).acc.mode).toBe("standby");
    expect(run(driving(155), { type: "accPower" }, { type: "setButton", long: false }).acc.mode).toBe("standby");
  });

  it("com ESP desligado nada funciona", () => {
    const s = run(driving(100, { esp: false }), { type: "accPower" });
    expect(s.acc.mode).toBe("off");
    expect(evaluate(s).operational).toBe(false);
  });

  it("sem Max Drive os assistentes não existem", () => {
    const s = { ...driving(100), hasMaxDrive: false };
    expect(run(s, { type: "accPower" }).acc.mode).toBe("off");
  });
});

describe("ACC — uso", () => {
  const active = () => run(driving(100), { type: "accPower" }, { type: "setButton", long: false });

  it("RES+ e SET– ajustam 1 km/h num toque e 5 ou 10 km/h segurando", () => {
    expect(run(active(), { type: "resButton", long: false }).acc.setSpeed).toBe(101);
    expect(run(active(), { type: "setButton", long: false }).acc.setSpeed).toBe(99);
    expect(run(active(), { type: "resButton", long: true }).acc.setSpeed).toBe(110);
    const low = { ...active(), acc: { ...active().acc, setSpeed: 60 } };
    expect(run(low, { type: "resButton", long: true }).acc.setSpeed).toBe(65);
  });

  it("limita a velocidade programada entre 30 e 150", () => {
    let s = { ...active(), acc: { ...active().acc, setSpeed: 148 } };
    s = run(s, { type: "resButton", long: true });
    expect(s.acc.setSpeed).toBe(150);
  });

  it("pisar no freio suspende o ACC e RES+ retoma", () => {
    let s = run(active(), { type: "brake", down: true });
    expect(s.acc.mode).toBe("suspended");
    s = run(s, { type: "brake", down: false }, { type: "resButton", long: false });
    expect(s.acc.mode).toBe("active");
    expect(s.acc.setSpeed).toBe(100);
  });

  it("o botão de distância percorre os três níveis", () => {
    let s = active();
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      s = run(s, { type: "accGap" });
      seen.push(s.acc.gap);
    }
    expect(seen).toEqual([3, 1, 2, 3]);
  });

  it("saindo do repouso: soltar o freio em até 3 s ativa com 30 km/h", () => {
    let s = driving(0, { brake: true });
    s = run(s, { type: "accPower" }, { type: "accSetFromStop" });
    expect(s.acc.arm).toBeGreaterThan(0);
    s = advance(run(s, { type: "brake", down: false }), 0.2);
    expect(s.acc.mode).toBe("active");
    expect(s.acc.setSpeed).toBe(30);
  });

  it("se passar de 3 s, é preciso tocar no acelerador", () => {
    let s = driving(0, { brake: true });
    s = advance(run(s, { type: "accPower" }, { type: "accSetFromStop" }), 3.5);
    expect(evaluate(s).messages).toContain("accTapAccelerator");
    s = advance(run(s, { type: "brake", down: false }, { type: "accel", level: 1 }), 0.2);
    expect(s.acc.mode).toBe("active");
  });

  it("segue o veículo da frente em vez de manter a velocidade programada", () => {
    let s = run(driving(100), { type: "accPower" }, { type: "setButton", long: false });
    s = run(s, { type: "target", target: { kind: "movingVehicle", distance: 60, speed: 70 } });
    s = advance(s, 40);
    expect(s.speed).toBeLessThan(85);
    expect(s.speed).toBeGreaterThan(55);
    expect(s.acc.mode).toBe("active");
    expect(s.collided).toBe(false);
  });

  it("o ACC não reage a veículo parado (quem age é o AEB)", () => {
    let s = run(driving(60), { type: "accPower" }, { type: "setButton", long: false });
    s = run(s, { type: "target", target: { kind: "staticVehicle", distance: 120, speed: 0 } });
    expect(evaluate(s).following).toBe(false);
  });
});

describe("Limitador de velocidade", () => {
  it("ativar o limitador desliga o ACC", () => {
    const s = run(driving(100), { type: "accPower" }, { type: "limitToggle" });
    expect(s.acc.mode).toBe("off");
    expect(s.limit.mode).toBe("standby");
  });

  it("abaixo de 30 km/h o SET– grava 20 km/h; entre 20 e 200 grava a velocidade atual", () => {
    expect(run(driving(10), { type: "limitToggle" }, { type: "setButton", long: false }).limit.value).toBe(20);
    expect(run(driving(90), { type: "limitToggle" }, { type: "setButton", long: false }).limit.value).toBe(90);
  });

  it("segura a velocidade, e o acelerador a fundo ultrapassa", () => {
    let s = run(driving(90), { type: "limitToggle" }, { type: "setButton", long: false });
    s = advance(run(s, { type: "accel", level: 1 }), 5);
    expect(s.speed).toBeLessThanOrEqual(90.01);
    s = advance(run(s, { type: "accel", level: 2 }), 3);
    expect(s.speed).toBeGreaterThan(95);
  });
});

describe("AEB e alerta de colisão frontal", () => {
  const withTarget = (speed: number, kind: "staticVehicle" | "movingVehicle" | "pedestrian", distance: number, tSpeed = 0) =>
    driving(speed, { target: { kind, distance, speed: tSpeed } });

  it("o alarme FCW não soa abaixo de 30 km/h", () => {
    const a = assessAeb(withTarget(25, "staticVehicle", 10));
    expect(a.fcwInRange).toBe(false);
  });

  it("o alarme FCW não soa para alvo parado acima de 85 km/h", () => {
    expect(assessAeb(withTarget(90, "staticVehicle", 20)).fcwInRange).toBe(false);
    expect(assessAeb(withTarget(90, "movingVehicle", 20, 20)).fcwInRange).toBe(true);
  });

  it.each([
    ["staticVehicle", 53, 54],
    ["movingVehicle", 80, 81],
    ["pedestrian", 64, 65],
  ] as const)("%s: freia até %i km/h e não freia a %i km/h", (kind, inside, outside) => {
    expect(assessAeb(withTarget(inside, kind, 3, kind === "movingVehicle" ? 0 : 0)).aebInRange).toBe(true);
    expect(assessAeb(withTarget(outside, kind, 3, 0)).aebInRange).toBe(false);
  });

  it("evita a batida em alvo parado a 50 km/h", () => {
    let s = withTarget(50, "staticVehicle", 45);
    s = advance(s, 5);
    // O carro não fica retido: o motorista segura com o freio de estacionamento.
    s = { ...s, parkingBrake: true };
    s = advance(s, 7);
    expect(s.collided).toBe(false);
    expect(s.speed).toBe(0);
    expect(s.aebStopped).toBe(true);
  });

  it("não freia se o cinto estiver solto", () => {
    expect(assessAeb({ ...withTarget(50, "staticVehicle", 10), seatbelt: false }).stage).toBe("idle");
  });

  it("não freia com o ESP desligado", () => {
    expect(assessAeb({ ...withTarget(50, "staticVehicle", 10), esp: false }).stage).toBe("idle");
  });

  it("o motorista cancela a frenagem com volante brusco ou acelerador a fundo", () => {
    const base = withTarget(50, "staticVehicle", 8);
    expect(assessAeb(base).stage).toBe("emergency");
    expect(assessAeb({ ...base, evasiveSteer: true }).stage).not.toBe("emergency");
    expect(assessAeb({ ...base, accel: 2 }).stage).not.toBe("emergency");
  });

  it("a sensibilidade alta antecipa o alerta", () => {
    const base = withTarget(60, "staticVehicle", 40);
    const low = assessAeb({ ...base, settings: { ...base.settings, fcwSensitivity: "low" } });
    const high = assessAeb({ ...base, settings: { ...base.settings, fcwSensitivity: "high" } });
    expect(low.stage).toBe("idle");
    expect(high.stage).toBe("warn");
  });

  it("o AEB derruba o ACC", () => {
    let s = run(driving(50), { type: "accPower" }, { type: "setButton", long: false });
    s = run(s, { type: "target", target: { kind: "staticVehicle", distance: 8, speed: 0 } });
    s = advance(s, 0.3);
    expect(s.acc.mode).toBe("suspended");
  });
});

describe("LDW, ponto cego, farol alto e câmera 360°", () => {
  it("LDW: ativa a 65 km/h, fica em espera até 60 km/h e desliga abaixo", () => {
    let s = advance(driving(70), 0.1);
    expect(s.ldw).toBe("active");
    s = advance({ ...s, speed: 62 }, 0.1);
    expect(s.ldw).toBe("standby");
    s = advance({ ...s, speed: 55 }, 0.1);
    expect(s.ldw).toBe("off");
  });

  it("LDW avisa ao cruzar a linha sem seta, e cala com seta ou pisca-alerta", () => {
    let s = advance(driving(90, { lateral: -1.05 }), 0.1);
    expect(evaluate(s).ldwWarn).toBe(true);
    expect(evaluate({ ...s, turnSignal: "left" }).ldwWarn).toBe(false);
    expect(evaluate({ ...s, hazard: true }).ldwWarn).toBe(false);
  });

  it("BSD: ativa a 15 km/h, espera até 10 km/h, depois desliga", () => {
    let s = advance(driving(20), 0.1);
    expect(s.bsd).toBe("active");
    s = advance({ ...s, speed: 12 }, 0.1);
    expect(s.bsd).toBe("standby");
    s = advance({ ...s, speed: 8 }, 0.1);
    expect(s.bsd).toBe("off");
  });

  it("BSD: nível 1 só com carro no ponto cego; nível 2 com a seta do mesmo lado", () => {
    let s = advance(driving(60, { blind: { left: true, right: false } }), 0.1);
    expect(evaluate(s).bsdWarn).toEqual({ left: 1, right: 0 });
    s = { ...s, turnSignal: "left" };
    expect(evaluate(s).bsdWarn.left).toBe(2);
    s = { ...s, turnSignal: "right" };
    expect(evaluate(s).bsdWarn.left).toBe(1);
  });

  it("RCTA: só em marcha à ré", () => {
    const s = advance({ ...driving(3), gear: "R", cross: { left: true, right: false } }, 0.1);
    expect(evaluate(s).rctaWarn.left).toBe(true);
    expect(evaluate({ ...s, gear: "D" }).rctaWarn.left).toBe(false);
  });

  it("farol alto inteligente: liga acima de 40 km/h, desliga abaixo de 30, e respeita via iluminada e carro vindo", () => {
    let s = run(driving(50), { type: "ihcPush" });
    s = advance(s, 0.1);
    expect(evaluate(s).highBeam).toBe(true);
    expect(evaluate({ ...s, roadLit: true }).highBeam).toBe(false);
    expect(evaluate({ ...s, oncoming: true }).highBeam).toBe(false);
    s = advance({ ...s, speed: 35 }, 0.1);
    expect(evaluate(s).highBeam).toBe(true);
    s = advance({ ...s, speed: 25 }, 0.1);
    expect(evaluate(s).highBeam).toBe(false);
  });

  it("câmera 360°: abre abaixo de 20 km/h e fecha acima de 30 km/h", () => {
    let s = advance(driving(10, { gear: "R" }), 0.1);
    expect(s.avmOn).toBe(true);
    s = advance({ ...s, gear: "D", avmManual: true, speed: 25 }, 0.1);
    expect(s.avmOn).toBe(true);
    s = advance({ ...s, speed: 35 }, 0.1);
    expect(s.avmOn).toBe(false);
    s = advance({ ...s, speed: 25 }, 0.1);
    expect(s.avmOn).toBe(false);
  });
});

describe("Estado geral", () => {
  it("não deixa engatar R ou P em movimento", () => {
    expect(run(driving(40), { type: "gear", gear: "R" }).gear).toBe("D");
    expect(run(driving(40), { type: "gear", gear: "P" }).gear).toBe("D");
  });

  it("desligar o carro zera os assistentes", () => {
    let s = run(driving(0), { type: "accPower" });
    s = run(s, { type: "ignition" });
    expect(s.ignitionOn).toBe(false);
    expect(s.acc.mode).toBe("off");
  });
});

describe("volante e faixas", () => {
  it("esterçar para a esquerda sem seta dispara o LDW; seta cala o aviso", () => {
    let s = driving(90, { steer: -1 });
    s = advance(s, 1.0);
    expect(s.lateral).toBeLessThan(-0.85);
    expect(evaluate(s).ldwWarn).toBe(true);
    expect(evaluate({ ...s, turnSignal: "left" }).ldwWarn).toBe(false);
  });

  it("trocar de faixa completa a manobra sem alerta ao final", () => {
    let s = driving(90, { steer: -1, turnSignal: "left" });
    s = advance(s, 2.6);
    expect(s.lateral).toBeLessThan(-3.2);
    s = { ...s, steer: 0 };
    s = advance(s, 0.1);
    expect(s.laneDeparture).toBe(false);
  });

  it("carro parado na outra faixa não é alvo do AEB nem causa colisão", () => {
    let s = driving(60, { lateral: -3.5, target: { kind: "staticVehicle", distance: 40, speed: 0 } });
    s = advance(s, 6);
    expect(s.collided).toBe(false);
    expect(s.speed).toBeGreaterThan(40);
    expect(s.aeb).toBe("idle");
  });

  it("carro parado na sua faixa continua sendo alvo", () => {
    let s = driving(60, { target: { kind: "staticVehicle", distance: 40, speed: 0 } });
    s = advance(s, 0.5);
    expect(["warn", "partial", "emergency"]).toContain(s.aeb);
  });
});

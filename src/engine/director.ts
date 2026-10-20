import { inPath, laneWidth } from "./engine";
import type { Action, SimState } from "./types";

/**
 * Diretor da "Estrada livre": decide, de tempos em tempos, o que aparece na
 * pista (carro à frente, carro parado, pedestre, carro no ponto cego, carro vindo
 * de frente). Regras puras e determinísticas a partir da semente, para testar.
 * Distâncias e frequências são ILUSTRATIVAS.
 */

interface Pending {
  at: number;
  actions: Action[];
}

export interface DirState {
  seed: number;
  nextAt: number;
  nightAt: number;
  stuckSince: number | null;
  nextOnc: number;
  pending: Pending[];
}

export function createDirector(clock: number, seed = 7): DirState {
  return { seed, nextAt: clock + 4, nightAt: clock + 110, stuckSince: null, nextOnc: clock + 6, pending: [] };
}

function rand(d: DirState): number {
  // mulberry32
  let t = (d.seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

const currentLane = (s: SimState): -1 | 0 | 1 => Math.max(-1, Math.min(1, Math.round(s.lateral / laneWidth(s)))) as -1 | 0 | 1;

export function directorStep(s: SimState, prev: DirState): { actions: Action[]; dir: DirState } {
  const dir: DirState = { ...prev, pending: [...prev.pending] };
  const actions: Action[] = [];
  if (!s.ignitionOn) return { actions, dir };

  // Ações agendadas (apagar o carro do ponto cego, por exemplo).
  const due = dir.pending.filter((p) => p.at <= s.clock);
  dir.pending = dir.pending.filter((p) => p.at > s.clock);
  for (const p of due) actions.push(...p.actions);

  const serra = s.world === "serra";

  // Carros vindo em sentido contrário na Serra.
  if (serra && s.clock >= dir.nextOnc) {
    if (s.oncomingList.length < 3 && s.route.s > 200 && !s.route.finished) {
      actions.push({
        type: "set",
        key: "oncomingList",
        value: [...s.oncomingList, { d: 240 + rand(dir) * 90, v: 45 + rand(dir) * 30 }],
      });
    }
    dir.nextOnc = s.clock + 9 + rand(dir) * 16;
  }

  // Dia e noite (só na rodovia: na Serra o horário é escolhido no menu).
  if (!serra && s.clock >= dir.nightAt) {
    actions.push({ type: "set", key: "night", value: !s.night });
    dir.nightAt = s.clock + 110;
  }

  // Limpar alvo que ficou para trás, que fugiu ou que bloqueia o carro parado.
  const t = s.target;
  if (t.kind !== "none") {
    const passed = t.distance < -40;
    const escaped = t.kind === "movingVehicle" && t.distance > 260;
    const blocked = s.speed < 1 && inPath(s) && t.kind !== "movingVehicle";
    if (blocked || s.collided) {
      dir.stuckSince ??= s.clock;
      if (s.clock - dir.stuckSince > 3.5) {
        actions.push({ type: "clearTarget" });
        dir.stuckSince = null;
        dir.nextAt = Math.max(dir.nextAt, s.clock + 6);
      }
    } else {
      dir.stuckSince = null;
    }
    if (passed || escaped) {
      actions.push({ type: "clearTarget" });
      dir.nextAt = Math.max(dir.nextAt, s.clock + 5 + rand(dir) * 6);
    }
    return { actions, dir };
  }

  if (s.clock < dir.nextAt || s.gear !== "D") return { actions, dir };
  if (s.speed < 12) {
    dir.nextAt = s.clock + 2;
    return { actions, dir };
  }

  if (serra) {
    const r = rand(dir);
    const near = s.route.s < 420 || s.route.s > 9500;
    if (near) {
      dir.nextAt = s.clock + 5;
      return { actions, dir };
    }
    if (r < 0.5) {
      actions.push({
        type: "target",
        target: {
          kind: "movingVehicle",
          distance: 90 + rand(dir) * 50,
          speed: 32 + rand(dir) * 24,
          lane: 0,
          variant: rand(dir) < 0.45 ? 1 : 0,
        },
      });
    } else if (r < 0.72) {
      actions.push({ type: "target", target: { kind: "staticVehicle", distance: 140 + rand(dir) * 40, speed: 0, lane: 1 } });
    } else if (r < 0.9) {
      actions.push({
        type: "target",
        target: { kind: "pedestrian", distance: 100 + rand(dir) * 40, speed: 0, lane: 1, variant: Math.floor(rand(dir) * 3) },
      });
    } else {
      actions.push({ type: "target", target: { kind: "staticVehicle", distance: 150 + rand(dir) * 30, speed: 0, lane: 0 } });
    }
    dir.nextAt = s.clock + 14 + rand(dir) * 14;
    return { actions, dir };
  }

  // Escolher o próximo acontecimento.
  const lane = currentLane(s);
  const options: { w: number; run: () => void }[] = [
    {
      w: 3,
      run: () =>
        actions.push({
          type: "target",
          target: {
            kind: "movingVehicle",
            distance: 110 + rand(dir) * 40,
            speed: Math.max(40, Math.min(100, s.speed * (0.5 + rand(dir) * 0.3))),
            lane,
            variant: rand(dir) < 0.3 ? 1 : 0,
          },
        }),
    },
    {
      w: 2,
      run: () =>
        actions.push({ type: "target", target: { kind: "staticVehicle", distance: 150 + rand(dir) * 40, speed: 0, lane } }),
    },
    {
      w: 2,
      run: () =>
        actions.push({ type: "target", target: { kind: "pedestrian", distance: 100 + rand(dir) * 40, speed: 0, lane, variant: Math.floor(rand(dir) * 3) } }),
    },
  ];
  const sides = [lane > -1 ? "left" : null, lane < 1 ? "right" : null].filter(Boolean) as ("left" | "right")[];
  if (sides.length && !s.blind.left && !s.blind.right) {
    options.push({
      w: 2,
      run: () => {
        const side = sides[Math.floor(rand(dir) * sides.length)];
        actions.push({ type: "set", key: "blind", value: { left: side === "left", right: side === "right" } });
        dir.pending.push({
          at: s.clock + 7,
          actions: [{ type: "set", key: "blind", value: { left: false, right: false } }],
        });
      },
    });
  }
  if (s.night && !s.oncoming) {
    options.push({
      w: 2,
      run: () => {
        actions.push({ type: "set", key: "oncoming", value: true });
        dir.pending.push({ at: s.clock + 8, actions: [{ type: "set", key: "oncoming", value: false }] });
      },
    });
    options.push({
      w: 1,
      run: () => {
        actions.push({ type: "set", key: "roadLit", value: true });
        dir.pending.push({ at: s.clock + 8, actions: [{ type: "set", key: "roadLit", value: false }] });
      },
    });
  }

  const total = options.reduce((a, o) => a + o.w, 0);
  let r = rand(dir) * total;
  for (const o of options) {
    r -= o.w;
    if (r <= 0) {
      o.run();
      break;
    }
  }
  dir.nextAt = s.clock + 10 + rand(dir) * 8;
  return { actions, dir };
}

/**
 * Rotas do simulador. Tudo aqui é ILUSTRATIVO: a estrada "Serra" é um trajeto
 * inventado para este projeto, não representa nenhuma rodovia real.
 *
 * Convenção: curvatura positiva = curva à ESQUERDA; inclinação positiva = subida
 * (metros de altura por metro percorrido).
 */

export type WorldId = "highway" | "serra";

export interface RoadPoint {
  /** curvatura (1/m), + esquerda */
  kappa: number;
  /** inclinação (subida / percurso) */
  grade: number;
  /** direção da pista (rad, + esquerda) */
  heading: number;
  /** altitude em relação ao início (m) */
  elev: number;
}

export interface GeoInfo {
  /** largura da faixa */
  lane: number;
  /** posição lateral a partir da qual o carro bate na lateral direita / esquerda */
  crashRight: number;
  crashLeft: number;
  /** distância do centro da faixa em que o carro pisa na linha */
  departAt: number;
}

export const GEO: Record<WorldId, GeoInfo> = {
  highway: { lane: 3.5, crashRight: 99, crashLeft: -99, departAt: 0.85 },
  serra: { lane: 3.3, crashRight: 2.0, crashLeft: -5.2, departAt: 0.75 },
};

/** Posição lateral do centro de cada faixa: -1 esquerda (sentido oposto na serra), 0 a sua, 1 direita. */
export function laneX(world: WorldId, lane: number): number {
  if (world === "serra") return lane < 0 ? -GEO.serra.lane : lane > 0 ? 2.3 : 0;
  return lane * GEO.highway.lane;
}

export const SERRA_LENGTH = 10000;
export const SERRA_VILLAGE_START = 360;
export const SERRA_VILLAGE_END = 9640;
export const SERRA_BRIDGE = { start: 5120, end: 5480 };
export const SERRA_VIEWPOINT = 6900;
export const SERRA_LIMIT = 60;

export interface Curve {
  start: number;
  end: number;
  /** raio (m) */
  radius: number;
  /** +1 esquerda, -1 direita */
  dir: 1 | -1;
  /** velocidade recomendada na placa (km/h) */
  advised: number;
}

function mulberry(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Velocidade confortável (km/h, múltiplos de 5) para um raio de curva. ILUSTRATIVO. */
export function advisedSpeed(radius: number): number {
  return Math.max(20, Math.floor((Math.sqrt(3.2 * radius) * 3.6) / 5) * 5);
}

const STEP = 2;
const SPIRAL = 28;

const GRADE_POINTS: [number, number][] = [
  [0, 0],
  [380, 0],
  [900, 0.04],
  [2600, 0.062],
  [3700, 0.03],
  [4300, 0.05],
  [5000, 0.0],
  [5600, 0.0],
  [6250, 0.045],
  [6900, 0.0],
  [7450, -0.05],
  [8900, -0.07],
  [9450, -0.03],
  [9700, 0],
  [SERRA_LENGTH, 0],
];

function gradeAt(s: number): number {
  const p = GRADE_POINTS;
  if (s <= p[0][0]) return p[0][1];
  for (let i = 1; i < p.length; i++) {
    if (s <= p[i][0]) {
      const t = (s - p[i - 1][0]) / (p[i][0] - p[i - 1][0]);
      const e = t * t * (3 - 2 * t);
      return p[i - 1][1] + (p[i][1] - p[i - 1][1]) * e;
    }
  }
  return p[p.length - 1][1];
}

/* Curvatura por trechos: retas e curvas (com transição suave) sorteadas com semente fixa. */
const CURVES: Curve[] = [];
const kappaTable: number[] = new Array(Math.ceil(SERRA_LENGTH / STEP) + 2).fill(0);
{
  const r = mulberry(20261019);
  let s = SERRA_VILLAGE_START + 90;
  let flip = 1;
  while (s < SERRA_VILLAGE_END - 260) {
    const progress = s / SERRA_LENGTH;
    const straight = 45 + r() * (190 - 90 * Math.min(1, progress * 1.4));
    s += straight;
    if (s > SERRA_BRIDGE.start - 160 && s < SERRA_BRIDGE.end + 120) {
      s = SERRA_BRIDGE.end + 120;
      continue;
    }
    const rr = r();
    const radius = 52 + rr * rr * (progress > 0.55 && progress < 0.92 ? 80 : 110);
    const angle = 0.45 + r() * 0.95;
    const arc = Math.max(40, radius * angle);
    flip = r() < 0.7 ? -flip : flip;
    const total = SPIRAL * 2 + arc;
    if (s + total > SERRA_VILLAGE_END - 200) break;
    const K = flip / radius;
    for (let x = 0; x <= total; x += STEP) {
      const i = Math.round((s + x) / STEP);
      const t = x < SPIRAL ? x / SPIRAL : x > total - SPIRAL ? (total - x) / SPIRAL : 1;
      kappaTable[i] = K * t * t * (3 - 2 * t);
    }
    CURVES.push({ start: s + SPIRAL * 0.5, end: s + total - SPIRAL * 0.5, radius, dir: flip as 1 | -1, advised: advisedSpeed(radius) });
    s += total;
  }
}

const headingTable: number[] = [0];
const elevTable: number[] = [0];
for (let i = 1; i < kappaTable.length; i++) {
  headingTable.push(headingTable[i - 1] + kappaTable[i - 1] * STEP);
  elevTable.push(elevTable[i - 1] + gradeAt((i - 1) * STEP) * STEP);
}

export const SERRA_CURVES: readonly Curve[] = CURVES;

function lerpTable(t: number[], s: number): number {
  const f = Math.min(Math.max(s, 0), (t.length - 1) * STEP) / STEP;
  const i = Math.floor(f);
  const j = Math.min(i + 1, t.length - 1);
  return t[i] + (t[j] - t[i]) * (f - i);
}

const FLAT: RoadPoint = { kappa: 0, grade: 0, heading: 0, elev: 0 };

export function roadAt(world: WorldId, s: number): RoadPoint {
  if (world !== "serra") return FLAT;
  return {
    kappa: lerpTable(kappaTable, s),
    grade: gradeAt(s),
    heading: lerpTable(headingTable, s),
    elev: lerpTable(elevTable, s),
  };
}

/** Próxima curva à frente de `s` (até `within` metros), ou a curva em que o carro está. */
export function nextCurve(world: WorldId, s: number, within = 400): Curve | null {
  if (world !== "serra") return null;
  for (const c of CURVES) {
    if (c.end < s) continue;
    if (c.start - s <= within) return c;
    return null;
  }
  return null;
}

/**
 * Deslocamentos do traçado à frente do carro, no referencial do carro:
 * x (+ direita) e y (+ para cima) a `d` metros adiante, medidos pelo percurso.
 */
export function pathOffset(world: WorldId, s: number, d: number): { x: number; y: number } {
  if (world !== "serra") return { x: 0, y: 0 };
  const h0 = lerpTable(headingTable, s);
  let x = 0;
  const step = d >= 0 ? 4 : -4;
  const n = Math.max(1, Math.round(Math.abs(d) / 4));
  const ds = d / n;
  for (let k = 0; k < n; k++) {
    const mid = s + (k + 0.5) * ds;
    x -= Math.sin(lerpTable(headingTable, mid) - h0) * ds;
  }
  void step;
  const y = lerpTable(elevTable, s + d) - lerpTable(elevTable, s);
  return { x, y };
}

/** Direção da pista no ponto `s` em relação a `ref` (rad, + esquerda). */
export function headingDelta(world: WorldId, s: number, ref: number): number {
  return world === "serra" ? lerpTable(headingTable, s) - lerpTable(headingTable, ref) : 0;
}

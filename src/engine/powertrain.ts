/**
 * Motor 1.5 turbo e câmbio CVT. Números de referência (fonte: fichas técnicas
 * publicadas por sites automotivos, NÃO o manual): 147 cv a gasolina, 21,4 kgfm,
 * 1.452 kg, 0 a 100 km/h em ~10,3 s, máxima ~193 km/h, pneus 225/55 R18.
 * A curva de torque, as relações do CVT e as perdas são ILUSTRATIVAS, ajustadas
 * para o carro simulado reproduzir esses números.
 */

export const PT = {
  /** raio do pneu 225/55 R18 (m) */
  wheelR: 0.352,
  /** torque máximo (N·m): 21,4 kgfm */
  torque: 210,
  /** relação total mais curta (arrancada) e mais longa (velocidade final) */
  ratioMax: 13,
  ratioMin: 3.3,
  /** rendimento da transmissão (inclui perdas do CVT) */
  eta: 0.84,
  idle: 800,
  redline: 6200,
  /** massa em ordem de marcha + motorista (kg) */
  mass: 1530,
} as const;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

/** Torque do motor (N·m) a plena carga: turbo "enche" depois de ~1.700 rpm e cai perto do limite. */
export function torqueAt(rpm: number): number {
  const boost = 0.55 + 0.45 * smooth(1000, 1900, rpm);
  const fall = 1 - 0.1 * smooth(4200, 5600, rpm) - 0.1 * smooth(5600, 6200, rpm);
  return PT.torque * boost * fall;
}

const OMEGA = 0.10472; // rpm → rad/s

/** Rotação que o CVT escolhe para a velocidade (m/s) e a carga do pedal (0 a 1). */
export function cvtRpm(v: number, throttle: number): number {
  const want = throttle > 0.03 ? 1500 + 3400 * Math.pow(throttle, 0.85) : 1350;
  const ratio = clamp((want * OMEGA * PT.wheelR) / Math.max(v, 0.1), PT.ratioMin, PT.ratioMax);
  return clamp((v * ratio) / (OMEGA * PT.wheelR), PT.idle, PT.redline);
}

/** Força de tração nas rodas (N). */
export function wheelForce(v: number, throttle: number): number {
  const rpm = cvtRpm(v, throttle);
  const ratio = clamp((rpm * OMEGA * PT.wheelR) / Math.max(v, 0.1), PT.ratioMin, PT.ratioMax);
  const traction = 0.95 * PT.mass * 9.81 * 0.62; // limite de aderência do eixo dianteiro
  return Math.min(traction, (throttle * torqueAt(rpm) * ratio * PT.eta) / PT.wheelR);
}

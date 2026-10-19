import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";

/**
 * Bipes simples (osciladores) para você ouvir o que cada alerta faz.
 * Sons e ritmos são ILUSTRATIVOS: o manual não descreve a sonoridade.
 */

interface Pattern {
  id: string;
  freq: number;
  period: number;
  dur: number;
}

export function pickPattern(s: SimState, d: Derived): Pattern | null {
  if (!s.ignitionOn) return null;
  if (s.collided) return null;
  if (s.aeb === "partial" || s.aeb === "emergency") return { id: "aeb", freq: 1400, period: 0.18, dur: 0.1 };
  if (d.messages.includes("aebWarn")) return { id: "fcw", freq: 1100, period: 0.34, dur: 0.14 };
  if (d.rctaWarn.left || d.rctaWarn.right) return { id: "rcta", freq: 900, period: 0.4, dur: 0.15 };
  if (d.bsdWarn.left === 2 || d.bsdWarn.right === 2) return { id: "bsd", freq: 820, period: 0.3, dur: 0.12 };
  if (d.ldwWarn) return { id: "ldw", freq: 520, period: 0.5, dur: 0.2 };
  if (d.messages.includes("takeover")) return { id: "takeover", freq: 700, period: 0.6, dur: 0.2 };
  if (d.fdmWarn) return { id: "fdm", freq: 640, period: 0.7, dur: 0.15 };
  return null;
}

export function createBeeper() {
  let ctx: AudioContext | null = null;
  let enabled = false;
  let nextAt = 0;
  let lastId = "";

  const beep = (freq: number, dur: number) => {
    if (!ctx) return;
    const t = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.06, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  };

  return {
    isEnabled: () => enabled,
    setEnabled(on: boolean) {
      enabled = on;
      if (on) {
        ctx ??= new AudioContext();
        void ctx.resume();
        beep(660, 0.08);
      }
    },
    update(s: SimState, d: Derived) {
      if (!enabled || !ctx) return;
      const p = pickPattern(s, d);
      if (!p) {
        lastId = "";
        return;
      }
      const now = ctx.currentTime;
      if (p.id !== lastId || now >= nextAt) {
        beep(p.freq, p.dur);
        nextAt = now + p.period;
        lastId = p.id;
      }
    },
    dispose() {
      void ctx?.close();
      ctx = null;
    },
  };
}

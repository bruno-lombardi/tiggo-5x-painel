import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";
import { pickPattern } from "./audio";

/**
 * Ambiente sonoro sintetizado em tempo real (Web Audio), sem arquivos de áudio.
 * Todos os sons são ILUSTRATIVOS: o manual não descreve a sonoridade do carro.
 *
 * Camadas contínuas: motor, vento, pneus, ambiente (pássaros de dia, grilos de noite),
 * carros passando. Eventos: partida, câmbio, seta, freio de estacionamento, portas,
 * cintos, alertas dos assistentes, frenagem, colisão e buzina.
 */

/* Mesma fórmula do cenário 3D, para o som acompanhar o que se vê. */
const hash = (n: number) => {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
};
export const TRAFFIC_REL_SPEED = 22; // m/s do tráfego do sentido oposto
export const TRAFFIC_COUNT = 1500;
/** Distância relativa acumulada em que cada carro do sentido oposto cruza o seu. */
export const TRAFFIC_AT: number[] = (() => {
  const out: number[] = [];
  let d = 60;
  for (let k = 0; k < TRAFFIC_COUNT; k++) {
    d += 50 + hash(k + 1) * 150;
    out.push(d);
  }
  return out;
})();

type Bus = AudioNode;

interface Voice {
  gain: GainNode;
  set(gain: number, freq: number, pan: number, bright: number): void;
}

export interface Soundscape {
  isEnabled(): boolean;
  setEnabled(on: boolean): void;
  setVolume(v: number): void;
  update(s: SimState, d: Derived): void;
  /** sons da interface: missão concluída etc. */
  ui(kind: "ok" | "fail" | "step"): void;
  dispose(): void;
}

export function createSoundscape(): Soundscape {
  let ctx: AudioContext | null = null;
  let enabled = false;
  let volume = 0.8;

  let master: GainNode;
  let ext: GainNode; // sons de fora do carro (passam pela "lataria")
  let extLP: BiquadFilterNode;
  let inn: GainNode; // sons de dentro
  let noiseBuf: AudioBuffer;

  /* camadas contínuas */
  let engGain: GainNode;
  let engLP: BiquadFilterNode;
  let engOsc: OscillatorNode[] = [];
  let engNoiseGain: GainNode;
  let windGain: GainNode;
  let windBP: BiquadFilterNode;
  let tireGain: GainNode;
  let tireLP: BiquadFilterNode;
  let rumbleEnable: GainNode;
  let squealGain: GainNode;
  let squealBP: BiquadFilterNode;
  let absGain: GainNode;
  let treesGain: GainNode;
  let cricketGain: GainNode;
  let voices: Record<string, Voice> = {};

  /* memória entre atualizações */
  let prev: SimState | null = null;
  let lastBlink = -1;
  let nextBelt = 0;
  let nextDoor = 0;
  let nextRev = 0;
  let nextBird = 0;
  let nextBeep = 0;
  let lastPattern = "";
  let cum = 0;
  let cumBase: { odo: number; clock: number } | null = null;
  let nextCar = 0;
  let prevOncomingZ = -999;
  let engineHold = 0;
  let hornNodes: { stop(): void } | null = null;

  const now = () => ctx!.currentTime;

  /* ---------- blocos de construção ---------- */
  const noise = (loop = true) => {
    const src = ctx!.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = loop;
    return src;
  };

  const env = (g: GainNode, t: number, peak: number, attack: number, dur: number) => {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  };

  const tone = (
    freq: number,
    dur: number,
    o: { type?: OscillatorType; gain?: number; to?: number; at?: number; attack?: number; out?: Bus; pan?: number; lp?: number } = {},
  ) => {
    if (!ctx) return;
    const t = now() + (o.at ?? 0);
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = o.type ?? "sine";
    osc.frequency.setValueAtTime(freq, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    env(g, t, o.gain ?? 0.1, o.attack ?? 0.008, dur);
    let node: AudioNode = osc;
    if (o.lp) {
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = o.lp;
      node.connect(f);
      node = f;
    }
    node.connect(g);
    let tail: AudioNode = g;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(o.out ?? inn);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  };

  const burst = (
    dur: number,
    o: { type?: BiquadFilterType; f0?: number; f1?: number; q?: number; gain?: number; at?: number; attack?: number; out?: Bus; pan?: number } = {},
  ) => {
    if (!ctx) return;
    const t = now() + (o.at ?? 0);
    const src = noise(false);
    const f = ctx.createBiquadFilter();
    f.type = o.type ?? "lowpass";
    f.frequency.setValueAtTime(o.f0 ?? 1000, t);
    if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, t + dur);
    f.Q.value = o.q ?? 0.8;
    const g = ctx.createGain();
    env(g, t, o.gain ?? 0.2, o.attack ?? 0.01, dur);
    src.connect(f).connect(g);
    let tail: AudioNode = g;
    if (o.pan !== undefined && ctx.createStereoPanner) {
      const p = ctx.createStereoPanner();
      p.pan.value = o.pan;
      g.connect(p);
      tail = p;
    }
    tail.connect(o.out ?? inn);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.05);
  };

  /* ---------- sons pontuais ---------- */
  const chime = (notes: number[], gap = 0.13, gain = 0.09, type: OscillatorType = "sine") =>
    notes.forEach((n, i) => tone(n, 0.45, { type, gain, at: i * gap, attack: 0.006 }));

  const click = (gain = 0.12, f = 2600) => burst(0.03, { type: "bandpass", f0: f, q: 2, gain });

  const thunk = (gain = 0.25) => {
    tone(120, 0.18, { to: 45, gain });
    burst(0.07, { type: "lowpass", f0: 900, gain: gain * 0.6 });
  };

  const turnTick = (high: boolean) => {
    tone(high ? 2100 : 1500, 0.03, { type: "square", gain: 0.05, lp: 3500 });
    burst(0.02, { type: "bandpass", f0: high ? 3200 : 2400, q: 3, gain: 0.08 });
    tone(high ? 320 : 260, 0.05, { gain: 0.05 });
  };

  const starter = () => {
    if (!ctx) return;
    const t = now();
    // motor de arranque: ronco com pulsos de compressão
    const osc = ctx.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(70, t);
    osc.frequency.linearRampToValueAtTime(110, t + 0.8);
    const am = ctx.createOscillator();
    am.frequency.value = 13;
    const amg = ctx.createGain();
    amg.gain.value = 0.5;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.09, t + 0.08);
    g.gain.setValueAtTime(0.09, t + 0.75);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 700;
    const mod = ctx.createGain();
    mod.gain.value = 0.55;
    am.connect(amg).connect(mod.gain);
    osc.connect(lp).connect(mod).connect(g).connect(inn);
    osc.start(t);
    am.start(t);
    osc.stop(t + 1.1);
    am.stop(t + 1.1);
    engineHold = t + 1.1;
    // o motor "pega": sobe a rotação por um instante
    if (engOsc.length) {
      engGain.gain.cancelScheduledValues(t);
      engGain.gain.setValueAtTime(0.0001, t);
      engGain.gain.setValueAtTime(0.0001, t + 0.8);
      engGain.gain.linearRampToValueAtTime(0.16, t + 0.95);
    }
    chime([784, 988, 1175], 0.12, 0.05);
  };

  const epbMotor = () => {
    tone(190, 0.7, { type: "sawtooth", gain: 0.035, lp: 600, to: 150 });
    click(0.1, 1800);
    click(0.1, 1800);
  };

  const crash = () => {
    burst(0.9, { type: "lowpass", f0: 3500, f1: 150, gain: 0.7, attack: 0.004, out: master });
    tone(90, 0.7, { to: 28, gain: 0.5, out: master });
    for (let i = 0; i < 9; i++) {
      tone(3500 + Math.random() * 5000, 0.06 + Math.random() * 0.08, { type: "triangle", gain: 0.05, at: 0.05 + Math.random() * 0.5, out: master });
    }
    burst(0.35, { type: "bandpass", f0: 1800, q: 0.7, gain: 0.25, at: 0.08, out: master });
  };

  const whoosh = (pan: number, strength: number) => {
    burst(1.4, { type: "bandpass", f0: 500, f1: 1400, q: 0.9, gain: 0.12 * strength, attack: 0.5, out: ext, pan });
    burst(1.4, { type: "bandpass", f0: 1400, f1: 300, q: 0.7, gain: 0.1 * strength, attack: 0.55, out: ext, pan: -pan * 0.2 });
    tone(150, 1.3, { type: "sawtooth", to: 85, gain: 0.04 * strength, attack: 0.5, lp: 400, out: ext, pan });
  };

  const chirp = () => {
    const pan = Math.random() * 1.6 - 0.8;
    const base = 2400 + Math.random() * 1800;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      tone(base, 0.09, { gain: 0.03, to: base * (1.25 + Math.random() * 0.4), at: i * 0.13, attack: 0.01, out: ext, pan });
    }
  };

  const horn = (on: boolean) => {
    if (!ctx) return;
    if (on && !hornNodes) {
      const t = now();
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.085, t + 0.03);
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 1800;
      const oscs = [410, 515].map((f) => {
        const o = ctx!.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.connect(lp);
        o.start(t);
        return o;
      });
      lp.connect(g).connect(ext);
      // a buzina é ouvida de fora e de dentro
      g.connect(inn);
      hornNodes = {
        stop() {
          const u = now();
          g.gain.cancelScheduledValues(u);
          g.gain.setTargetAtTime(0.0001, u, 0.03);
          oscs.forEach((o) => o.stop(u + 0.2));
        },
      };
    } else if (!on && hornNodes) {
      hornNodes.stop();
      hornNodes = null;
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "KeyC" && !e.repeat && !e.ctrlKey && !e.metaKey) horn(true);
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (e.code === "KeyC") horn(false);
  };

  /* ---------- vozes de outros veículos ---------- */
  const makeVoice = (): Voice => {
    const c = ctx!;
    const g = c.createGain();
    g.gain.value = 0;
    const lp = c.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 600;
    const o1 = c.createOscillator();
    o1.type = "sawtooth";
    o1.frequency.value = 80;
    const o2 = c.createOscillator();
    o2.type = "square";
    o2.frequency.value = 160;
    const o2g = c.createGain();
    o2g.gain.value = 0.35;
    const n = noise();
    const nf = c.createBiquadFilter();
    nf.type = "bandpass";
    nf.frequency.value = 700;
    const ng = c.createGain();
    ng.gain.value = 0.5;
    o1.connect(lp);
    o2.connect(o2g).connect(lp);
    n.connect(nf).connect(ng).connect(lp);
    const pan = c.createStereoPanner();
    lp.connect(g).connect(pan).connect(ext);
    o1.start();
    o2.start();
    n.start();
    return {
      gain: g,
      set(gain, freq, p, bright) {
        const t = c.currentTime;
        g.gain.setTargetAtTime(gain, t, 0.06);
        o1.frequency.setTargetAtTime(freq, t, 0.05);
        o2.frequency.setTargetAtTime(freq * 2.01, t, 0.05);
        lp.frequency.setTargetAtTime(300 + bright * 1400, t, 0.1);
        nf.frequency.setTargetAtTime(500 + bright * 1500, t, 0.1);
        pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, p)), t, 0.05);
      },
    };
  };

  /* ---------- montagem do grafo ---------- */
  const build = () => {
    ctx = new AudioContext();
    const c = ctx;
    const len = c.sampleRate * 2;
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    let b0 = 0;
    let b1 = 0;
    let b2 = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      // ruído "rosa" simples: soa mais natural que o branco
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      data[i] = (b0 + b1 + b2 + w * 0.1848) * 0.25;
    }

    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 6;
    master = c.createGain();
    master.gain.value = volume;
    master.connect(comp).connect(c.destination);

    inn = c.createGain();
    inn.connect(master);
    ext = c.createGain();
    extLP = c.createBiquadFilter();
    extLP.type = "lowpass";
    extLP.frequency.value = 2200;
    ext.connect(extLP).connect(master);

    /* motor: quatro cilindros → dois disparos por volta */
    engGain = c.createGain();
    engGain.gain.value = 0;
    engLP = c.createBiquadFilter();
    engLP.type = "lowpass";
    engLP.frequency.value = 500;
    engLP.Q.value = 1.2;
    const mix = c.createGain();
    mix.gain.value = 1;
    const spec: [OscillatorType, number, number][] = [
      ["sawtooth", 1, 0.55],
      ["square", 2, 0.22],
      ["sawtooth", 3, 0.16],
      ["triangle", 0.5, 0.5],
    ];
    engOsc = spec.map(([type, mul, vol]) => {
      const o = c.createOscillator();
      o.type = type;
      o.frequency.value = 27 * mul;
      o.detune.value = (Math.random() - 0.5) * 8;
      const g = c.createGain();
      g.gain.value = vol;
      o.connect(g).connect(mix);
      o.start();
      (o as OscillatorNode & { mul: number }).mul = mul;
      return o;
    });
    mix.connect(engLP).connect(engGain);
    // leve variação de rotação para não soar eletrônico
    const wob = c.createOscillator();
    wob.frequency.value = 7.3;
    const wobG = c.createGain();
    wobG.gain.value = 3;
    wob.connect(wobG);
    engOsc.forEach((o) => wobG.connect(o.detune));
    wob.start();
    // sopro de admissão
    const intake = noise();
    const intakeBP = c.createBiquadFilter();
    intakeBP.type = "bandpass";
    intakeBP.frequency.value = 450;
    engNoiseGain = c.createGain();
    engNoiseGain.gain.value = 0;
    intake.connect(intakeBP).connect(engNoiseGain);
    intake.start();
    // o motor chega mais abafado: vai pelo "interior", com parte pelo exterior
    const engOut = c.createGain();
    engOut.gain.value = 1.5;
    engGain.connect(engOut).connect(inn);
    engNoiseGain.connect(engOut);

    /* vento */
    const w = noise();
    windBP = c.createBiquadFilter();
    windBP.type = "bandpass";
    windBP.frequency.value = 600;
    windBP.Q.value = 0.6;
    windGain = c.createGain();
    windGain.gain.value = 0;
    w.connect(windBP).connect(windGain).connect(ext);
    w.start();

    /* pneus no asfalto */
    const tn = noise();
    tireLP = c.createBiquadFilter();
    tireLP.type = "lowpass";
    tireLP.frequency.value = 300;
    tireGain = c.createGain();
    tireGain.gain.value = 0;
    tn.connect(tireLP).connect(tireGain).connect(ext);
    tn.start();

    /* faixa sonora na borda da pista */
    const rn = noise();
    const rlp = c.createBiquadFilter();
    rlp.type = "lowpass";
    rlp.frequency.value = 220;
    const rmod = c.createGain();
    rmod.gain.value = 0.5;
    const rlfo = c.createOscillator();
    rlfo.type = "square";
    rlfo.frequency.value = 26;
    const rlg = c.createGain();
    rlg.gain.value = 0.5;
    rlfo.connect(rlg).connect(rmod.gain);
    rumbleEnable = c.createGain();
    rumbleEnable.gain.value = 0;
    rn.connect(rlp).connect(rmod).connect(rumbleEnable).connect(inn);
    rn.start();
    rlfo.start();

    /* freada: chiado dos pneus e o "trac-trac" do ABS */
    const sn = noise();
    squealBP = c.createBiquadFilter();
    squealBP.type = "bandpass";
    squealBP.frequency.value = 2600;
    squealBP.Q.value = 5;
    squealGain = c.createGain();
    squealGain.gain.value = 0;
    sn.connect(squealBP).connect(squealGain).connect(ext);
    sn.start();
    const squealLfo = c.createOscillator();
    squealLfo.frequency.value = 5.5;
    const squealLfoG = c.createGain();
    squealLfoG.gain.value = 300;
    squealLfo.connect(squealLfoG).connect(squealBP.frequency);
    squealLfo.start();

    const an = noise();
    const alp = c.createBiquadFilter();
    alp.type = "lowpass";
    alp.frequency.value = 380;
    const amod = c.createGain();
    amod.gain.value = 0.5;
    const alfo = c.createOscillator();
    alfo.type = "square";
    alfo.frequency.value = 15;
    const alg = c.createGain();
    alg.gain.value = 0.5;
    alfo.connect(alg).connect(amod.gain);
    absGain = c.createGain();
    absGain.gain.value = 0;
    an.connect(alp).connect(amod).connect(absGain).connect(inn);
    an.start();
    alfo.start();

    /* ambiente: vento nas árvores e grilos */
    const tr = noise();
    const trBP = c.createBiquadFilter();
    trBP.type = "bandpass";
    trBP.frequency.value = 1100;
    trBP.Q.value = 0.5;
    treesGain = c.createGain();
    treesGain.gain.value = 0;
    tr.connect(trBP).connect(treesGain).connect(ext);
    tr.start();
    const trLfo = c.createOscillator();
    trLfo.frequency.value = 0.13;
    const trLfoG = c.createGain();
    trLfoG.gain.value = 500;
    trLfo.connect(trLfoG).connect(trBP.frequency);
    trLfo.start();

    const cr = c.createOscillator();
    cr.type = "sine";
    cr.frequency.value = 4400;
    const cr2 = c.createOscillator();
    cr2.type = "sine";
    cr2.frequency.value = 5100;
    const crMod = c.createGain();
    crMod.gain.value = 0.5;
    const crLfo = c.createOscillator();
    crLfo.type = "square";
    crLfo.frequency.value = 17;
    const crLfoG = c.createGain();
    crLfoG.gain.value = 0.5;
    crLfo.connect(crLfoG).connect(crMod.gain);
    const crSlow = c.createOscillator();
    crSlow.type = "square";
    crSlow.frequency.value = 1.7;
    const crSlowG = c.createGain();
    crSlowG.gain.value = 0.5;
    const crSlowMod = c.createGain();
    crSlowMod.gain.value = 0.5;
    crSlow.connect(crSlowG).connect(crSlowMod.gain);
    cricketGain = c.createGain();
    cricketGain.gain.value = 0;
    cr.connect(crMod);
    cr2.connect(crMod);
    crMod.connect(crSlowMod).connect(cricketGain).connect(ext);
    cr.start();
    cr2.start();
    crLfo.start();
    crSlow.start();

    voices = {
      oncoming: makeVoice(),
      blindL: makeVoice(),
      blindR: makeVoice(),
      crossL: makeVoice(),
      crossR: makeVoice(),
      lead: makeVoice(),
    };
  };

  const tauSet = (p: AudioParam, v: number, tau = 0.08) => p.setTargetAtTime(v, now(), tau);

  /* ---------- atualização (a cada 100 ms) ---------- */
  function update(s: SimState, d: Derived) {
    if (!enabled || !ctx) return;
    const p = prev;
    const mps = s.speed / 3.6;
    const speedK = Math.min(1, s.speed / 150);

    /* cabine fechada ou porta aberta muda o que chega aos ouvidos */
    tauSet(extLP.frequency, s.doorClosed ? 1700 + speedK * 400 : 9000, 0.12);

    /* motor */
    const rpm = d.rpm;
    const f0 = Math.max(rpm, 0) / 60 * 2;
    const load = s.accel === 2 ? 1 : s.accel === 1 ? 0.6 : s.speed > 5 && s.gear === "D" ? 0.12 : 0.05;
    engOsc.forEach((o) => {
      const mul = (o as OscillatorNode & { mul: number }).mul;
      tauSet(o.frequency, Math.max(f0, 20) * mul, 0.06);
    });
    tauSet(engLP.frequency, 260 + rpm * 0.22 + load * 650, 0.1);
    if (s.ignitionOn && now() > engineHold) tauSet(engGain.gain, 0.05 + load * 0.1 + Math.min(rpm, 6000) / 6000 * 0.05, 0.1);
    if (!s.ignitionOn) tauSet(engGain.gain, 0.0001, 0.12);
    tauSet(engNoiseGain.gain, s.ignitionOn ? 0.01 + load * 0.05 : 0, 0.1);

    /* vento e pneus */
    tauSet(windGain.gain, 0.2 * Math.pow(speedK, 1.7), 0.15);
    tauSet(windBP.frequency, 500 + s.speed * 9, 0.15);
    tauSet(tireGain.gain, Math.min(0.28, 0.2 * Math.pow(Math.min(s.speed / 110, 1.2), 1.1)), 0.12);
    tauSet(tireLP.frequency, 180 + s.speed * 5.5, 0.15);

    /* faixa sonora e freada */
    tauSet(rumbleEnable.gain, s.laneDeparture && s.speed > 5 ? 0.55 : 0, 0.04);
    const hard = s.ignitionOn && s.speed > 18 && (s.absActive || s.aeb === "emergency");
    tauSet(squealGain.gain, hard ? 0.07 : 0, 0.05);
    tauSet(absGain.gain, hard ? 0.45 : 0, 0.05);
    if (s.brake && s.speed > 25 && !hard) burst(0.12, { type: "highpass", f0: 5000, gain: 0.015, out: ext });

    /* ambiente */
    const nightK = s.night ? 1 : 0;
    const masked = 1 - Math.min(1, s.speed / 120) * 0.8;
    tauSet(treesGain.gain, (0.035 - 0.015 * nightK) * masked, 0.4);
    tauSet(cricketGain.gain, 0.011 * nightK * masked, 0.5);
    if (!s.night && ctx.currentTime > nextBird && Math.random() < 0.12 * masked) {
      chirp();
      nextBird = ctx.currentTime + 1.5 + Math.random() * 3;
    }

    /* carros do sentido oposto (decorativos) e a numeração de passagens */
    if (!cumBase) {
      cumBase = { odo: s.odo, clock: s.clock };
      nextCar = TRAFFIC_AT.findIndex((x) => x > 0);
    }
    cum = (s.odo - cumBase.odo) * 1000 + TRAFFIC_REL_SPEED * (s.clock - cumBase.clock);
    if (nextCar >= 0 && cum >= TRAFFIC_AT[nextCar]) {
      while (nextCar < TRAFFIC_COUNT - 1 && cum >= TRAFFIC_AT[nextCar]) nextCar++;
      whoosh(-0.55, 0.45 + 0.55 * Math.min(1, (mps + TRAFFIC_REL_SPEED) / 45));
    }

    /* outros veículos com posição conhecida */
    const clk = s.clock;
    if (s.oncoming) {
      const z = -150 + ((clk * 26) % 190);
      const prox = 1 / (1 + Math.abs(z) / 18);
      const dop = z < 0 ? 1.08 : 0.9;
      voices.oncoming.set(0.2 * prox, 78 * dop, -0.6 - 0.2 * prox, 0.3 + prox * 0.7);
      if (prevOncomingZ < 0 && z >= 0) whoosh(-0.7, 1);
      prevOncomingZ = z;
    } else {
      voices.oncoming.set(0, 78, -0.6, 0.3);
      prevOncomingZ = -999;
    }
    const near = (flag: boolean, v: Voice, pan: number) => v.set(flag ? 0.09 + Math.min(0.1, mps * 0.004) : 0, 70 + Math.min(60, mps * 1.4), pan, 0.5);
    near(s.blind.left, voices.blindL, -0.75);
    near(s.blind.right, voices.blindR, 0.75);
    const crossSpan = 40;
    const phase = (clk * 5.5) % crossSpan;
    const crossVoice = (flag: boolean, v: Voice, x: number, z: number) => {
      const dist = Math.hypot(x, z - 0);
      v.set(flag && s.gear === "R" ? 0.16 / (1 + dist / 9) : flag ? 0.05 / (1 + dist / 12) : 0, 60 + Math.min(20, Math.abs(x)), x / 14, 0.4);
    };
    crossVoice(s.cross.left, voices.crossL, -20 + phase, 9.5);
    crossVoice(s.cross.right, voices.crossR, 20 - phase, 15);
    // carro à frente: motor distante, mais grave se for caminhão
    const t = s.target;
    const veh = t.kind === "movingVehicle" || t.kind === "staticVehicle";
    voices.lead.set(veh && t.distance < 60 && !s.collided ? 0.1 / (1 + t.distance / 10) : 0, t.variant === 1 ? 48 : 68, ((t.lane ?? 0) * 3.5 - s.lateral) / 9, 0.35);

    /* ré */
    if (s.ignitionOn && s.gear === "R" && s.speed < 12 && ctx.currentTime >= nextRev) {
      tone(1000, 0.33, { type: "square", gain: 0.035, lp: 2500, out: inn });
      nextRev = ctx.currentTime + 0.9;
    }

    /* setas: tique-taque no mesmo ritmo da luz */
    const signalling = s.ignitionOn && (s.hazard || s.turnSignal !== "none");
    const blink = Math.floor(clk * 2.6);
    if (signalling && blink !== lastBlink) turnTick(blink % 2 === 0);
    lastBlink = blink;
    if (p && p.ignitionOn && ((p.hazard || p.turnSignal !== "none") && !(s.hazard || s.turnSignal !== "none"))) turnTick(false);

    /* avisos de cinto e porta */
    if (s.ignitionOn && !s.seatbelt && s.speed > 6 && ctx.currentTime >= nextBelt) {
      chime([1319, 1319, 1319], 0.18, 0.06, "triangle");
      nextBelt = ctx.currentTime + 3;
    }
    if (s.ignitionOn && !s.doorClosed && ctx.currentTime >= nextDoor) {
      chime([880, 660], 0.2, 0.07);
      nextDoor = ctx.currentTime + 1.6;
    }

    /* bipes dos assistentes (alertas) */
    const pat = pickPattern(s, d);
    if (!pat) {
      lastPattern = "";
    } else if (pat.id !== lastPattern || ctx.currentTime >= nextBeep) {
      tone(pat.freq, pat.dur, { type: "square", gain: 0.06, lp: 4000, out: inn });
      nextBeep = ctx.currentTime + pat.period;
      lastPattern = pat.id;
    }

    /* mudanças de estado */
    if (p) {
      if (!p.ignitionOn && s.ignitionOn) starter();
      if (p.ignitionOn && !s.ignitionOn) {
        click(0.15, 1500);
        chime([784, 587], 0.14, 0.05);
      }
      if (p.gear !== s.gear) thunk(0.22);
      if (p.parkingBrake !== s.parkingBrake) epbMotor();
      if (p.doorClosed && !s.doorClosed) click(0.18, 1900);
      if (!p.doorClosed && s.doorClosed) thunk(0.4);
      if (!p.seatbelt && s.seatbelt) click(0.14, 3000);
      if (p.seatbelt && !s.seatbelt) click(0.1, 2400);
      if (p.acc.mode !== s.acc.mode) {
        if (s.acc.mode === "active") chime([880, 1175], 0.1, 0.07);
        else if (p.acc.mode === "active") chime([1175, 784], 0.1, 0.07);
        else if (p.acc.mode === "off" && s.acc.mode === "standby") chime([988], 0.1, 0.05);
      }
      if (p.limit.mode !== s.limit.mode) chime(s.limit.mode === "active" ? [988, 1319] : [1319, 988], 0.1, 0.06);
      if (p.acc.setSpeed !== s.acc.setSpeed || p.limit.value !== s.limit.value) click(0.1, 3400);
      if (p.acc.gap !== s.acc.gap) click(0.1, 2200);
      if (!p.ihcActive && s.ihcActive) click(0.1, 1600);
      if (p.ihcActive && !s.ihcActive) click(0.08, 1300);
      if (!p.avmOn && s.avmOn) chime([1480], 0.1, 0.04);
      if (p.esp && !s.esp) chime([440, 330], 0.15, 0.08);
      if (!p.esp && s.esp) chime([440, 587], 0.12, 0.05);
      if (p.hdc !== s.hdc) click(0.1, 2000);
      if (p.aeb === "idle" && (s.aeb === "partial" || s.aeb === "emergency")) {
        thunk(0.28);
        burst(0.5, { type: "bandpass", f0: 2400, f1: 1600, q: 2, gain: 0.08, out: ext });
      }
      if (!p.collided && s.collided) crash();
      if (p.ldw !== s.ldw && s.ldw === "active") click(0.06, 2600);
    }
    prev = s;
  }

  return {
    isEnabled: () => enabled,
    setEnabled(on) {
      enabled = on;
      if (on) {
        if (!ctx) {
          build();
          window.addEventListener("keydown", onKeyDown);
          window.addEventListener("keyup", onKeyUp);
        }
        void ctx!.resume();
        prev = null;
        chime([660], 0.1, 0.05);
      } else {
        horn(false);
        if (ctx) {
          ctx.suspend().catch(() => undefined);
        }
      }
    },
    setVolume(v) {
      volume = Math.max(0, Math.min(1, v));
      if (ctx) tauSet(master.gain, volume, 0.05);
    },
    update,
    ui(kind) {
      if (!enabled || !ctx) return;
      if (kind === "ok") chime([784, 988, 1175, 1568], 0.11, 0.07, "triangle");
      else if (kind === "fail") chime([392, 330], 0.18, 0.07, "triangle");
      else chime([880, 1319], 0.09, 0.05);
    },
    dispose() {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      horn(false);
      void ctx?.close();
      ctx = null;
    },
  };
}

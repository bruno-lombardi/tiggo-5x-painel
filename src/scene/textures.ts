import * as THREE from "three";

/**
 * Texturas geradas por código (canvas), sem arquivos de imagem.
 * Tudo é original e determinístico (semente fixa).
 */

function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function canvas(w: number, h = w) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

function finish(c: HTMLCanvasElement, opts: { repeat?: [number, number]; srgb?: boolean; aniso?: number } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = opts.srgb === false ? THREE.NoColorSpace : THREE.SRGBColorSpace;
  if (opts.repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(opts.repeat[0], opts.repeat[1]);
  }
  t.anisotropy = opts.aniso ?? 8;
  t.needsUpdate = true;
  return t;
}

/** Ruído de valor suave e repetível, para dar variação a asfalto e grama. */
function valueNoise(size: number, cell: number, rand: () => number) {
  const n = Math.ceil(size / cell);
  const grid = Array.from({ length: n * n }, () => rand());
  const at = (x: number, y: number) => grid[(((y % n) + n) % n) * n + (((x % n) + n) % n)];
  const out = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const gx = x / cell;
      const gy = y / cell;
      const x0 = Math.floor(gx);
      const y0 = Math.floor(gy);
      const fx = gx - x0;
      const fy = gy - y0;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const a = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
      const b = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
      out[y * size + x] = a * (1 - sy) + b * sy;
    }
  }
  return out;
}

export function asphaltTextures(): { map: THREE.CanvasTexture; bump: THREE.CanvasTexture } {
  const size = 512;
  const r = rng(11);
  const big = valueNoise(size, 64, r);
  const mid = valueNoise(size, 16, r);
  const fine = valueNoise(size, 2, r);
  const c = canvas(size);
  const b = canvas(size);
  const cx = c.getContext("2d")!;
  const bx = b.getContext("2d")!;
  const img = cx.createImageData(size, size);
  const bimg = bx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 0.55 * big[i] + 0.3 * mid[i] + 0.55 * fine[i];
    const grain = fine[i] > 0.86 ? 26 : 0; // pedrinhas claras
    const base = 52 + v * 34 + grain;
    img.data[i * 4] = base;
    img.data[i * 4 + 1] = base + 2;
    img.data[i * 4 + 2] = base + 5;
    img.data[i * 4 + 3] = 255;
    const h = Math.min(255, 90 + fine[i] * 120 + mid[i] * 40);
    bimg.data[i * 4] = bimg.data[i * 4 + 1] = bimg.data[i * 4 + 2] = h;
    bimg.data[i * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  bx.putImageData(bimg, 0, 0);
  // Remendos e rachaduras discretas.
  cx.strokeStyle = "rgba(20,22,24,0.35)";
  for (let k = 0; k < 6; k++) {
    cx.lineWidth = 1 + r() * 1.2;
    cx.beginPath();
    let x = r() * size;
    let y = r() * size;
    cx.moveTo(x, y);
    for (let s = 0; s < 8; s++) {
      x += (r() - 0.5) * 60;
      y += (r() - 0.5) * 60;
      cx.lineTo(x, y);
    }
    cx.stroke();
  }
  return { map: finish(c, { repeat: [3, 60] }), bump: finish(b, { repeat: [3, 60], srgb: false }) };
}

export function grassTexture(): THREE.CanvasTexture {
  const size = 512;
  const r = rng(23);
  const big = valueNoise(size, 96, r);
  const mid = valueNoise(size, 12, r);
  const fine = valueNoise(size, 2, r);
  const c = canvas(size);
  const cx = c.getContext("2d")!;
  const img = cx.createImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const v = 0.5 * big[i] + 0.3 * mid[i] + 0.4 * fine[i];
    img.data[i * 4] = 78 + v * 40;
    img.data[i * 4 + 1] = 118 + v * 50;
    img.data[i * 4 + 2] = 62 + v * 26;
    img.data[i * 4 + 3] = 255;
  }
  cx.putImageData(img, 0, 0);
  return finish(c, { repeat: [24, 40] });
}

/** Faixa de desgaste dos pneus: mancha escura, suave nas bordas. */
export function wearTexture(): THREE.CanvasTexture {
  const c = canvas(64, 8);
  const cx = c.getContext("2d")!;
  const g = cx.createLinearGradient(0, 0, 64, 0);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(0.5, "rgba(0,0,0,1)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  cx.fillStyle = g;
  cx.fillRect(0, 0, 64, 8);
  return finish(c, { aniso: 1 });
}

/** Placa fictícia, só para dar realismo. */
export function plateTexture(text: string): THREE.CanvasTexture {
  const c = canvas(256, 128);
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#f4f4f2";
  cx.fillRect(0, 0, 256, 128);
  cx.fillStyle = "#1a3d8f";
  cx.fillRect(0, 0, 256, 26);
  cx.strokeStyle = "#222";
  cx.lineWidth = 6;
  cx.strokeRect(3, 3, 250, 122);
  cx.fillStyle = "#111";
  cx.font = "700 72px Arial, sans-serif";
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.fillText(text, 128, 78);
  return finish(c);
}

export function signTexture(lines: string[], bg = "#0f6b3f", fg = "#ffffff"): THREE.CanvasTexture {
  const c = canvas(512, 192);
  const cx = c.getContext("2d")!;
  cx.fillStyle = bg;
  cx.fillRect(0, 0, 512, 192);
  cx.strokeStyle = fg;
  cx.lineWidth = 8;
  cx.strokeRect(10, 10, 492, 172);
  cx.fillStyle = fg;
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  lines.forEach((l, i) => {
    cx.font = `${i === 0 ? 700 : 500} ${i === 0 ? 64 : 46}px Arial, sans-serif`;
    cx.fillText(l, 256, 66 + i * 68);
  });
  return finish(c);
}

export function speedSignTexture(value: string): THREE.CanvasTexture {
  const c = canvas(256);
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#fff";
  cx.beginPath();
  cx.arc(128, 128, 124, 0, Math.PI * 2);
  cx.fill();
  cx.strokeStyle = "#d3231b";
  cx.lineWidth = 26;
  cx.beginPath();
  cx.arc(128, 128, 104, 0, Math.PI * 2);
  cx.stroke();
  cx.fillStyle = "#111";
  cx.font = "700 110px Arial, sans-serif";
  cx.textAlign = "center";
  cx.textBaseline = "middle";
  cx.fillText(value, 128, 136);
  return finish(c);
}

export function glowTexture(): THREE.CanvasTexture {
  const c = canvas(128);
  const cx = c.getContext("2d")!;
  const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.25, "rgba(255,255,255,0.55)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  cx.fillStyle = g;
  cx.fillRect(0, 0, 128, 128);
  return finish(c, { aniso: 1 });
}

export function cloudTexture(): THREE.CanvasTexture {
  const c = canvas(256, 128);
  const cx = c.getContext("2d")!;
  const r = rng(5);
  for (let i = 0; i < 26; i++) {
    const x = 50 + r() * 156;
    const y = 54 + (r() - 0.5) * 30;
    const rad = 18 + r() * 26;
    const g = cx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, "rgba(255,255,255,0.55)");
    g.addColorStop(1, "rgba(255,255,255,0)");
    cx.fillStyle = g;
    cx.fillRect(0, 0, 256, 128);
  }
  return finish(c, { aniso: 1 });
}

/** Faixa de luz no chão sob os postes. */
export function poolTexture(): THREE.CanvasTexture {
  const c = canvas(128);
  const cx = c.getContext("2d")!;
  const g = cx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, "rgba(255,214,150,0.9)");
  g.addColorStop(0.5, "rgba(255,200,130,0.28)");
  g.addColorStop(1, "rgba(255,190,110,0)");
  cx.fillStyle = g;
  cx.fillRect(0, 0, 128, 128);
  return finish(c, { aniso: 1 });
}

/** Painéis de carroceria do caminhão (linhas finas verticais). */
export function cargoTexture(): THREE.CanvasTexture {
  const c = canvas(256, 128);
  const cx = c.getContext("2d")!;
  cx.fillStyle = "#e7ebee";
  cx.fillRect(0, 0, 256, 128);
  cx.strokeStyle = "rgba(60,70,80,0.35)";
  cx.lineWidth = 2;
  for (let x = 16; x < 256; x += 32) {
    cx.beginPath();
    cx.moveTo(x, 0);
    cx.lineTo(x, 128);
    cx.stroke();
  }
  cx.fillStyle = "#1f6fb2";
  cx.fillRect(0, 100, 256, 12);
  return finish(c);
}

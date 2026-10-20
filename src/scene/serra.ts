import * as THREE from "three";
import { SERRA_BRIDGE, SERRA_CURVES, SERRA_LENGTH, SERRA_LIMIT, SERRA_VIEWPOINT } from "../engine/route";
import {
  advisoryTexture,
  chevronTexture,
  checkerTexture,
  curveSignTexture,
  houseTexture,
  poolTexture,
  signTexture,
  speedSignTexture,
  waterTexture,
  wearTexture,
} from "./textures";

/**
 * Cenário da "Serra": estrada de pista simples entre montanhas. É um trajeto
 * INVENTADO para este projeto. Tudo é posicionado pela distância percorrida (S)
 * e o "mundo curvo" (bend.ts) dobra o conjunto para seguir o traçado.
 */

/* ---------- ruído ---------- */
function hash(i: number, j: number) {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function vnoise(x: number, y: number) {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(i, j) * (1 - sx) + hash(i + 1, j) * sx;
  const b = hash(i, j + 1) * (1 - sx) + hash(i + 1, j + 1) * sx;
  return a * (1 - sy) + b * sy;
}
function fbm(x: number, y: number) {
  return vnoise(x, y) * 0.55 + vnoise(x * 2.1, y * 2.1) * 0.3 + vnoise(x * 4.3, y * 4.3) * 0.15;
}
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ---------- geometria da faixa ---------- */
const X_LEFT_EDGE = -4.95;
const X_CENTER = -1.65;
const X_RIGHT_EDGE = 1.65;
const X_SHOULDER = 3.4;
const X_RAIL = 3.5;
const X_CUT = -6.4;

/** 1 dentro das vilas (início e fim), 0 na serra. */
export function villageK(S: number) {
  return Math.max(1 - smooth(300, 430, S), smooth(9560, 9690, S));
}
const gorgeK = (S: number) => smooth(SERRA_BRIDGE.start - 130, SERRA_BRIDGE.start + 80, S) * (1 - smooth(SERRA_BRIDGE.end - 80, SERRA_BRIDGE.end + 130, S));
const viewK = (S: number) => 1 - smooth(34, 74, Math.abs(S - SERRA_VIEWPOINT));
export const inVillage = (S: number) => villageK(S) > 0.97;

/** Altura do terreno em relação ao asfalto da própria posição S (m). x: + direita. */
export function terrainRel(x: number, S: number): number {
  const v = villageK(S);
  let base = -0.07;
  if (x < X_CUT) {
    const u = X_CUT - x;
    const cutH = 4 + 12 * fbm(S * 0.004 + 3, 1.5);
    const slope = 0.7 + 0.7 * fbm(S * 0.007 + 8, 2.5);
    const cut = Math.min(u * slope, cutH) * (1 - v * 0.92);
    const far = smooth(16, 95, u) * (fbm(x * 0.014, S * 0.014 + 4) * 58 + 8);
    base = cut + far * (1 - v * 0.6) + vnoise(x * 0.5, S * 0.5) * 0.35 * smooth(0, 10, u) - 0.07;
  } else if (x > X_SHOULDER) {
    const u = x - X_SHOULDER;
    const depth = (3 + 28 * smooth(0.25, 0.8, fbm(S * 0.0025 + 11, 3.5))) * (1 - v);
    const far = smooth(60, 190, u) * (fbm(x * 0.012 + 9, S * 0.012) * 75);
    base = -depth * smooth(0.4, 13, u) + far + vnoise(x * 0.4, S * 0.4) * 0.3 * smooth(0, 8, u) - 0.07;
    const vp = viewK(S);
    if (vp > 0) {
      const pad = -0.07 - smooth(12.5, 40, x) * 34;
      base = lerp(base, pad, vp);
    }
  }
  const g = gorgeK(S);
  if (g > 0) {
    const valley = -42 + 62 * smooth(14, 110, Math.abs(x + 1.6)) + vnoise(x * 0.2, S * 0.2) * 3;
    base = lerp(base, Math.min(base, valley), g);
  }
  return base;
}

/* ---------- peças ---------- */
export interface SerraEnv {
  update(p: { routeS: number; nightK: number; clock: number; speed: number }): void;
  laneLeftMat: THREE.MeshStandardMaterial;
  laneRightMat: THREE.MeshStandardMaterial;
  root: THREE.Group;
}

export interface SerraDeps {
  keep: <T extends { dispose(): void }>(o: T) => T;
  pineGeo: THREE.BufferGeometry;
  broadGeo: THREE.BufferGeometry;
  bushGeo: THREE.BufferGeometry;
  foliageMat: THREE.Material;
  rockGeo: THREE.BufferGeometry;
  rockMat: THREE.Material;
  tuftGeo: THREE.BufferGeometry;
  tuftMat: THREE.Material;
  asphalt: { map: THREE.Texture; bump: THREE.Texture; rough: THREE.Texture };
  grassMap: THREE.Texture;
}

const R0 = 60;
const R1 = -470;
const ROW = 3;

export function createSerra(scene: THREE.Scene, deps: SerraDeps): SerraEnv {
  const { keep } = deps;
  const root = new THREE.Group();
  scene.add(root);
  const dummy = new THREE.Object3D();
  const ZERO = new THREE.Matrix4().makeScale(0, 0, 0);
  const col = new THREE.Color();

  /* ---- fita (faixa de asfalto, linhas…) com linhas ao longo de z ---- */
  const rows = Math.ceil((R0 - R1) / ROW) + 1;
  function ribbon(x0: number, x1: number, y: number, mat: THREE.Material, vScale: number, uScale = 1) {
    const pos = new Float32Array(rows * 2 * 3);
    const nor = new Float32Array(rows * 2 * 3);
    const uv = new Float32Array(rows * 2 * 2);
    const idx: number[] = [];
    for (let r = 0; r < rows; r++) {
      const z = R0 - r * ROW;
      pos.set([x0, y, z, x1, y, z], r * 6);
      nor.set([0, 1, 0, 0, 1, 0], r * 6);
      uv.set([0, -z / vScale, uScale, -z / vScale], r * 4);
      if (r < rows - 1) {
        const a = r * 2;
        idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    keep(g);
    const m = new THREE.Mesh(g, mat);
    m.receiveShadow = true;
    root.add(m);
    return m;
  }

  /* ---- asfalto ---- */
  const tex = (t: THREE.Texture, rx: number, srgb = true) => {
    const c = t.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(rx, 1);
    if (!srgb) c.colorSpace = THREE.NoColorSpace;
    c.needsUpdate = true;
    return keep(c);
  };
  const aMap = tex(deps.asphalt.map, 1);
  const aBump = tex(deps.asphalt.bump, 1, false);
  const aRough = tex(deps.asphalt.rough, 1, false);
  const roadMat = keep(new THREE.MeshStandardMaterial({ map: aMap, bumpMap: aBump, bumpScale: 0.6, roughnessMap: aRough, roughness: 1, metalness: 0, color: 0xcfcfcf }));
  ribbon(X_LEFT_EDGE, X_RIGHT_EDGE, 0.02, roadMat, 8, 0.8);
  const shoulderMat = keep(new THREE.MeshStandardMaterial({ color: 0x8a8a82, roughness: 1, map: aMap, bumpMap: aBump, bumpScale: 1.2 }));
  ribbon(X_RIGHT_EDGE, X_SHOULDER, 0.022, shoulderMat, 8, 0.3);
  ribbon(X_CUT, X_LEFT_EDGE, 0.015, shoulderMat, 8, 0.4);

  const wear = keep(wearTexture());
  const wearMat = keep(new THREE.MeshBasicMaterial({ map: wear, transparent: true, opacity: 0.22, depthWrite: false }));
  for (const lane of [0, -3.3]) {
    for (const off of [-0.85, 0.85]) {
      const m = ribbon(lane + off - 0.38, lane + off + 0.38, 0.03, wearMat, 6);
      m.receiveShadow = false;
    }
  }

  const laneLeftMat = keep(new THREE.MeshStandardMaterial({ color: 0xe8c32a, roughness: 0.6, emissive: 0x2a2000 }));
  const laneRightMat = keep(new THREE.MeshStandardMaterial({ color: 0xdcdedf, roughness: 0.6 }));
  const edgeMat = keep(new THREE.MeshStandardMaterial({ color: 0xdcdedf, roughness: 0.6 }));
  // linha dupla contínua no centro; bordas brancas
  ribbon(X_CENTER - 0.19, X_CENTER - 0.07, 0.035, laneLeftMat, 6);
  ribbon(X_CENTER + 0.07, X_CENTER + 0.19, 0.035, laneLeftMat, 6);
  ribbon(X_RIGHT_EDGE - 0.16, X_RIGHT_EDGE, 0.035, laneRightMat, 6);
  ribbon(X_LEFT_EDGE, X_LEFT_EDGE + 0.15, 0.035, edgeMat, 6);

  /* ---- terreno ---- */
  const TROW = 5;
  const TR = 104;
  const xs = [-220, -170, -130, -100, -78, -60, -46, -35, -27, -21, -16.5, -13, -10.5, -8.6, -7.4, X_CUT, X_LEFT_EDGE, X_CENTER, X_RIGHT_EDGE, X_SHOULDER, 4.6, 5.8, 7.3, 9.2, 11.5, 14.5, 18.5, 23.5, 30, 38, 48, 60, 75, 95, 120, 150, 185, 220];
  const TC = xs.length;
  const tPos = new Float32Array(TR * TC * 3);
  const tCol = new Float32Array(TR * TC * 3);
  const tUv = new Float32Array(TR * TC * 2);
  const tIdx: number[] = [];
  for (let r = 0; r < TR - 1; r++) {
    for (let c = 0; c < TC - 1; c++) {
      const a = r * TC + c;
      const b = a + 1;
      const d = a + TC;
      tIdx.push(a, b, d, b, d + 1, d);
    }
  }
  const tGeo = new THREE.BufferGeometry();
  tGeo.setAttribute("position", new THREE.BufferAttribute(tPos, 3));
  tGeo.setAttribute("color", new THREE.BufferAttribute(tCol, 3));
  tGeo.setAttribute("uv", new THREE.BufferAttribute(tUv, 2));
  tGeo.setIndex(tIdx);
  keep(tGeo);
  const grass = (() => {
    const c = deps.grassMap.clone();
    c.wrapS = c.wrapT = THREE.RepeatWrapping;
    c.repeat.set(1, 1);
    c.needsUpdate = true;
    return keep(c);
  })();
  const tMat = keep(new THREE.MeshStandardMaterial({ map: grass, vertexColors: true, roughness: 1, metalness: 0 }));
  const terrain = new THREE.Mesh(tGeo, tMat);
  terrain.receiveShadow = true;
  terrain.frustumCulled = false;
  root.add(terrain);
  let tBase = Number.NaN;

  const hCache = new Float32Array(TR * TC);
  const pCache = new Float32Array(TR * TC);
  function rebuildTerrain(b: number) {
    // ao andar, as linhas já calculadas apenas "sobem" na tabela; só as novas são calculadas
    const delta = Number.isNaN(tBase) ? TR : b - tBase;
    let first = 0;
    if (delta > 0 && delta < TR) {
      hCache.copyWithin(0, delta * TC);
      pCache.copyWithin(0, delta * TC);
      first = TR - delta;
    } else if (delta !== 0) first = 0;
    else first = TR;
    for (let r = first; r < TR; r++) {
      const S = (b + r) * TROW;
      for (let c = 0; c < TC; c++) {
        const k = r * TC + c;
        hCache[k] = terrainRel(xs[c], S);
        pCache[k] = fbm(xs[c] * 0.03 + 40, S * 0.03);
      }
    }
    for (let r = 0; r < TR; r++) {
      const S = (b + r) * TROW;
      const z = -r * TROW;
      for (let c = 0; c < TC; c++) {
        const k = r * TC + c;
        tPos[k * 3] = xs[c];
        tPos[k * 3 + 1] = hCache[k];
        tPos[k * 3 + 2] = z;
        tUv[k * 2] = xs[c] / 18;
        tUv[k * 2 + 1] = S / 18;
      }
    }
    tGeo.attributes.position.needsUpdate = true;
    tGeo.attributes.uv.needsUpdate = true;
    tGeo.computeVertexNormals();
    const nor = tGeo.getAttribute("normal");
    for (let r = 0; r < TR; r++) {
      const S = (b + r) * TROW;
      const v = villageK(S);
      for (let c = 0; c < TC; c++) {
        const k = r * TC + c;
        const x = xs[c];
        const h = tPos[k * 3 + 1];
        const ny = nor.getY(k);
        const patch = pCache[k];
        const rock = smooth(0.84, 0.6, ny); // encosta íngreme → rocha
        const dirt = x < X_CUT && x > -13 ? 0.55 * (1 - v) : 0;
        col.setHSL(0.26 + patch * 0.05 - Math.max(0, h) * 0.0006, 0.42 - Math.max(0, h) * 0.003, 0.46 + (patch - 0.5) * 0.14 - Math.max(0, h) * 0.0012);
        const rr = col.r;
        const gg = col.g;
        const bb = col.b;
        // mistura com rocha (cinza-azulado) e terra (marrom avermelhado)
        const rk = Math.min(1, rock + smooth(60, 120, h) * 0.6 + (h < -20 ? 0.5 : 0));
        let R = lerp(rr, 0.42, rk);
        let G = lerp(gg, 0.4, rk);
        let B = lerp(bb, 0.37, rk);
        R = lerp(R, 0.45, dirt);
        G = lerp(G, 0.31, dirt);
        B = lerp(B, 0.2, dirt);
        tCol[k * 3] = R;
        tCol[k * 3 + 1] = G;
        tCol[k * 3 + 2] = B;
      }
    }
    tGeo.attributes.color.needsUpdate = true;
  }

  /* ---- água sob a ponte ---- */
  const wTex = keep(waterTexture());
  const waterMat = keep(new THREE.MeshStandardMaterial({ map: wTex, roughness: 0.18, metalness: 0.15, color: 0xcfe9f0 }));
  const wGeo = new THREE.PlaneGeometry(300, 330, 6, 22);
  wGeo.rotateX(-Math.PI / 2);
  keep(wGeo);
  const water = new THREE.Mesh(wGeo, waterMat);
  water.position.y = -39.5;
  water.receiveShadow = true;
  root.add(water);

  /* ---- ponte ---- */
  const bridge = new THREE.Group();
  {
    const concrete = keep(new THREE.MeshStandardMaterial({ color: 0xb2b3ae, roughness: 0.92, bumpMap: deps.asphalt.bump, bumpScale: 1.4 }));
    const len = SERRA_BRIDGE.end - SERRA_BRIDGE.start;
    const slabGeo = keep(new THREE.BoxGeometry(10.4, 0.9, len, 1, 1, Math.round(len / 3)));
    const slab = new THREE.Mesh(slabGeo, concrete);
    slab.position.set(-1.15, -0.5, 0);
    slab.castShadow = slab.receiveShadow = true;
    const parGeo = keep(new THREE.BoxGeometry(0.34, 1.05, len, 1, 1, Math.round(len / 3)));
    for (const x of [3.75, -6.05]) {
      const p = new THREE.Mesh(parGeo, concrete);
      p.position.set(x, 0.52, 0);
      p.castShadow = p.receiveShadow = true;
      bridge.add(p);
    }
    bridge.add(slab);
    const pierGeo = keep(new THREE.BoxGeometry(5.2, 42, 2.4));
    for (let k = 0; k < 9; k++) {
      const p = new THREE.Mesh(pierGeo, concrete);
      p.position.set(-1.15, -21.8, -len / 2 + 22 + k * ((len - 44) / 8));
      p.castShadow = p.receiveShadow = true;
      bridge.add(p);
    }
  }
  root.add(bridge);
  const bridgeMid = (SERRA_BRIDGE.start + SERRA_BRIDGE.end) / 2;

  /* ---- defensa metálica ---- */
  const metal = keep(new THREE.MeshStandardMaterial({ color: 0xaeb4b8, roughness: 0.45, metalness: 0.75 }));
  const beamGeo = keep(new THREE.BoxGeometry(0.07, 0.3, 4.04));
  const beam2Geo = keep(new THREE.BoxGeometry(0.06, 0.12, 4.04));
  const postGeo = keep(new THREE.BoxGeometry(0.12, 0.8, 0.12));
  const delGeo = keep(new THREE.BoxGeometry(0.1, 0.14, 0.05));
  const delMat = keep(new THREE.MeshStandardMaterial({ color: 0xe6e8ea, roughness: 0.6, emissive: 0xff2a20, emissiveIntensity: 0 }));
  const GR_N = 124;
  const mkInst = (g: THREE.BufferGeometry, m: THREE.Material, n: number, cast = false) => {
    const im = new THREE.InstancedMesh(g, m, n);
    im.frustumCulled = false;
    im.castShadow = cast;
    im.receiveShadow = true;
    root.add(im);
    return im;
  };
  const rails = mkInst(beamGeo, metal, GR_N, true);
  const rails2 = mkInst(beam2Geo, metal, GR_N, false);
  const posts = mkInst(postGeo, metal, GR_N, true);
  const dels = mkInst(delGeo, delMat, GR_N);

  /* ---- vegetação, rochas e capim ---- */
  interface Scat {
    mesh: THREE.InstancedMesh;
    period: number;
    seed: number;
    bands: [number, number][];
    scale: [number, number];
    sink: number;
    skip?: (S: number, x: number) => boolean;
    tint?: (i: number, c: THREE.Color) => void;
    lift?: number;
  }
  const notNearRoad = (S: number, x: number) => {
    if (villageK(S) > 0.5 && Math.abs(x) < 24) return true;
    if (viewK(S) > 0.1 && x > 2 && x < 18) return true;
    return false;
  };
  const tintGreen = (seed: number) => (i: number, c: THREE.Color) =>
    c.setHSL(0.27 + (hash(i, seed + 5) - 0.5) * 0.08, 0.4 + (hash(i, seed + 6) - 0.5) * 0.15, 0.55 + (hash(i, seed + 7) - 0.5) * 0.25);
  const mkScat = (geo: THREE.BufferGeometry, mat: THREE.Material, n: number, cast: boolean, rest: Omit<Scat, "mesh">): Scat => {
    const mesh = mkInst(geo, mat, n, cast);
    if (rest.tint) mesh.setColorAt(0, col.setRGB(1, 1, 1));
    return { mesh, ...rest };
  };
  const RIGHT: [number, number] = [5.2, 16];
  const RIGHT_FAR: [number, number] = [14, 50];
  const LEFT: [number, number] = [-24, -8.2];
  const LEFT_FAR: [number, number] = [-60, -22];
  const scats: Scat[] = [
    mkScat(deps.pineGeo, deps.foliageMat, 110, true, { period: 5.2, seed: 1, bands: [RIGHT, LEFT, RIGHT_FAR, LEFT_FAR], scale: [0.8, 1.7], sink: 0.15, skip: notNearRoad, tint: tintGreen(1) }),
    mkScat(deps.broadGeo, deps.foliageMat, 100, true, { period: 5.6, seed: 2, bands: [LEFT, RIGHT, LEFT_FAR, RIGHT_FAR], scale: [0.8, 1.5], sink: 0.15, skip: notNearRoad, tint: tintGreen(2) }),
    mkScat(deps.bushGeo, deps.foliageMat, 110, false, { period: 4.4, seed: 3, bands: [[4.2, 8], [-9, -6.6], [8, 14], [-14, -9]], scale: [0.8, 1.9], sink: 0.05, skip: (S, x) => viewK(S) > 0.1 && x > 2 && x < 18, tint: tintGreen(3) }),
    mkScat(deps.rockGeo, deps.rockMat, 70, true, { period: 7, seed: 4, bands: [[-12, -6.7], [4.2, 9], [-30, -12], [9, 22]], scale: [0.7, 2.6], sink: -0.1, skip: (S, x) => viewK(S) > 0.1 && x > 2 && x < 18 }),
    mkScat(deps.tuftGeo, deps.tuftMat, 130, false, { period: 3.6, seed: 5, bands: [[3.7, 7], [-8.5, -6.6], [7, 12]], scale: [0.7, 1.6], sink: 0.02 }),
  ];
  const sunk = (S: number, x: number, extra: number) => terrainRel(x, S) - extra;

  function runScat(sc: Scat, routeS: number) {
    const n = sc.mesh.count;
    const base = Math.floor((routeS - 70) / sc.period);
    for (let k = 0; k < n; k++) {
      const i = base + k;
      const S = (i + hash(i, sc.seed)) * sc.period;
      const band = sc.bands[((i % sc.bands.length) + sc.bands.length) % sc.bands.length];
      const x = band[0] + hash(i * 3.1, sc.seed + 1) * (band[1] - band[0]);
      const z = -(S - routeS);
      if (z < -445 || z > 50 || S < -30 || S > SERRA_LENGTH + 60 || (sc.skip && sc.skip(S, x))) {
        sc.mesh.setMatrixAt(k, ZERO);
        continue;
      }
      const s = lerp(sc.scale[0], sc.scale[1], hash(i * 5.3, sc.seed + 2));
      dummy.position.set(x, sunk(S, x, sc.sink), z);
      dummy.rotation.set(0, hash(i * 7.7, sc.seed + 3) * 6.28, 0);
      dummy.scale.setScalar(s);
      dummy.updateMatrix();
      sc.mesh.setMatrixAt(k, dummy.matrix);
      if (sc.tint) {
        sc.tint(i, col);
        sc.mesh.setColorAt(k, col);
      }
    }
    sc.mesh.instanceMatrix.needsUpdate = true;
    if (sc.mesh.instanceColor) sc.mesh.instanceColor.needsUpdate = true;
  }

  /* ---- casas, postes e luminárias das vilas ---- */
  const faceMap = keep(houseTexture(false));
  const faceEm = keep(houseTexture(true));
  const houseMat = keep(new THREE.MeshStandardMaterial({ map: faceMap, emissiveMap: faceEm, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.9 }));
  const bodyGeo = keep(new THREE.BoxGeometry(6.4, 3.3, 7, 1, 1, 1));
  bodyGeo.translate(0, 1.65, 0);
  const roofShape = new THREE.Shape();
  roofShape.moveTo(-3.8, 0);
  roofShape.lineTo(3.8, 0);
  roofShape.lineTo(0, 2);
  roofShape.closePath();
  const roofGeo = keep(new THREE.ExtrudeGeometry(roofShape, { depth: 7.6, bevelEnabled: false }));
  roofGeo.translate(0, 3.3, -3.8);
  const roofMat = keep(new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }));
  const HOUSE_N = 56;
  const houses = mkInst(bodyGeo, houseMat, HOUSE_N, true);
  const roofs = mkInst(roofGeo, roofMat, HOUSE_N, true);
  houses.setColorAt(0, col.setRGB(1, 1, 1));
  roofs.setColorAt(0, col.setRGB(1, 1, 1));
  const wall = [0xf2eee6, 0xf4e3c4, 0xd9e6dc, 0xe9d4c8, 0xdfe6f0, 0xf1dfa8];
  const roofC = [0xa8512e, 0x8c4a32, 0xb5623a, 0x7d3f2a];

  const poleGeo = keep(new THREE.BoxGeometry(0.22, 8.2, 0.22));
  poleGeo.translate(0, 4.1, 0);
  const armGeo = keep(new THREE.BoxGeometry(2.0, 0.14, 0.14));
  armGeo.translate(0, 7.5, 0);
  const woodMat = keep(new THREE.MeshStandardMaterial({ color: 0x5d4a38, roughness: 0.95 }));
  const UP_N = 16;
  const uPoles = mkInst(poleGeo, woodMat, UP_N, true);
  const uArms = mkInst(armGeo, woodMat, UP_N, true);

  const LAMP_N = 14;
  const lampHeadMat = keep(new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }));
  const lampPoles: THREE.Group[] = [];
  const poolTex = keep(poolTexture());
  const poolGeo = keep(new THREE.PlaneGeometry(14, 14));
  poolGeo.rotateX(-Math.PI / 2);
  const poolMat = keep(new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, LAMP_N);
  pools.frustumCulled = false;
  pools.renderOrder = 1;
  root.add(pools);
  {
    const lm = keep(new THREE.MeshStandardMaterial({ color: 0x70787d, roughness: 0.5, metalness: 0.7 }));
    const pg = keep(new THREE.CylinderGeometry(0.07, 0.11, 7.4, 8));
    const ag = keep(new THREE.BoxGeometry(2.2, 0.08, 0.08));
    const hg = keep(new THREE.BoxGeometry(0.8, 0.12, 0.3));
    for (let i = 0; i < LAMP_N; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(pg, lm);
      pole.position.y = 3.7;
      const arm = new THREE.Mesh(ag, lm);
      arm.position.set(-1.1, 7.3, 0);
      const head = new THREE.Mesh(hg, lampHeadMat);
      head.position.set(-2.1, 7.25, 0);
      g.add(pole, arm, head);
      g.traverse((o) => (o.castShadow = true));
      root.add(g);
      lampPoles.push(g);
    }
  }

  function runVillage(routeS: number) {
    const ph = 26;
    const base = Math.floor((routeS - 70) / ph);
    for (let k = 0; k < HOUSE_N; k++) {
      const j = base + Math.floor(k / 2);
      const side = k % 2 ? 1 : -1;
      const S = j * ph + (side > 0 ? 9 : 0) + hash(j, side) * 6;
      const z = -(S - routeS);
      const ok = villageK(S) > 0.98 && S > -60 && S < SERRA_LENGTH + 80 && z > -445 && z < 50;
      if (!ok) {
        houses.setMatrixAt(k, ZERO);
        roofs.setMatrixAt(k, ZERO);
        continue;
      }
      const x = side > 0 ? 13 + hash(j, 3) * 3 : -(12.5 + hash(j, 4) * 3);
      const sc = 0.85 + hash(j * 2.3, side) * 0.4;
      dummy.position.set(x, terrainRel(x, S), z);
      dummy.rotation.set(0, side > 0 ? -Math.PI / 2 : Math.PI / 2, 0);
      dummy.scale.set(sc, 0.9 + hash(j, 8) * 0.3, sc);
      dummy.updateMatrix();
      houses.setMatrixAt(k, dummy.matrix);
      roofs.setMatrixAt(k, dummy.matrix);
      houses.setColorAt(k, col.setHex(wall[Math.floor(hash(j, 9 + side) * wall.length) % wall.length]));
      roofs.setColorAt(k, col.setHex(roofC[Math.floor(hash(j, 12 + side) * roofC.length) % roofC.length]));
    }
    houses.instanceMatrix.needsUpdate = roofs.instanceMatrix.needsUpdate = true;
    if (houses.instanceColor) houses.instanceColor.needsUpdate = true;
    if (roofs.instanceColor) roofs.instanceColor.needsUpdate = true;

    const pp = 38;
    const pb = Math.floor((routeS - 70) / pp);
    for (let k = 0; k < UP_N; k++) {
      const S = (pb + k) * pp;
      const z = -(S - routeS);
      if (villageK(S) < 0.98 || z < -445 || z > 50) {
        uPoles.setMatrixAt(k, ZERO);
        uArms.setMatrixAt(k, ZERO);
        continue;
      }
      dummy.position.set(5.4, terrainRel(5.4, S), z);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      uPoles.setMatrixAt(k, dummy.matrix);
      uArms.setMatrixAt(k, dummy.matrix);
    }
    uPoles.instanceMatrix.needsUpdate = uArms.instanceMatrix.needsUpdate = true;

    const lp = 30;
    const lb = Math.floor((routeS - 70) / lp);
    for (let k = 0; k < LAMP_N; k++) {
      const S = (lb + k) * lp + 15;
      const z = -(S - routeS);
      const ok = villageK(S) > 0.98 && z > -400 && z < 40;
      lampPoles[k].visible = ok;
      if (ok) {
        lampPoles[k].position.set(4.6, terrainRel(4.6, S), z);
        dummy.position.set(2.6, 0.06, z);
        dummy.rotation.set(0, 0, 0);
        dummy.scale.setScalar(1);
        dummy.updateMatrix();
        pools.setMatrixAt(k, dummy.matrix);
      } else pools.setMatrixAt(k, ZERO);
    }
    pools.instanceMatrix.needsUpdate = true;
  }

  /* ---- placas e pórticos ---- */
  interface Prop {
    S: number;
    obj: THREE.Object3D;
  }
  const props: Prop[] = [];
  const poleMat = keep(new THREE.MeshStandardMaterial({ color: 0x8b9094, roughness: 0.5, metalness: 0.6 }));
  const poleG = keep(new THREE.CylinderGeometry(0.045, 0.05, 1, 8));
  const planeCache = new Map<string, THREE.Mesh>();
  void planeCache;
  const texCache = new Map<string, THREE.Texture>();
  const cached = (key: string, make: () => THREE.Texture) => {
    let t = texCache.get(key);
    if (!t) {
      t = keep(make());
      texCache.set(key, t);
    }
    return t;
  };
  function panel(t: THREE.Texture, w: number, h: number) {
    const g = new THREE.PlaneGeometry(w, h);
    keep(g);
    const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.5, side: THREE.DoubleSide, emissive: 0x303030, emissiveMap: t, emissiveIntensity: 0.15 });
    keep(m);
    const mesh = new THREE.Mesh(g, m);
    mesh.castShadow = true;
    return mesh;
  }
  /** Placa sobre poste. `yaw` gira a placa para o motorista (face voltada para +z). */
  function signPost(x: number, S: number, parts: { tex: THREE.Texture; w: number; h: number; y: number }[], poleH: number) {
    const g = new THREE.Group();
    const pole = new THREE.Mesh(poleG, poleMat);
    pole.scale.y = poleH;
    pole.position.y = poleH / 2;
    pole.castShadow = true;
    g.add(pole);
    for (const p of parts) {
      const m = panel(p.tex, p.w, p.h);
      m.position.set(0, p.y, 0.06);
      g.add(m);
    }
    g.position.set(x, terrainRel(x, S), 0);
    g.rotation.y = x > 0 ? 0.12 : -0.12;
    g.visible = false;
    root.add(g);
    props.push({ S, obj: g });
    return g;
  }

  // limite de velocidade
  for (const S of [140, 1200, 2500, 3900, 5000, 6300, 7600, 8800, 9720]) {
    signPost(4.9, S, [{ tex: cached(`lim${SERRA_LIMIT}`, () => speedSignTexture(String(SERRA_LIMIT))), w: 0.9, h: 0.9, y: 2.2 }], 2.7);
  }
  // curvas: aviso, velocidade recomendada e setas na parte externa
  for (const c of SERRA_CURVES) {
    const warnS = c.start - 120;
    signPost(
      4.9,
      warnS,
      [
        { tex: cached(`curve${c.dir}`, () => curveSignTexture(c.dir)), w: 1.1, h: 1.1, y: 2.5 },
        { tex: cached(`adv${c.advised}`, () => advisoryTexture(c.advised)), w: 0.85, h: 0.42, y: 1.55 },
      ],
      3.0,
    );
    const outsideX = c.dir > 0 ? 4.7 : -7.6;
    const n = Math.min(4, Math.max(2, Math.round((c.end - c.start) / 22)));
    for (let k = 0; k < n; k++) {
      const S = lerp(c.start + 8, c.end - 8, n === 1 ? 0.5 : k / (n - 1));
      signPost(outsideX, S, [{ tex: cached(`chev${c.dir}`, () => chevronTexture(c.dir)), w: 0.55, h: 1.1, y: 1.5 }], 2.1);
    }
  }
  // placas de lugar
  signPost(4.9, 9540, [{ tex: cached("vila-fim", () => signTexture(["VILA DO MIRANTE", "Reduza a velocidade"], "#0f5a8c")), w: 2.6, h: 1.0, y: 2.6 }], 3.1);
  signPost(4.9, 350, [{ tex: cached("vila-ini", () => signTexture(["BOA VIAGEM", "Serra · 10 km"], "#0f6b3f")), w: 2.6, h: 1.0, y: 2.6 }], 3.1);
  signPost(4.9, SERRA_VIEWPOINT - 280, [{ tex: cached("mirante", () => signTexture(["MIRANTE", "300 m"], "#0f5a8c")), w: 2.4, h: 0.95, y: 2.6 }], 3.1);
  signPost(4.9, SERRA_BRIDGE.start - 90, [{ tex: cached("ponte", () => signTexture(["PONTE", "Pista estreita"], "#e9b520", "#111")), w: 2.4, h: 0.95, y: 2.6 }], 3.1);

  // pórticos de largada e chegada
  function gantry(S: number, tex: THREE.Texture, color: number) {
    const g = new THREE.Group();
    const m = keep(new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.5 }));
    const pg = keep(new THREE.BoxGeometry(0.35, 6.2, 0.35));
    for (const x of [-6.9, 4.2]) {
      const p = new THREE.Mesh(pg, m);
      p.position.set(x, 3.1, 0);
      p.castShadow = true;
      g.add(p);
    }
    const bar = new THREE.Mesh(keep(new THREE.BoxGeometry(11.5, 1.5, 0.3)), m);
    bar.position.set(-1.35, 6.0, 0);
    bar.castShadow = true;
    g.add(bar);
    const face = panel(tex, 11, 1.3);
    face.position.set(-1.35, 6.0, 0.18);
    g.add(face);
    g.visible = false;
    root.add(g);
    props.push({ S, obj: g });
  }
  gantry(14, cached("largada", () => signTexture(["LARGADA", "Serra do Mirante"], "#0f5a8c")), 0x4a5560);
  gantry(9940, cached("chegada", () => checkerTexture()), 0x4a5560);

  // mirante: piso, mureta de pedra e banco
  const view = new THREE.Group();
  {
    const padMat = keep(new THREE.MeshStandardMaterial({ color: 0x9a9a92, roughness: 1, map: aMap, bumpMap: aBump, bumpScale: 1 }));
    const pad = new THREE.Mesh(keep(new THREE.BoxGeometry(9.5, 0.2, 100, 1, 1, 30)), padMat);
    pad.position.set(8.2, -0.1, 0);
    pad.receiveShadow = true;
    const stone = keep(new THREE.MeshStandardMaterial({ color: 0x7c7a72, roughness: 0.95, bumpMap: deps.asphalt.bump, bumpScale: 3 }));
    const wallG = keep(new THREE.BoxGeometry(0.7, 1.0, 100, 1, 1, 34));
    const wall = new THREE.Mesh(wallG, stone);
    wall.position.set(12.7, 0.5, 0);
    wall.castShadow = wall.receiveShadow = true;
    const benchMat = woodMat;
    for (const z of [-18, 6, 28]) {
      const seat = new THREE.Mesh(keep(new THREE.BoxGeometry(0.5, 0.08, 1.8)), benchMat);
      seat.position.set(11.3, 0.5, z);
      const back = new THREE.Mesh(keep(new THREE.BoxGeometry(0.06, 0.45, 1.8)), benchMat);
      back.position.set(11.55, 0.78, z);
      seat.castShadow = back.castShadow = true;
      view.add(seat, back);
    }
    view.add(pad, wall);
  }
  view.visible = false;
  root.add(view);

  /* ---- atualização ---- */
  const PROP_NEAR = 48;
  const PROP_FAR = -450;

  function update(p: { routeS: number; nightK: number; clock: number; speed: number }) {
    const { routeS, nightK } = p;
    // terreno
    const b = Math.floor((routeS - 60) / TROW);
    if (b !== tBase) {
      tBase = b;
      rebuildTerrain(b);
    }
    terrain.position.z = routeS - b * TROW;
    terrain.position.x = 0;
    // asfalto rolando
    const off = (routeS / 8) % 1;
    aMap.offset.y = aBump.offset.y = aRough.offset.y = off;
    // objetos fixos na estrada
    wear.offset.y = 0;

    // defensa
    const gb = Math.floor((routeS - 70) / 4);
    for (let k = 0; k < GR_N; k++) {
      const S = (gb + k) * 4 + 2;
      const z = -(S - routeS);
      const hide =
        z < -445 ||
        z > 50 ||
        villageK(S) > 0.5 ||
        (S > SERRA_BRIDGE.start - 4 && S < SERRA_BRIDGE.end + 4) ||
        Math.abs(S - SERRA_VIEWPOINT) < 56 ||
        S < 0 ||
        S > SERRA_LENGTH;
      if (hide) {
        rails.setMatrixAt(k, ZERO);
        rails2.setMatrixAt(k, ZERO);
        posts.setMatrixAt(k, ZERO);
        dels.setMatrixAt(k, ZERO);
        continue;
      }
      const y = terrainRel(X_RAIL, S);
      const y0 = Math.max(0, y + 0.2) * 0 + 0.0;
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.position.set(X_RAIL, y0 + 0.62, z);
      dummy.updateMatrix();
      rails.setMatrixAt(k, dummy.matrix);
      dummy.position.set(X_RAIL, y0 + 0.4, z);
      dummy.updateMatrix();
      rails2.setMatrixAt(k, dummy.matrix);
      dummy.position.set(X_RAIL + 0.1, y0 + 0.4, z - 1.2);
      dummy.updateMatrix();
      posts.setMatrixAt(k, dummy.matrix);
      if (k % 2 === 0) {
        dummy.position.set(X_RAIL - 0.04, y0 + 0.86, z - 1.2);
        dummy.updateMatrix();
        dels.setMatrixAt(k, dummy.matrix);
      } else dels.setMatrixAt(k, ZERO);
    }
    rails.instanceMatrix.needsUpdate = rails2.instanceMatrix.needsUpdate = posts.instanceMatrix.needsUpdate = dels.instanceMatrix.needsUpdate = true;
    delMat.emissiveIntensity = 0.9 * nightK;

    for (const sc of scats) runScat(sc, routeS);
    runVillage(routeS);
    houseMat.emissiveIntensity = 2.4 * nightK;
    lampHeadMat.emissiveIntensity = 4 * nightK;
    poolMat.opacity = 0.55 * nightK;

    // ponte, água, mirante
    bridge.position.z = -(bridgeMid - routeS);
    bridge.visible = Math.abs(bridgeMid - routeS) < 700;
    water.position.z = -(bridgeMid - routeS);
    water.visible = Math.abs(bridgeMid - routeS) < 520;
    wTex.offset.set(p.clock * 0.004, p.clock * 0.01);
    view.position.z = -(SERRA_VIEWPOINT - routeS);
    view.visible = Math.abs(SERRA_VIEWPOINT - routeS) < 520;

    for (const pr of props) {
      const z = -(pr.S - routeS);
      const vis = z < PROP_NEAR && z > PROP_FAR;
      pr.obj.visible = vis;
      if (vis) pr.obj.position.z = z;
    }
  }

  return { update, laneLeftMat, laneRightMat, root };
}

import * as THREE from "three";
import { Sky } from "three/addons/objects/Sky.js";
import {
  asphaltTextures,
  cloudTexture,
  glowTexture,
  grassTexture,
  poolTexture,
  signTexture,
  speedSignTexture,
  wearTexture,
} from "./textures";

/**
 * Cenário: céu com sol e estrelas, relevo, estrada de asfalto, faixas, barreiras,
 * árvores, placas, postes e iluminação. Tudo gerado por código.
 */

export interface EnvInput {
  travel: number;
  nightK: number;
  ownX: number;
  dt: number;
  clock: number;
  still: boolean;
}

export interface Env {
  update(p: EnvInput): void;
  laneLeftMat: THREE.MeshStandardMaterial;
  laneRightMat: THREE.MeshStandardMaterial;
  sun: THREE.DirectionalLight;
  setShadows(level: 0 | 1 | 2): void;
  dispose(): void;
}

const SCROLL_LEN = 360;
const SCROLL_START = -330;
const wrapZ = (offset: number, i: number, period: number, len = SCROLL_LEN, start = SCROLL_START) => {
  const v = (((i * period + offset) % len) + len) % len;
  return start + v;
};

/* ruído de valor, só para modelar o relevo */
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

/** Altura do relevo no ponto (x, z): plano perto da pista, morros mais longe. */
export function terrainHeight(x: number, z: number): number {
  const d = Math.max(0, -17.5 - x, x - 8.5);
  const amp = smooth(3, 80, d);
  return amp * (fbm(x * 0.012 + 3, z * 0.012 + 9) * 34 + fbm(x * 0.06, z * 0.06) * 4) - (1 - smooth(0, 2.5, d)) * 0.22;
}

function sunVector(elevationDeg: number, azimuthDeg: number) {
  const phi = THREE.MathUtils.degToRad(90 - elevationDeg);
  const theta = THREE.MathUtils.degToRad(azimuthDeg);
  return new THREE.Vector3().setFromSphericalCoords(1, phi, theta);
}

export function createEnvironment(scene: THREE.Scene, renderer: THREE.WebGLRenderer): Env {
  const disposables: { dispose(): void }[] = [];
  const keep = <T extends { dispose(): void }>(o: T): T => {
    disposables.push(o);
    return o;
  };

  /* ---------------- Céu ---------------- */
  const sky = new Sky();
  sky.scale.setScalar(10000);
  const su = sky.material.uniforms;
  su.turbidity.value = 4.5;
  su.rayleigh.value = 1.3;
  su.mieCoefficient.value = 0.004;
  su.mieDirectionalG.value = 0.82;
  scene.add(sky);

  const AZIMUTH = 205;
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envFor = (elev: number) => {
    const s = new THREE.Scene();
    const k = new Sky();
    k.scale.setScalar(10000);
    const u = k.material.uniforms;
    u.turbidity.value = 4.5;
    u.rayleigh.value = elev > 0 ? 1.3 : 0.3;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.82;
    u.sunPosition.value.copy(sunVector(elev, AZIMUTH));
    s.add(k);
    const rt = pmrem.fromScene(s, 0, 0.1, 2000);
    k.geometry.dispose();
    (k.material as THREE.Material).dispose();
    return rt;
  };
  const dayEnv = envFor(30);
  const nightEnv = envFor(-14);
  keep(dayEnv);
  keep(nightEnv);
  scene.environment = dayEnv.texture;
  let envIsNight = false;

  /* estrelas */
  const starGeo = new THREE.BufferGeometry();
  const sp: number[] = [];
  for (let i = 0; i < 900; i++) {
    const u = Math.random();
    const v = Math.random() * 0.95 + 0.05;
    const th = u * Math.PI * 2;
    const ph = Math.acos(v);
    sp.push(Math.sin(ph) * Math.cos(th) * 1500, Math.cos(ph) * 1500, Math.sin(ph) * Math.sin(th) * 1500);
  }
  starGeo.setAttribute("position", new THREE.Float32BufferAttribute(sp, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false });
  const stars = new THREE.Points(starGeo, starMat);
  stars.frustumCulled = false;
  scene.add(stars);
  keep(starGeo);
  keep(starMat);

  /* nuvens */
  const cloudTex = keep(cloudTexture());
  const clouds: { s: THREE.Sprite; base: number; y: number; z: number; v: number }[] = [];
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.9 });
  keep(cloudMat);
  for (let i = 0; i < 9; i++) {
    const s = new THREE.Sprite(cloudMat);
    const base = (i / 9) * 1200 - 600;
    const y = 130 + (i % 3) * 40;
    const z = -520 - (i % 4) * 60;
    s.scale.set(380 + (i % 3) * 120, 150 + (i % 2) * 40, 1);
    s.position.set(base, y, z);
    scene.add(s);
    clouds.push({ s, base, y, z, v: 1.2 + (i % 4) * 0.5 });
  }

  /* montanhas ao fundo (silhuetas em camadas) */
  const ridgeMats: THREE.MeshBasicMaterial[] = [];
  const ridges = [
    { z: -640, h: 150, seed: 1, day: 0x8fa6bb, night: 0x0b1420 },
    { z: -560, h: 110, seed: 2, day: 0x7a93a8, night: 0x0a121b },
    { z: -480, h: 70, seed: 3, day: 0x667f8f, night: 0x080f17 },
  ];
  for (const r of ridges) {
    const shape = new THREE.Shape();
    shape.moveTo(-900, -40);
    for (let x = -900; x <= 900; x += 18) {
      shape.lineTo(x, fbm(x * 0.006 + r.seed * 7, r.seed) * r.h);
    }
    shape.lineTo(900, -40);
    const g = new THREE.ShapeGeometry(shape);
    const m = new THREE.MeshBasicMaterial({ color: r.day, fog: false });
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(0, -4, r.z);
    scene.add(mesh);
    ridgeMats.push(m);
    keep(g);
    keep(m);
  }

  /* ---------------- Luzes ---------------- */
  const hemi = new THREE.HemisphereLight(0xcfe3ff, 0x6a7a5c, 0.5);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -22;
  sc.right = 22;
  sc.top = 38;
  sc.bottom = -26;
  sc.near = 10;
  sc.far = 220;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.04;
  scene.add(sun, sun.target);
  const moon = new THREE.DirectionalLight(0x8aa4ff, 0);
  moon.position.set(30, 60, -40);
  scene.add(moon);

  /* ---------------- Terreno ---------------- */
  const grassMap = keep(grassTexture());
  const tGeo = new THREE.PlaneGeometry(560, 760, 112, 152);
  tGeo.rotateX(-Math.PI / 2);
  {
    const pos = tGeo.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i) - 150;
      const h = terrainHeight(x, z);
      pos.setY(i, h);
      const patch = fbm(x * 0.03 + 40, z * 0.03);
      c.setHSL(0.26 + patch * 0.06 - h * 0.0008, 0.38 - h * 0.003, 0.5 - h * 0.004 + (patch - 0.5) * 0.12);
      col[i * 3] = c.r;
      col[i * 3 + 1] = c.g;
      col[i * 3 + 2] = c.b;
    }
    tGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    tGeo.computeVertexNormals();
  }
  const grassMat = new THREE.MeshStandardMaterial({ map: grassMap, vertexColors: true, roughness: 1, metalness: 0 });
  const terrain = new THREE.Mesh(tGeo, grassMat);
  terrain.position.set(0, 0, -150);
  terrain.receiveShadow = true;
  scene.add(terrain);
  keep(tGeo);
  keep(grassMat);

  /* ---------------- Pista ---------------- */
  const asphalt = asphaltTextures();
  keep(asphalt.map);
  keep(asphalt.bump);
  const roadMat = new THREE.MeshStandardMaterial({ map: asphalt.map, bumpMap: asphalt.bump, bumpScale: 0.6, roughness: 0.93, metalness: 0 });
  keep(roadMat);
  const ROAD_LEN = 800;
  const roadZ = -300;
  const plane = (w: number, mat: THREE.Material, x: number, y: number, len = ROAD_LEN) => {
    const g = new THREE.PlaneGeometry(w, len);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, mat);
    m.position.set(x, y, roadZ);
    m.receiveShadow = true;
    scene.add(m);
    keep(g);
    return m;
  };
  plane(11.6, roadMat, 0, 0.02);
  plane(7.6, roadMat, -11.5, 0.02);

  const shoulderMat = keep(new THREE.MeshStandardMaterial({ color: 0x6f716b, roughness: 1 }));
  plane(1.8, shoulderMat, 6.9, 0.025);
  plane(1.2, shoulderMat, -6.3, 0.025);
  plane(1.6, shoulderMat, -15.5, 0.025);

  // desgaste dos pneus em cada faixa
  const wear = keep(wearTexture());
  const wearMat = new THREE.MeshBasicMaterial({ map: wear, transparent: true, opacity: 0.2, depthWrite: false });
  keep(wearMat);
  for (const lane of [-3.5, 0, 3.5]) {
    for (const off of [-0.85, 0.85]) {
      const m = plane(0.75, wearMat, lane + off, 0.03);
      m.receiveShadow = false;
    }
  }
  for (const off of [-0.85, 0.85]) plane(0.75, wearMat, -11.5 + off, 0.03).receiveShadow = false;

  // linhas contínuas de borda
  const edgeMat = keep(new THREE.MeshStandardMaterial({ color: 0xd9dcde, roughness: 0.6 }));
  for (const x of [-5.45, 5.45, -15.1, -7.9]) plane(0.17, edgeMat, x, 0.035);
  const yellowMat = keep(new THREE.MeshStandardMaterial({ color: 0xe8b81e, roughness: 0.6, emissive: 0x201800 }));
  for (const x of [-11.58, -11.42]) plane(0.1, yellowMat, x, 0.035);

  // faixas tracejadas (instanciadas)
  const laneLeftMat = new THREE.MeshStandardMaterial({ color: 0xd9dcde, roughness: 0.6 });
  const laneRightMat = laneLeftMat.clone();
  keep(laneLeftMat);
  keep(laneRightMat);
  const dashGeo = new THREE.PlaneGeometry(0.17, 4);
  dashGeo.rotateX(-Math.PI / 2);
  keep(dashGeo);
  const DASH_N = SCROLL_LEN / 12;
  const mkDashes = (mat: THREE.Material, x: number) => {
    const m = new THREE.InstancedMesh(dashGeo, mat, DASH_N);
    m.position.set(x, 0.04, 0);
    m.frustumCulled = false;
    m.receiveShadow = true;
    scene.add(m);
    return m;
  };
  const dashesL = mkDashes(laneLeftMat, -1.8);
  const dashesR = mkDashes(laneRightMat, 1.8);
  const dashesL2 = mkDashes(laneLeftMat, -5.3 + 0); // placeholder removido abaixo
  dashesL2.visible = false;

  /* barreira central (concreto) */
  const jersey = new THREE.Shape();
  [
    [-0.36, 0],
    [-0.36, 0.1],
    [-0.22, 0.38],
    [-0.12, 0.86],
    [0.12, 0.86],
    [0.22, 0.38],
    [0.36, 0.1],
    [0.36, 0],
  ].forEach(([x, y], i) => (i ? jersey.lineTo(x, y) : jersey.moveTo(x, y)));
  const jGeo = new THREE.ExtrudeGeometry(jersey, { depth: ROAD_LEN, bevelEnabled: false });
  jGeo.translate(0, 0, -ROAD_LEN + 120);
  const concrete = keep(new THREE.MeshStandardMaterial({ color: 0xb4b6b3, roughness: 0.92, bumpMap: asphalt.bump, bumpScale: 1.2 }));
  const barrier = new THREE.Mesh(jGeo, concrete);
  barrier.position.set(-7.0, 0, 0);
  barrier.castShadow = true;
  barrier.receiveShadow = true;
  scene.add(barrier);
  keep(jGeo);

  /* defensas metálicas (trilho + postes instanciados) */
  const rail = new THREE.Shape();
  [
    [0, 0.5],
    [0.04, 0.54],
    [0.04, 0.62],
    [0.0, 0.66],
    [0.04, 0.7],
    [0.04, 0.78],
    [0, 0.82],
    [-0.03, 0.78],
    [-0.03, 0.7],
    [0.01, 0.66],
    [-0.03, 0.62],
    [-0.03, 0.54],
  ].forEach(([x, y], i) => (i ? rail.lineTo(x, y) : rail.moveTo(x, y)));
  const rGeo = new THREE.ExtrudeGeometry(rail, { depth: ROAD_LEN, bevelEnabled: false });
  rGeo.translate(0, 0, -ROAD_LEN + 120);
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0x9aa1a6, roughness: 0.5, metalness: 0.7 }));
  for (const x of [7.8, -16.0]) {
    const m = new THREE.Mesh(rGeo, steel);
    m.position.x = x;
    m.castShadow = true;
    scene.add(m);
  }
  keep(rGeo);
  const postGeo = new THREE.BoxGeometry(0.08, 0.8, 0.1);
  postGeo.translate(0, 0.4, 0);
  keep(postGeo);
  const POST_N = SCROLL_LEN / 4;
  const postsR = new THREE.InstancedMesh(postGeo, steel, POST_N);
  const postsL = new THREE.InstancedMesh(postGeo, steel, POST_N);
  for (const p of [postsR, postsL]) {
    p.frustumCulled = false;
    p.castShadow = true;
    scene.add(p);
  }
  postsR.position.x = 7.82;
  postsL.position.x = -16.02;

  /* ---------------- Árvores e arbustos (instanciados) ---------------- */
  const addCone = (list: THREE.BufferGeometry[], r: number, h: number, y: number, color: THREE.Color, seg = 10) => {
    const g = new THREE.ConeGeometry(r, h, seg);
    g.translate(0, y + h / 2, 0);
    paint(g, color, 0.55, 1.05);
    list.push(g);
  };
  const paint = (g: THREE.BufferGeometry, color: THREE.Color, lo: number, hi: number) => {
    g.computeBoundingBox();
    const bb = g.boundingBox!;
    const pos = g.getAttribute("position");
    const col = new Float32Array(pos.count * 3);
    for (let i = 0; i < pos.count; i++) {
      const t = (pos.getY(i) - bb.min.y) / Math.max(0.001, bb.max.y - bb.min.y);
      const k = lo + (hi - lo) * t;
      col[i * 3] = color.r * k;
      col[i * 3 + 1] = color.g * k;
      col[i * 3 + 2] = color.b * k;
    }
    g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  };
  const mergeAll = (list: THREE.BufferGeometry[]) => {
    // junta geometrias não indexadas com os mesmos atributos
    const pieces = list.map((g) => (g.index ? g.toNonIndexed() : g));
    let count = 0;
    for (const g of pieces) count += g.getAttribute("position").count;
    const pos = new Float32Array(count * 3);
    const nor = new Float32Array(count * 3);
    const col = new Float32Array(count * 3);
    let o = 0;
    for (const g of pieces) {
      pos.set(g.getAttribute("position").array as Float32Array, o * 3);
      nor.set(g.getAttribute("normal").array as Float32Array, o * 3);
      col.set(g.getAttribute("color").array as Float32Array, o * 3);
      o += g.getAttribute("position").count;
    }
    const out = new THREE.BufferGeometry();
    out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    out.setAttribute("normal", new THREE.BufferAttribute(nor, 3));
    out.setAttribute("color", new THREE.BufferAttribute(col, 3));
    return out;
  };

  const trunkColor = new THREE.Color(0x5b4637);
  const pineParts: THREE.BufferGeometry[] = [];
  {
    const t = new THREE.CylinderGeometry(0.16, 0.24, 1.8, 7);
    t.translate(0, 0.9, 0);
    paint(t, trunkColor, 0.7, 1);
    pineParts.push(t);
    const green = new THREE.Color(0x2f6b45);
    addCone(pineParts, 1.7, 2.8, 1.4, green);
    addCone(pineParts, 1.35, 2.4, 2.9, green);
    addCone(pineParts, 0.95, 2.1, 4.3, green);
  }
  const pineGeo = mergeAll(pineParts);
  const broadParts: THREE.BufferGeometry[] = [];
  {
    const t = new THREE.CylinderGeometry(0.2, 0.3, 2.6, 7);
    t.translate(0, 1.3, 0);
    paint(t, trunkColor, 0.7, 1);
    broadParts.push(t);
    const leaf = new THREE.Color(0x5b9a3c);
    const blobs: [number, number, number, number][] = [
      [0, 3.7, 0, 1.7],
      [1.1, 3.2, 0.3, 1.2],
      [-1.1, 3.3, -0.2, 1.25],
      [0.2, 4.6, 0.2, 1.2],
      [0.1, 3.3, 1.0, 1.1],
    ];
    for (const [x, y, z, r] of blobs) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      const pos = g.getAttribute("position");
      for (let i = 0; i < pos.count; i++) {
        const n = 1 + (hash(pos.getX(i) * 3, pos.getZ(i) * 3 + y) - 0.5) * 0.28;
        pos.setXYZ(i, pos.getX(i) * n, pos.getY(i) * n * 0.9, pos.getZ(i) * n);
      }
      g.translate(x, y, z);
      g.computeVertexNormals();
      paint(g, leaf, 0.6, 1.1);
      broadParts.push(g);
    }
  }
  const broadGeo = mergeAll(broadParts);
  const bushParts: THREE.BufferGeometry[] = [];
  {
    const leaf = new THREE.Color(0x4f8a3a);
    for (const [x, y, z, r] of [
      [0, 0.45, 0, 0.6],
      [0.5, 0.35, 0.2, 0.45],
      [-0.45, 0.35, -0.1, 0.42],
    ] as const) {
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.translate(x, y, z);
      g.computeVertexNormals();
      paint(g, leaf, 0.6, 1.1);
      bushParts.push(g);
    }
  }
  const bushGeo = mergeAll(bushParts);
  keep(pineGeo);
  keep(broadGeo);
  keep(bushGeo);
  const foliageMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, metalness: 0 }));

  interface Plant {
    mesh: THREE.InstancedMesh;
    items: { x: number; i: number; s: number; rot: number; jitter: number }[];
    period: number;
  }
  const rnd = (n: number) => hash(n, n * 1.7 + 3);
  const mkPlants = (geo: THREE.BufferGeometry, n: number, xs: [number, number][], period: number, scale: [number, number], seed: number): Plant => {
    const mesh = new THREE.InstancedMesh(geo, foliageMat, n);
    mesh.castShadow = true;
    mesh.frustumCulled = false;
    const items: Plant["items"] = [];
    const c = new THREE.Color();
    for (let k = 0; k < n; k++) {
      const band = xs[k % xs.length];
      const x = band[0] + rnd(k + seed) * (band[1] - band[0]);
      items.push({ x, i: k, s: scale[0] + rnd(k * 3 + seed) * (scale[1] - scale[0]), rot: rnd(k * 5 + seed) * 6.28, jitter: rnd(k * 7 + seed) * period });
      c.setHSL(0.27 + (rnd(k * 11 + seed) - 0.5) * 0.08, 0.4 + (rnd(k * 13) - 0.5) * 0.15, 0.55 + (rnd(k * 17) - 0.5) * 0.25);
      mesh.setColorAt(k, c);
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    scene.add(mesh);
    return { mesh, items, period };
  };
  const RIGHT: [number, number] = [10.5, 55];
  const LEFT: [number, number] = [-60, -19];
  const plants = [
    mkPlants(pineGeo, 70, [RIGHT, LEFT], 360 / 70, [0.8, 1.5], 1),
    mkPlants(broadGeo, 70, [RIGHT, LEFT], 360 / 70, [0.8, 1.4], 2),
    mkPlants(bushGeo, 110, [[9, 18], [-24, -18]], 360 / 110, [0.8, 1.7], 3),
  ];
  const dummy = new THREE.Object3D();

  /* ---------------- Placas e pórtico ---------------- */
  const gantry = new THREE.Group();
  {
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0x9ea6ab, roughness: 0.5, metalness: 0.8 }));
    const beam = new THREE.Mesh(new THREE.BoxGeometry(14.6, 0.35, 0.35), metal);
    beam.position.set(0.5, 6.6, 0);
    const p1 = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 6.6, 10), metal);
    p1.position.set(-6.4, 3.3, 0);
    const p2 = p1.clone();
    p2.position.x = 7.6;
    const tex = keep(signTexture(["Saída 12", "Centro · 2 km"]));
    const panel = new THREE.Mesh(
      new THREE.PlaneGeometry(5.6, 2.1),
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, emissive: 0x0c2a1c, emissiveMap: tex, emissiveIntensity: 0.25 }),
    );
    panel.position.set(0.6, 5.3, 0.22);
    const back = new THREE.Mesh(new THREE.BoxGeometry(5.7, 2.2, 0.06), metal);
    back.position.set(0.6, 5.3, 0.16);
    gantry.add(beam, p1, p2, back, panel);
    gantry.traverse((o) => (o.castShadow = true));
    scene.add(gantry);
  }
  const speedPole = new THREE.Group();
  {
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0x9ea6ab, roughness: 0.5, metalness: 0.8 }));
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.8, 8), metal);
    pole.position.y = 1.4;
    const tex = keep(speedSignTexture("80"));
    const face = new THREE.Mesh(new THREE.CircleGeometry(0.45, 28), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.4 }));
    face.position.set(0, 2.6, 0.04);
    speedPole.add(pole, face);
    speedPole.position.x = 8.4;
    speedPole.traverse((o) => (o.castShadow = true));
    scene.add(speedPole);
  }

  /* ---------------- Postes de luz ---------------- */
  const LAMP_N = 10;
  const lampGroup = new THREE.Group();
  const lampPoles: THREE.Group[] = [];
  const lampHeadMat = keep(new THREE.MeshStandardMaterial({ color: 0xdddddd, emissive: 0xffd9a0, emissiveIntensity: 0, roughness: 0.4 }));
  {
    const metal = keep(new THREE.MeshStandardMaterial({ color: 0x70787d, roughness: 0.5, metalness: 0.7 }));
    for (let i = 0; i < LAMP_N; i++) {
      const g = new THREE.Group();
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, 8.5, 8), metal);
      pole.position.y = 4.25;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 0.08), metal);
      arm.position.set(-1.3, 8.4, 0);
      const head = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.35), lampHeadMat);
      head.position.set(-2.5, 8.34, 0);
      g.add(pole, arm, head);
      g.traverse((o) => (o.castShadow = true));
      g.position.x = 8.9;
      lampGroup.add(g);
      lampPoles.push(g);
    }
    scene.add(lampGroup);
  }
  const poolTex = keep(poolTexture());
  const poolGeo = new THREE.PlaneGeometry(16, 16);
  poolGeo.rotateX(-Math.PI / 2);
  keep(poolGeo);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0, fog: true });
  keep(poolMat);
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, LAMP_N);
  pools.frustumCulled = false;
  pools.renderOrder = 1;
  scene.add(pools);
  keep(glowTexture());

  /* ---------------- Atualização ---------------- */
  const col = new THREE.Color();
  const dayFog = new THREE.Color(0xc4d6e3);
  const nightFog = new THREE.Color(0x070b11);
  const fog = new THREE.Fog(dayFog.clone(), 90, 340);
  scene.fog = fog;

  const m4 = new THREE.Matrix4();
  const sunDir = new THREE.Vector3();

  function update(p: EnvInput) {
    const { nightK, travel, ownX } = p;

    /* céu e luzes */
    const elev = 30 - 46 * nightK;
    sunDir.copy(sunVector(elev, AZIMUTH));
    su.sunPosition.value.copy(sunDir);
    su.rayleigh.value = elev > 0 ? 1.3 : 0.3 + 1.0 * Math.max(0, (elev + 14) / 14);
    sun.position.set(ownX + sunDir.x * 90, Math.max(sunDir.y, 0.05) * 90, sunDir.z * 90 - 5);
    sun.target.position.set(ownX, 0, -5);
    sun.intensity = 3.2 * smooth(-4, 14, elev);
    sun.color.setHSL(0.1, 0.5 - 0.3 * smooth(2, 30, elev), 0.5 + 0.4 * smooth(2, 30, elev));
    moon.intensity = 0.55 * nightK;
    hemi.intensity = 0.55 - 0.38 * nightK;
    scene.environmentIntensity = 1 - 0.78 * nightK;
    const wantNight = nightK > 0.5;
    if (wantNight !== envIsNight) {
      envIsNight = wantNight;
      scene.environment = (wantNight ? nightEnv : dayEnv).texture;
    }
    renderer.toneMappingExposure = 0.74 + 0.45 * nightK;

    fog.color.copy(dayFog).lerp(nightFog, nightK);
    fog.near = 90 - 40 * nightK;
    fog.far = 340 - 130 * nightK;
    starMat.opacity = smooth(0.35, 1, nightK);
    cloudMat.opacity = 0.9 - 0.75 * nightK;
    cloudMat.color.setRGB(1 - 0.75 * nightK, 1 - 0.72 * nightK, 1 - 0.55 * nightK);
    ridgeMats.forEach((m, i) => m.color.setHex(ridges[i].day).lerp(col.setHex(ridges[i].night), nightK));
    if (!p.still) for (const c of clouds) c.s.position.x = ((c.base + p.clock * c.v + 700) % 1400) - 700;

    /* movimento do cenário */
    asphalt.map.offset.y = (travel / 7) % 1;
    asphalt.bump.offset.y = (travel / 7) % 1;
    grassMap.offset.y = (travel / (760 / 40)) % 1;

    for (let i = 0; i < DASH_N; i++) {
      m4.makeTranslation(0, 0, wrapZ(travel, i, 12));
      dashesL.setMatrixAt(i, m4);
      dashesR.setMatrixAt(i, m4);
    }
    dashesL.instanceMatrix.needsUpdate = true;
    dashesR.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < POST_N; i++) {
      m4.makeTranslation(0, 0, wrapZ(travel, i, 4));
      postsR.setMatrixAt(i, m4);
      postsL.setMatrixAt(i, m4);
    }
    postsR.instanceMatrix.needsUpdate = true;
    postsL.instanceMatrix.needsUpdate = true;

    for (const pl of plants) {
      for (let k = 0; k < pl.items.length; k++) {
        const it = pl.items[k];
        const z = wrapZ(travel + it.jitter, it.i, pl.period);
        dummy.position.set(it.x, terrainHeight(it.x, z) - 0.05, z);
        dummy.rotation.set(0, it.rot, 0);
        dummy.scale.setScalar(it.s);
        dummy.updateMatrix();
        pl.mesh.setMatrixAt(k, dummy.matrix);
      }
      pl.mesh.instanceMatrix.needsUpdate = true;
    }

    gantry.position.z = wrapZ(travel + 120, 0, 1, 720, -560);
    speedPole.position.z = wrapZ(travel + 40, 0, 1, 480, -420);

    lampHeadMat.emissiveIntensity = 4 * nightK;
    poolMat.opacity = 0.55 * nightK;
    for (let i = 0; i < LAMP_N; i++) {
      const z = wrapZ(travel, i, 36);
      lampPoles[i].position.z = z;
      m4.makeTranslation(5.6, 0.05, z);
      pools.setMatrixAt(i, m4);
    }
    pools.instanceMatrix.needsUpdate = true;
  }

  function setShadows(level: 0 | 1 | 2) {
    sun.castShadow = level > 0;
    const size = level === 2 ? 2048 : 1024;
    if (sun.shadow.mapSize.x !== size) {
      sun.shadow.mapSize.set(size, size);
      sun.shadow.map?.dispose();
      sun.shadow.map = null;
    }
  }

  function dispose() {
    disposables.forEach((d) => d.dispose());
    pmrem.dispose();
  }

  return { update, laneLeftMat, laneRightMat, sun, setShadows, dispose };
}

import * as THREE from "three";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";

/**
 * Cena 3D do simulador. Tudo é modelado aqui, com formas simples, sem texturas
 * nem modelos externos. Frente do carro = -Z, direita = +X, medidas em metros.
 * Os volumes das zonas de sensor são ILUSTRATIVOS (o manual não informa o formato).
 */

export type CamMode = "auto" | "chase" | "top" | "side";
export type ShownMode = Exclude<CamMode, "auto"> | "avm";

export interface WorldInput {
  s: SimState;
  d: Derived;
  sensors: boolean;
  labels: boolean;
  mode: CamMode;
  reduced: boolean;
}

export interface World {
  update(input: WorldInput, dt: number): void;
  resize(w: number, h: number): void;
  nudge(dYaw: number, dZoom: number): void;
  resetView(): void;
  shownMode(): ShownMode;
  dispose(): void;
}

const GREEN = 0x38d39f;
const AMBER = 0xffb02e;
const RED = 0xff5a52;
const BLUE = 0x4aa8ff;
const CAR_HALF_LEN = 2.3;

/* ------------------------------------------------------------------ */
/* Peças                                                               */
/* ------------------------------------------------------------------ */

function glow(color: number) {
  return new THREE.MeshStandardMaterial({ color: 0x222222, emissive: color, emissiveIntensity: 0, roughness: 0.4 });
}

function zoneMaterial(color: number, opacity: number) {
  return new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
}

/** Retângulo deitado no chão; use scale.x (largura) e scale.z (comprimento). */
function flatPlane(material: THREE.Material) {
  const g = new THREE.PlaneGeometry(1, 1);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = 0.06;
  m.renderOrder = 2;
  return m;
}

/** Leque no chão. `centerAngle`: 0 = direita, π/2 = frente, π = esquerda, -π/2 = trás. */
function fan(radius: number, half: number, centerAngle: number, material: THREE.Material) {
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.absarc(0, 0, radius, centerAngle - half, centerAngle + half, false);
  shape.lineTo(0, 0);
  const g = new THREE.ShapeGeometry(shape, 24);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, material);
  m.position.y = 0.07;
  m.renderOrder = 2;
  return m;
}

interface CarParts {
  group: THREE.Group;
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  turnL: THREE.MeshStandardMaterial;
  turnR: THREE.MeshStandardMaterial;
  reverse: THREE.MeshStandardMaterial;
  wheels: THREE.Object3D[];
}

/** SUV compacto simplificado, desenhado do zero com um perfil lateral extrudado. */
function makeCar(color: number): CarParts {
  const group = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.08 });
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0d1419, roughness: 0.08, metalness: 0.7 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x15191c, roughness: 0.8 });

  const profile = [
    [-2.25, 0.35],
    [-2.28, 0.95],
    [-2.1, 1.15],
    [-1.75, 1.62],
    [0.35, 1.62],
    [1.05, 1.2],
    [2.0, 1.02],
    [2.25, 0.86],
    [2.28, 0.5],
    [2.2, 0.34],
  ];
  const body = new THREE.Shape();
  profile.forEach(([x, y], i) => (i === 0 ? body.moveTo(x, y) : body.lineTo(x, y)));
  const bodyGeo = new THREE.ExtrudeGeometry(body, {
    depth: 1.64,
    bevelEnabled: true,
    bevelSize: 0.08,
    bevelThickness: 0.1,
    bevelSegments: 3,
  });
  bodyGeo.translate(0, 0, -0.82);
  bodyGeo.rotateY(Math.PI / 2);
  group.add(new THREE.Mesh(bodyGeo, bodyMat));

  const glassShape = new THREE.Shape();
  [
    [-1.78, 1.1],
    [-1.68, 1.54],
    [0.3, 1.54],
    [0.9, 1.24],
    [0.9, 1.1],
  ].forEach(([x, y], i) => (i === 0 ? glassShape.moveTo(x, y) : glassShape.lineTo(x, y)));
  const glassGeo = new THREE.ExtrudeGeometry(glassShape, {
    depth: 1.66,
    bevelEnabled: true,
    bevelSize: 0.02,
    bevelThickness: 0.1,
    bevelSegments: 1,
  });
  glassGeo.translate(0, 0, -0.83);
  glassGeo.rotateY(Math.PI / 2);
  group.add(new THREE.Mesh(glassGeo, glassMat));

  const under = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.3, 4.4), darkMat);
  under.position.y = 0.32;
  group.add(under);

  const grille = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.2, 0.06), darkMat);
  grille.position.set(0, 0.62, -2.37);
  group.add(grille);

  const head = glow(0xfff1c2);
  const tail = glow(0xff2a20);
  const turnL = glow(0xffa11a);
  const turnR = glow(0xffa11a);
  const reverse = glow(0xffffff);

  for (const sx of [-1, 1]) {
    const h = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.1, 0.08), head);
    h.position.set(sx * 0.62, 0.8, -2.36);
    group.add(h);
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.08), tail);
    t.position.set(sx * 0.66, 0.86, 2.36);
    group.add(t);
    const tf = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.08), sx < 0 ? turnL : turnR);
    tf.position.set(sx * 0.8, 0.68, -2.34);
    group.add(tf);
    const tr = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.08), sx < 0 ? turnL : turnR);
    tr.position.set(sx * 0.8, 0.7, 2.36);
    group.add(tr);
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.07, 0.08), reverse);
    rv.position.set(sx * 0.36, 0.62, 2.37);
    group.add(rv);
    const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.12, 0.22), bodyMat);
    mirror.position.set(sx * 1.0, 1.12, -0.8);
    group.add(mirror);
  }

  const wheels: THREE.Object3D[] = [];
  const tireMat = new THREE.MeshStandardMaterial({ color: 0x0c0d0e, roughness: 0.9 });
  const rimMat = new THREE.MeshStandardMaterial({ color: 0xaab4ba, roughness: 0.3, metalness: 0.8 });
  for (const sx of [-1, 1]) {
    for (const z of [-1.42, 1.38]) {
      const w = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20), tireMat);
      tire.rotation.z = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.27, 6), rimMat);
      rim.rotation.z = Math.PI / 2;
      w.add(tire, rim);
      const holder = new THREE.Group();
      holder.position.set(sx * 0.8, 0.36, z);
      holder.add(w);
      group.add(holder);
      wheels.push(w);
    }
  }
  return { group, head, tail, turnL, turnR, reverse, wheels };
}

interface Walker {
  group: THREE.Group;
  legL: THREE.Object3D;
  legR: THREE.Object3D;
  armL: THREE.Object3D;
  armR: THREE.Object3D;
}

function makeWalker(): Walker {
  const group = new THREE.Group();
  const vest = new THREE.MeshStandardMaterial({ color: 0xff7a1a, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.8 });
  const skin = new THREE.MeshStandardMaterial({ color: 0xd9a07a, roughness: 0.7 });

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.66, 0.26), vest);
  torso.position.y = 1.2;
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), skin);
  head.position.y = 1.64;
  group.add(torso, head);

  const limb = (w: number, h: number, mat: THREE.Material, x: number, y: number) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = -h / 2;
    pivot.add(m);
    group.add(pivot);
    return pivot;
  };
  const legL = limb(0.16, 0.86, pants, -0.12, 0.88);
  const legR = limb(0.16, 0.86, pants, 0.12, 0.88);
  const armL = limb(0.11, 0.6, vest, -0.29, 1.5);
  const armR = limb(0.11, 0.6, vest, 0.29, 1.5);
  return { group, legL, legR, armL, armR };
}

function makeTree(): THREE.Group {
  const g = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.18, 0.24, 1.6, 8),
    new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.9 }),
  );
  trunk.position.y = 0.8;
  const top = new THREE.Mesh(
    new THREE.ConeGeometry(1.4, 3.8, 10),
    new THREE.MeshStandardMaterial({ color: 0x3f7d55, roughness: 0.85 }),
  );
  top.position.y = 3.3;
  g.add(trunk, top);
  return g;
}

/* ------------------------------------------------------------------ */
/* Mundo                                                               */
/* ------------------------------------------------------------------ */

interface LabelSpec {
  id: string;
  text: string;
  pos: THREE.Vector3;
  tone: "ok" | "info" | "warn" | "alert";
}

const WRAP_LEN = 204;
const WRAP_START = -174;
const PERIOD = 12;

const wrap = (offset: number, i: number, period = PERIOD) => {
  const v = (((i * period + offset) % WRAP_LEN) + WRAP_LEN) % WRAP_LEN;
  return WRAP_START + v;
};

export function createWorld(host: HTMLElement, labelLayer: HTMLElement): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(host.clientWidth || 640, host.clientHeight || 360, false);
  renderer.domElement.className = "scene-canvas";
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const daySky = new THREE.Color(0xbcd6e4);
  const nightSky = new THREE.Color(0x070c12);
  scene.background = daySky.clone();
  scene.fog = new THREE.Fog(daySky.clone(), 70, 230);

  const camera = new THREE.PerspectiveCamera(46, (host.clientWidth || 640) / (host.clientHeight || 360), 0.1, 400);

  const hemi = new THREE.HemisphereLight(0xffffff, 0x6d7f66, 1.0);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(-30, 50, 20);
  scene.add(hemi, sun);

  /* Terreno e pista */
  const grassMat = new THREE.MeshStandardMaterial({ color: 0x7a9a72, roughness: 1 });
  const grass = new THREE.Mesh(new THREE.PlaneGeometry(400, 420), grassMat);
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(0, -0.02, -90);
  scene.add(grass);

  const asphalt = new THREE.MeshStandardMaterial({ color: 0x3a434a, roughness: 0.95 });
  const road = new THREE.Mesh(new THREE.PlaneGeometry(11.4, 420), asphalt);
  road.rotation.x = -Math.PI / 2;
  road.position.set(0, 0, -90);
  scene.add(road);

  const oncomingRoad = new THREE.Mesh(new THREE.PlaneGeometry(7.4, 420), asphalt);
  oncomingRoad.rotation.x = -Math.PI / 2;
  oncomingRoad.position.set(-11.5, 0, -90);
  scene.add(oncomingRoad);

  const barrier = new THREE.Mesh(
    new THREE.BoxGeometry(0.5, 0.8, 420),
    new THREE.MeshStandardMaterial({ color: 0x9aa4a9, roughness: 0.8 }),
  );
  barrier.position.set(-7.0, 0.4, -90);
  scene.add(barrier);

  const edgeMat = new THREE.MeshBasicMaterial({ color: 0xe8edf0 });
  for (const x of [-5.4, 5.4, -14.8]) {
    const edge = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 420), edgeMat);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(x, 0.015, -90);
    scene.add(edge);
  }

  /* Faixas tracejadas (rolam com a velocidade) */
  const laneLeftMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f5 });
  const laneRightMat = new THREE.MeshBasicMaterial({ color: 0xf2f4f5 });
  const dashes: { mesh: THREE.Mesh; i: number }[] = [];
  const dashGeo = new THREE.PlaneGeometry(0.16, 4);
  dashGeo.rotateX(-Math.PI / 2);
  for (const [x, mat] of [
    [-1.8, laneLeftMat],
    [1.8, laneRightMat],
  ] as const) {
    for (let i = 0; i < WRAP_LEN / PERIOD; i++) {
      const m = new THREE.Mesh(dashGeo, mat);
      m.position.set(x, 0.02, 0);
      scene.add(m);
      dashes.push({ mesh: m, i });
    }
  }
  const oncomingDashes: { mesh: THREE.Mesh; i: number }[] = [];
  for (let i = 0; i < WRAP_LEN / PERIOD; i++) {
    const m = new THREE.Mesh(dashGeo, edgeMat);
    m.position.set(-11.5, 0.02, 0);
    scene.add(m);
    oncomingDashes.push({ mesh: m, i });
  }

  /* Árvores nas laterais */
  const trees: { obj: THREE.Group; i: number }[] = [];
  for (let i = 0; i < WRAP_LEN / 24; i++) {
    for (const x of [9.5, -17.5]) {
      const t = makeTree();
      t.position.x = x + (i % 2 ? 1.2 : -0.6);
      t.scale.setScalar(0.85 + ((i * 7) % 5) * 0.08);
      scene.add(t);
      trees.push({ obj: t, i: i + (x > 0 ? 0 : 0.5) });
    }
  }

  /* Seu carro */
  const own = makeCar(0xe9eef1);
  scene.add(own.group);

  /* Alvos */
  const leadCar = makeCar(0x4a6f8a);
  leadCar.group.visible = false;
  scene.add(leadCar.group);
  const walker = makeWalker();
  walker.group.visible = false;
  scene.add(walker.group);

  const targetRing = new THREE.Mesh(
    (() => {
      const g = new THREE.RingGeometry(1.5, 1.75, 40);
      g.rotateX(-Math.PI / 2);
      return g;
    })(),
    zoneMaterial(0xffffff, 0.8),
  );
  targetRing.position.y = 0.08;
  targetRing.renderOrder = 3;
  scene.add(targetRing);

  /* Carros de apoio */
  const blindL = makeCar(0xb3412f);
  const blindR = makeCar(0x6b7f3a);
  const crossL = makeCar(0x8a6bb0);
  const crossR = makeCar(0xd6a23a);
  const oncomingCar = makeCar(0x2f3a45);
  crossL.group.rotation.y = Math.PI / 2;
  crossR.group.rotation.y = -Math.PI / 2;
  oncomingCar.group.rotation.y = Math.PI;
  for (const c of [blindL, blindR, crossL, crossR, oncomingCar]) {
    c.group.visible = false;
    scene.add(c.group);
  }

  /* Farol: luz de verdade e leque visual */
  const spot = new THREE.SpotLight(0xfff2d0, 0, 90, 0.5, 0.6, 1.2);
  spot.position.set(0, 0.9, -2.2);
  const spotTarget = new THREE.Object3D();
  spotTarget.position.set(0, 0, -40);
  scene.add(spot, spotTarget);
  spot.target = spotTarget;

  const lowBeamMat = zoneMaterial(0xfff2c8, 0.0);
  const highBeamMat = zoneMaterial(0xcfe6ff, 0.0);
  const lowBeam = fan(34, 0.42, Math.PI / 2, lowBeamMat);
  const highBeam = fan(110, 0.13, Math.PI / 2, highBeamMat);
  lowBeam.position.set(0, 0.05, -2.3);
  highBeam.position.set(0, 0.055, -2.3);
  scene.add(lowBeam, highBeam);

  /* Zonas de sensor */
  const sensorGroup = new THREE.Group();
  scene.add(sensorGroup);

  const radarMat = zoneMaterial(BLUE, 0.1);
  const cameraMat = zoneMaterial(BLUE, 0.07);
  const radarFan = fan(85, 0.1, Math.PI / 2, radarMat);
  const cameraFan = fan(38, 0.46, Math.PI / 2, cameraMat);
  radarFan.position.set(0, 0.06, -CAR_HALF_LEN);
  cameraFan.position.set(0, 0.065, -CAR_HALF_LEN);
  sensorGroup.add(radarFan, cameraFan);

  const gapZoneMat = zoneMaterial(GREEN, 0.14);
  const gapLineMat = zoneMaterial(GREEN, 0.85);
  const gapZone = flatPlane(gapZoneMat);
  gapZone.scale.x = 3.0;
  const gapLine = flatPlane(gapLineMat);
  gapLine.scale.set(3.4, 1, 0.45);
  sensorGroup.add(gapZone, gapLine);

  const aebMat = zoneMaterial(RED, 0.3);
  const aebZone = flatPlane(aebMat);
  aebZone.scale.x = 2.2;
  sensorGroup.add(aebZone);

  const bsdMatL = zoneMaterial(BLUE, 0.1);
  const bsdMatR = zoneMaterial(BLUE, 0.1);
  const bsdL = flatPlane(bsdMatL);
  const bsdR = flatPlane(bsdMatR);
  for (const z of [bsdL, bsdR]) {
    z.scale.set(3.1, 1, 9);
  }
  bsdL.position.set(-3.5, 0.06, 4.0);
  bsdR.position.set(3.5, 0.06, 4.0);
  sensorGroup.add(bsdL, bsdR);

  const rctaMatL = zoneMaterial(BLUE, 0.1);
  const rctaMatR = zoneMaterial(BLUE, 0.1);
  const rctaL = fan(20, 0.55, -Math.PI + 0.55, rctaMatL);
  const rctaR = fan(20, 0.55, -0.55, rctaMatR);
  rctaL.position.set(-0.9, 0.065, CAR_HALF_LEN);
  rctaR.position.set(0.9, 0.065, CAR_HALF_LEN);
  sensorGroup.add(rctaL, rctaR);

  const avmMat = zoneMaterial(0x4fd0e8, 0.12);
  const avmZone = flatPlane(avmMat);
  avmZone.scale.set(5.6, 1, 8.6);
  avmZone.position.set(0, 0.055, 0);
  sensorGroup.add(avmZone);

  const camGeo = new THREE.ConeGeometry(0.16, 0.34, 10);
  const camMat = new THREE.MeshBasicMaterial({ color: 0x4fd0e8 });
  const camMarkers: THREE.Mesh[] = [];
  for (const [x, z, ry] of [
    [0, -2.45, 0],
    [0, 2.45, Math.PI],
    [-1.05, -0.8, Math.PI / 2],
    [1.05, -0.8, -Math.PI / 2],
  ] as const) {
    const m = new THREE.Mesh(camGeo, camMat);
    m.rotation.x = Math.PI / 2;
    const holder = new THREE.Group();
    holder.position.set(x, 0.95, z);
    holder.rotation.y = ry;
    holder.add(m);
    sensorGroup.add(holder);
    camMarkers.push(m);
  }

  /* Rótulos flutuantes */
  const labelEls = new Map<string, HTMLDivElement>();
  const tmp = new THREE.Vector3();

  function paintLabels(specs: LabelSpec[], enabled: boolean, w: number, h: number) {
    const seen = new Set<string>();
    if (enabled) {
      for (const sp of specs) {
        tmp.copy(sp.pos).project(camera);
        const visible = tmp.z > -1 && tmp.z < 1 && Math.abs(tmp.x) < 1.05 && Math.abs(tmp.y) < 1.05;
        if (!visible) continue;
        seen.add(sp.id);
        let el = labelEls.get(sp.id);
        if (!el) {
          el = document.createElement("div");
          el.className = "scene-label";
          labelLayer.appendChild(el);
          labelEls.set(sp.id, el);
        }
        if (el.textContent !== sp.text) el.textContent = sp.text;
        const cls = `scene-label tone-${sp.tone}`;
        if (el.className !== cls) el.className = cls;
        el.style.transform = `translate(-50%, -100%) translate(${((tmp.x + 1) / 2) * w}px, ${((1 - tmp.y) / 2) * h}px)`;
      }
    }
    for (const [id, el] of labelEls) {
      if (!seen.has(id)) {
        el.remove();
        labelEls.delete(id);
      }
    }
  }

  /* Estado interno da animação */
  let travel = 0;
  let clock = 0;
  let nightK = 0;
  let ownX = 0;
  let wheelSpin = 0;
  let yawOff = 0;
  let zoom = 1;
  let shown: ShownMode = "chase";
  const camPos = new THREE.Vector3(0, 4.5, 10.5);
  const camLook = new THREE.Vector3(0, 1.2, -14);
  const wantPos = new THREE.Vector3();
  const wantLook = new THREE.Vector3();
  let width = host.clientWidth || 640;
  let height = host.clientHeight || 360;

  function setCar(
    car: CarParts,
    o: { head?: number; tail?: number; turnL?: boolean; turnR?: boolean; reverse?: boolean },
  ) {
    car.head.emissiveIntensity = o.head ?? 0;
    car.tail.emissiveIntensity = o.tail ?? 0;
    car.turnL.emissiveIntensity = o.turnL ? 2.2 : 0;
    car.turnR.emissiveIntensity = o.turnR ? 2.2 : 0;
    car.reverse.emissiveIntensity = o.reverse ? 2 : 0;
  }

  function update(inp: WorldInput, dtRaw: number) {
    const { s, d } = inp;
    const dt = Math.min(dtRaw, 0.1);
    clock += dt;
    const still = inp.reduced;
    const blinkOn = still ? true : Math.floor(clock * 2.6) % 2 === 0;
    const fastBlink = still ? true : Math.floor(clock * 6) % 2 === 0;

    const dir = s.gear === "R" ? -1 : 1;
    const mps = s.speed / 3.6;
    if (!still) travel += mps * dt * dir;
    wheelSpin += (mps * dt * dir) / 0.36;

    /* Dia e noite */
    nightK += ((s.night ? 1 : 0) - nightK) * (1 - Math.exp(-dt * 3));
    (scene.background as THREE.Color).copy(daySky).lerp(nightSky, nightK);
    (scene.fog as THREE.Fog).color.copy(scene.background as THREE.Color);
    hemi.intensity = 1.0 - nightK * 0.6;
    sun.intensity = 1.5 - nightK * 1.42;
    grassMat.color.setHex(0x7a9a72).multiplyScalar(1 - nightK * 0.35);

    /* Cenário rolando */
    for (const d1 of dashes) d1.mesh.position.z = wrap(travel, d1.i);
    for (const d1 of oncomingDashes) d1.mesh.position.z = wrap(travel, d1.i);
    for (const t of trees) t.obj.position.z = wrap(travel, t.i, 24);

    /* Seu carro e a saída de faixa */
    const driftTarget = s.laneDeparture ? -0.95 : 0;
    ownX += (driftTarget - ownX) * (1 - Math.exp(-dt * 2));
    own.group.position.x = ownX;
    own.group.rotation.y = (driftTarget - ownX) * 0.1;
    for (const w of own.wheels) w.rotation.x = wheelSpin;

    const warnLdw = d.ldwWarn;
    laneLeftMat.color.setHex(warnLdw && fastBlink ? AMBER : 0xf2f4f5);

    const headLevel = s.ignitionOn ? (nightK > 0.4 || d.highBeam ? 1.4 : 0.35) : 0;
    const braking = s.brake || s.aeb === "partial" || s.aeb === "emergency";
    const showTurnL = s.hazard || s.turnSignal === "left";
    const showTurnR = s.hazard || s.turnSignal === "right";
    setCar(own, {
      head: headLevel,
      tail: s.ignitionOn ? (braking ? 3 : 0.5) : 0,
      turnL: showTurnL && blinkOn && s.ignitionOn,
      turnR: showTurnR && blinkOn && s.ignitionOn,
      reverse: s.gear === "R" && s.ignitionOn,
    });

    /* Luz dos faróis */
    const lightsOn = s.ignitionOn && nightK > 0.3;
    spot.intensity = lightsOn ? 900 : 0;
    spot.angle = d.highBeam ? 0.3 : 0.55;
    spot.distance = d.highBeam ? 140 : 55;
    spot.position.x = ownX;
    spotTarget.position.set(ownX, 0, d.highBeam ? -80 : -32);
    lowBeamMat.opacity = lightsOn ? 0.2 : 0;
    highBeamMat.opacity = lightsOn && d.highBeam ? 0.26 : 0;
    lowBeam.position.x = ownX;
    highBeam.position.x = ownX;

    /* Alvo à frente */
    const t = s.target;
    const labels: LabelSpec[] = [];
    const tgtZ = -(CAR_HALF_LEN + t.distance);
    leadCar.group.visible = t.kind === "movingVehicle" || t.kind === "staticVehicle";
    walker.group.visible = t.kind === "pedestrian";
    targetRing.visible = t.kind !== "none";
    const tone: LabelSpec["tone"] =
      s.collided || s.aeb === "partial" || s.aeb === "emergency"
        ? "alert"
        : d.fdmWarn || s.aeb === "warn"
          ? "warn"
          : d.following
            ? "ok"
            : "info";
    const ringColor = { alert: RED, warn: AMBER, ok: GREEN, info: 0xdfe8ec }[tone];
    (targetRing.material as THREE.MeshBasicMaterial).color.setHex(ringColor);
    if (leadCar.group.visible) {
      leadCar.group.position.set(0, 0, tgtZ - 2.3);
      for (const w of leadCar.wheels) w.rotation.x = wheelSpin * (t.kind === "movingVehicle" ? t.speed / Math.max(s.speed, 8) : 0);
      setCar(leadCar, {
        tail: t.kind === "staticVehicle" ? 0.7 : 0.8,
        turnL: t.kind === "staticVehicle" && blinkOn,
        turnR: t.kind === "staticVehicle" && blinkOn,
        head: 0,
      });
      targetRing.position.set(0, 0.08, tgtZ - 2.3);
      targetRing.scale.set(1.25, 1, 1.9);
      labels.push({
        id: "target",
        text:
          t.kind === "movingVehicle"
            ? `Carro a ${Math.round(t.speed)} km/h · ${Math.round(t.distance)} m${d.following ? " · seguido pelo ACC" : ""}`
            : `Carro parado · ${Math.round(t.distance)} m`,
        pos: new THREE.Vector3(0, 2.4, tgtZ - 2.3),
        tone,
      });
    }
    if (walker.group.visible) {
      walker.group.position.set(0, 0, tgtZ - 0.2);
      const sw = still ? 0 : Math.sin(clock * 5.5) * 0.5;
      walker.legL.rotation.x = sw;
      walker.legR.rotation.x = -sw;
      walker.armL.rotation.x = -sw * 0.8;
      walker.armR.rotation.x = sw * 0.8;
      targetRing.position.set(0, 0.08, tgtZ - 0.2);
      targetRing.scale.set(0.5, 1, 0.5);
      labels.push({
        id: "target",
        text: `Pedestre · ${Math.round(t.distance)} m`,
        pos: new THREE.Vector3(0, 2.1, tgtZ - 0.2),
        tone,
      });
    }
    if (s.collided) {
      labels.push({ id: "crash", text: "Colisão simulada", pos: new THREE.Vector3(0, 3.1, -CAR_HALF_LEN - 1), tone: "alert" });
    }

    /* Ponto cego, ré e farol */
    blindL.group.visible = s.blind.left;
    blindR.group.visible = s.blind.right;
    blindL.group.position.set(-3.5, 0, 3.2);
    blindR.group.position.set(3.5, 0, 3.2);
    for (const c of [blindL, blindR]) {
      for (const w of c.wheels) w.rotation.x = wheelSpin;
      setCar(c, { tail: 0.6 });
    }
    const crossSpan = 40;
    const crossPhase = (clock * 5.5) % crossSpan;
    crossL.group.visible = s.cross.left;
    crossR.group.visible = s.cross.right;
    crossL.group.position.set(-20 + crossPhase, 0, 9.5);
    crossR.group.position.set(20 - crossPhase, 0, 15);
    for (const c of [crossL, crossR]) {
      for (const w of c.wheels) w.rotation.x = clock * 8;
      setCar(c, { tail: 0.7, head: 0.5 });
    }
    oncomingCar.group.visible = s.oncoming;
    oncomingCar.group.position.set(-9.8, 0, -150 + ((clock * 26) % 190));
    setCar(oncomingCar, { head: 2, tail: 0 });
    for (const w of oncomingCar.wheels) w.rotation.x = clock * 10;

    /* Zonas de sensor */
    sensorGroup.visible = inp.sensors;
    if (inp.sensors) {
      const md = s.hasMaxDrive && s.ignitionOn;
      const frontTone = s.collided || s.aeb === "partial" || s.aeb === "emergency" ? RED : d.fdmWarn || s.aeb === "warn" ? AMBER : d.following ? GREEN : BLUE;
      radarFan.visible = cameraFan.visible = md && d.operational;
      radarMat.color.setHex(frontTone);
      cameraMat.color.setHex(frontTone);
      radarFan.position.x = cameraFan.position.x = ownX;

      const accOn = md && s.acc.mode === "active";
      gapZone.visible = gapLine.visible = accOn;
      if (accOn) {
        const gz = d.gapMeters;
        gapZone.scale.z = gz;
        gapZone.position.set(ownX, 0.06, -(CAR_HALF_LEN + gz / 2));
        gapLine.position.set(ownX, 0.07, -(CAR_HALF_LEN + gz));
        labels.push({
          id: "gap",
          text: `Distância do ACC · ${Math.round(gz)} m`,
          pos: new THREE.Vector3(ownX + 2.2, 0.3, -(CAR_HALF_LEN + gz)),
          tone: "ok",
        });
      }

      aebZone.visible = md && (s.aeb === "partial" || s.aeb === "emergency");
      if (aebZone.visible) {
        const len = Math.max(t.distance, 0.5);
        aebZone.scale.z = len;
        aebZone.position.set(0, 0.075, -(CAR_HALF_LEN + len / 2));
        aebMat.opacity = fastBlink ? 0.36 : 0.18;
      }

      const bsdOn = md && s.bsd !== "off";
      bsdL.visible = bsdR.visible = bsdOn;
      const paintBsd = (mat: THREE.MeshBasicMaterial, lvl: 0 | 1 | 2) => {
        mat.color.setHex(lvl === 2 ? AMBER : lvl === 1 ? GREEN : BLUE);
        mat.opacity = lvl === 2 ? (fastBlink ? 0.5 : 0.2) : lvl === 1 ? 0.32 : 0.1;
      };
      paintBsd(bsdMatL, d.bsdWarn.left);
      paintBsd(bsdMatR, d.bsdWarn.right);
      if (bsdOn) {
        labels.push({ id: "bsdL", text: "Zona do ponto cego", pos: new THREE.Vector3(-3.5, 0.5, 6.5), tone: d.bsdWarn.left ? "warn" : "info" });
      }

      const rctaOn = md && s.gear === "R" && s.settings.bsd;
      rctaL.visible = rctaR.visible = rctaOn;
      rctaMatL.color.setHex(d.rctaWarn.left ? RED : BLUE);
      rctaMatR.color.setHex(d.rctaWarn.right ? RED : BLUE);
      rctaMatL.opacity = d.rctaWarn.left ? (fastBlink ? 0.42 : 0.2) : 0.1;
      rctaMatR.opacity = d.rctaWarn.right ? (fastBlink ? 0.42 : 0.2) : 0.1;
      rctaL.position.x = ownX - 0.9;
      rctaR.position.x = ownX + 0.9;
      if (rctaOn) {
        labels.push({ id: "rcta", text: "Radar traseiro de tráfego cruzado", pos: new THREE.Vector3(0, 1.2, 9), tone: "info" });
      }

      avmZone.visible = s.avmOn;
      for (const m of camMarkers) m.parent!.visible = s.avmOn;
      avmZone.position.x = ownX;

      if (md && d.operational) {
        labels.push({ id: "radar", text: "Radar e câmera da frente", pos: new THREE.Vector3(ownX + 7, 0.3, -20), tone: "info" });
      }
    }

    if (s.oncoming) {
      labels.push({
        id: "oncoming",
        text: "Carro vindo de frente",
        pos: new THREE.Vector3(-9.8, 2.2, oncomingCar.group.position.z),
        tone: d.highBeam ? "warn" : "info",
      });
    }
    if (s.cross.left) labels.push({ id: "crossL", text: "Cruzando atrás", pos: new THREE.Vector3(crossL.group.position.x, 2.2, 9.5), tone: d.rctaWarn.left ? "alert" : "info" });
    if (s.cross.right) labels.push({ id: "crossR", text: "Cruzando atrás", pos: new THREE.Vector3(crossR.group.position.x, 2.2, 15), tone: d.rctaWarn.right ? "alert" : "info" });
    if (s.blind.left) labels.push({ id: "blL", text: "Carro no ponto cego", pos: new THREE.Vector3(-3.5, 2.2, 3.2), tone: d.bsdWarn.left === 2 ? "alert" : d.bsdWarn.left === 1 ? "warn" : "info" });
    if (s.blind.right) labels.push({ id: "blR", text: "Carro no ponto cego", pos: new THREE.Vector3(3.5, 2.2, 3.2), tone: d.bsdWarn.right === 2 ? "alert" : d.bsdWarn.right === 1 ? "warn" : "info" });
    if (d.highBeam) labels.push({ id: "hb", text: "Farol alto ligado", pos: new THREE.Vector3(ownX, 0.4, -40), tone: "info" });
    if (warnLdw) labels.push({ id: "ldw", text: "Saindo da faixa", pos: new THREE.Vector3(-1.8, 0.8, -6), tone: "warn" });
    labels.push({ id: "own", text: "Seu carro", pos: new THREE.Vector3(ownX, 2.1, 0), tone: "info" });

    /* Câmera */
    const wantsTop = s.blind.left || s.blind.right || s.cross.left || s.cross.right;
    let mode: ShownMode;
    if (inp.mode === "auto") mode = s.avmOn ? "avm" : wantsTop ? "top" : "chase";
    else mode = inp.mode;
    shown = mode;

    const cy = Math.cos(yawOff);
    const sy = Math.sin(yawOff);
    if (mode === "chase") {
      wantPos.set(ownX * 0.6 + sy * 11.5 * zoom, 5.0, cy * 11.5 * zoom);
      wantLook.set(ownX * 0.5, 0.9, -14);
    } else if (mode === "top") {
      wantPos.set(sy * 8, 34 * zoom, 4 + cy * 8);
      wantLook.set(0, 0, -6);
    } else if (mode === "avm") {
      wantPos.set(sy * 3, 15 * zoom, 3 + cy * 3);
      wantLook.set(0, 0, 0);
    } else {
      wantPos.set(15 * zoom * cy, 3.4, -3 + 15 * zoom * sy);
      wantLook.set(0, 1, -6);
    }
    const k = 1 - Math.exp(-dt * (still ? 30 : 3.5));
    camPos.lerp(wantPos, k);
    camLook.lerp(wantLook, k);
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    camera.updateMatrixWorld();

    renderer.render(scene, camera);
    paintLabels(labels, inp.labels, width, height);
  }

  function resize(w: number, h: number) {
    width = Math.max(w, 1);
    height = Math.max(h, 1);
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  }

  function dispose() {
    for (const el of labelEls.values()) el.remove();
    labelEls.clear();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose());
      else mat?.dispose();
    });
    renderer.dispose();
    renderer.domElement.remove();
  }

  return {
    update,
    resize,
    nudge(dYaw, dZoom) {
      yawOff = Math.max(-1.2, Math.min(1.2, yawOff + dYaw));
      zoom = Math.max(0.55, Math.min(1.8, zoom * (1 + dZoom)));
    },
    resetView() {
      yawOff = 0;
      zoom = 1;
    },
    shownMode: () => shown,
    dispose,
  };
}


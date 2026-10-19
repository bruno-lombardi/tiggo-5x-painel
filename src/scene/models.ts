import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { toCreasedNormals } from "three/addons/utils/BufferGeometryUtils.js";
import { blobTexture, cargoTexture, plateTexture } from "./textures";

let blobMat: THREE.MeshBasicMaterial | null = null;
/** Sombra suave de contato: aterra o veículo no asfalto, de dia e de noite. */
function contactBlob(w: number, l: number, z: number) {
  blobMat ??= new THREE.MeshBasicMaterial({ map: blobTexture(), transparent: true, depthWrite: false, opacity: 0.9 });
  const g = new THREE.PlaneGeometry(w, l);
  g.rotateX(-Math.PI / 2);
  const m = new THREE.Mesh(g, blobMat);
  m.position.set(0, 0.045, z);
  m.renderOrder = 1;
  return m;
}

/**
 * Modelos 3D desenhados em código: SUV genérico, caminhão e pedestre.
 * Não reproduzem nenhum carro real nem logotipo: o desenho é uma silhueta de SUV
 * compacto, com emblema em branco e placa fictícia.
 * Eixos: frente = -Z, direita = +X, altura = +Y, medidas em metros.
 */

export interface CarParts {
  group: THREE.Group;
  head: THREE.MeshStandardMaterial;
  tail: THREE.MeshStandardMaterial;
  turnL: THREE.MeshStandardMaterial;
  turnR: THREE.MeshStandardMaterial;
  reverse: THREE.MeshStandardMaterial;
  wheels: THREE.Object3D[];
  /** metade do comprimento: distância do centro até o para-choque */
  halfLen: number;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

function glowMat(color: number) {
  return new THREE.MeshStandardMaterial({ color: 0x1a1a1a, emissive: color, emissiveIntensity: 0, roughness: 0.35 });
}

function shadowed<T extends THREE.Object3D>(o: T, cast = true, receive = false): T {
  o.traverse((c) => {
    c.castShadow = cast;
    c.receiveShadow = receive;
  });
  return o;
}

/* ------------------------------------------------------------------ */
/* Roda                                                                */
/* ------------------------------------------------------------------ */

const tireMat = new THREE.MeshStandardMaterial({ color: 0x0e0f10, roughness: 0.92, metalness: 0 });
const rimMat = new THREE.MeshStandardMaterial({ color: 0xc4ccd1, roughness: 0.22, metalness: 0.95 });
const rimDark = new THREE.MeshStandardMaterial({ color: 0x23282c, roughness: 0.5, metalness: 0.6 });
const discMat = new THREE.MeshStandardMaterial({ color: 0x8c9296, roughness: 0.4, metalness: 0.9 });
const caliperMat = new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.5 });

let tireGeo: THREE.BufferGeometry | null = null;

function buildWheel(side: 1 | -1, radius = 0.355): THREE.Group {
  const k = radius / 0.355;
  const spinner = new THREE.Group();
  if (!tireGeo) {
    const pts = [
      [0.215, -0.11],
      [0.3, -0.118],
      [0.345, -0.09],
      [0.357, -0.04],
      [0.358, 0],
      [0.357, 0.04],
      [0.345, 0.09],
      [0.3, 0.118],
      [0.215, 0.11],
    ].map(([r, y]) => new THREE.Vector2(r, y));
    tireGeo = new THREE.LatheGeometry(pts, 32);
    tireGeo.rotateZ(Math.PI / 2);
  }
  const tire = new THREE.Mesh(tireGeo, tireMat);
  spinner.add(tire);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.225, 0.225, 0.21, 28, 1, true), rimDark);
  barrel.rotation.z = Math.PI / 2;
  spinner.add(barrel);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.228, 0.016, 8, 36), rimMat);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = side * 0.105;
  spinner.add(lip);

  const face = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.02, 28), rimDark);
  face.rotation.z = Math.PI / 2;
  face.position.x = side * 0.07;
  spinner.add(face);

  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    const spoke = new THREE.Mesh(new RoundedBoxGeometry(0.03, 0.2, 0.052, 2, 0.01), rimMat);
    spoke.position.set(side * 0.092, Math.cos(a) * 0.12, Math.sin(a) * 0.12);
    spoke.rotation.x = -a;
    spinner.add(spoke);
  }
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.03, 16), rimMat);
  hub.rotation.z = Math.PI / 2;
  hub.position.x = side * 0.1;
  spinner.add(hub);

  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.022, 28), discMat);
  disc.rotation.z = Math.PI / 2;
  disc.position.x = side * 0.0;
  spinner.add(disc);

  const caliper = new THREE.Mesh(new RoundedBoxGeometry(0.06, 0.1, 0.075, 2, 0.015), caliperMat);
  caliper.position.set(side * 0.045, 0.14, -0.05);
  // a pinça não gira com a roda
  const holder = new THREE.Group();
  holder.add(spinner);
  holder.userData.caliper = caliper;
  holder.scale.setScalar(k);
  return holder;
}

/* ------------------------------------------------------------------ */
/* SUV                                                                 */
/* ------------------------------------------------------------------ */

function clipBand(poly: THREE.Vector2[], lo: number, hi: number): THREE.Vector2[] {
  const clip = (pts: THREE.Vector2[], inside: (p: THREE.Vector2) => boolean, cut: (a: THREE.Vector2, b: THREE.Vector2) => THREE.Vector2) => {
    const out: THREE.Vector2[] = [];
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      if (inside(a)) {
        out.push(a);
        if (!inside(b)) out.push(cut(a, b));
      } else if (inside(b)) out.push(cut(a, b));
    }
    return out;
  };
  const at = (y: number) => (a: THREE.Vector2, b: THREE.Vector2) => {
    const t = (y - a.y) / (b.y - a.y);
    return new THREE.Vector2(a.x + (b.x - a.x) * t, y);
  };
  let r = clip(poly, (p) => p.y >= lo, at(lo));
  r = clip(r, (p) => p.y <= hi, at(hi));
  return r;
}

export function makeCar(color: number): CarParts {
  const group = new THREE.Group();
  const paint = new THREE.MeshPhysicalMaterial({
    color,
    metalness: 0.35,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.07,
  });
  const trim = new THREE.MeshStandardMaterial({ color: 0x15181b, roughness: 0.72, metalness: 0.05 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe3e9ec, roughness: 0.16, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x05080c,
    roughness: 0.05,
    metalness: 0.25,
    clearcoat: 1,
    envMapIntensity: 1.7,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });

  /* Silhueta lateral (x = para a frente, y = altura) */
  const sh = new THREE.Shape();
  sh.moveTo(-2.25, 0.42);
  sh.lineTo(-2.3, 0.62);
  sh.lineTo(-2.3, 1.02);
  sh.bezierCurveTo(-2.3, 1.15, -2.22, 1.22, -2.12, 1.3);
  sh.bezierCurveTo(-2.0, 1.42, -1.85, 1.62, -1.62, 1.69);
  sh.bezierCurveTo(-1.2, 1.74, -0.1, 1.74, 0.25, 1.68);
  sh.bezierCurveTo(0.6, 1.62, 0.95, 1.38, 1.18, 1.22);
  sh.bezierCurveTo(1.5, 1.12, 1.9, 1.08, 2.12, 1.0);
  sh.bezierCurveTo(2.25, 0.96, 2.31, 0.86, 2.31, 0.72);
  sh.lineTo(2.3, 0.5);
  sh.bezierCurveTo(2.29, 0.44, 2.2, 0.4, 2.1, 0.4);
  sh.lineTo(-2.25, 0.42);

  const DEPTH = 1.6;
  const extrude = (shape: THREE.Shape, depth: number, bevel: number) => {
    const g = new THREE.ExtrudeGeometry(shape, {
      depth,
      bevelEnabled: true,
      bevelSize: bevel,
      bevelThickness: 0.12,
      bevelSegments: 5,
      curveSegments: 18,
    });
    g.translate(0, 0, -depth / 2);
    g.rotateY(Math.PI / 2);
    return g;
  };

  const bodyGeo = extrude(sh, DEPTH, 0.08);
  bodyGeo.computeBoundingBox();
  const bb = bodyGeo.boundingBox!;
  const W = 1.86;
  const H = 1.44;
  const L = 4.6;
  const sx = W / (bb.max.x - bb.min.x);
  const sy = H / (bb.max.y - bb.min.y);
  const sz = L / (bb.max.z - bb.min.z);
  const cz = (bb.max.z + bb.min.z) / 2;
  const MINY = 0.22;
  const toCarY = (ys: number) => (ys - bb.min.y) * sy + MINY;
  const toCarZ = (xs: number) => (-xs - cz) * sz;
  const halfW = (y: number) => (W / 2) * (1 - 0.12 * smooth(0.9, 1.68, y));

  const fit = (g: THREE.BufferGeometry) => {
    g.scale(sx, sy, sz);
    g.translate(0, MINY - bb.min.y * sy, -cz * sz);
    const pos = g.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      let f = 1 - 0.12 * smooth(0.9, 1.68, y);
      f *= 1 - 0.1 * smooth(1.5, 2.3, -z);
      f *= 1 - 0.05 * smooth(1.7, 2.3, z);
      pos.setX(i, x * f);
    }
    pos.needsUpdate = true;
    return toCreasedNormals(g, 0.55);
  };

  const body = new THREE.Mesh(fit(bodyGeo), paint);
  group.add(body);

  /* Vidros: faixa da silhueta entre a linha da cintura e o teto */
  const band = clipBand(sh.getPoints(24), 1.27, 1.6);
  const gs = new THREE.Shape(band);
  const glassMesh = new THREE.Mesh(fit(extrude(gs, DEPTH + 0.05, 0.02)), glass);
  group.add(glassMesh);

  /* Colunas e frisos */
  const pillarH = toCarY(1.6) - toCarY(1.27);
  const pillarY = (toCarY(1.6) + toCarY(1.27)) / 2;
  for (const sxn of [-1, 1]) {
    for (const [xs, w] of [
      [-0.12, 0.1],
      [-1.22, 0.2],
    ] as const) {
      const p = new THREE.Mesh(new RoundedBoxGeometry(0.03, pillarH + 0.02, w, 2, 0.01), paint);
      p.position.set(sxn * (halfW(1.45) + 0.012), pillarY, toCarZ(xs));
      group.add(p);
    }
    // frestas das portas
    for (const xs of [0.62, -0.12, -1.22]) {
      const line = new THREE.Mesh(new THREE.BoxGeometry(0.012, toCarY(1.27) - 0.34, 0.012), trim);
      line.position.set(sxn * (halfW(0.9) + 0.004), (toCarY(1.27) + 0.34) / 2, toCarZ(xs));
      group.add(line);
    }
    // maçanetas
    for (const xs of [0.28, -0.7]) {
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.02, 0.035, 0.17, 2, 0.01), chrome);
      h.position.set(sxn * (halfW(0.9) + 0.008), toCarY(1.12), toCarZ(xs));
      group.add(h);
    }
    // friso lateral inferior (plástico)
    const skirt = new THREE.Mesh(new RoundedBoxGeometry(0.07, 0.15, 3.0, 2, 0.03), trim);
    skirt.position.set(sxn * (W / 2 - 0.02), 0.32, 0);
    group.add(skirt);
  }

  /* Parte de baixo */
  const under = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.18, 4.3), trim);
  under.position.y = 0.26;
  group.add(under);

  /* Frente: grade, entradas de ar, faróis */
  const grille = new THREE.Mesh(new RoundedBoxGeometry(0.98, 0.2, 0.09, 3, 0.03), trim);
  grille.position.set(0, 0.74, -2.3);
  group.add(grille);
  for (let i = 0; i < 3; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.012, 0.02), chrome);
    slat.position.set(0, 0.68 + i * 0.05, -2.355);
    group.add(slat);
  }
  const emblem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.015, 24), chrome);
  emblem.rotation.x = Math.PI / 2;
  emblem.position.set(0, 0.8, -2.36);
  group.add(emblem);
  const intake = new THREE.Mesh(new RoundedBoxGeometry(1.15, 0.13, 0.1, 3, 0.03), trim);
  intake.position.set(0, 0.4, -2.28);
  group.add(intake);
  const splitter = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.04, 0.14, 2, 0.015), chrome);
  splitter.position.set(0, 0.27, -2.28);
  group.add(splitter);

  const head = glowMat(0xfff1c2);
  const tail = glowMat(0xff2a20);
  const turnL = glowMat(0xffa11a);
  const turnR = glowMat(0xffa11a);
  const reverse = glowMat(0xffffff);
  const lensClear = new THREE.MeshPhysicalMaterial({ color: 0xdfe8ee, roughness: 0.05, metalness: 0.1, clearcoat: 1, transmission: 0, envMapIntensity: 1.4 });
  const redLens = new THREE.MeshPhysicalMaterial({ color: 0x7a0b08, roughness: 0.1, metalness: 0.1, clearcoat: 1 });

  for (const s of [-1, 1]) {
    const housing = new THREE.Mesh(new RoundedBoxGeometry(0.46, 0.12, 0.14, 3, 0.04), trim);
    housing.position.set(s * 0.57, 0.9, -2.2);
    housing.rotation.y = -s * 0.3;
    group.add(housing);
    const lens = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.09, 0.05, 3, 0.02), lensClear);
    lens.position.set(s * 0.58, 0.9, -2.275);
    lens.rotation.y = -s * 0.3;
    group.add(lens);
    const drl = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.018, 0.012), head);
    drl.position.set(s * 0.58, 0.925, -2.31);
    drl.rotation.y = -s * 0.3;
    group.add(drl);
    const projector = new THREE.Mesh(new THREE.CircleGeometry(0.03, 16), head);
    projector.position.set(s * 0.5, 0.885, -2.312);
    projector.rotation.y = -s * 0.3;
    group.add(projector);
    const projector2 = projector.clone();
    projector2.position.x = s * 0.64;
    group.add(projector2);
    const indF = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.022, 0.012), s < 0 ? turnL : turnR);
    indF.position.set(s * 0.66, 0.86, -2.3);
    indF.rotation.y = -s * 0.3;
    group.add(indF);
    const fog = new THREE.Mesh(new THREE.CircleGeometry(0.045, 16), lensClear);
    fog.position.set(s * 0.66, 0.4, -2.335);
    group.add(fog);

    // lanternas traseiras
    const tl = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.15, 0.08, 3, 0.03), redLens);
    tl.position.set(s * 0.66, 0.98, 2.28);
    group.add(tl);
    const tlGlow = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.07, 0.012), tail);
    tlGlow.position.set(s * 0.66, 0.98, 2.325);
    group.add(tlGlow);
    const indR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.03, 0.012), s < 0 ? turnL : turnR);
    indR.position.set(s * 0.78, 0.89, 2.322);
    group.add(indR);
    const rv = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.012), reverse);
    rv.position.set(s * 0.5, 0.88, 2.322);
    group.add(rv);

    // retrovisor
    const stalk = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.03, 0.04), trim);
    stalk.position.set(s * 0.95, toCarY(1.2), toCarZ(0.88));
    group.add(stalk);
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.13, 0.11, 0.2, 3, 0.04), paint);
    mirror.position.set(s * 1.02, toCarY(1.22), toCarZ(0.84));
    group.add(mirror);
    const mirrorGlass = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.08), glass);
    mirrorGlass.position.set(s * 1.02, toCarY(1.22), toCarZ(0.84) + 0.101);
    group.add(mirrorGlass);

    // escapamento
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.12, 14), chrome);
    pipe.rotation.x = Math.PI / 2;
    pipe.position.set(s * 0.55, 0.3, 2.3);
    group.add(pipe);
    // refletor traseiro
    const refl = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.04, 0.012), new THREE.MeshStandardMaterial({ color: 0xb01010, roughness: 0.3, emissive: 0x300000 }));
    refl.position.set(s * 0.7, 0.52, 2.3);
    group.add(refl);
  }
  // barra de luz traseira ligando as lanternas
  const lightBar = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.02, 0.012), tail);
  lightBar.position.set(0, 0.98, 2.33);
  group.add(lightBar);
  const rearBumper = new THREE.Mesh(new RoundedBoxGeometry(1.6, 0.2, 0.1, 3, 0.04), trim);
  rearBumper.position.set(0, 0.36, 2.28);
  group.add(rearBumper);
  const rearDiff = new THREE.Mesh(new RoundedBoxGeometry(1.0, 0.04, 0.12, 2, 0.015), chrome);
  rearDiff.position.set(0, 0.25, 2.28);
  group.add(rearDiff);

  /* Placas fictícias */
  const plateF = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshStandardMaterial({ map: plateTexture("ABC1D23"), roughness: 0.5 }));
  plateF.position.set(0, 0.52, -2.37);
  plateF.rotation.y = Math.PI;
  group.add(plateF);
  const plateR = new THREE.Mesh(new THREE.PlaneGeometry(0.4, 0.2), new THREE.MeshStandardMaterial({ map: plateTexture("ABC1D23"), roughness: 0.5 }));
  plateR.position.set(0, 0.74, 2.336);
  group.add(plateR);

  /* Teto: longarinas, antena e aerofólio */
  const roofY = toCarY(1.74) + 0.01;
  for (const s of [-1, 1]) {
    const rail = new THREE.Mesh(new THREE.CylinderGeometry(0.017, 0.017, 1.5, 10), chrome);
    rail.rotation.x = Math.PI / 2;
    rail.position.set(s * 0.58, roofY + 0.025, toCarZ(-0.85));
    group.add(rail);
    for (const xs of [0.05, -1.6]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.04), chrome);
      leg.position.set(s * 0.58, roofY + 0.005, toCarZ(xs));
      group.add(leg);
    }
  }
  const fin = new THREE.Mesh(new RoundedBoxGeometry(0.05, 0.07, 0.16, 2, 0.02), trim);
  fin.position.set(0, roofY + 0.03, toCarZ(-1.3));
  group.add(fin);
  const spoiler = new THREE.Mesh(new RoundedBoxGeometry(1.2, 0.04, 0.16, 2, 0.015), paint);
  spoiler.position.set(0, toCarY(1.62), toCarZ(-1.92));
  spoiler.rotation.x = -0.12;
  group.add(spoiler);

  /* Rodas, caixas de roda e para-lamas */
  const wheels: THREE.Object3D[] = [];
  const archRing = new THREE.TorusGeometry(0.41, 0.03, 8, 28, Math.PI);
  archRing.rotateY(Math.PI / 2);
  for (const s of [-1, 1] as const) {
    for (const z of [-1.4, 1.38]) {
      const holder = buildWheel(s);
      holder.position.set(s * 0.84, 0.355, z);
      group.add(holder);
      const spinner = holder.children[0];
      wheels.push(spinner);
      const cal = holder.userData.caliper as THREE.Mesh;
      cal.position.x = s * 0.045;
      holder.add(cal);

      const ring = new THREE.Mesh(archRing, trim);
      ring.position.set(s * (halfW(0.7) + 0.005), 0.355, z);
      group.add(ring);
    }
  }

  shadowed(group, true, false);
  group.add(contactBlob(2.7, 5.6, 0));
  return { group, head, tail, turnL, turnR, reverse, wheels, halfLen: 2.3 };
}

/* ------------------------------------------------------------------ */
/* Caminhão de carroceria fechada                                      */
/* ------------------------------------------------------------------ */

export function makeTruck(): CarParts {
  const group = new THREE.Group();
  const cab = new THREE.MeshPhysicalMaterial({ color: 0xd8dde0, roughness: 0.4, metalness: 0.2, clearcoat: 0.7 });
  const trim = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.75 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe3e9ec, roughness: 0.2, metalness: 1 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x06090d, roughness: 0.05, metalness: 0.2, clearcoat: 1, envMapIntensity: 1.6 });
  const cargo = new THREE.MeshStandardMaterial({ map: cargoTexture(), roughness: 0.6 });

  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.3, 6.2), trim);
  chassis.position.y = 0.8;
  group.add(chassis);
  const box = new THREE.Mesh(new RoundedBoxGeometry(2.45, 2.55, 4.3, 3, 0.06), cargo);
  box.position.set(0, 2.2, 1.0);
  group.add(box);
  const cabBody = new THREE.Mesh(new RoundedBoxGeometry(2.35, 1.75, 1.7, 4, 0.14), cab);
  cabBody.position.set(0, 1.85, -2.2);
  group.add(cabBody);
  const wind = new THREE.Mesh(new RoundedBoxGeometry(2.05, 0.75, 0.05, 2, 0.02), glass);
  wind.position.set(0, 2.2, -3.05);
  group.add(wind);
  for (const s of [-1, 1]) {
    const side = new THREE.Mesh(new RoundedBoxGeometry(0.04, 0.6, 1.0, 2, 0.02), glass);
    side.position.set(s * 1.18, 2.2, -2.55);
    group.add(side);
    const mirror = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.35, 0.16, 2, 0.03), trim);
    mirror.position.set(s * 1.4, 2.2, -2.95);
    group.add(mirror);
  }
  const bumper = new THREE.Mesh(new RoundedBoxGeometry(2.4, 0.3, 0.2, 3, 0.05), trim);
  bumper.position.set(0, 0.7, -3.3);
  group.add(bumper);
  const grille = new THREE.Mesh(new RoundedBoxGeometry(1.5, 0.5, 0.06, 3, 0.03), trim);
  grille.position.set(0, 1.2, -3.07);
  group.add(grille);
  for (let i = 0; i < 4; i++) {
    const slat = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.02, 0.02), chrome);
    slat.position.set(0, 1.05 + i * 0.1, -3.11);
    group.add(slat);
  }

  const head = glowMat(0xfff1c2);
  const tail = glowMat(0xff2a20);
  const turnL = glowMat(0xffa11a);
  const turnR = glowMat(0xffa11a);
  const reverse = glowMat(0xffffff);
  for (const s of [-1, 1]) {
    const h = new THREE.Mesh(new RoundedBoxGeometry(0.4, 0.2, 0.06, 3, 0.03), head);
    h.position.set(s * 0.95, 1.1, -3.08);
    group.add(h);
    const ind = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.08, 0.04), s < 0 ? turnL : turnR);
    ind.position.set(s * 0.95, 0.92, -3.3);
    group.add(ind);
    const t = new THREE.Mesh(new RoundedBoxGeometry(0.22, 0.4, 0.06, 3, 0.03), tail);
    t.position.set(s * 1.05, 1.0, 3.16);
    group.add(t);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.04), reverse);
    r.position.set(s * 0.7, 0.9, 3.15);
    group.add(r);
    const indR = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.1, 0.04), s < 0 ? turnL : turnR);
    indR.position.set(s * 1.05, 1.3, 3.16);
    group.add(indR);
  }
  const rearBumper = new THREE.Mesh(new RoundedBoxGeometry(2.3, 0.22, 0.2, 3, 0.04), trim);
  rearBumper.position.set(0, 0.65, 3.2);
  group.add(rearBumper);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.21), new THREE.MeshStandardMaterial({ map: plateTexture("XYZ4E56"), roughness: 0.5 }));
  plate.position.set(0, 0.95, 3.2);
  group.add(plate);

  const wheels: THREE.Object3D[] = [];
  for (const s of [-1, 1] as const) {
    for (const z of [-2.3, 1.2, 2.45]) {
      const holder = buildWheel(s, 0.5);
      holder.position.set(s * 1.0, 0.5, z);
      group.add(holder);
      wheels.push(holder.children[0]);
    }
  }
  shadowed(group, true, false);
  group.add(contactBlob(3.1, 7.6, 0));
  return { group, head, tail, turnL, turnR, reverse, wheels, halfLen: 3.35 };
}

/* ------------------------------------------------------------------ */
/* Pedestre                                                            */
/* ------------------------------------------------------------------ */

export interface Walker {
  group: THREE.Group;
  /** fase em radianos; amplitude 0 = parado */
  animate(phase: number, amp: number): void;
}

const WALKER_STYLES = [
  { jacket: 0xff7a1a, pants: 0x2a3550, hair: 0x2b1d14, skin: 0xd9a07a },
  { jacket: 0x2f7fc1, pants: 0x30343a, hair: 0x1b1b1b, skin: 0xa86f4c },
  { jacket: 0xc2392f, pants: 0x3a3f4a, hair: 0x6b4a2b, skin: 0xf0c4a0 },
];

export function makeWalker(variant = 0): Walker {
  const st = WALKER_STYLES[Math.abs(variant) % WALKER_STYLES.length];
  const group = new THREE.Group();
  const jacket = new THREE.MeshStandardMaterial({ color: st.jacket, roughness: 0.7 });
  const pants = new THREE.MeshStandardMaterial({ color: st.pants, roughness: 0.85 });
  const skin = new THREE.MeshStandardMaterial({ color: st.skin, roughness: 0.65 });
  const hair = new THREE.MeshStandardMaterial({ color: st.hair, roughness: 0.9 });
  const shoe = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.6 });
  const stripe = new THREE.MeshStandardMaterial({ color: 0xdfe4e6, roughness: 0.3, metalness: 0.4, emissive: 0x303638 });
  const bag = new THREE.MeshStandardMaterial({ color: 0x1f2428, roughness: 0.8 });

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.17, 0.4, 6, 14), jacket);
  torso.scale.z = 0.7;
  torso.position.y = 1.2;
  group.add(torso);
  const s1 = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.04, 0.25), stripe);
  s1.position.set(0, 1.22, 0);
  s1.scale.z = 0.9;
  group.add(s1);
  const pelvis = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.05, 4, 12), pants);
  pelvis.scale.z = 0.7;
  pelvis.position.y = 0.92;
  group.add(pelvis);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.055, 0.08, 10), skin);
  neck.position.y = 1.55;
  group.add(neck);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11, 20, 16), skin);
  head.scale.set(0.95, 1.1, 1);
  head.position.y = 1.67;
  group.add(head);
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.118, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  cap.position.set(0, 1.69, 0.005);
  cap.rotation.x = -0.25;
  group.add(cap);
  const pack = new THREE.Mesh(new RoundedBoxGeometry(0.28, 0.34, 0.14, 3, 0.04), bag);
  pack.position.set(0, 1.22, 0.16);
  group.add(pack);

  const limb = (r: number, len: number, mat: THREE.Material, parent: THREE.Object3D, y: number, x = 0) => {
    const pivot = new THREE.Group();
    pivot.position.set(x, y, 0);
    const m = new THREE.Mesh(new THREE.CapsuleGeometry(r, len, 5, 10), mat);
    m.position.y = -(len / 2 + r * 0.6);
    pivot.add(m);
    parent.add(pivot);
    return pivot;
  };

  const armL = limb(0.048, 0.24, jacket, group, 1.46, -0.23);
  const armR = limb(0.048, 0.24, jacket, group, 1.46, 0.23);
  const foreL = limb(0.04, 0.22, skin, armL, -0.34);
  const foreR = limb(0.04, 0.22, skin, armR, -0.34);
  const thighL = limb(0.078, 0.34, pants, group, 0.9, -0.09);
  const thighR = limb(0.078, 0.34, pants, group, 0.9, 0.09);
  const shinL = limb(0.062, 0.34, pants, thighL, -0.42);
  const shinR = limb(0.062, 0.34, pants, thighR, -0.42);
  for (const sh of [shinL, shinR]) {
    const f = new THREE.Mesh(new RoundedBoxGeometry(0.1, 0.07, 0.24, 2, 0.025), shoe);
    f.position.set(0, -0.5, -0.04);
    sh.add(f);
  }

  shadowed(group, true, false);
  return {
    group,
    animate(phase, amp) {
      const sw = Math.sin(phase) * 0.55 * amp;
      thighL.rotation.x = sw;
      thighR.rotation.x = -sw;
      shinL.rotation.x = Math.max(0, -Math.sin(phase + 0.6)) * 0.7 * amp;
      shinR.rotation.x = Math.max(0, Math.sin(phase + 0.6)) * 0.7 * amp;
      armL.rotation.x = -sw * 0.8;
      armR.rotation.x = sw * 0.8;
      foreL.rotation.x = -0.25 * amp - Math.max(0, -sw) * 0.4;
      foreR.rotation.x = -0.25 * amp - Math.max(0, sw) * 0.4;
      group.position.y = Math.abs(Math.cos(phase)) * 0.02 * amp;
    },
  };
}

import * as THREE from "three";
import type { Derived } from "../engine/engine";
import type { SimState } from "../engine/types";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { createEnvironment } from "./environment";
import { TRAFFIC_AT, TRAFFIC_REL_SPEED } from "../input/soundscape";
import { makeCar, makeTruck, makeWalker } from "./models";
import type { CarParts } from "./models";

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

export type Quality = 0 | 1 | 2;

export interface World {
  setQuality(q: Quality): void;
  quality(): Quality;
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

/* ------------------------------------------------------------------ */
/* Mundo                                                               */
/* ------------------------------------------------------------------ */

interface LabelSpec {
  id: string;
  text: string;
  pos: THREE.Vector3;
  tone: "ok" | "info" | "warn" | "alert";
}

export function createWorld(host: HTMLElement, labelLayer: HTMLElement): World {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: "high-performance" });
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setSize(host.clientWidth || 640, host.clientHeight || 360, false);
  renderer.domElement.className = "scene-canvas";
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.65;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(46, (host.clientWidth || 640) / (host.clientHeight || 360), 0.3, 1500);

  const env = createEnvironment(scene, renderer);
  const { laneLeftMat, laneRightMat } = env;

  /* Pós-processamento (só na qualidade Alta) */
  let composer: EffectComposer | null = null;
  let bloom: UnrealBloomPass | null = null;
  const buildComposer = () => {
    const size = renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x * dpr, size.y * dpr, { type: THREE.HalfFloatType, samples: 4 });
    composer = new EffectComposer(renderer, rt);
    composer.setPixelRatio(dpr);
    composer.setSize(size.x, size.y);
    composer.addPass(new RenderPass(scene, camera));
    bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.3, 0.5, 1.15);
    composer.addPass(bloom);
    composer.addPass(new OutputPass());
  };

  let q: Quality = 2;
  const urlQ = new URLSearchParams(typeof location !== "undefined" ? location.search : "").get("q");
  if (urlQ === "0" || urlQ === "1" || urlQ === "2") q = Number(urlQ) as Quality;
  const lockQ = urlQ !== null;
  const applyQuality = () => {
    env.setShadows(q === 0 ? 0 : q === 1 ? 1 : 2);
    renderer.shadowMap.enabled = q > 0;
    renderer.setPixelRatio(q === 0 ? 1 : dpr);
    renderer.setSize(width, height, false);
    if (q === 2) {
      if (!composer) buildComposer();
      else {
        composer.setSize(width, height);
      }
    }
    scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(m)) m.forEach((x) => (x.needsUpdate = true));
      else if (m) m.needsUpdate = true;
    });
  };

  /* Seu carro */
  const own = makeCar(0xe9eef1);
  const shadowize = (g: THREE.Object3D) => g.traverse((o) => { if ((o as THREE.Mesh).isMesh) { o.castShadow = true; } });
  shadowize(own.group);
  scene.add(own.group);

  /* Alvos */
  const leadCar = makeCar(0x4a6f8a);
  const leadTruck = makeTruck();
  const walkers = [makeWalker(0), makeWalker(1), makeWalker(2)];
  for (const g of [leadCar.group, leadTruck.group, ...walkers.map((w) => w.group)]) {
    g.visible = false;
    shadowize(g);
    scene.add(g);
  }

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
    shadowize(c.group);
    scene.add(c.group);
  }

  /* Tráfego decorativo no sentido oposto (sincronizado com o som) */
  const deco = [makeCar(0x8a8f94), makeCar(0x2d4f7a), makeCar(0xb0b4b8), makeCar(0x6a2d2d), makeTruck()];
  for (const c of deco) {
    c.group.rotation.y = Math.PI;
    c.group.visible = false;
    shadowize(c.group);
    scene.add(c.group);
  }
  let cum = 0;

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
  let ownYaw = 0;
  let wheelSpin = 0;
  let slow = 0;
  let yawOff = 0;
  let zoom = Number(new URLSearchParams(typeof location !== "undefined" ? location.search : "").get("z")) || 1;
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
    env.update({ travel, nightK, ownX, dt, clock, still, speed: s.speed });

    /* Seu carro e a saída de faixa */
    ownX += (s.lateral - ownX) * (1 - Math.exp(-dt * 12));
    ownYaw += ((s.speed > 1 ? -s.steer * 0.07 : 0) - ownYaw) * (1 - Math.exp(-dt * 6));
    own.group.position.x = ownX;
    own.group.rotation.y = ownYaw;
    for (const w of own.wheels) w.rotation.x = wheelSpin;

    const warnLdw = d.ldwWarn;
    const laneWarnColor = warnLdw && fastBlink ? AMBER : 0xd9dcde;
    laneLeftMat.color.setHex(laneWarnColor);
    laneRightMat.color.setHex(laneWarnColor);

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
    spot.intensity = lightsOn ? 1400 : 0;
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
    const tgtX = (t.lane ?? 0) * 3.5;
    const isVeh = t.kind === "movingVehicle" || t.kind === "staticVehicle";
    const lead = t.kind === "movingVehicle" && t.variant === 1 ? leadTruck : leadCar;
    leadCar.group.visible = isVeh && lead === leadCar;
    leadTruck.group.visible = isVeh && lead === leadTruck;
    const walker = walkers[Math.abs(t.variant ?? 0) % walkers.length];
    walkers.forEach((w) => (w.group.visible = t.kind === "pedestrian" && w === walker));
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
    if (isVeh) {
      const hl = lead.halfLen;
      lead.group.position.set(tgtX, 0, tgtZ - hl);
      for (const w of lead.wheels) w.rotation.x = wheelSpin * (t.kind === "movingVehicle" ? t.speed / Math.max(s.speed, 8) : 0);
      setCar(lead, {
        tail: t.kind === "staticVehicle" ? 0.7 : 0.8,
        turnL: t.kind === "staticVehicle" && blinkOn,
        turnR: t.kind === "staticVehicle" && blinkOn,
        head: 0,
      });
      targetRing.position.set(tgtX, 0.08, tgtZ - hl);
      targetRing.scale.set(1.25, 1, hl * 0.83);
      labels.push({
        id: "target",
        text:
          t.kind === "movingVehicle"
            ? `Carro a ${Math.round(t.speed)} km/h · ${Math.round(t.distance)} m${d.following ? " · seguido pelo ACC" : ""}`
            : `Carro parado · ${Math.round(t.distance)} m`,
        pos: new THREE.Vector3(tgtX, lead === leadTruck ? 3.8 : 2.4, tgtZ - hl),
        tone,
      });
    }
    if (t.kind === "pedestrian") {
      walker.group.position.set(tgtX, 0, tgtZ - 0.2);
      walker.animate(clock * 5.5, still ? 0 : 1);
      targetRing.position.set(tgtX, 0.08, tgtZ - 0.2);
      targetRing.scale.set(0.5, 1, 0.5);
      labels.push({
        id: "target",
        text: `Pedestre · ${Math.round(t.distance)} m`,
        pos: new THREE.Vector3(tgtX, 2.1, tgtZ - 0.2),
        tone,
      });
    }
    if (s.collided) {
      labels.push({ id: "crash", text: "Colisão simulada", pos: new THREE.Vector3(0, 3.1, -CAR_HALF_LEN - 1), tone: "alert" });
    }

    /* Ponto cego, ré e farol */
    blindL.group.visible = s.blind.left;
    blindR.group.visible = s.blind.right;
    blindL.group.position.set(ownX - 3.5, 0, 3.2);
    blindR.group.position.set(ownX + 3.5, 0, 3.2);
    for (const c of [blindL, blindR]) {
      for (const w of c.wheels) w.rotation.x = wheelSpin;
      setCar(c, { tail: 0.6 });
    }
    const crossSpan = 40;
    const crossPhase = (clock * 5.5) % crossSpan;
    crossL.group.visible = s.cross.left;
    crossR.group.visible = s.cross.right;
    crossL.group.position.set(ownX - 20 + crossPhase, 0, 9.5);
    crossR.group.position.set(ownX + 20 - crossPhase, 0, 15);
    for (const c of [crossL, crossR]) {
      for (const w of c.wheels) w.rotation.x = clock * 8;
      setCar(c, { tail: 0.7, head: 0.5 });
    }
    oncomingCar.group.visible = s.oncoming;
    oncomingCar.group.position.set(-9.8, 0, -150 + ((clock * 26) % 190));
    setCar(oncomingCar, { head: 2, tail: 0 });
    for (const w of oncomingCar.wheels) w.rotation.x = clock * 10;

    /* Tráfego decorativo */
    cum += (mps * dir + TRAFFIC_REL_SPEED) * (still ? 0 : dt);
    deco.forEach((c) => (c.group.visible = false));
    for (let k = 0; k < TRAFFIC_AT.length; k++) {
      const z = cum - TRAFFIC_AT[k];
      if (z < -320) break;
      if (z > 40) continue;
      const c = deco[k % deco.length];
      c.group.visible = true;
      c.group.position.set(-13.3, 0, z);
      for (const w of c.wheels) w.rotation.x = clock * 12;
      setCar(c, { head: nightK > 0.4 ? 1.8 : 0.3, tail: 0 });
    }

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
          pos: new THREE.Vector3(ownX - 3.2, 0.3, -(CAR_HALF_LEN + gz)),
          tone: "ok",
        });
      }

      aebZone.visible = md && (s.aeb === "partial" || s.aeb === "emergency");
      if (aebZone.visible) {
        const len = Math.max(t.distance, 0.5);
        aebZone.scale.z = len;
        aebZone.position.set(ownX, 0.075, -(CAR_HALF_LEN + len / 2));
        aebMat.opacity = fastBlink ? 0.36 : 0.18;
      }

      bsdL.position.x = ownX - 3.5;
      bsdR.position.x = ownX + 3.5;
      const bsdOn = md && s.bsd !== "off";
      bsdL.visible = bsdR.visible = bsdOn;
      const paintBsd = (mat: THREE.MeshBasicMaterial, lvl: 0 | 1 | 2) => {
        mat.color.setHex(lvl === 2 ? AMBER : lvl === 1 ? GREEN : BLUE);
        mat.opacity = lvl === 2 ? (fastBlink ? 0.5 : 0.2) : lvl === 1 ? 0.32 : 0.1;
      };
      paintBsd(bsdMatL, d.bsdWarn.left);
      paintBsd(bsdMatR, d.bsdWarn.right);
      if (bsdOn) {
        labels.push({ id: "bsdL", text: "Zona do ponto cego", pos: new THREE.Vector3(ownX - 3.5, 0.5, 6.5), tone: d.bsdWarn.left ? "warn" : "info" });
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
        labels.push({ id: "radar", text: "Radar e câmera da frente", pos: new THREE.Vector3(ownX + 8, 0.3, -24), tone: "info" });
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
    if (s.blind.left) labels.push({ id: "blL", text: "Carro no ponto cego", pos: new THREE.Vector3(ownX - 3.5, 2.2, 3.2), tone: d.bsdWarn.left === 2 ? "alert" : d.bsdWarn.left === 1 ? "warn" : "info" });
    if (s.blind.right) labels.push({ id: "blR", text: "Carro no ponto cego", pos: new THREE.Vector3(ownX + 3.5, 2.2, 3.2), tone: d.bsdWarn.right === 2 ? "alert" : d.bsdWarn.right === 1 ? "warn" : "info" });
    if (d.highBeam) labels.push({ id: "hb", text: "Farol alto ligado", pos: new THREE.Vector3(ownX, 0.4, -40), tone: "info" });
    if (warnLdw) labels.push({ id: "ldw", text: "Saindo da faixa", pos: new THREE.Vector3(ownX - 3.4, 1.4, -1), tone: "warn" });
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
      wantPos.set(ownX * 0.85 + sy * 11.5 * zoom, 5.0, cy * 11.5 * zoom);
      wantLook.set(ownX * 0.8, 0.9, -14);
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
    const spK = Math.min(1, s.speed / 150);
    const fovWant = mode === "top" || mode === "avm" ? 46 : 46 + 9 * spK;
    camera.fov += (fovWant - camera.fov) * k;
    camera.updateProjectionMatrix();
    camera.position.copy(camPos);
    if (!still && mode === "chase" && s.speed > 5) {
      camera.position.y += Math.sin(clock * 31) * 0.012 * spK + Math.sin(clock * 11.3) * 0.01 * spK;
      camera.position.x += Math.sin(clock * 23) * 0.008 * spK;
    }
    camera.lookAt(camLook);
    camera.updateMatrixWorld();

    const t0 = performance.now();
    if (q === 2 && composer) composer.render(dt);
    else renderer.render(scene, camera);
    if (!lockQ && q > 0 && dt > 0) {
      const ms = performance.now() - t0;
      slow = ms > 28 ? slow + 1 : Math.max(0, slow - 1);
      if (slow > 40) {
        slow = 0;
        q = (q - 1) as Quality;
        applyQuality();
      }
    }
    paintLabels(labels, inp.labels, width, height);
  }

  function resize(w: number, h: number) {
    width = Math.max(w, 1);
    height = Math.max(h, 1);
    renderer.setSize(width, height, false);
    composer?.setSize(width, height);
    camera.aspect = width / height;
    // Em tela cheia o painel cobre a parte de baixo: sobe o enquadramento para o carro ficar à vista.
    if (host.closest(".drive-full")) camera.setViewOffset(width, height, 0, height * (width < 700 ? 0.17 : 0.25), width, height);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
  }

  applyQuality();

  function dispose() {
    env.dispose();
    composer?.dispose();
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
    setQuality(v) {
      q = v;
      applyQuality();
    },
    quality: () => q,
    update,
    resize,
    nudge(dYaw, dZoom) {
      yawOff = Math.max(-1.2, Math.min(1.2, yawOff + dYaw));
      zoom = Math.max(0.2, Math.min(1.8, zoom * (1 + dZoom)));
    },
    resetView() {
      yawOff = 0;
      zoom = 1;
    },
    shownMode: () => shown,
    dispose,
  };
}


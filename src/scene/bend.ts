import * as THREE from "three";
import { pathOffset } from "../engine/route";
import type { WorldId } from "../engine/route";

/**
 * "Mundo curvo": o carro fica parado na origem olhando para -Z e o cenário rola por
 * baixo dele. Para a estrada fazer curvas e subir/descer, todos os vértices (no
 * espaço do mundo) são deslocados por polinômios da distância à frente do carro,
 * ajustados a cada quadro ao traçado real da rota. Assim todo o resto do código
 * (alvos, sensores, sombras) continua trabalhando numa linha reta.
 */

export const bendUniforms = {
  uBendX: { value: new THREE.Vector2(0, 0) }, // a2, a3
  uBendY: { value: new THREE.Vector3(0, 0, 0) }, // b1, b2, b3
};

const SAMPLES = [-30, -15, 6, 16, 30, 50, 75, 100, 130, 165, 205, 250, 300, 360, 420, 490];

/** Ajusta os polinômios ao traçado à frente de `s`. */
export function fitBend(world: WorldId, s: number) {
  if (world !== "serra") {
    bendUniforms.uBendX.value.set(0, 0);
    bendUniforms.uBendY.value.set(0, 0, 0);
    return;
  }
  // x(d) = a2 d² + a3 d³ (mínimos quadrados ponderados)
  let s44 = 0;
  let s45 = 0;
  let s55 = 0;
  let t4 = 0;
  let t5 = 0;
  // y(d) = b1 d + b2 d² + b3 d³
  const m = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  const r = [0, 0, 0];
  for (const d of SAMPLES) {
    const w = 1 / (1 + (Math.abs(d) / 70) ** 2);
    const o = pathOffset(world, s, d);
    const d2 = d * d;
    const d3 = d2 * d;
    s44 += w * d2 * d2;
    s45 += w * d2 * d3;
    s55 += w * d3 * d3;
    t4 += w * d2 * o.x;
    t5 += w * d3 * o.x;
    const row = [d, d2, d3];
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) m[i * 3 + j] += w * row[i] * row[j];
      r[i] += w * row[i] * o.y;
    }
  }
  const det = s44 * s55 - s45 * s45;
  const a2 = det > 1e-9 ? (t4 * s55 - t5 * s45) / det : 0;
  const a3 = det > 1e-9 ? (s44 * t5 - s45 * t4) / det : 0;
  bendUniforms.uBendX.value.set(a2, a3);

  // Cramer 3x3
  const D = (a: number[]) =>
    a[0] * (a[4] * a[8] - a[5] * a[7]) - a[1] * (a[3] * a[8] - a[5] * a[6]) + a[2] * (a[3] * a[7] - a[4] * a[6]);
  const dm = D(m);
  if (Math.abs(dm) > 1e-9) {
    const col = (k: number) => {
      const c = m.slice();
      for (let i = 0; i < 3; i++) c[i * 3 + k] = r[i];
      return D(c) / dm;
    };
    bendUniforms.uBendY.value.set(col(0), col(1), col(2));
  } else bendUniforms.uBendY.value.set(0, 0, 0);
}

/** Leva um ponto do referencial "reto" do carro para onde ele aparece na tela (mesma conta do shader). */
export function bendPoint<T extends THREE.Vector3>(v: T): T {
  const d = Math.min(520, Math.max(-60, -v.z));
  const x = bendUniforms.uBendX.value;
  const y = bendUniforms.uBendY.value;
  v.x += x.x * d * d + x.y * d * d * d;
  v.y += y.x * d + y.y * d * d + y.z * d * d * d;
  return v;
}

const BEND_VERT = `
vec4 bendW = vec4( transformed, 1.0 );
#ifdef USE_INSTANCING
	bendW = instanceMatrix * bendW;
#endif
bendW = modelMatrix * bendW;
float bendD = clamp( -bendW.z, -60.0, 520.0 );
bendW.x += uBendX.x * bendD * bendD + uBendX.y * bendD * bendD * bendD;
bendW.y += uBendY.x * bendD + uBendY.y * bendD * bendD + uBendY.z * bendD * bendD * bendD;
vec4 mvPosition = viewMatrix * bendW;
gl_Position = projectionMatrix * mvPosition;
`;

const BEND_WORLDPOS = `
#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = bendW;
#endif
`;

const patched = new WeakSet<THREE.Material>();

export function bendMaterial<T extends THREE.Material>(mat: T): T {
  if (patched.has(mat)) return mat;
  patched.add(mat);
  const prevCompile = mat.onBeforeCompile;
  mat.onBeforeCompile = (shader, renderer) => {
    prevCompile?.call(mat, shader, renderer);
    shader.uniforms.uBendX = bendUniforms.uBendX;
    shader.uniforms.uBendY = bendUniforms.uBendY;
    shader.vertexShader =
      "uniform vec2 uBendX;\nuniform vec3 uBendY;\n" +
      shader.vertexShader.replace("#include <project_vertex>", BEND_VERT).replace("#include <worldpos_vertex>", BEND_WORLDPOS);
  };
  const key = mat.customProgramCacheKey?.bind(mat);
  mat.customProgramCacheKey = () => `bend|${key ? key() : ""}`;
  mat.needsUpdate = true;
  return mat;
}

let depthMat: THREE.MeshDepthMaterial | null = null;
function bendDepth() {
  depthMat ??= bendMaterial(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking }));
  return depthMat;
}

/** Aplica o "mundo curvo" a tudo sob `root`, exceto o que estiver marcado com userData.noBend. */
export function applyBend(root: THREE.Object3D) {
  root.traverse((o) => {
    if (o.userData.noBend) return;
    // objetos marcados como noBend protegem também seus filhos
    let p: THREE.Object3D | null = o.parent;
    while (p) {
      if (p.userData.noBend) return;
      p = p.parent;
    }
    const m = o as THREE.Mesh;
    if (!m.isMesh && !(o as THREE.Line).isLine) return;
    // o recorte do volume visível usa a geometria sem curva; desligado para não sumir com objetos
    m.frustumCulled = false;
    const mats = Array.isArray(m.material) ? m.material : [m.material];
    for (const mat of mats) if (mat && !(mat as THREE.SpriteMaterial).isSpriteMaterial) bendMaterial(mat);
    if (m.castShadow) m.customDepthMaterial = bendDepth();
  });
}

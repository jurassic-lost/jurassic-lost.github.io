import * as THREE from 'three';
import { rng } from '../core/math';

/**
 * Piel de reptil procedural para materiales PBR (MeshStandardMaterial):
 * escamas de Voronoi con relieve, surcos entre escamas más ásperos, variación
 * de tono por escama y osteodermos (escamas grandes) dispersos.
 * Se proyecta en tres planos (triplanar) en el espacio del modelo, así que
 * funciona igual en los modelos procedurales y en los GLB sin UV, y no se
 * estira con la animación (se usa la posición de reposo).
 */
let skinTex: THREE.DataTexture | null = null;

function makeSkinTexture(size = 256) {
  const r = rng(808);
  // Puntos de escamas en rejilla con jitter (Voronoi rápido y periódico).
  const G = 22, cell = size / G;
  const pts: { x: number; y: number; v: number; big: number }[] = [];
  for (let j = 0; j < G; j++) for (let i = 0; i < G; i++) {
    pts.push({ x: (i + 0.15 + r() * 0.7) * cell, y: (j + 0.15 + r() * 0.7) * cell, v: r(), big: r() < 0.05 ? 1 : 0 });
  }
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const ci = Math.floor(x / cell), cj = Math.floor(y / cell);
    let d1 = 1e9, d2 = 1e9, best = pts[0];
    for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      const ii = (ci + di + G) % G, jj = (cj + dj + G) % G;
      const p = pts[jj * G + ii];
      // Distancia periódica (textura sin costuras).
      let dx = Math.abs(p.x - x), dy = Math.abs(p.y - y);
      if (dx > size / 2) dx = size - dx;
      if (dy > size / 2) dy = size - dy;
      const d = Math.hypot(dx, dy) * (p.big ? 0.55 : 1);
      if (d < d1) { d2 = d1; d1 = d; best = p; } else if (d < d2) d2 = d;
    }
    const edge = Math.min(1, (d2 - d1) / (cell * 0.35)); // 0 en el surco, 1 en el centro
    const dome = Math.sqrt(edge);
    const h = Math.min(1, dome * (0.85 + best.big * 0.3) + (r() - 0.5) * 0.05);
    const k = (y * size + x) * 4;
    data[k] = h * 255;              // relieve
    data[k + 1] = best.v * 255;     // variación de tono por escama
    data[k + 2] = best.big * 255;   // osteodermo
    data[k + 3] = 255;
  }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.colorSpace = THREE.NoColorSpace;
  t.needsUpdate = true;
  return t;
}

export interface SkinOptions {
  /** Escamas por unidad del modelo. */
  density?: number;
  /** Fuerza del relieve. */
  bump?: number;
  /** Contraste de color entre escamas y surcos. */
  contrast?: number;
}

/** Añade la piel de reptil a un material estándar (se puede llamar una vez por material). */
export function applyReptileSkin(mat: THREE.MeshStandardMaterial, opts: SkinOptions = {}) {
  skinTex ??= makeSkinTexture();
  const uniforms = {
    tSkin: { value: skinTex },
    uSkinDensity: { value: opts.density ?? 6 },
    uSkinBump: { value: opts.bump ?? 0.8 },
    uSkinContrast: { value: opts.contrast ?? 1 },
  };
  mat.userData.skin = uniforms;
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vSkinPos;\nvarying vec3 vSkinNrm;\n#ifdef USE_SKINPOS\nattribute vec3 skinPos;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_SKINPOS\nvSkinPos = skinPos;\n#else\nvSkinPos = position;\n#endif\nvSkinNrm = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
uniform sampler2D tSkin;
uniform float uSkinDensity, uSkinBump, uSkinContrast;
varying vec3 vSkinPos;
varying vec3 vSkinNrm;
vec3 skinTri() {
  vec3 w = pow(abs(normalize(vSkinNrm)), vec3(4.0));
  w /= (w.x + w.y + w.z + 1e-4);
  vec3 p = vSkinPos * uSkinDensity;
  return texture2D(tSkin, p.yz).rgb * w.x + texture2D(tSkin, p.xz).rgb * w.y + texture2D(tSkin, p.xy).rgb * w.z;
}
vec3 skinPerturb(vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection) {
  vec3 vSigmaX = normalize(dFdx(surf_pos.xyz));
  vec3 vSigmaY = normalize(dFdy(surf_pos.xyz));
  vec3 vN = surf_norm;
  vec3 R1 = cross(vSigmaY, vN);
  vec3 R2 = cross(vN, vSigmaX);
  float fDet = dot(vSigmaX, R1) * faceDirection;
  vec3 vGrad = sign(fDet) * (dHdxy.x * R1 + dHdxy.y * R2);
  return normalize(abs(fDet) * surf_norm - vGrad);
}`)
      .replace('#include <map_fragment>', `#include <map_fragment>
vec3 skinS = skinTri();
// Surcos más oscuros, escamas con ligera variación y osteodermos más claros.
diffuseColor.rgb *= mix(1.0 - 0.32 * uSkinContrast, 1.06, skinS.r) * mix(0.92, 1.07, skinS.g) * (1.0 + skinS.b * 0.12);`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
roughnessFactor = clamp(roughnessFactor * mix(1.12, 0.78, skinS.r), 0.35, 1.0);`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
normal = skinPerturb(-vViewPosition, normal, vec2(dFdx(skinS.r), dFdy(skinS.r)) * uSkinBump, faceDirection);`);
  };
  mat.customProgramCacheKey = () => 'reptile-skin' + (mat.defines?.USE_SKINPOS !== undefined ? '-sp' : '');
  mat.needsUpdate = true;
  return mat;
}

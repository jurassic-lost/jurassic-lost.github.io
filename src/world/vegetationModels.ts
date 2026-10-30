import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { jitter, merge, part } from '../core/geometry';
import { rng } from '../core/math';
import { addWind, bark, broadLeaf, frond, grassBlades, leafCluster, needles } from '../core/textures';

/**
 * Modelos originales de vegetación prehistórica: troncos con corteza y copas
 * hechas de "tarjetas" de hojas con transparencia, que se mueven con el viento.
 */
/** decor: detalle que solo se dibuja cerca (distancia de decoración de la calidad elegida). */
export interface ModelPart { geo: THREE.BufferGeometry; mat: THREE.Material; shadow: boolean; decor?: boolean }

let M: ReturnType<typeof makeMaterials> | null = null;
function makeMaterials() {
  const leaf = (rgb: [number, number, number], wind: number) => {
    const m = new THREE.MeshLambertMaterial({ map: leafCluster(rgb), alphaTest: 0.45, side: THREE.DoubleSide });
    addWind(m, wind, 12);
    return m;
  };
  const frondMat = new THREE.MeshLambertMaterial({ map: frond(), alphaTest: 0.4, side: THREE.DoubleSide });
  addWind(frondMat, 0.12, 4);
  const grassMat = new THREE.MeshLambertMaterial({ map: grassBlades(), alphaTest: 0.4, side: THREE.DoubleSide });
  addWind(grassMat, 0.12, 0.8);
  const barkTex = bark();
  const broadMat = new THREE.MeshLambertMaterial({ map: broadLeaf(), alphaTest: 0.45, side: THREE.DoubleSide });
  addWind(broadMat, 0.1, 2.5);

  const needleMat = new THREE.MeshLambertMaterial({ map: needles(), alphaTest: 0.4, side: THREE.DoubleSide });
  addWind(needleMat, 0.15, 30);
  return {
    needles: needleMat,
    vine: new THREE.MeshLambertMaterial({ color: '#3d5a2a' }),
    deadBark: new THREE.MeshLambertMaterial({ map: barkTex, color: '#b9b2a6' }),
    moss: new THREE.MeshLambertMaterial({ map: barkTex, color: '#7fa055' }),
    bark: new THREE.MeshLambertMaterial({ map: barkTex }),
    barkDark: new THREE.MeshLambertMaterial({ map: barkTex, color: '#a08a7a' }),
    leafDark: leaf([52, 105, 38], 0.18),
    leafMid: leaf([78, 135, 48], 0.22),
    leafBush: leaf([45, 95, 35], 0.06),
    frond: frondMat,
    broad: broadMat,
    grass: grassMat,
    rock: new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }),
  };
}
export const mats = () => (M ??= makeMaterials());

type T3 = [number, number, number];

/** Pieza texturizada (conserva las UV, sin color por vértice). */
function tpart(geo: THREE.BufferGeometry, opts: { pos?: T3; rot?: T3; scale?: T3 } = {}) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  if (opts.scale) g.scale(...opts.scale);
  if (opts.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...opts.rot)));
  if (opts.pos) g.translate(...opts.pos);
  return g;
}
function tmerge(parts: THREE.BufferGeometry[], keepNormals = false) {
  const g = mergeGeometries(parts, false)!;
  if (!keepNormals) g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Copa: tarjetas de hojas orientadas al azar dentro de un elipsoide, con normales hacia fuera (luz suave). */
function canopy(blobs: { c: T3; r: number; n: number; size: number }[], seed: number) {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  const q = new THREE.Quaternion(), e = new THREE.Euler(), n = new THREE.Vector3(), p = new THREE.Vector3();
  for (const b of blobs) {
    for (let i = 0; i < b.n; i++) {
      const g = new THREE.PlaneGeometry(b.size, b.size).toNonIndexed();
      e.set(r() * Math.PI, r() * Math.PI * 2, r() * Math.PI);
      q.setFromEuler(e);
      g.applyQuaternion(q);
      const u = r() * Math.PI * 2, v = Math.acos(2 * r() - 1), d = Math.cbrt(r()) * b.r;
      p.set(Math.sin(v) * Math.cos(u) * d, Math.cos(v) * d * 0.55, Math.sin(v) * Math.sin(u) * d);
      g.translate(b.c[0] + p.x, b.c[1] + p.y, b.c[2] + p.z);
      const pos = g.attributes.position, nor = g.attributes.normal;
      for (let k = 0; k < pos.count; k++) {
        n.set(pos.getX(k) - b.c[0], (pos.getY(k) - b.c[1]) * 1.5 + b.r * 0.3, pos.getZ(k) - b.c[2]).normalize();
        nor.setXYZ(k, n.x, n.y, n.z);
      }
      parts.push(g);
    }
  }
  return tmerge(parts, true);
}

/** Abanico de frondas arqueadas que salen de un punto. */
function fronds(count: number, length: number, width: number, at: T3, tilt: number, droop: number, seed: number) {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const g = new THREE.PlaneGeometry(width, length, 1, 5);
    g.translate(0, length / 2, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const t = pos.getY(k) / length;
      pos.setZ(k, pos.getZ(k) + droop * t * t * length);
    }
    const ng = g.toNonIndexed();
    ng.rotateX(tilt + (r() - 0.5) * 0.3);
    ng.rotateY((i / count) * Math.PI * 2 + r() * 0.4);
    ng.translate(...at);
    parts.push(ng);
  }
  const m = tmerge(parts);
  // Normales hacia arriba para que las hojas se iluminen de forma uniforme
  const nor = m.attributes.normal;
  for (let k = 0; k < nor.count; k++) nor.setXYZ(k, nor.getX(k) * 0.3, 1, nor.getZ(k) * 0.3);
  return m;
}

export function jungleTree(): ModelPart[] {
  const m = mats();
  const trunk = tmerge([
    ...buttresses(4, 1.1, 1.6, 0.18, 3),
    tpart(new THREE.CylinderGeometry(0.28, 0.55, 10, 9), { pos: [0, 5, 0] }),
    tpart(new THREE.CylinderGeometry(0.1, 0.18, 3, 6), { rot: [0, 0, 0.9], pos: [1.1, 8.6, 0] }),
    tpart(new THREE.CylinderGeometry(0.1, 0.18, 3, 6), { rot: [0.8, 0, -0.3], pos: [-0.4, 8.9, 1.0] }),
  ]);
  const leaves = canopy([
    { c: [0, 10.4, 0], r: 3.0, n: 16, size: 2.8 },
    { c: [2.0, 9.6, 0.4], r: 2.0, n: 9, size: 2.3 },
    { c: [-0.6, 9.8, 2.0], r: 2.0, n: 9, size: 2.3 },
  ], 1);
  return [{ geo: trunk, mat: m.bark, shadow: true }, { geo: leaves, mat: m.leafMid, shadow: true }, ...lianas(JUNGLE_LIANAS, 63, jungleVines().geo)];
}

export function giantTree(): ModelPart[] {
  const m = mats();
  const parts = [tpart(new THREE.CylinderGeometry(1.0, 1.8, 26, 12, 4), { pos: [0, 13, 0] })];
  // Raíces tabulares (contrafuertes) y raíces que serpentean por el suelo.
  parts.push(...buttresses(6, 3.6, 5.2, 0.42, 5), ...surfaceRoots(7, 1.6, 7.5, 9));
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const g = tpart(new THREE.CylinderGeometry(0.2, 0.45, 7, 7), { rot: [0, 0, -0.9] });
    g.translate(2.6, 21 + (i % 2) * 2, 0);
    g.rotateY(-a);
    parts.push(g);
  }
  const leaves = canopy([
    { c: [0, 28, 0], r: 6.5, n: 26, size: 5 },
    { c: [5, 25, 1], r: 4, n: 12, size: 4 },
    { c: [-4.5, 25.5, -2], r: 4, n: 12, size: 4 },
    { c: [1, 24.5, -5], r: 3.6, n: 10, size: 4 },
    { c: [-1, 24, 5], r: 3.6, n: 10, size: 4 },
  ], 2);
  return [{ geo: tmerge(parts), mat: m.bark, shadow: true }, { geo: leaves, mat: m.leafDark, shadow: true }, ...lianas(GIANT_LIANAS, 64, giantVines().geo)];
}

export function cycad(): ModelPart[] {
  const m = mats();
  const trunk = tmerge([tpart(new THREE.CylinderGeometry(0.3, 0.45, 4.5, 9), { pos: [0, 2.25, 0] })]);
  return [
    { geo: trunk, mat: m.barkDark, shadow: true },
    { geo: fronds(12, 3.6, 1.1, [0, 4.4, 0], 0.9, 0.35, 3), mat: m.frond, shadow: true },
  ];
}

export function treeFern(): ModelPart[] {
  const m = mats();
  const trunk = tmerge([tpart(new THREE.CylinderGeometry(0.2, 0.3, 2.6, 8), { pos: [0, 1.3, 0] })]);
  return [
    { geo: trunk, mat: m.barkDark, shadow: true },
    { geo: fronds(10, 2.6, 0.9, [0, 2.5, 0], 1.0, 0.45, 4), mat: m.frond, shadow: true },
  ];
}

export function bush(): ModelPart[] {
  const leaves = canopy([{ c: [0, 0.9, 0], r: 1.1, n: 12, size: 1.5 }, { c: [0.7, 0.7, 0.4], r: 0.7, n: 6, size: 1.1 }], 5);
  return [{ geo: leaves, mat: mats().leafBush, shadow: false }];
}

export function fern(): ModelPart[] {
  return [{ geo: fronds(8, 1.4, 0.55, [0, 0.05, 0], 0.75, 0.6, 6), mat: mats().frond, shadow: false }];
}

export function grassTuft(): ModelPart[] {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.PlaneGeometry(1.1, 0.8).toNonIndexed();
    g.translate(0, 0.4, 0);
    g.rotateY((i / 3) * Math.PI);
    parts.push(g);
  }
  const geo = tmerge(parts);
  const nor = geo.attributes.normal;
  for (let k = 0; k < nor.count; k++) nor.setXYZ(k, 0, 1, 0);
  return [{ geo, mat: mats().grass, shadow: false }];
}

export function boulder(seed: number): ModelPart[] {
  const geo = merge([
    part(jitter(new THREE.IcosahedronGeometry(1, 1), 0.18, seed), '#8d8a80', { scale: [1.25, 0.8, 1] }),
    part(jitter(new THREE.IcosahedronGeometry(0.5, 0), 0.1, seed + 4), '#6f6c64', { pos: [0.85, -0.2, 0.4] }),
  ]);
  // Musgo en la parte superior
  const pos = geo.attributes.position, col = geo.attributes.color;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getY(i) > 0.45) col.setXYZ(i, 0.38, 0.5, 0.25);
  }
  return [{ geo, mat: mats().rock, shadow: true }];
}

/** Arbusto de bayas (las bayas son un recurso aparte). */
export function berryBush(): THREE.BufferGeometry {
  return canopy([{ c: [0, 0.75, 0], r: 0.9, n: 12, size: 1.2 }], 8);
}

/** Lianas colgando de las ramas. */
function vines(points: T3[], seed: number) {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (const [x, y, z] of points) {
    const len = 4 + r() * 5;
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(x, y, z), new THREE.Vector3(x + (r() - 0.5), y - len * 0.5, z + (r() - 0.5)), new THREE.Vector3(x + (r() - 0.5) * 1.5, y - len, z + (r() - 0.5) * 1.5),
    ]);
    parts.push(new THREE.TubeGeometry(curve, 8, 0.05, 4, false).toNonIndexed());
  }
  return tmerge(parts);
}

/** Conífera gigante (tipo secuoya/abeto) con pisos de ramas. */
export function conifer(): ModelPart[] {
  const m = mats(), r = rng(31), cards: THREE.BufferGeometry[] = [];
  const trunk = tmerge([tpart(new THREE.CylinderGeometry(0.35, 1.3, 34, 10, 3), { pos: [0, 17, 0] })]);
  for (let y = 9; y < 35; y += 1.6) {
    const t = (y - 9) / 26, rad = (1 - t) * 5.5 + 0.8;
    const n = Math.max(3, Math.round(7 * (1 - t) + 3));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + r() * 0.6;
      const g = new THREE.PlaneGeometry(rad * 0.9, rad * 1.1).toNonIndexed();
      g.translate(0, rad * 0.55, 0);
      g.rotateX(Math.PI / 2 - 0.25); // rama casi horizontal, algo caída
      g.rotateY(-a + Math.PI / 2);
      g.translate(0, y, 0);
      const nor = g.attributes.normal;
      for (let k = 0; k < nor.count; k++) nor.setXYZ(k, Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4);
      cards.push(g);
    }
  }
  return [{ geo: trunk, mat: m.bark, shadow: true }, { geo: tmerge(cards, true), mat: m.needles, shadow: true }];
}

/** Palmera alta con tronco curvo y frondas caídas. */
export function palm(): ModelPart[] {
  const m = mats();
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.6, 5, 0), new THREE.Vector3(1.6, 10, 0), new THREE.Vector3(2.6, 13.5, 0)]);
  const trunk = tmerge([new THREE.TubeGeometry(curve, 16, 0.28, 8, false).toNonIndexed()]);
  return [
    { geo: trunk, mat: m.barkDark, shadow: true },
    { geo: fronds(14, 4.8, 1.2, [2.6, 13.4, 0], 1.25, 0.55, 12), mat: m.frond, shadow: true },
  ];
}

/** Árbol seco sin hojas. */
export function snag(): ModelPart[] {
  const parts = [tpart(new THREE.CylinderGeometry(0.2, 0.7, 18, 8), { pos: [0, 9, 0] })];
  for (let i = 0; i < 6; i++) {
    const a = i * 2.1, y = 8 + i * 1.6, len = 3.5 - i * 0.35;
    const g = tpart(new THREE.CylinderGeometry(0.05, 0.16, len, 5), { rot: [0, 0, -1.0 + (i % 2) * 0.3] });
    g.translate(Math.sin(1.0) * len * 0.5, y, 0);
    g.rotateY(a);
    parts.push(g);
  }
  return [{ geo: tmerge(parts), mat: mats().deadBark, shadow: true }];
}

/** Tronco caído cubierto de musgo (eje a lo largo de x). */
export function log(): ModelPart[] {
  const body = tpart(new THREE.CylinderGeometry(0.55, 0.7, 8, 10), { rot: [0, 0, Math.PI / 2], pos: [0, 0.45, 0] });
  const roots = tpart(new THREE.CylinderGeometry(0.75, 1.3, 1.0, 9), { rot: [0, 0, Math.PI / 2], pos: [-4.3, 0.6, 0] });
  const moss = canopy([{ c: [0.5, 0.95, 0], r: 1.6, n: 7, size: 1.3 }, { c: [-2.4, 0.9, 0], r: 1.2, n: 5, size: 1.1 }], 41);
  return [{ geo: tmerge([body, roots]), mat: mats().moss, shadow: true }, { geo: moss, mat: mats().leafBush, shadow: false }];
}

/** Contrafuertes: tablones triangulares que salen de la base del tronco. */
function buttresses(n: number, reach: number, height: number, thick: number, seed: number) {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.5, k = 0.75 + r() * 0.45;
    const sh = new THREE.Shape();
    // Perfil cóncavo: ancho en el suelo y pegado al tronco arriba.
    sh.moveTo(0, -0.3); sh.lineTo(reach * k, -0.3);
    sh.quadraticCurveTo(reach * k * 0.25, height * k * 0.2, 0, height * k);
    sh.lineTo(0, -0.3);
    const g = new THREE.ExtrudeGeometry(sh, { depth: thick * k, bevelEnabled: true, bevelThickness: thick * 0.4, bevelSize: thick * 0.4, bevelSegments: 1, curveSegments: 6 });
    g.translate(0, 0, -thick * k / 2);
    g.rotateY(-a);
    parts.push(g.index ? g.toNonIndexed() : g);
  }
  return parts;
}

/** Raíces gruesas que serpentean por el suelo alrededor del árbol. */
function surfaceRoots(n: number, start: number, len: number, seed: number) {
  const r = rng(seed), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + r() * 0.7, l = len * (0.6 + r() * 0.5);
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 4; k++) {
      const t = k / 4, d = start + t * l, aa = a + Math.sin(t * 5 + i) * 0.18;
      pts.push(new THREE.Vector3(Math.cos(aa) * d, 0.35 * (1 - t) + 0.02 + Math.sin(t * 9 + i) * 0.06, Math.sin(aa) * d));
    }
    const tube = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 10, 0.22 * (0.8 + r() * 0.4), 5, false);
    // Se adelgaza hacia la punta.
    const pos = tube.attributes.position;
    for (let k = 0; k < pos.count; k++) {
      const d = Math.hypot(pos.getX(k), pos.getZ(k)), t = Math.min(1, (d - start) / l);
      const c = pts[Math.min(4, Math.round(t * 4))];
      const f = 1 - t * 0.75;
      pos.setY(k, c.y + (pos.getY(k) - c.y) * f);
    }
    parts.push(tube.toNonIndexed());
  }
  return parts;
}

/** Lianas que cuelgan de la copa casi hasta el suelo, con hojas a lo largo. */
const JUNGLE_LIANAS: [number, number, number, number][] = [[1.9, 9.4, 0.4, 8.2], [-0.7, 9.6, 1.9, 7.4], [0.8, 10.2, -1.6, 9.1], [-1.7, 9.8, -0.4, 6.5], [2.4, 9.2, -0.9, 8.6]];
const GIANT_LIANAS: [number, number, number, number][] = [
  [4.5, 22, 1, 20], [-4.2, 22.5, -2, 21.5], [1, 22, -5, 19], [-1.5, 21.5, 4.8, 20.5], [3.2, 23, -3.4, 16], [-3.4, 23, 3.1, 21], [5.6, 23.5, -1, 12], [-2.6, 22, -4.2, 21.8],
];
function lianas(list: [number, number, number, number][], seed: number, vinesGeo: THREE.BufferGeometry): ModelPart[] {
  // Las lianas cortas de siempre van en la misma malla (una llamada de dibujo menos).
  const r = rng(seed), stems: THREE.BufferGeometry[] = [vinesGeo], leaves: THREE.BufferGeometry[] = [];
  for (const [x, y, z, len] of list) {
    const sway = 0.4 + r() * 0.8, dx = (r() - 0.5) * 2, dz = (r() - 0.5) * 2;
    const pts: THREE.Vector3[] = [];
    for (let k = 0; k <= 5; k++) {
      const t = k / 5;
      // Cuelga recta con una ligera curva y un rizo al final.
      pts.push(new THREE.Vector3(x + dx * sway * t * t, y - len * t, z + dz * sway * t * t + Math.sin(t * 7) * 0.12));
    }
    const curve = new THREE.CatmullRomCurve3(pts);
    stems.push(new THREE.TubeGeometry(curve, 14, 0.045 + r() * 0.03, 4, false).toNonIndexed());
    const nLeaves = Math.round(len * 1.1);
    for (let i = 0; i < nLeaves; i++) {
      const t = 0.08 + r() * 0.9, p = curve.getPoint(t), sz = 0.45 + r() * 0.45;
      const g = new THREE.PlaneGeometry(sz, sz).toNonIndexed();
      g.rotateY(r() * Math.PI * 2);
      g.rotateX((r() - 0.5) * 0.9);
      g.translate(p.x + (r() - 0.5) * 0.2, p.y, p.z + (r() - 0.5) * 0.2);
      leaves.push(g);
    }
  }
  const lg = tmerge(leaves);
  const nor = lg.attributes.normal;
  for (let k = 0; k < nor.count; k++) nor.setXYZ(k, nor.getX(k) * 0.4, 0.8, nor.getZ(k) * 0.4);
  return [{ geo: tmerge(stems), mat: mats().vine, shadow: false }, { geo: lg, mat: mats().leafBush, shadow: false, decor: true }];
}

export function jungleVines(): ModelPart {
  return { geo: vines([[1.8, 9.6, 0.3], [-0.5, 9.7, 1.6], [0.9, 10.4, -1.2], [-1.4, 10, -0.6]], 61), mat: mats().vine, shadow: false };
}
export function giantVines(): ModelPart {
  return { geo: vines([[4, 22, 1], [-4, 22.5, -2], [1, 22, -4.5], [-1, 21.5, 4.5], [3, 23, -3], [-3, 23, 3]], 62), mat: mats().vine, shadow: false };
}

/** Helecho gigante del sotobosque: frondas largas y arqueadas de hasta 3 m. */
export function giantFern(): ModelPart[] {
  return [{ geo: fronds(14, 3.0, 0.95, [0, 0.1, 0], 0.62, 0.75, 21), mat: mats().frond, shadow: false }];
}

/** Planta de hojas anchas sobre tallos (sotobosque húmedo). */
export function broadleafPlant(): ModelPart[] {
  const r = rng(23), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + r() * 0.5, h = 0.7 + r() * 0.9, len = 1.1 + r() * 0.5;
    const g = new THREE.PlaneGeometry(len * 0.55, len, 1, 4);
    g.translate(0, len / 2, 0);
    const pos = g.attributes.position;
    for (let k = 0; k < pos.count; k++) { const t = pos.getY(k) / len; pos.setZ(k, pos.getZ(k) + t * t * 0.45 + Math.abs(pos.getX(k)) * -0.25); }
    const ng = g.toNonIndexed();
    ng.rotateX(1.05 + r() * 0.3);
    ng.translate(0, h, 0);
    ng.rotateY(a);
    parts.push(ng);
    // Tallo.
    const st = tpart(new THREE.CylinderGeometry(0.02, 0.03, h, 4), { pos: [0, h / 2, 0], rot: [0.25, 0, 0] });
    st.rotateY(a);
    parts.push(st);
  }
  const geo = tmerge(parts);
  const nor = geo.attributes.normal;
  for (let k = 0; k < nor.count; k++) nor.setXYZ(k, nor.getX(k) * 0.4, 1, nor.getZ(k) * 0.4);
  return [{ geo, mat: mats().broad, shadow: false }];
}

/** Cola de caballo prehistórica (Equisetum): tallos segmentados con verticilos. */
export function horsetail(): ModelPart[] {
  const r = rng(29), parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 7; i++) {
    const x = (r() - 0.5) * 0.9, z = (r() - 0.5) * 0.9, h = 1.3 + r() * 1.3, tilt = (r() - 0.5) * 0.25;
    parts.push(part(new THREE.CylinderGeometry(0.025, 0.04, h, 5, 1, true), '#6f9440', { pos: [x, h / 2, z], rot: [tilt, 0, tilt] }));
    // Anillos oscuros (nudos) a lo largo del tallo.
    for (let y = 0.3; y < h - 0.1; y += 0.3) {
      parts.push(part(new THREE.CylinderGeometry(0.05, 0.045, 0.035, 5, 1, true), '#3f5a26', { pos: [x + tilt * y, y, z - tilt * y] }));
    }
    parts.push(part(new THREE.ConeGeometry(0.04, 0.14, 5), '#a08a4a', { pos: [x + tilt * h, h + 0.05, z - tilt * h] }));
  }
  const m = new THREE.MeshLambertMaterial({ vertexColors: true });
  addWind(m, 0.08, 3);
  return [{ geo: merge(parts), mat: m, shadow: false }];
}

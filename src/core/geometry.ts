import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Herramientas para construir modelos low-poly originales combinando primitivas.
 * Todas las piezas se convierten a no indexadas, con color por vértice, para
 * poder fusionarlas en una sola geometría (= una sola llamada de dibujo).
 */
export function part(
  geo: THREE.BufferGeometry,
  color: THREE.ColorRepresentation,
  opts: { pos?: [number, number, number]; rot?: [number, number, number]; scale?: [number, number, number] } = {},
): THREE.BufferGeometry {
  let g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  if (opts.scale) g.scale(...opts.scale);
  if (opts.rot) g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...opts.rot)));
  if (opts.pos) g.translate(...opts.pos);
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

/** Fusiona piezas y recalcula normales planas. */
export function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const g = mergeGeometries(parts, false);
  if (!g) throw new Error('No se pudieron fusionar las geometrías');
  g.computeVertexNormals();
  g.computeBoundingSphere();
  return g;
}

/** Deforma ligeramente los vértices para un aspecto más orgánico. */
export function jitter(geo: THREE.BufferGeometry, amount: number, seed = 1): THREE.BufferGeometry {
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const key = (x: number, y: number, z: number) => `${x.toFixed(3)},${y.toFixed(3)},${z.toFixed(3)}`;
  const offsets = new Map<string, [number, number, number]>();
  let s = seed;
  const r = () => ((s = (s * 16807) % 2147483647) / 2147483647 - 0.5) * 2 * amount;
  for (let i = 0; i < pos.count; i++) {
    const k = key(pos.getX(i), pos.getY(i), pos.getZ(i));
    let o = offsets.get(k);
    if (!o) offsets.set(k, (o = [r(), r(), r()]));
    pos.setXYZ(i, pos.getX(i) + o[0], pos.getY(i) + o[1], pos.getZ(i) + o[2]);
  }
  return geo;
}

/** Material compartido para modelos con color por vértice. */
export const vertexColorMaterial = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });

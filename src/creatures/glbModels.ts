import * as THREE from 'three';
import { dataUrlToBuffer } from './quatModels';
import { applyReptileSkin } from './skin';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { DinoRig } from './dinoModels';

/**
 * Modelos GLB provisionales (public/models/dinosaurs). No tienen esqueleto:
 * se separan por geometría en cuerpo, patas, cola y cabeza, y cada grupo
 * se mueve como pieza rígida (animación por desplazamiento, sin huesos reales).
 * Archivo: Z arriba, mirando a +X. Juego: Y arriba, mirando a +Z.
 */
export const GLB_NAMES = ['Allosaurus', 'Ceratosaurus', 'Torvosaurus', 'Megalosaurus', 'Compsognathus'] as const;
export type GlbName = (typeof GLB_NAMES)[number];

const sources = new Map<GlbName, THREE.Mesh[]>();

/** Carga todos los modelos. En la versión de un solo archivo vienen incrustados en window.__GLB. */
export async function preloadGlbModels(): Promise<void> {
  const loader = new GLTFLoader();
  const inline = (window as unknown as { __GLB?: Record<string, string> }).__GLB;
  await Promise.all(GLB_NAMES.map(async (name) => {
    try {
      const data = inline?.[name];
      const gltf = data ? await loader.parseAsync(dataUrlToBuffer(data), '') : await loader.loadAsync(`./models/dinosaurs/${name}.glb`);
      const meshes: THREE.Mesh[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => { if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh); });
      sources.set(name, meshes);
    } catch (e) {
      console.warn('No se pudo cargar', name, e);
    }
  }));
}

export const hasGlb = (name: GlbName) => sources.has(name);

// Archivo (x adelante, y lateral, z arriba) → juego (z adelante, x lateral, y arriba).
const toGame = new THREE.Matrix4().set(
  0, -1, 0, 0,
  0, 0, 1, 0,
  1, 0, 0, 0,
  0, 0, 0, 1,
);

let material: THREE.MeshStandardMaterial | null = null;

export function buildGlbDino(name: GlbName, biped = true): DinoRig {
  const meshes = sources.get(name)!;
  if (!material) {
    material = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8, flatShading: true });
    material.defines = { USE_SKINPOS: '' };
    applyReptileSkin(material, { density: 0.6, bump: 1.1 });
  }

  const geos = meshes.map((m) => {
    const g = m.geometry.clone();
    g.applyMatrix4(m.matrixWorld);
    g.applyMatrix4(toGame);
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'color') g.deleteAttribute(k);
    // Los colores de vértice del archivo están en sRGB: pásalos a lineal.
    const col = g.getAttribute('color');
    if (col) {
      const c = new THREE.Color();
      for (let i = 0; i < col.count; i++) { c.setRGB(col.getX(i), col.getY(i), col.getZ(i), THREE.SRGBColorSpace); col.setXYZ(i, c.r, c.g, c.b); }
    }
    g.computeBoundingBox();
    return g;
  });
  const all = new THREE.Box3();
  geos.forEach((g) => all.union(g.boundingBox!));
  const H = all.max.y, L = all.max.z - all.min.z;
  const center = (g: THREE.BufferGeometry) => g.boundingBox!.getCenter(new THREE.Vector3());

  // Las pezuñas tocan el suelo: su posición marca la cadera.
  const feet = geos.filter((g) => g.boundingBox!.min.y < H * 0.06);
  const hipZ = feet.length ? feet.reduce((s, g) => s + center(g).z, 0) / feet.length : 0;
  const limb = (g: THREE.BufferGeometry) => { const c = center(g); return Math.abs(c.x) > 0.1 * (L / 8) && c.y < H * 0.63; };
  const groups = { body: [] as THREE.BufferGeometry[], legL: [] as THREE.BufferGeometry[], legR: [] as THREE.BufferGeometry[], tail: [] as THREE.BufferGeometry[], head: [] as THREE.BufferGeometry[] };
  const torsoFront = hipZ + L * 0.16;
  for (const g of geos) {
    const c = center(g);
    if (limb(g) && Math.abs(c.z - hipZ) < L * 0.11) (c.x > 0 ? groups.legL : groups.legR).push(g);
    else if (c.z < hipZ - L * 0.14) groups.tail.push(g);
    else if (c.z > torsoFront && !limb(g)) groups.head.push(g);
    else groups.body.push(g);
  }

  const mesh = (list: THREE.BufferGeometry[], offset: THREE.Vector3) => {
    const g = mergeGeometries(list, false)!;
    // Posición original (antes de separar las piezas) para que las escamas no tengan costuras.
    g.setAttribute('skinPos', g.getAttribute('position').clone());
    g.translate(-offset.x, -offset.y, -offset.z);
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, material!);
    m.castShadow = true;
    return m;
  };

  const root = new THREE.Group();
  const body = new THREE.Group();
  root.add(body);
  body.add(mesh(groups.body, new THREE.Vector3()));

  // Patas: cadera en lo alto del muslo, rodilla a media altura.
  const legs: THREE.Group[] = [];
  for (const list of [groups.legL, groups.legR]) {
    if (!list.length) continue;
    const box = new THREE.Box3(); list.forEach((g) => box.union(g.boundingBox!));
    const hip = new THREE.Vector3((box.min.x + box.max.x) / 2, box.max.y * 0.92, hipZ);
    const kneeY = box.max.y * 0.45;
    const upper = list.filter((g) => center(g).y > kneeY);
    const lower = list.filter((g) => center(g).y <= kneeY);
    const leg = new THREE.Group(); leg.position.copy(hip);
    if (upper.length) leg.add(mesh(upper, hip));
    const knee = new THREE.Group(); knee.position.set(0, kneeY - hip.y, 0);
    if (lower.length) knee.add(mesh(lower, new THREE.Vector3(hip.x, kneeY, hip.z)));
    leg.add(knee);
    leg.userData.knee = knee; leg.userData.kneeRest = 0;
    body.add(leg);
    legs.push(leg);
  }

  // Cola en 4 tramos encadenados.
  const tailBones: THREE.Bone[] = [];
  if (groups.tail.length) {
    const tb = new THREE.Box3(); groups.tail.forEach((g) => tb.union(g.boundingBox!));
    const start = hipZ - L * 0.14, n = 4, seg = (start - tb.min.z) / n;
    let parent: THREE.Object3D = body; let prevPivot = new THREE.Vector3();
    for (let i = 0; i < n; i++) {
      const zA = start - seg * i;
      const part = groups.tail.filter((g) => { const z = center(g).z; return z <= zA && (i === n - 1 || z > zA - seg); });
      const yAt = part.length ? part.reduce((s, g) => s + center(g).y, 0) / part.length : H * 0.5;
      const pivot = new THREE.Vector3(0, yAt, zA);
      const b = new THREE.Bone();
      b.position.copy(pivot).sub(prevPivot);
      if (part.length) b.add(mesh(part, pivot));
      parent.add(b); tailBones.push(b);
      parent = b; prevPivot = pivot;
    }
  }

  // Cabeza (y cuello corto) como una sola pieza.
  const headBone = new THREE.Bone();
  const hb = new THREE.Box3(); groups.head.forEach((g) => hb.union(g.boundingBox!));
  const neck = new THREE.Vector3(0, groups.head.length ? (hb.min.y + hb.max.y) / 2 : H * 0.8, torsoFront);
  headBone.position.copy(neck);
  if (groups.head.length) headBone.add(mesh(groups.head, neck));
  body.add(headBone);

  return { root, body, legs, neckBones: [headBone], tailBones, headBone, biped };
}

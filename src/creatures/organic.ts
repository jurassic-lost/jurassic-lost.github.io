import * as THREE from 'three';
import { applyReptileSkin } from './skin';

/**
 * Cuerpos orgánicos para criaturas: una "columna" suave (curva) barrida con
 * una sección elíptica variable forma cola + cuerpo + cuello + cabeza en una sola
 * malla con esqueleto (SkinnedMesh), para animar cola, cuello y cabeza con huesos.
 */
export interface SpineSpec {
  /** Puntos de control (z, y) de la cola a la nariz. */
  points: [number, number][];
  /** Semiancho y semialto de la sección en cada punto de control. */
  widths: number[];
  heights: number[];
  /** Desplaza el centro de la sección hacia abajo (vientre colgante), en fracción de la altura. */
  sag?: number[];
  bones: number;
  /** z de la cadera: raíz del esqueleto (la cola y el cuello cuelgan de ella). */
  rootZ: number;
  rings?: number;
  radial?: number;
}

export interface Coloring {
  base: THREE.ColorRepresentation;
  belly: THREE.ColorRepresentation;
  back: THREE.ColorRepresentation;
  /** Rayas transversales: frecuencia (0 = sin rayas) e intensidad. */
  stripes?: number;
  stripeStrength?: number;
  stripeColor?: THREE.ColorRepresentation;
}

export interface OrganicBody {
  mesh: THREE.SkinnedMesh;
  bones: THREE.Bone[];
  /** Posición de reposo de cada hueso en el espacio del modelo. */
  bonePos: THREE.Vector3[];
  curve: THREE.CatmullRomCurve3;
  material: THREE.MeshStandardMaterial;
  root: number;
}

/** Material de piel PBR: escamas con relieve y rugosidad variable (ver skin.ts). */
export function skinMaterial(vertexColors: boolean, color: THREE.ColorRepresentation = '#ffffff', _repeat: [number, number] = [6, 3]) {
  const m = new THREE.MeshStandardMaterial({ color, vertexColors, roughness: 0.78, metalness: 0 });
  return applyReptileSkin(m, { density: 0.65, bump: 0.9 });
}

/** Interpolación suave de un perfil de valores por parámetro t ∈ [0, 1]. */
function profile(values: number[], t: number) {
  const f = t * (values.length - 1);
  const i = Math.min(values.length - 2, Math.floor(f)), k = f - i;
  const s = k * k * (3 - 2 * k);
  return values[i] + (values[i + 1] - values[i]) * s;
}

export function buildBody(spec: SpineSpec, col: Coloring): OrganicBody {
  const curve = new THREE.CatmullRomCurve3(spec.points.map(([z, y]) => new THREE.Vector3(0, y, z)), false, 'centripetal');
  const rings = spec.rings ?? 64, radial = spec.radial ?? 20;
  const pos: number[] = [], uv: number[] = [], colors: number[] = [], skinIdx: number[] = [], skinW: number[] = [], index: number[] = [];
  const base = new THREE.Color(col.base), belly = new THREE.Color(col.belly), back = new THREE.Color(col.back);
  const stripeC = new THREE.Color(col.stripeColor ?? col.back);
  const side = new THREE.Vector3(1, 0, 0), n = new THREE.Vector3(), c = new THREE.Color();
  const sag = spec.sag ?? spec.widths.map(() => 0);
  const B = spec.bones;

  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const p = curve.getPointAt(t), tan = curve.getTangentAt(t);
    n.crossVectors(side, tan).normalize(); // "arriba" perpendicular a la columna
    const w = Math.max(0.005, profile(spec.widths, t)), h = Math.max(0.005, profile(spec.heights, t)), sg = profile(sag, t);
    const stripe = col.stripes ? Math.pow(Math.max(0, Math.sin(t * col.stripes * Math.PI * 2)), 6) * (col.stripeStrength ?? 0.5) : 0;
    const bf = t * (B - 1), bi = Math.min(B - 2, Math.floor(bf)), bw = bf - bi;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      // Sección algo aplanada en el vientre
      const yy = sa > 0 ? sa : sa * (1 + sg);
      pos.push(p.x + ca * w, p.y + yy * h * n.y - sg * h * 0.2, p.z + yy * h * n.z);
      uv.push(j / radial, t * 4);
      // Color: lomo oscuro, vientre claro, rayas en los flancos
      const v = sa; // -1 vientre, 1 lomo
      c.copy(base);
      if (v < -0.2) c.lerp(belly, Math.min(1, (-v - 0.2) * 1.6));
      if (v > 0.4) c.lerp(back, (v - 0.4) * 1.4);
      if (stripe > 0 && v > -0.3) c.lerp(stripeC, stripe * Math.min(1, (v + 0.3) * 1.5));
      colors.push(c.r, c.g, c.b);
      skinIdx.push(bi, bi + 1, 0, 0);
      skinW.push(1 - bw, bw, 0, 0);
    }
  }
  for (let i = 0; i < rings; i++)
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = a + radial + 1;
      index.push(a, a + 1, b, b, a + 1, b + 1);
    }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIdx, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinW, 4));
  geo.setIndex(index);
  geo.computeVertexNormals();

  // Esqueleto a lo largo de la columna, con raíz en la cadera: una cadena hacia la cola y otra hacia la cabeza.
  const bones: THREE.Bone[] = [], bonePos: THREE.Vector3[] = [];
  for (let b = 0; b < B; b++) { bones.push(new THREE.Bone()); bonePos.push(curve.getPointAt(b / (B - 1))); }
  let root = 0, rd = Infinity;
  bonePos.forEach((p, i) => { const d = Math.abs(p.z - spec.rootZ); if (d < rd) { rd = d; root = i; } });
  bones[root].position.copy(bonePos[root]);
  for (let b = root + 1; b < B; b++) { bones[b].position.copy(bonePos[b]).sub(bonePos[b - 1]); bones[b - 1].add(bones[b]); }
  for (let b = root - 1; b >= 0; b--) { bones[b].position.copy(bonePos[b]).sub(bonePos[b + 1]); bones[b + 1].add(bones[b]); }
  const material = skinMaterial(true, '#ffffff', [8, 4]);
  const mesh = new THREE.SkinnedMesh(geo, material);
  mesh.add(bones[root]);
  mesh.updateMatrixWorld(true);
  mesh.bind(new THREE.Skeleton(bones));
  mesh.castShadow = true;
  mesh.frustumCulled = false;
  return { mesh, bones, bonePos, curve, material, root };
}

/** Hueso más cercano a un punto del modelo. */
export function nearestBone(body: OrganicBody, z: number): number {
  let best = 0, bd = Infinity;
  body.bonePos.forEach((p, i) => { const d = Math.abs(p.z - z); if (d < bd) { bd = d; best = i; } });
  return best;
}

/** Engancha un objeto a un hueso conservando su posición de reposo. */
export function attach(body: OrganicBody, obj: THREE.Object3D, at: THREE.Vector3, bone = nearestBone(body, at.z)) {
  obj.position.copy(at).sub(body.bonePos[bone]);
  body.bones[bone].add(obj);
  return bone;
}

/** Pata con muslo musculoso, rodilla articulada y pie con dedos. */
export function limb(mat: THREE.Material, nail: THREE.Material, upper: number, lower: number, r: number, opts: { biped?: boolean } = {}) {
  const g = new THREE.Group();
  const mk = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; return m; };
  const thigh = mk(new THREE.SphereGeometry(1, 16, 12), 0, opts.biped ? -upper * 0.15 : upper * 0.05, 0);
  thigh.scale.set(r * 1.2, upper * (opts.biped ? 0.5 : 0.38), r * 1.45);
  g.add(thigh);
  g.add(mk(new THREE.CylinderGeometry(r * 0.85, r * 0.7, upper, 14), 0, -upper / 2, 0));
  const knee = new THREE.Group();
  knee.position.y = -upper;
  g.add(knee);
  knee.add(mk(new THREE.SphereGeometry(r * 0.66, 12, 10)));
  knee.add(mk(new THREE.CylinderGeometry(r * 0.68, r * 0.6, lower, 14), 0, -lower / 2, 0));
  const foot = mk(new THREE.SphereGeometry(1, 14, 10), 0, -lower, opts.biped ? r * 0.6 : r * 0.2);
  foot.scale.set(r * 0.95, r * 0.35, opts.biped ? r * 1.8 : r * 1.15);
  knee.add(foot);
  const toes = opts.biped ? [-0.5, 0, 0.5] : [-0.6, 0, 0.6];
  for (const dx of toes) {
    const toe = new THREE.Mesh(new THREE.ConeGeometry(r * 0.16, r * 0.45, 8), nail);
    toe.rotation.x = Math.PI / 2;
    toe.position.set(dx * r, -lower - r * 0.15, (opts.biped ? r * 2.3 : r * 1.25));
    knee.add(toe);
  }
  g.userData.knee = knee;
  g.userData.length = upper + lower + r * 0.35;
  // En reposo la rodilla está algo flexionada (bípedos más).
  g.userData.kneeRest = opts.biped ? 0.35 : 0.08;
  return g;
}

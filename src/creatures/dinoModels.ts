import * as THREE from 'three';
import type { ClipAnimator } from './quatModels';
import { Coloring, OrganicBody, SpineSpec, attach, buildBody, limb, skinMaterial } from './organic';

/**
 * Especies originales de dinosaurio. Cada una es un cuerpo orgánico con esqueleto
 * (cola, cuello y cabeza animables) más patas articuladas y detalles (cuernos, placas…).
 */
export interface DinoRig {
  root: THREE.Group;
  /** Contiene el cuerpo; se inclina con el terreno y respira. */
  body: THREE.Group;
  legs: THREE.Group[];
  /** Huesos del cuello, de la base a la cabeza. */
  neckBones: THREE.Bone[];
  /** Huesos de la cola, de la base a la punta. */
  tailBones: THREE.Bone[];
  headBone: THREE.Bone;
  jaw?: THREE.Object3D;
  biped: boolean;
  /** Modelos con esqueleto y clips (Quaternius): se animan con sus propias animaciones. */
  clips?: ClipAnimator;
}

const plain = (color: THREE.ColorRepresentation, roughness = 0.5) => new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
const EYE = plain('#120c06', 0.15), NAIL = plain('#2e281f', 0.5), HORN = plain('#e3d6b8', 0.45), TEETH = plain('#f2ead6', 0.4), MOUTH = plain('#6b2a24', 0.7);

function mesh(geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

interface LegSpec { x: number; z: number; y: number; upper: number; lower: number; r: number }

function assemble(spec: SpineSpec, col: Coloring, opts: { hipZ: number; shoulderZ: number; legs: LegSpec[]; biped?: boolean }) {
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  const b = buildBody(spec, col);
  body.add(b.mesh);
  const legMat = skinMaterial(false, col.base, [2, 2]);
  const legs = opts.legs.map((l) => {
    const g = limb(legMat, NAIL, l.upper, l.lower, l.r, { biped: opts.biped });
    attach(b, g, new THREE.Vector3(l.x, l.y, l.z));
    return g;
  });
  const tailBones: THREE.Bone[] = [], neckBones: THREE.Bone[] = [];
  for (let i = b.root - 1; i >= 0; i--) if (b.bonePos[i].z < opts.hipZ - 0.2) tailBones.push(b.bones[i]);
  for (let i = b.root + 1; i < b.bones.length - 1; i++) if (b.bonePos[i].z > opts.shoulderZ) neckBones.push(b.bones[i]);
  const headBone = b.bones[b.bones.length - 2];
  return { root, body, legs, tailBones, neckBones, headBone, b };
}

function eyes(b: OrganicBody, at: THREE.Vector3, spread: number, r: number, mat = EYE) {
  for (const s of [-1, 1]) {
    const e = mesh(new THREE.SphereGeometry(r, 12, 10), mat);
    attach(b, e, new THREE.Vector3(at.x + s * spread, at.y, at.z), b.bones.length - 2);
    const lid = mesh(new THREE.SphereGeometry(r * 1.25, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), b.material);
    attach(b, lid, new THREE.Vector3(at.x + s * spread, at.y + r * 0.15, at.z), b.bones.length - 2);
  }
}

/** Braquiosaurio original: cuello muy alto, patas delanteras largas. */
export function buildLongNeck(): DinoRig {
  const spec: SpineSpec = {
    points: [[-13, 3.0], [-10, 4.3], [-7, 5.6], [-4.5, 6.4], [-2, 6.9], [0.5, 7.2], [2.5, 7.9], [3.8, 9.8], [4.9, 12.6], [5.6, 15.0], [6.2, 16.7], [7.0, 16.85], [7.8, 16.6]],
    widths: [0.04, 0.45, 0.95, 1.75, 2.05, 1.95, 1.65, 0.85, 0.6, 0.48, 0.44, 0.38, 0.18],
    heights: [0.04, 0.45, 1.05, 1.85, 2.25, 2.25, 1.9, 0.95, 0.66, 0.52, 0.5, 0.36, 0.17],
    sag: [0, 0, 0.1, 0.25, 0.35, 0.35, 0.25, 0.05, 0, 0, 0, 0, 0],
    bones: 16, rootZ: -4.5, rings: 90,
  };
  const r = assemble(spec, { base: '#6d6a58', belly: '#a39d84', back: '#4e4c3f', stripes: 0 }, {
    hipZ: -4.5, shoulderZ: 3,
    legs: [
      { x: 1.25, z: 2.4, y: 6.6, upper: 3.4, lower: 3.0, r: 0.62 }, { x: -1.25, z: 2.4, y: 6.6, upper: 3.4, lower: 3.0, r: 0.62 },
      { x: 1.35, z: -4.5, y: 5.9, upper: 3.1, lower: 2.6, r: 0.72 }, { x: -1.35, z: -4.5, y: 5.9, upper: 3.1, lower: 2.6, r: 0.72 },
    ],
  });
  eyes(r.b, new THREE.Vector3(0, 17.0, 7.0), 0.36, 0.09);
  const crest = mesh(new THREE.SphereGeometry(0.35, 14, 10), r.b.material);
  crest.scale.set(1, 0.6, 1.3);
  attach(r.b, crest, new THREE.Vector3(0, 17.25, 6.6), r.b.bones.length - 2);
  return { root: r.root, body: r.body, legs: r.legs, neckBones: r.neckBones, tailBones: r.tailBones, headBone: r.headBone, biped: false };
}

/** Triceratops: gola festoneada y tres cuernos. */
export function buildTriceratops(): DinoRig {
  const spec: SpineSpec = {
    points: [[-5.3, 1.0], [-3.9, 1.55], [-2.3, 2.0], [-0.6, 2.1], [1.1, 1.85], [2.1, 1.6], [2.8, 1.55], [3.5, 1.4], [4.1, 1.1]],
    widths: [0.03, 0.32, 0.95, 1.18, 1.0, 0.72, 0.55, 0.4, 0.14],
    heights: [0.03, 0.33, 0.95, 1.08, 0.98, 0.72, 0.6, 0.45, 0.16],
    sag: [0, 0, 0.15, 0.3, 0.25, 0.05, 0, 0, 0],
    bones: 12, rootZ: -2.3,
  };
  const r = assemble(spec, { base: '#6e6a3c', belly: '#b7a77a', back: '#45452a', stripes: 7, stripeStrength: 0.35, stripeColor: '#3c3a22' }, {
    hipZ: -2.3, shoulderZ: 1.6,
    legs: [
      { x: 0.8, z: 1.1, y: 1.35, upper: 0.7, lower: 0.62, r: 0.28 }, { x: -0.8, z: 1.1, y: 1.35, upper: 0.7, lower: 0.62, r: 0.28 },
      { x: 0.85, z: -2.3, y: 1.6, upper: 0.85, lower: 0.72, r: 0.34 }, { x: -0.85, z: -2.3, y: 1.6, upper: 0.85, lower: 0.72, r: 0.34 },
    ],
  });
  const b = r.b, hb = b.bones.length - 2;
  const frillMat = skinMaterial(false, '#8f5a2c', [2, 2]);
  const frill = mesh(new THREE.CylinderGeometry(1.0, 0.85, 0.12, 36), frillMat);
  frill.rotation.x = Math.PI / 2 - 0.55;
  attach(b, frill, new THREE.Vector3(0, 2.15, 2.55), hb);
  for (let i = 0; i < 13; i++) {
    const a = Math.PI * 0.06 + (i / 12) * Math.PI * 0.88;
    const k = mesh(new THREE.ConeGeometry(0.08, 0.24, 10), HORN);
    k.rotation.set(-0.55, 0, -Math.PI / 2 + a);
    attach(b, k, new THREE.Vector3(Math.cos(a) * 0.98, 2.15 + Math.sin(a) * 0.98 * Math.cos(0.55), 2.55 - Math.sin(a) * 0.98 * Math.sin(0.55)), hb);
  }
  for (const s of [-1, 1]) {
    const h = mesh(new THREE.ConeGeometry(0.12, 1.2, 14), HORN);
    h.rotation.set(Math.PI / 2 - 0.8, 0, -s * 0.25);
    attach(b, h, new THREE.Vector3(s * 0.27, 2.05, 3.3), hb);
  }
  const nose = mesh(new THREE.ConeGeometry(0.09, 0.4, 12), HORN);
  nose.rotation.x = 0.45;
  attach(b, nose, new THREE.Vector3(0, 1.62, 3.75), hb);
  const beak = mesh(new THREE.ConeGeometry(0.16, 0.4, 12), plain('#3a3428', 0.5));
  beak.rotation.x = Math.PI / 2 + 0.5;
  attach(b, beak, new THREE.Vector3(0, 1.0, 4.15), hb);
  eyes(b, new THREE.Vector3(0, 1.58, 3.2), 0.42, 0.065);
  return { root: r.root, body: r.body, legs: r.legs, neckBones: r.neckBones, tailBones: r.tailBones, headBone: r.headBone, biped: false };
}

/** Estegosaurio: lomo alto con placas alternas y púas en la cola. */
export function buildStegosaurus(): DinoRig {
  const spec: SpineSpec = {
    points: [[-5.6, 1.5], [-4.0, 2.2], [-2.0, 2.75], [0, 2.5], [1.5, 1.85], [2.5, 1.25], [3.2, 0.95], [3.8, 0.75]],
    widths: [0.04, 0.32, 0.82, 0.9, 0.7, 0.35, 0.27, 0.12],
    heights: [0.04, 0.32, 0.92, 0.98, 0.72, 0.35, 0.28, 0.12],
    sag: [0, 0, 0.2, 0.3, 0.2, 0, 0, 0],
    bones: 12, rootZ: -2,
  };
  const r = assemble(spec, { base: '#7a6a45', belly: '#c2ad80', back: '#4f4129', stripes: 9, stripeStrength: 0.5, stripeColor: '#3d3020' }, {
    hipZ: -2, shoulderZ: 1.8,
    legs: [
      { x: 0.6, z: 1.4, y: 1.4, upper: 0.7, lower: 0.62, r: 0.22 }, { x: -0.6, z: 1.4, y: 1.4, upper: 0.7, lower: 0.62, r: 0.22 },
      { x: 0.7, z: -2.0, y: 2.25, upper: 1.2, lower: 0.95, r: 0.3 }, { x: -0.7, z: -2.0, y: 2.25, upper: 1.2, lower: 0.95, r: 0.3 },
    ],
  });
  const b = r.b;
  const plateMat = new THREE.MeshStandardMaterial({ color: '#9a5a2a', roughness: 0.7, side: THREE.DoubleSide });
  const plateShape = new THREE.Shape();
  plateShape.moveTo(-0.5, 0); plateShape.quadraticCurveTo(-0.55, 0.7, 0, 1); plateShape.quadraticCurveTo(0.55, 0.7, 0.5, 0); plateShape.lineTo(-0.5, 0);
  const plateGeo = new THREE.ExtrudeGeometry(plateShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.02, bevelThickness: 0.02, bevelSegments: 1 });
  plateGeo.translate(0, 0, -0.03);
  for (let i = 0; i < 15; i++) {
    const t = 0.12 + (i / 14) * 0.7;
    const p = b.curve.getPointAt(t);
    const h = Math.sin(((i + 1) / 16) * Math.PI) * 0.9 + 0.25;
    const plate = mesh(plateGeo, plateMat);
    plate.scale.setScalar(h);
    plate.rotation.y = Math.PI / 2;
    plate.rotation.z = (i % 2 ? 0.12 : -0.12);
    const hh = Math.max(0.2, b.mesh.geometry.boundingSphere ? 0 : 0);
    void hh;
    attach(b, plate, new THREE.Vector3((i % 2 ? 0.12 : -0.12), p.y + spec.heights[Math.min(7, Math.round(t * 7))] * 0.85, p.z));
  }
  for (const s of [-1, 1]) for (const dz of [0, 0.35]) {
    const sp = mesh(new THREE.ConeGeometry(0.06, 0.8, 10), HORN);
    sp.rotation.set(-0.6, 0, s * 1.0);
    attach(b, sp, new THREE.Vector3(s * 0.2, 1.75, -4.6 + dz));
  }
  eyes(b, new THREE.Vector3(0, 1.05, 3.4), 0.2, 0.05);
  return { root: r.root, body: r.body, legs: r.legs, neckBones: r.neckBones, tailBones: r.tailBones, headBone: r.headBone, biped: false };
}

/** Iguanodonte: herbívoro rayado que camina a cuatro patas. */
export function buildIguanodon(): DinoRig {
  const spec: SpineSpec = {
    points: [[-5.4, 1.5], [-3.5, 2.05], [-1.5, 2.35], [0.4, 2.3], [1.8, 2.25], [2.6, 2.6], [3.2, 2.9], [3.75, 2.85], [4.3, 2.65]],
    widths: [0.03, 0.3, 0.62, 0.7, 0.55, 0.32, 0.3, 0.24, 0.1],
    heights: [0.03, 0.36, 0.78, 0.82, 0.62, 0.34, 0.33, 0.27, 0.12],
    sag: [0, 0, 0.15, 0.2, 0.1, 0, 0, 0, 0],
    bones: 12, rootZ: -1.5,
  };
  const r = assemble(spec, { base: '#8a8a94', belly: '#d2cbbb', back: '#4b4d63', stripes: 10, stripeStrength: 0.7, stripeColor: '#3e3c55' }, {
    hipZ: -1.5, shoulderZ: 2.2,
    legs: [
      { x: 0.5, z: 1.8, y: 1.8, upper: 0.95, lower: 0.85, r: 0.15 }, { x: -0.5, z: 1.8, y: 1.8, upper: 0.95, lower: 0.85, r: 0.15 },
      { x: 0.62, z: -1.5, y: 2.1, upper: 1.1, lower: 1.0, r: 0.26 }, { x: -0.62, z: -1.5, y: 2.1, upper: 1.1, lower: 1.0, r: 0.26 },
    ],
  });
  eyes(r.b, new THREE.Vector3(0, 3.0, 3.55), 0.24, 0.05);
  const beak = mesh(new THREE.SphereGeometry(0.14, 12, 8), plain('#d6b9a0', 0.6));
  beak.scale.set(1, 0.6, 1.4);
  attach(r.b, beak, new THREE.Vector3(0, 2.62, 4.3), r.b.bones.length - 2);
  return { root: r.root, body: r.body, legs: r.legs, neckBones: r.neckBones, tailBones: r.tailBones, headBone: r.headBone, biped: false };
}

/** Bípedo genérico (tiranosaurio y compsognathus) con boca que se abre y brazos cortos. */
function buildTheropod(s: number, col: Coloring, teeth: boolean): DinoRig {
  const spec: SpineSpec = {
    points: [[-7.5 * s, 2.6 * s], [-5 * s, 3.4 * s], [-2.5 * s, 3.95 * s], [-0.5 * s, 4.1 * s], [1.2 * s, 4.15 * s], [2.4 * s, 4.6 * s], [3.2 * s, 5.0 * s], [4.0 * s, 4.95 * s], [4.9 * s, 4.7 * s], [5.6 * s, 4.45 * s]],
    widths: [0.04, 0.45, 1.1, 1.4, 1.2, 0.72, 0.75, 0.78, 0.58, 0.24].map((v) => v * s),
    heights: [0.04, 0.5, 1.2, 1.5, 1.3, 0.78, 0.95, 0.9, 0.62, 0.24].map((v) => v * s),
    sag: [0, 0, 0.1, 0.25, 0.2, 0, 0, 0, 0, 0],
    bones: 14, rootZ: -0.5 * s,
  };
  const r = assemble(spec, col, {
    hipZ: -0.8 * s, shoulderZ: 2.0 * s, biped: true,
    legs: [
      { x: 0.75 * s, z: -0.6 * s, y: 3.75 * s, upper: 2.0 * s, lower: 1.9 * s, r: 0.38 * s },
      { x: -0.75 * s, z: -0.6 * s, y: 3.75 * s, upper: 2.0 * s, lower: 1.9 * s, r: 0.38 * s },
    ],
  });
  const b = r.b, hb = b.bones.length - 2;
  const jaw = new THREE.Group();
  const jawMesh = mesh(new THREE.SphereGeometry(1, 16, 10), b.material);
  jawMesh.scale.set(0.42 * s, 0.17 * s, 1.0 * s);
  jawMesh.position.set(0, 0, 0.75 * s);
  jaw.add(jawMesh);
  const tongue = mesh(new THREE.SphereGeometry(1, 12, 8), MOUTH);
  tongue.scale.set(0.3 * s, 0.08 * s, 0.75 * s);
  tongue.position.set(0, 0.1 * s, 0.7 * s);
  jaw.add(tongue);
  if (teeth) {
    for (let i = 0; i < 9; i++) for (const sx of [-1, 1]) {
      const t = mesh(new THREE.ConeGeometry(0.04 * s, 0.16 * s, 6), TEETH);
      t.position.set(sx * 0.3 * s * (1 - i * 0.06), 0.15 * s, 0.25 * s + i * 0.15 * s);
      jaw.add(t);
      const up = mesh(new THREE.ConeGeometry(0.045 * s, 0.2 * s, 6), TEETH);
      up.rotation.x = Math.PI;
      attach(b, up, new THREE.Vector3(sx * 0.34 * s * (1 - i * 0.06), 4.6 * s, 3.95 * s + i * 0.15 * s), hb);
    }
  }
  attach(b, jaw, new THREE.Vector3(0, 4.62 * s, 3.85 * s), hb);
  // Brazos cortos
  for (const sx of [-1, 1]) {
    const arm = new THREE.Group();
    const a1 = mesh(new THREE.CylinderGeometry(0.11 * s, 0.08 * s, 0.7 * s, 10), b.material);
    a1.position.y = -0.3 * s; arm.add(a1);
    const a2 = mesh(new THREE.CylinderGeometry(0.08 * s, 0.06 * s, 0.5 * s, 10), b.material);
    a2.position.set(0, -0.6 * s, 0.25 * s); a2.rotation.x = -1.1; arm.add(a2);
    for (const dx of [-0.03, 0.03]) { const c = mesh(new THREE.ConeGeometry(0.03 * s, 0.15 * s, 6), NAIL); c.position.set(dx * s, -0.72 * s, 0.5 * s); c.rotation.x = Math.PI / 2; arm.add(c); }
    arm.rotation.x = -0.6;
    attach(b, arm, new THREE.Vector3(sx * 0.62 * s, 4.0 * s, 2.0 * s));
  }
  eyes(b, new THREE.Vector3(0, 5.15 * s, 3.55 * s), 0.43 * s, 0.07 * s, plain('#c99a2a', 0.2));
  // Crestas sobre los ojos
  for (const sx of [-1, 1]) {
    const ridge = mesh(new THREE.SphereGeometry(1, 10, 8), b.material);
    ridge.scale.set(0.12 * s, 0.08 * s, 0.35 * s);
    attach(b, ridge, new THREE.Vector3(sx * 0.38 * s, 5.3 * s, 3.5 * s), hb);
  }
  r.body.position.y = 0.2 * s;
  return { root: r.root, body: r.body, legs: r.legs, neckBones: r.neckBones, tailBones: r.tailBones, headBone: r.headBone, jaw, biped: true };
}

/** Tiranosaurio original: gigante, cabeza enorme, no se le puede vencer. */
export function buildTRex(): DinoRig {
  return buildTheropod(1, { base: '#7d6c48', belly: '#c2ae86', back: '#4d4330', stripes: 12, stripeStrength: 0.55, stripeColor: '#2e281a' }, true);
}

/** Compsognathus: pequeño carroñero curioso. */
export function buildCompy(): DinoRig {
  return buildTheropod(0.13, { base: '#7f8a3a', belly: '#d8cf98', back: '#3f4a20', stripes: 10, stripeStrength: 0.6, stripeColor: '#2e3a18' }, false);
}

/** Kiro: un dinosaurio pequeño y curioso, del tamaño de un perro, con tonos cálidos. */
export function buildKiro(): DinoRig {
  return buildTheropod(0.2, { base: '#c27a3a', belly: '#f1dcb0', back: '#6b3f22', stripes: 8, stripeStrength: 0.45, stripeColor: '#4a2a16' }, false);
}

import * as THREE from 'three';
import { fbm, rng, smoothstep } from '../core/math';
import type { Terrain } from './Terrain';

/**
 * Volcán activo dentro de la isla (al oeste), con un lago de lava en el cráter y
 * ríos de lava que bajan por las laderas. La lava quema: si la pisas pierdes salud
 * muy rápido. Para cruzar los ríos de lava hay troncos caídos (ver Bridges.ts).
 *
 * Todo es analítico (sin aleatoriedad): la forma del volcán y de los ríos es la misma
 * para todos los jugadores (también en las salas de amigos).
 */
export const VOLCANO = { x: -205, z: -60, R: 88, H: 62, crater: 11 };

/** Ríos de lava: ángulo de salida (0 = este, hacia el centro de la isla) y dónde terminan. */
const FLOWS = [
  { a: -0.55, end: 84, k: 0 },
  { a: 0.25, end: 68, k: 1 },
  { a: 1.05, end: 78, k: 2 },
];
const START = 9.5;

/** Ángulo del centro del río k a la distancia r del cráter (serpentea un poco). */
export function flowTheta(k: number, r: number) {
  const f = FLOWS[k];
  return f.a + 0.2 * Math.sin(r * 0.055 + k * 2.1) + 0.07 * Math.sin(r * 0.16 + k);
}
/** Medio ancho del río de lava (se ensancha al bajar). */
export const flowHalfWidth = (r: number) => 1.7 + r * 0.02;
export const flowCount = FLOWS.length;
export const flowEnd = (k: number) => FLOWS[k].end;
/** Punto del centro del río k a la distancia r. */
export function flowPoint(k: number, r: number) {
  const t = flowTheta(k, r);
  return { x: VOLCANO.x + Math.cos(t) * r, z: VOLCANO.z + Math.sin(t) * r, theta: t };
}
const POOL_R = 5.5;

const wrap = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/**
 * Distancia (m) al borde de la lava más cercana: negativa dentro de la lava.
 * Devuelve también el río (k) y el lado, para empujar hacia fuera.
 */
export function lavaDistance(x: number, z: number) {
  const dx = x - VOLCANO.x, dz = z - VOLCANO.z;
  const r = Math.hypot(dx, dz);
  let best = Infinity, side = 0, kk = -1;
  if (r > 110) return { d: r - 100, side, k: kk };
  // Lago del cráter
  const dc = r - (START - 0.3);
  if (dc < best) { best = dc; kk = -1; }
  const th = Math.atan2(dz, dx);
  for (let k = 0; k < FLOWS.length; k++) {
    const end = FLOWS[k].end;
    if (r >= START - 1 && r <= end) {
      const dth = wrap(th - flowTheta(k, r));
      const d = Math.abs(dth) * r - flowHalfWidth(r);
      if (d < best) { best = d; side = Math.sign(dth) || 1; kk = k; }
    }
    // Charco al final del río
    const p = flowPoint(k, end);
    const dp = Math.hypot(x - p.x, z - p.z) - POOL_R;
    if (dp < best) { best = dp; side = 0; kk = k; }
  }
  return { d: best, side, k: kk };
}

/** 1 en plena lava, 0 fuera. */
export const lavaAt = (x: number, z: number) => {
  const d = lavaDistance(x, z).d;
  return d >= 0 ? 0 : Math.min(1, -d / 1.2);
};

/** 0..1: cuánto pertenece este punto a las laderas de roca volcánica (sin selva). */
export function volcanicAt(x: number, z: number) {
  const d = Math.hypot(x - VOLCANO.x, z - VOLCANO.z);
  return 1 - smoothstep(VOLCANO.R * 0.55, VOLCANO.R * 0.95, d + fbm(x * 0.03, z * 0.03, 2) * 12);
}

/** Suma el volcán (cono, cráter y cauces de lava) a la altura del terreno. */
export function volcanoHeight(x: number, z: number, h: number) {
  const { x: vx, z: vz, R, H, crater } = VOLCANO;
  const d = Math.hypot(x - vx, z - vz);
  if (d > R * 1.15) return h;
  const a = Math.atan2(z - vz, x - vx);
  // Cono con barrancos (ruido según el ángulo) y base suave.
  const ridges = 1 + fbm(Math.cos(a) * 3 + 11, Math.sin(a) * 3 + d * 0.02, 3) * 0.12;
  const t = Math.max(0, 1 - d / R);
  let add = H * Math.pow(t, 1.45) * ridges;
  add *= smoothstep(0, 0.12, t) * 0.4 + 0.6;
  // Cráter: hoyo en la cima con un borde algo levantado.
  if (d < crater * 1.6) {
    const c = d / crater;
    add -= 10 * Math.max(0, 1 - c * c) - 1.2 * Math.exp(-(c - 1) * (c - 1) * 6);
  }
  let out = Math.max(h, h * 0.35 + add + 4 * t);
  // Cauces: un surco donde corre la lava (los bordes quedan un poco más altos).
  const ld = lavaDistance(x, z);
  if (ld.k >= 0 && ld.d < 1.5) out -= 1.3 * smoothstep(1.5, -1.2, ld.d);
  return out;
}

/** Textura de lava: costra oscura con grietas brillantes (se desplaza para que parezca que fluye). */
function lavaTexture() {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    // Ruido que se repite sin cortes (toroidal)
    const u = (x / S) * Math.PI * 2, v = (y / S) * Math.PI * 2;
    const n = fbm(Math.cos(u) * 2 + 5, Math.sin(u) * 2 + Math.cos(v) * 2.2 + Math.sin(v) * 1.3, 5);
    const n2 = fbm(Math.cos(u) * 4 + 9, Math.sin(v) * 4 + Math.cos(v) * 3 + Math.sin(u), 3);
    const vein = Math.pow(1 - Math.min(1, Math.abs(n) * 5.5), 3);
    const hot = Math.max(vein, smoothstep(0.1, 0.5, n2) * 0.75);
    const i = (y * S + x) * 4;
    img.data[i] = 70 + hot * 185;
    img.data[i + 1] = 12 + hot * hot * 170;
    img.data[i + 2] = 4 + Math.pow(hot, 4) * 60;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

function smokeTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = rng(5);
  for (let i = 0; i < 14; i++) {
    const x = 18 + r() * 28, y = 18 + r() * 28, rad = 10 + r() * 14;
    const grd = g.createRadialGradient(x, y, 0, x, y, rad);
    grd.addColorStop(0, 'rgba(255,255,255,0.35)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Puff { sp: THREE.Sprite; t: number; life: number; drift: number }

/** Lo que se ve del volcán: lava (cráter, ríos y charcos), humo, chispas y resplandor. */
export class Volcano {
  readonly group = new THREE.Group();
  private readonly lavaTex: THREE.Texture;
  private readonly puffs: Puff[] = [];
  private readonly embers: THREE.Points;
  private readonly emberBase: Float32Array;
  private readonly lights: THREE.PointLight[] = [];
  private time = 0;

  constructor(private readonly terrain: Terrain, withLights: boolean) {
    this.group.name = 'volcano';
    this.lavaTex = lavaTexture();
    // Sin niebla: la lava brilla y se ve de lejos, sobre todo de noche.
    const mat = new THREE.MeshBasicMaterial({ map: this.lavaTex, toneMapped: false, fog: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    mat.color.setScalar(1.35);

    // Ríos de lava: cintas pegadas al terreno a lo largo de cada cauce.
    for (let k = 0; k < FLOWS.length; k++) {
      const pos: number[] = [], uv: number[] = [], idx: number[] = [];
      const across = 7, step = 0.8;
      let row = 0;
      for (let r = START - 1; r <= FLOWS[k].end + 0.01; r += step, row++) {
        const p = flowPoint(k, r), hw = flowHalfWidth(r) + 0.4;
        const sx = -Math.sin(p.theta), sz = Math.cos(p.theta);
        for (let i = 0; i < across; i++) {
          const s = (i / (across - 1)) * 2 - 1;
          const x = p.x + sx * s * hw, z = p.z + sz * s * hw;
          pos.push(x, terrain.heightAt(x, z) + 0.1, z);
          uv.push(i / (across - 1) * 0.6, r / 7);
        }
        if (row > 0) for (let i = 0; i < across - 1; i++) {
          const a = (row - 1) * across + i, b = a + 1, c = a + across, d = c + 1;
          idx.push(a, c, b, b, c, d);
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
      geo.setIndex(idx);
      const m = new THREE.Mesh(geo, mat);
      m.name = 'lava-river';
      this.group.add(m);
      // Charco donde termina el río
      this.group.add(this.disc(flowPoint(k, FLOWS[k].end), POOL_R + 0.4, mat, false));
      // Resplandor naranja a media bajada
      if (withLights) {
        const mid = flowPoint(k, FLOWS[k].end * 0.55);
        const l = new THREE.PointLight('#ff6a1a', 0, 30, 1.6);
        l.position.set(mid.x, terrain.heightAt(mid.x, mid.z) + 3, mid.z);
        this.group.add(l);
        this.lights.push(l);
      }
    }
    // Lago de lava del cráter (plano)
    this.group.add(this.disc({ x: VOLCANO.x, z: VOLCANO.z }, START + 0.6, mat, true));
    if (withLights) {
      const l = new THREE.PointLight('#ff5a10', 0, 60, 1.4);
      l.position.set(VOLCANO.x, terrain.heightAt(VOLCANO.x, VOLCANO.z) + 8, VOLCANO.z);
      this.group.add(l);
      this.lights.push(l);
    }

    // Humo que sale del cráter (sube, crece y se desvanece)
    const smoke = smokeTexture();
    const top = terrain.heightAt(VOLCANO.x, VOLCANO.z);
    for (let i = 0; i < 14; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: smoke, color: '#5a514d', transparent: true, depthWrite: false, opacity: 0 }));
      sp.position.set(VOLCANO.x, top, VOLCANO.z);
      this.group.add(sp);
      this.puffs.push({ sp, t: (i / 14) * 18, life: 18, drift: (i % 3) - 1 });
    }

    // Chispas que saltan de la lava
    const N = 120;
    this.emberBase = new Float32Array(N * 4);
    const ep = new Float32Array(N * 3);
    const r = rng(77);
    for (let i = 0; i < N; i++) {
      let x: number, z: number;
      if (i < 40) { const a = r() * Math.PI * 2, d = r() * START; x = VOLCANO.x + Math.cos(a) * d; z = VOLCANO.z + Math.sin(a) * d; }
      else { const k = i % FLOWS.length, p = flowPoint(k, START + r() * (FLOWS[k].end - START)); x = p.x; z = p.z; }
      this.emberBase.set([x, terrain.heightAt(x, z), z, r()], i * 4);
      ep.set([x, 0, z], i * 3);
    }
    const eg = new THREE.BufferGeometry();
    eg.setAttribute('position', new THREE.BufferAttribute(ep, 3));
    this.embers = new THREE.Points(eg, new THREE.PointsMaterial({ color: '#ffb347', size: 0.35, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, toneMapped: false }));
    this.embers.frustumCulled = false;
    this.group.add(this.embers);
  }

  /** Disco de lava pegado al terreno (o plano, para el lago del cráter). */
  private disc(c: { x: number; z: number }, radius: number, mat: THREE.Material, flat: boolean) {
    const geo = new THREE.CircleGeometry(radius, 28, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const flatY = this.terrain.heightAt(c.x, c.z) + 1.2;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i) + c.x, z = pos.getZ(i) + c.z;
      pos.setXYZ(i, x, flat ? flatY : this.terrain.heightAt(x, z) + 0.12, z);
    }
    geo.computeBoundingSphere();
    const m = new THREE.Mesh(geo, mat);
    m.name = flat ? 'lava-crater' : 'lava-pool';
    return m;
  }

  update(dt: number, daylight: number, playerNear: boolean) {
    this.time += dt;
    // La lava fluye cuesta abajo.
    this.lavaTex.offset.y -= dt * 0.045;
    this.lavaTex.offset.x = Math.sin(this.time * 0.2) * 0.02;
    const glow = 1.5 + (1 - daylight) * 3.5;
    for (const [i, l] of this.lights.entries()) l.intensity = glow * (i === this.lights.length - 1 ? 2.2 : 1) * (0.85 + Math.sin(this.time * 3 + i) * 0.15);
    const top = this.terrain.heightAt(VOLCANO.x, VOLCANO.z);
    for (const p of this.puffs) {
      p.t = (p.t + dt) % p.life;
      const k = p.t / p.life;
      p.sp.position.set(VOLCANO.x + p.drift * k * 12 + k * k * 25, top + 4 + k * 70, VOLCANO.z + p.drift * k * 6);
      p.sp.scale.setScalar(8 + k * 45);
      const m = p.sp.material as THREE.SpriteMaterial;
      m.opacity = Math.min(1, k * 6) * (1 - k) * 0.75;
      // Abajo el humo se ve iluminado por la lava
      m.color.set('#5a514d').lerp(new THREE.Color('#c0502a'), (1 - k) * (0.25 + (1 - daylight) * 0.35));
    }
    this.embers.visible = playerNear;
    if (playerNear) {
      const pos = this.embers.geometry.attributes.position as THREE.BufferAttribute;
      const b = this.emberBase;
      for (let i = 0; i < pos.count; i++) {
        const ph = (b[i * 4 + 3] + this.time * 0.35) % 1;
        pos.setXYZ(i, b[i * 4] + Math.sin(ph * 9 + i) * 0.6, b[i * 4 + 1] + ph * 5, b[i * 4 + 2] + Math.cos(ph * 7 + i) * 0.6);
      }
      pos.needsUpdate = true;
      (this.embers.material as THREE.PointsMaterial).opacity = 0.5 + (1 - daylight) * 0.5;
    }
  }
}

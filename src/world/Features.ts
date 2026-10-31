import * as THREE from 'three';
import { fbm, lerp, rng, smoothstep } from '../core/math';
import type { Terrain } from './Terrain';
import { WATER_LEVEL } from './config';

/**
 * Lugares especiales del terreno:
 * - Charcas de agua limpia repartidas por la isla (más sitios para beber).
 * - Pantanos de brea: negros, brillantes y pegajosos; te hacen avanzar muy despacio
 *   y hay dinosaurios atrapados en ellos (sin heridas: solo están atascados).
 * Todo es fijo (igual para todos los jugadores).
 */
export const PONDS: [number, number, number][] = [
  [-60, -105, 9], [115, -205, 10], [-95, 215, 9], [205, 35, 8],
  [-25, 165, 7], [165, -55, 8], [45, -150, 8], [-160, 130, 8], [120, 120, 7],
];
export const TAR_PITS: [number, number, number][] = [
  [-118, -128, 17], [-150, 35, 13], [150, 45, 12],
];

const wobble = (x: number, z: number) => 1 + fbm(x * 0.06, z * 0.06, 2) * 0.22;

/** Excava charcas (por debajo del nivel del agua) y pozos de brea (por encima). */
export function featuresHeight(x: number, z: number, h: number) {
  for (const [px, pz, r] of PONDS) {
    const d = Math.hypot(x - px, z - pz) / (r * wobble(x, z));
    if (d < 1.4) h = lerp(WATER_LEVEL - 1.3, h, smoothstep(0.45, 1.3, d));
  }
  for (const [tx, tz, r] of TAR_PITS) {
    const d = Math.hypot(x - tx, z - tz) / (r * wobble(x + 50, z));
    if (d < 1.5) h -= 1.1 * (1 - smoothstep(0.55, 1.15, d));
  }
  return h;
}

/** 0..1: cuánto estás dentro de la brea. */
export function tarAt(x: number, z: number) {
  let v = 0;
  for (const [tx, tz, r] of TAR_PITS) {
    const d = Math.hypot(x - tx, z - tz) / (r * wobble(x + 50, z));
    if (d < 0.9) v = Math.max(v, Math.min(1, (0.9 - d) / 0.2));
  }
  return v;
}

/** Para el color del terreno: 1 en la orilla manchada de brea. */
export function tarStain(x: number, z: number) {
  let v = 0;
  for (const [tx, tz, r] of TAR_PITS) {
    const d = Math.hypot(x - tx, z - tz) / (r * wobble(x + 50, z));
    v = Math.max(v, 1 - smoothstep(0.8, 1.35, d));
  }
  return v;
}

interface Bubble { m: THREE.Mesh; x: number; z: number; y: number; t: number; life: number; size: number }

/** Superficie de brea brillante con burbujas que suben y revientan. */
export class TarPits {
  readonly group = new THREE.Group();
  private readonly bubbles: Bubble[] = [];
  /** Altura de la superficie de cada pozo (para hundir a los dinosaurios atrapados). */
  readonly surface: number[] = [];

  constructor(terrain: Terrain) {
    this.group.name = 'tar-pits';
    const mat = new THREE.MeshStandardMaterial({ color: '#0d0a08', roughness: 0.08, metalness: 0.35, envMapIntensity: 1.2 });
    const bmat = new THREE.MeshStandardMaterial({ color: '#15100c', roughness: 0.05, metalness: 0.4 });
    const r = rng(31);
    for (const [tx, tz, rad] of TAR_PITS) {
      // Nivel: un poco por debajo de la orilla.
      let rim = 0;
      for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; rim += terrain.heightAt(tx + Math.cos(a) * rad * 0.95, tz + Math.sin(a) * rad * 0.95); }
      const y = rim / 12 - 0.45;
      this.surface.push(y);
      const geo = new THREE.CircleGeometry(rad * 1.05, 40);
      geo.rotateX(-Math.PI / 2);
      const m = new THREE.Mesh(geo, mat);
      m.position.set(tx, y, tz);
      m.receiveShadow = true;
      m.name = 'tar';
      this.group.add(m);
      for (let i = 0; i < 7; i++) {
        const b = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), bmat);
        const a = r() * Math.PI * 2, d = r() * rad * 0.75;
        const bb: Bubble = { m: b, x: tx + Math.cos(a) * d, z: tz + Math.sin(a) * d, y, t: r() * 4, life: 2.5 + r() * 2.5, size: 0.25 + r() * 0.5 };
        b.position.set(bb.x, y, bb.z);
        this.group.add(b);
        this.bubbles.push(bb);
      }
    }
  }

  update(dt: number) {
    for (const b of this.bubbles) {
      b.t += dt;
      if (b.t > b.life) b.t = 0;
      // Crece despacio como una cúpula y, al final, revienta.
      const k = b.t / b.life;
      const s = k < 0.9 ? b.size * Math.sqrt(k / 0.9) : 0.001;
      b.m.scale.set(s, s * 0.7, s);
      b.m.position.y = b.y;
    }
  }
}

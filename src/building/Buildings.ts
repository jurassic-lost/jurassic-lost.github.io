import * as THREE from 'three';
import { CollisionWorld, Collider } from '../core/Collision';
import { merge, part, vertexColorMaterial } from '../core/geometry';
import { Terrain, sampleSlope } from '../world/Terrain';
import { PLAY_LIMIT } from '../world/config';
import type { Construction } from '../profile/types';

/** Segundos que tarda en levantarse un refugio. */
export const BUILD_SECONDS = 4;
const MIN_SPACING = 8;
/** Radio del interior del refugio (a salvo de los dinosaurios). */
export const SHELTER_RADIUS = 2.1;

/**
 * Piezas del refugio en el orden en que se construyen. Es una cabaña en "A"
 * de troncos atados con fibra, techo de hojas, cama de hojas y una fogata.
 */
function shelterParts(): THREE.BufferGeometry[][] {
  const log = '#7a5230', logDark = '#5e3e22', rope = '#c9b27a';
  const leaf = ['#3f8a37', '#4c9a40', '#367a31', '#5aa647'];
  const W = 1.55, L = 2.6, H = 2.15, tilt = Math.atan2(W, H);
  const stages: THREE.BufferGeometry[][] = [];
  // 1. Marcos en A delante y detrás + viga.
  const frames: THREE.BufferGeometry[] = [];
  for (const z of [-L / 2, L / 2]) {
    for (const sx of [-1, 1]) {
      frames.push(part(new THREE.CylinderGeometry(0.07, 0.09, Math.hypot(W, H) + 0.35, 6), sx < 0 ? log : logDark,
        { rot: [0, 0, sx * tilt], pos: [sx * W / 2, H / 2 + 0.08, z] }));
    }
    frames.push(part(new THREE.TorusGeometry(0.1, 0.03, 4, 8), rope, { rot: [Math.PI / 2, 0, 0], pos: [0, H, z] }));
  }
  frames.push(part(new THREE.CylinderGeometry(0.07, 0.07, L + 0.6, 6), log, { rot: [Math.PI / 2, 0, 0], pos: [0, H + 0.02, 0] }));
  stages.push(frames);
  // 2. Travesaños laterales.
  const bars: THREE.BufferGeometry[] = [];
  for (const sx of [-1, 1]) for (const k of [0.3, 0.62]) {
    bars.push(part(new THREE.CylinderGeometry(0.045, 0.045, L + 0.3, 5), logDark,
      { rot: [Math.PI / 2, 0, 0], pos: [sx * W * (1 - k) * 0.98, H * k + 0.05, 0] }));
  }
  stages.push(bars);
  // 3-4. Techo de hojas de palmera en dos capas: tiras largas solapadas, con tonos y giros variados.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const slope = Math.hypot(W, H);
  for (const layer of [0, 1]) {
    const roof: THREE.BufferGeometry[] = [];
    for (const sx of [-1, 1]) for (let row = 0; row < 4; row++) for (let i = 0; i < 11; i++) {
      if ((row + i) % 2 !== layer) continue;
      const k = 0.08 + row * 0.24 + rnd() * 0.04;
      const z = -L / 2 - 0.15 + (i + 0.5) * ((L + 0.3) / 11);
      const c = new THREE.Color(leaf[Math.floor(rnd() * 4)]).offsetHSL((rnd() - 0.5) * 0.04, 0, (rnd() - 0.5) * 0.08);
      // Cada hoja: tira que baja por la pendiente, un poco más ancha en el centro.
      const len = slope * 0.36, wid = 0.2 + rnd() * 0.08;
      const g = new THREE.CylinderGeometry(wid / 2, wid / 2, len, 4, 1);
      g.scale(0.14, 1, 1);
      roof.push(part(g, c, {
        rot: [rnd() * 0.12 - 0.06, (rnd() - 0.5) * 0.25, -sx * (Math.PI / 2 - tilt) + sx * Math.PI / 2 + (rnd() - 0.5) * 0.08],
        pos: [sx * (W * (1 - k) + 0.07 + layer * 0.03), H * k + 0.04 + layer * 0.02, z],
      }));
    }
    stages.push(roof);
  }
  // 5. Pared trasera de hojas, cama de hojas y fogata.
  const inside: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const x = (i - 2) * 0.28;
    inside.push(part(new THREE.BoxGeometry(0.3, H * (1 - Math.abs(x) / W) * 0.95, 0.04), leaf[i % 4], { pos: [x, H * (1 - Math.abs(x) / W) * 0.47, -L / 2 + 0.02] }));
  }
  inside.push(part(new THREE.BoxGeometry(1.1, 0.12, 1.9), '#6f8f3a', { pos: [0, 0.06, -0.15] }));
  inside.push(part(new THREE.BoxGeometry(1.0, 0.06, 1.8), '#8aa84a', { pos: [0, 0.14, -0.15] }));
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    inside.push(part(new THREE.DodecahedronGeometry(0.12, 0), '#8b877c', { scale: [1, 0.7, 1], pos: [Math.cos(a) * 0.42, 0.06, L / 2 + 1.1 + Math.sin(a) * 0.42] }));
  }
  for (let i = 0; i < 3; i++) {
    const a = (i / 3) * Math.PI;
    inside.push(part(new THREE.CylinderGeometry(0.05, 0.06, 0.7, 5), logDark, { rot: [0, a, Math.PI / 2 - 0.25], pos: [0, 0.13, L / 2 + 1.1] }));
  }
  stages.push(inside);
  return stages;
}

let STAGES: THREE.BufferGeometry[] | null = null;
const stageGeos = () => (STAGES ??= shelterParts().map((p) => merge(p)));

class Shelter {
  readonly root = new THREE.Group();
  private readonly pieces: THREE.Mesh[] = [];
  readonly flame: THREE.Mesh;
  readonly colliders: Collider[] = [];

  constructor(readonly data: Construction, terrain: Terrain, collisions: CollisionWorld) {
    const [x, , z] = data.pos;
    this.root.position.set(x, terrain.heightAt(x, z) - 0.05, z);
    this.root.rotation.y = data.rotation;
    for (const g of stageGeos()) {
      const m = new THREE.Mesh(g, vertexColorMaterial);
      m.castShadow = true; m.receiveShadow = true;
      this.pieces.push(m);
      this.root.add(m);
    }
    // Llamas de la fogata (solo cuando el refugio está terminado).
    this.flame = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.6, 7, 1, true),
      new THREE.MeshBasicMaterial({ color: '#ffb347', transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.flame.position.set(0, 0.4, 1.3 + 1.1);
    this.root.add(this.flame);
    // Solo bloquean los postes: se puede entrar por delante.
    const c = Math.cos(data.rotation), s = Math.sin(data.rotation);
    for (const [lx, lz] of [[-1.45, -1.3], [1.45, -1.3], [-1.45, 1.3], [1.45, 1.3]]) {
      this.colliders.push(collisions.add({ x: x + lx * c + lz * s, z: z - lx * s + lz * c, r: 0.18, top: this.root.position.y + 2.2, active: true }));
    }
    this.setProgress(data.state === 'building' ? 0 : 1);
  }

  get position() { return this.root.position; }
  get built() { return this.data.state !== 'building'; }

  /** Muestra las piezas que ya están puestas (0 → 1); la última crece desde el suelo. */
  setProgress(p: number) {
    const n = this.pieces.length;
    this.pieces.forEach((m, i) => {
      const k = THREE.MathUtils.clamp(p * n - i, 0, 1);
      m.visible = k > 0;
      m.scale.set(1, Math.max(0.01, k < 1 ? 0.3 + k * 0.7 : 1), 1);
    });
    this.flame.visible = p >= 1;
  }

  /** Centro del interior, delante de la cama, en coordenadas del mundo. */
  inside(out = new THREE.Vector3()) { return out.set(0, 0, 0.2).applyMatrix4(this.root.matrixWorld); }
}

/**
 * Construcciones del jugador: vista previa para colocar, obra en curso,
 * refugios terminados (con su fogata) y exportación para la partida guardada.
 */
export class Buildings {
  readonly group = new THREE.Group();
  readonly shelters: Shelter[] = [];
  private readonly ghost: THREE.Group;
  private readonly ghostMat = new THREE.MeshBasicMaterial({ color: '#7dff8a', transparent: true, opacity: 0.38, depthWrite: false });
  private readonly fireLight = new THREE.PointLight('#ffae5c', 0, 14, 1.6);
  placing = false;
  valid = false;
  private readonly ghostPos = new THREE.Vector3();
  private ghostRot = 0;
  /** Refugio en obra (el jugador está construyéndolo). */
  building: Shelter | null = null;
  private buildT = 0;
  private time = 0;
  onBuilt?: (s: Shelter) => void;

  constructor(private readonly terrain: Terrain, private readonly collisions: CollisionWorld) {
    this.group.name = 'buildings';
    this.ghost = new THREE.Group();
    for (const g of stageGeos()) this.ghost.add(new THREE.Mesh(g, this.ghostMat));
    this.ghost.visible = false;
    this.group.add(this.ghost, this.fireLight);
  }

  startPlacing() { this.placing = true; this.ghost.visible = true; }
  cancelPlacing() { this.placing = false; this.ghost.visible = false; }

  /** Comprueba si cabe un refugio en (x, z): en seco, llano, sin obstáculos ni otros refugios. */
  canPlace(x: number, z: number) {
    if (Math.abs(x) > PLAY_LIMIT - 6 || Math.abs(z) > PLAY_LIMIT - 6) return false;
    if (this.terrain.waterDepthAt(x, z) > 0 || this.terrain.heightAt(x, z) < 0.4) return false;
    for (const [ox, oz] of [[0, 0], [1.2, 0], [-1.2, 0], [0, 1.6], [0, -1.6], [0, 2.6]]) if (sampleSlope(x + ox, z + oz) > 0.45) return false;
    if (this.shelters.some((s) => Math.hypot(s.position.x - x, s.position.z - z) < MIN_SPACING)) return false;
    return !this.collisions.blocked(x, z, 2.0);
  }

  /** Coloca la vista previa delante del jugador, con la entrada mirándole. */
  updateGhost(player: THREE.Vector3, facing: number) {
    const x = player.x + Math.sin(facing) * 3.6, z = player.z + Math.cos(facing) * 3.6;
    this.ghostPos.set(x, this.terrain.heightAt(x, z) - 0.05, z);
    this.ghostRot = facing + Math.PI;
    this.ghost.position.copy(this.ghostPos);
    this.ghost.rotation.y = this.ghostRot;
    this.valid = this.canPlace(x, z);
    this.ghostMat.color.set(this.valid ? '#7dff8a' : '#ff6b6b');
  }

  /** Empieza la obra donde está la vista previa. */
  place(): Shelter | null {
    if (!this.placing || !this.valid) return null;
    this.cancelPlacing();
    const data: Construction = {
      id: 'c_' + Math.random().toString(36).slice(2, 10), type: 'shelter',
      pos: [this.ghostPos.x, this.ghostPos.y, this.ghostPos.z], rotation: this.ghostRot, state: 'building', storage: {},
    };
    const s = this.add(data);
    this.building = s;
    this.buildT = 0;
    return s;
  }

  private add(data: Construction) {
    const s = new Shelter(data, this.terrain, this.collisions);
    this.shelters.push(s);
    this.group.add(s.root);
    s.root.updateMatrixWorld(true);
    return s;
  }

  /** Avanza la obra y anima las fogatas. `night` enciende la luz del fuego. */
  update(dt: number, player: THREE.Vector3, daylight: number) {
    this.time += dt;
    if (this.building) {
      this.buildT += dt / BUILD_SECONDS;
      this.building.setProgress(Math.min(1, this.buildT));
      if (this.buildT >= 1) {
        const s = this.building;
        s.data.state = 'built';
        this.building = null;
        this.onBuilt?.(s);
      }
    }
    // La luz del fuego acompaña a la fogata más cercana (una sola luz para todo el mapa).
    const near = this.nearest(player, 40, true);
    const fire = 0.85 + Math.sin(this.time * 13) * 0.08 + Math.sin(this.time * 7.3) * 0.07;
    for (const s of this.shelters) if (s.flame.visible) {
      s.flame.scale.set(1, fire, 1);
      (s.flame.material as THREE.MeshBasicMaterial).opacity = 0.75 + (fire - 0.85) * 1.5;
    }
    if (near) {
      near.flame.getWorldPosition(this.fireLight.position);
      this.fireLight.position.y += 0.3;
      this.fireLight.intensity = (2 + (1 - daylight) * 10) * fire;
    } else this.fireLight.intensity = 0;
  }

  nearest(p: THREE.Vector3, maxDist: number, builtOnly = false): Shelter | null {
    let best: Shelter | null = null, bd = maxDist;
    for (const s of this.shelters) {
      if (builtOnly && !s.built) continue;
      const d = Math.hypot(s.position.x - p.x, s.position.z - p.z);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }

  /** ¿Está el jugador dentro de un refugio terminado? */
  insideShelter(p: THREE.Vector3): Shelter | null {
    const v = new THREE.Vector3();
    for (const s of this.shelters) if (s.built && s.inside(v).setY(p.y).distanceTo(p) < SHELTER_RADIUS) return s;
    return null;
  }

  export(): Construction[] { return this.shelters.map((s) => structuredClone(s.data)); }

  /** Restaura los refugios guardados (una obra a medias se da por terminada). */
  import(list: Construction[]) {
    for (const c of list ?? []) {
      if (c?.type !== 'shelter' || !Array.isArray(c.pos) || !c.pos.every(Number.isFinite)) continue;
      this.add({ ...c, state: 'built', rotation: Number.isFinite(c.rotation) ? c.rotation : 0 });
    }
  }
}
export type { Shelter };

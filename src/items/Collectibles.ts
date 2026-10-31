import * as THREE from 'three';
import { rng } from '../core/math';
import { CollisionWorld } from '../core/Collision';
import { jitter, merge, part, vertexColorMaterial } from '../core/geometry';
import { Terrain, riverX, sampleSlope } from '../world/Terrain';
import { lavaDistance } from '../world/Volcano';
import { tarStain } from '../world/Features';
import { CLEARING, PLAY_LIMIT, SPAWN, WATER_LEVEL } from '../world/config';
import { berryBush, mats } from '../world/vegetationModels';
import { ItemId } from './items';

interface Pickup {
  type: ItemId;
  mesh: THREE.InstancedMesh;
  index: number;
  matrix: THREE.Matrix4;
  pos: THREE.Vector3;
  available: boolean;
  respawnAt: number;
}

const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);
const RESPAWN_SECONDS = 150;

function stoneGeo() {
  return merge([part(jitter(new THREE.DodecahedronGeometry(0.22, 0), 0.05, 77), '#9b978c', { scale: [1.2, 0.75, 1], pos: [0, 0.12, 0] })]);
}
function woodGeo() {
  return merge([
    part(new THREE.CylinderGeometry(0.07, 0.09, 1.2, 6), '#7a5230', { rot: [0, 0, Math.PI / 2], pos: [0, 0.09, 0] }),
    part(new THREE.CylinderGeometry(0.05, 0.06, 0.5, 5), '#6a4526', { rot: [0, 0.6, Math.PI / 2.4], pos: [0.2, 0.15, 0.12] }),
    part(new THREE.ConeGeometry(0.1, 0.2, 3), '#5f9a3a', { pos: [-0.45, 0.16, 0.05] }),
  ]);
}
function fiberGeo() {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 6; i++) {
    parts.push(part(new THREE.BoxGeometry(0.06, 0.015, 0.9), i % 2 ? '#7aa83e' : '#94b850', { rot: [0, (i - 2.5) * 0.18, 0], pos: [(i - 2.5) * 0.05, 0.03 + i * 0.01, 0] }));
  }
  parts.push(part(new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6), '#8a6a3a', { rot: [Math.PI / 2, 0, 0], pos: [0, 0.06, 0] }));
  return merge(parts);
}
function leavesGeo() {
  // Montoncito de hojas anchas caídas, con su nervio central.
  const parts: THREE.BufferGeometry[] = [];
  const cols = ['#3f8f3a', '#4fa046', '#5aa83e', '#3a7f36'];
  for (let i = 0; i < 4; i++) {
    const a = i * 1.7;
    const leaf = new THREE.CircleGeometry(0.22, 7);
    parts.push(part(leaf, cols[i], { scale: [0.55, 1.6, 1], rot: [-Math.PI / 2 + 0.12, 0, a], pos: [Math.cos(a) * 0.12, 0.04 + i * 0.025, Math.sin(a) * 0.12] }));
    parts.push(part(new THREE.BoxGeometry(0.015, 0.012, 0.62), '#c9dc8a', { rot: [0, -a + Math.PI / 2, 0], pos: [Math.cos(a) * 0.12, 0.05 + i * 0.025, Math.sin(a) * 0.12] }));
  }
  return merge(parts);
}
function berriesGeo() {
  const parts: THREE.BufferGeometry[] = [];
  const pts = [[0.5, 0.9, 0.5], [-0.6, 1.0, 0.3], [0.2, 1.25, -0.5], [-0.3, 0.7, -0.75], [0.75, 0.6, -0.3], [0, 1.35, 0.4]];
  for (const [x, y, z] of pts) parts.push(part(new THREE.IcosahedronGeometry(0.12, 0), '#d6304f', { pos: [x, y, z] }));
  return merge(parts);
}

/**
 * Recursos repartidos por el mapa. Al recogerlos desaparecen (instancia a escala 0)
 * y reaparecen pasado un tiempo para que nunca se agoten.
 */
export class Collectibles {
  readonly group = new THREE.Group();
  private readonly pickups: Pickup[] = [];
  private readonly highlight: THREE.Mesh;
  private time = 0;

  constructor(terrain: Terrain, collisions: CollisionWorld) {
    this.group.name = 'collectibles';
    const rand = rng(4242);
    const bushes = new THREE.InstancedMesh(berryBush(), mats().leafBush, 140);
    bushes.castShadow = true;
    const kinds: { type: ItemId; geo: THREE.BufferGeometry; count: number; nearSpawn: number }[] = [
      { type: 'wood', geo: woodGeo(), count: 260, nearSpawn: 10 },
      { type: 'stone', geo: stoneGeo(), count: 260, nearSpawn: 10 },
      { type: 'berries', geo: berriesGeo(), count: 140, nearSpawn: 3 },
      { type: 'fiber', geo: fiberGeo(), count: 220, nearSpawn: 8 },
      { type: 'leaves', geo: leavesGeo(), count: 220, nearSpawn: 8 },
    ];
    const q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0), s = new THREE.Vector3(1, 1, 1);
    for (const k of kinds) {
      const mesh = new THREE.InstancedMesh(k.geo, vertexColorMaterial, k.count);
      mesh.castShadow = k.type !== 'stone';
      mesh.name = k.type;
      let placed = 0, tries = 0;
      while (placed < k.count && tries++ < k.count * 30) {
        // Algunos cerca del claro inicial para que el jugador empiece enseguida.
        const near = placed < k.nearSpawn;
        const x = near ? CLEARING.x + (rand() * 2 - 1) * 40 : (rand() * 2 - 1) * (PLAY_LIMIT - 5);
        const z = near ? CLEARING.z + (rand() * 2 - 1) * 40 : (rand() * 2 - 1) * (PLAY_LIMIT - 5);
        const dSpawn = Math.hypot(x - SPAWN.x, z - SPAWN.z);
        if (dSpawn < (k.type === 'berries' ? 14 : 4)) continue;
        const h = terrain.heightAt(x, z);
        if (h < WATER_LEVEL + 0.3 || Math.abs(x - riverX(z)) < 7 || sampleSlope(x, z) > 0.6) continue;
        if (lavaDistance(x, z).d < 3 || tarStain(x, z) > 0.2) continue;
        if (collisions.blocked(x, z, k.type === 'berries' ? 1.2 : 0.5)) continue;
        const pos = new THREE.Vector3(x, h, z);
        q.setFromAxisAngle(up, rand() * Math.PI * 2);
        const matrix = new THREE.Matrix4().compose(pos, q, s);
        mesh.setMatrixAt(placed, matrix);
        if (k.type === 'berries') {
          bushes.setMatrixAt(placed, matrix);
          collisions.add({ x, z, r: 0.9, top: h + 1.2, active: true });
        }
        this.pickups.push({ type: k.type, mesh, index: placed, matrix, pos, available: true, respawnAt: 0 });
        placed++;
      }
      mesh.count = placed;
      if (k.type === 'berries') bushes.count = placed;
      mesh.frustumCulled = false;
      this.group.add(mesh);
    }
    bushes.frustumCulled = false;
    this.group.add(bushes);

    // Anillo luminoso que marca el objeto más cercano.
    this.highlight = new THREE.Mesh(
      new THREE.RingGeometry(0.45, 0.6, 24),
      new THREE.MeshBasicMaterial({ color: '#ffe066', transparent: true, opacity: 0.85, side: THREE.DoubleSide, depthWrite: false }),
    );
    this.highlight.rotation.x = -Math.PI / 2;
    this.highlight.visible = false;
    this.group.add(this.highlight);
  }

  /** Objeto disponible más cercano dentro del alcance. */
  nearest(p: THREE.Vector3, reach = 2.0): Pickup | null {
    let best: Pickup | null = null, bd = reach;
    for (const k of this.pickups) {
      if (!k.available) continue;
      const r = k.type === 'berries' ? reach + 0.9 : reach;
      const d = Math.hypot(k.pos.x - p.x, k.pos.z - p.z);
      if (d < r && d - (r - reach) < bd) { bd = d - (r - reach); best = k; }
    }
    return best;
  }

  take(p: Pickup) {
    p.available = false;
    p.respawnAt = this.time + RESPAWN_SECONDS;
    p.mesh.setMatrixAt(p.index, HIDDEN);
    p.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt: number, focus: Pickup | null) {
    this.time += dt;
    for (const p of this.pickups) {
      if (!p.available && this.time >= p.respawnAt) {
        p.available = true;
        p.mesh.setMatrixAt(p.index, p.matrix);
        p.mesh.instanceMatrix.needsUpdate = true;
      }
    }
    this.highlight.visible = !!focus;
    if (focus) {
      const sc = focus.type === 'berries' ? 2.4 : 1 + Math.sin(this.time * 5) * 0.08;
      this.highlight.position.set(focus.pos.x, focus.pos.y + 0.06, focus.pos.z);
      this.highlight.scale.setScalar(sc);
    }
  }

  /** Recursos recogidos que aún no han vuelto: [posición en la lista, segundos restantes]. */
  exportDepleted(): [number, number][] {
    const out: [number, number][] = [];
    this.pickups.forEach((p, i) => { if (!p.available) out.push([i, Math.max(0, p.respawnAt - this.time)]); });
    return out;
  }

  importDepleted(list: [number, number][]) {
    for (const [i, left] of list) {
      const p = this.pickups[i];
      if (!p || !Number.isFinite(left)) continue;
      p.available = false;
      p.respawnAt = this.time + Math.min(left, RESPAWN_SECONDS);
      p.mesh.setMatrixAt(p.index, HIDDEN);
      p.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  countAvailable(type: ItemId) { return this.pickups.filter((p) => p.available && p.type === type).length; }
}
export type { Pickup };

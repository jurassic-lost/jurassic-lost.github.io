import * as THREE from 'three';
import { fbm, rng } from '../core/math';
import { CollisionWorld } from '../core/Collision';
import { InstancedChunks } from './InstancedChunks';
import { prop } from './propModels';
import { Terrain, riverX, sampleSlope, trailAt } from './Terrain';
import { lavaDistance, volcanicAt } from './Volcano';
import { tarStain } from './Features';
import { CLEARING, PLAY_LIMIT, WATER_LEVEL } from './config';
import * as M from './vegetationModels';

export interface VegetationDensity {
  /** Multiplicador de la vegetación decorativa (helechos, hierba). */
  decor: number;
}

interface Spec {
  name: string;
  parts: M.ModelPart[];
  count: number;
  scale: [number, number];
  collider?: { r: number; top: number };
  /** Distancia mínima a otros obstáculos. */
  spacing: number;
  /** Preferencia por zonas de bosque denso (1) o abiertas (-1). */
  forest: number;
  tint: number;
  maxSlope: number;
  /** Tronco tumbado: colisión en varios círculos a lo largo de su eje. */
  log?: boolean;
  outsideLimit?: boolean;
}

/** Coloca de forma determinista árboles, plantas y rocas sobre el terreno. */
export class Vegetation {
  readonly group = new THREE.Group();
  private readonly layers: { chunks: InstancedChunks; decor: boolean }[] = [];

  constructor(terrain: Terrain, collisions: CollisionWorld, density: VegetationDensity) {
    this.group.name = 'vegetation';
    const rand = rng(1337);
    const specs: Spec[] = [
      { name: 'giant', parts: M.giantTree(), count: 110, scale: [0.85, 1.25], collider: { r: 1.9, top: 999 }, spacing: 9, forest: 1, tint: 0.15, maxSlope: 0.5, outsideLimit: true },
      { name: 'jungle', parts: M.jungleTree(), count: 1500, scale: [0.75, 1.35], collider: { r: 0.65, top: 999 }, spacing: 3.2, forest: 1, tint: 0.2, maxSlope: 0.75, outsideLimit: true },
      { name: 'conifer', parts: M.conifer(), count: 420, scale: [0.8, 1.3], collider: { r: 1.2, top: 999 }, spacing: 6, forest: 0.6, tint: 0.2, maxSlope: 0.7, outsideLimit: true },
      { name: 'palm', parts: M.palm(), count: 260, scale: [0.8, 1.25], collider: { r: 0.4, top: 999 }, spacing: 3, forest: -0.6, tint: 0.2, maxSlope: 0.45 },
      { name: 'snag', parts: M.snag(), count: 60, scale: [0.8, 1.3], collider: { r: 0.6, top: 999 }, spacing: 4, forest: 0, tint: 0.1, maxSlope: 0.5 },
      { name: 'log', parts: M.log(), count: 90, scale: [0.8, 1.2], collider: { r: 0.75, top: 1.1 }, spacing: 5, forest: 0.4, tint: 0.15, maxSlope: 0.25, log: true },
      { name: 'cycad', parts: M.cycad(), count: 550, scale: [0.7, 1.3], collider: { r: 0.45, top: 999 }, spacing: 2.5, forest: 0, tint: 0.2, maxSlope: 0.6 },
      { name: 'treefern', parts: M.treeFern(), count: 500, scale: [0.8, 1.4], collider: { r: 0.35, top: 999 }, spacing: 2, forest: 0.5, tint: 0.2, maxSlope: 0.7 },
      { name: 'boulderA', parts: prop('boulder') ?? M.boulder(3), count: 190, scale: [0.8, 2.6], collider: { r: 1.15, top: 1.4 }, spacing: 2.5, forest: -0.3, tint: 0.1, maxSlope: 1.4, outsideLimit: true },
      { name: 'boulderB', parts: M.boulder(9), count: 190, scale: [0.6, 1.8], collider: { r: 1.15, top: 1.4 }, spacing: 2.5, forest: -0.3, tint: 0.1, maxSlope: 1.4, outsideLimit: true },
      // Árboles realistas de Poly Haven (CC0): pocos, en claros y orillas (pesan más que los procedurales).
      ...(['islandTree', 'smallTree'] as const).flatMap((n) => {
        const parts = prop(n);
        return parts ? [{ name: n, parts, count: Math.round(28 * density.decor), scale: [1.4, 2.1] as [number, number], collider: { r: 0.5, top: 999 }, spacing: 5, forest: -0.4, tint: 0.12, maxSlope: 0.45 }] : [];
      }),
      { name: 'bush', parts: M.bush(), count: 1100, scale: [0.7, 1.4], spacing: 0, forest: 0.6, tint: 0.25, maxSlope: 0.8 },
      { name: 'fern', parts: M.fern(), count: Math.round(5500 * density.decor), scale: [0.7, 1.6], spacing: 0, forest: 0.3, tint: 0.25, maxSlope: 0.9 },
      // Sotobosque prehistórico: helechos gigantes, hojas anchas y colas de caballo.
      { name: 'giantfern', parts: M.giantFern(), count: Math.round(2200 * density.decor), scale: [0.7, 1.4], spacing: 0, forest: 0.8, tint: 0.25, maxSlope: 0.8 },
      { name: 'broadleaf', parts: M.broadleafPlant(), count: Math.round(1600 * density.decor), scale: [0.8, 1.5], spacing: 0, forest: 0.9, tint: 0.25, maxSlope: 0.7 },
      { name: 'horsetail', parts: M.horsetail(), count: Math.round(1100 * density.decor), scale: [0.8, 1.3], spacing: 0, forest: -0.3, tint: 0.2, maxSlope: 0.5 },
      { name: 'grass', parts: M.grassTuft(), count: Math.round(6000 * density.decor), scale: [0.8, 1.5], spacing: 0, forest: -0.5, tint: 0.2, maxSlope: 0.7 },
    ];

    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3();
    const up = new THREE.Vector3(0, 1, 0), col = new THREE.Color();

    for (const spec of specs) {
      const chunkSet = spec.parts.map((p) => new InstancedChunks(p.geo, p.mat, { castShadow: p.shadow, receiveShadow: true, name: spec.name, chunkSize: spec.collider ? 80 : 64 }));
      const extent = spec.outsideLimit ? PLAY_LIMIT + 25 : PLAY_LIMIT;
      let placed = 0, attempts = 0;
      while (placed < spec.count && attempts < spec.count * 12) {
        attempts++;
        const x = (rand() * 2 - 1) * extent, z = (rand() * 2 - 1) * extent;
        const h = terrain.heightAt(x, z);
        if (h < WATER_LEVEL + 0.4) continue;
        if (Math.abs(x - riverX(z)) < (spec.collider ? 13 : 9)) continue;
        const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
        if (spec.collider && dc < CLEARING.radius && spec.name !== 'boulderA') continue;
        if (sampleSlope(x, z) > spec.maxSlope) continue;
        // Laderas del volcán casi desnudas (solo rocas y algo de hierba), nada en la lava ni en la brea.
        const volc = volcanicAt(x, z);
        if (volc > 0.2 && spec.name !== 'boulderA' && rand() < volc * 1.2) continue;
        if ((volc > 0 || x < -90) && lavaDistance(x, z).d < 3.5) continue;
        if (tarStain(x, z) > 0.2) continue;
        // Los senderos quedan despejados (algo de hierba y helechos en los bordes).
        const tr = trailAt(x, z);
        if (tr > 0.05 && (spec.collider || spec.name === 'bush' || rand() < tr * 1.4)) continue;
        // Zonas de bosque y claros mediante ruido.
        const forestN = fbm(x * 0.012 + 40, z * 0.012 - 20, 3);
        const want = 0.5 + forestN * spec.forest * 1.6;
        if (rand() > want) continue;
        const sc = spec.scale[0] + rand() * (spec.scale[1] - spec.scale[0]);
        const rot = rand() * Math.PI * 2;
        if (spec.log) {
          // Círculos a lo largo del tronco (eje x local girado).
          const pts = [-4, -2, 0, 2, 4].map((d) => [x + Math.cos(rot) * d * sc, z - Math.sin(rot) * d * sc]);
          if (pts.some(([px, pz]) => collisions.blocked(px, pz, 1.2) || terrain.heightAt(px, pz) < WATER_LEVEL + 0.4)) continue;
          for (const [px, pz] of pts) collisions.add({ x: px, z: pz, r: spec.collider!.r * sc, top: terrain.heightAt(px, pz) + spec.collider!.top * sc, active: true });
        } else if (spec.collider) {
          const r = spec.collider.r * sc;
          if (collisions.blocked(x, z, r + spec.spacing * 0.5)) continue;
          collisions.add({ x, z, r, top: h + spec.collider.top * sc, active: true });
        }
        q.setFromAxisAngle(up, rot);
        p.set(x, h - (spec.collider ? 0.15 * sc : 0.05), z);
        s.set(sc, sc * (0.9 + rand() * 0.2), sc);
        m.compose(p, q, s);
        const t = 1 - spec.tint / 2 + rand() * spec.tint;
        col.setRGB(t, t * (0.95 + rand() * 0.1), t);
        for (const c of chunkSet) c.add(m, col);
        placed++;
      }
      chunkSet.forEach((chunks, i) => {
        chunks.build(this.group);
        this.layers.push({ chunks, decor: (!spec.collider && spec.name !== 'bush') || !!spec.parts[i].decor });
      });
    }
  }

  updateVisibility(cam: THREE.Vector3, viewDistance: number, decorDistance = 90) {
    for (const l of this.layers) l.chunks.updateVisibility(cam, l.decor ? Math.min(viewDistance, decorDistance) : viewDistance);
  }
}

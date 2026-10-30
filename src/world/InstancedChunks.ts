import * as THREE from 'three';
import { WORLD_HALF, WORLD_SIZE } from './config';

/**
 * Divide las instancias de un mismo modelo en trozos (chunks) del mapa para que
 * Three.js pueda descartar por frustum y por distancia los que no se ven.
 */
export class InstancedChunks {
  readonly meshes: THREE.InstancedMesh[] = [];
  private readonly buckets = new Map<number, { m: THREE.Matrix4[]; c: THREE.Color[] }>();
  private readonly centers: THREE.Vector3[] = [];
  private readonly grid: number;

  constructor(
    private readonly geometry: THREE.BufferGeometry,
    private readonly material: THREE.Material,
    private readonly opts: { chunkSize?: number; castShadow?: boolean; receiveShadow?: boolean; name?: string } = {},
  ) {
    this.grid = Math.ceil(WORLD_SIZE / (opts.chunkSize ?? 80));
  }

  add(matrix: THREE.Matrix4, color?: THREE.Color) {
    const x = matrix.elements[12], z = matrix.elements[14];
    const cs = WORLD_SIZE / this.grid;
    const cx = Math.max(0, Math.min(this.grid - 1, Math.floor((x + WORLD_HALF) / cs)));
    const cz = Math.max(0, Math.min(this.grid - 1, Math.floor((z + WORLD_HALF) / cs)));
    const k = cz * this.grid + cx;
    let b = this.buckets.get(k);
    if (!b) this.buckets.set(k, (b = { m: [], c: [] }));
    b.m.push(matrix.clone());
    b.c.push(color ? color.clone() : new THREE.Color(1, 1, 1));
  }

  get count() {
    let n = 0;
    for (const b of this.buckets.values()) n += b.m.length;
    return n;
  }

  build(parent: THREE.Object3D) {
    const cs = WORLD_SIZE / this.grid;
    for (const [k, b] of this.buckets) {
      const mesh = new THREE.InstancedMesh(this.geometry, this.material, b.m.length);
      b.m.forEach((m, i) => mesh.setMatrixAt(i, m));
      b.c.forEach((c, i) => mesh.setColorAt(i, c));
      mesh.instanceMatrix.needsUpdate = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.computeBoundingSphere();
      mesh.castShadow = !!this.opts.castShadow;
      mesh.receiveShadow = !!this.opts.receiveShadow;
      mesh.name = `${this.opts.name ?? 'inst'}-${k}`;
      parent.add(mesh);
      this.meshes.push(mesh);
      const cx = k % this.grid, cz = Math.floor(k / this.grid);
      this.centers.push(new THREE.Vector3((cx + 0.5) * cs - WORLD_HALF, 0, (cz + 0.5) * cs - WORLD_HALF));
    }
    this.buckets.clear();
  }

  /** Oculta trozos lejanos (además del descarte por frustum de Three.js). */
  updateVisibility(cam: THREE.Vector3, maxDist: number) {
    const cs = WORLD_SIZE / this.grid;
    const limit = maxDist + cs * 0.75;
    for (let i = 0; i < this.meshes.length; i++) {
      const c = this.centers[i];
      this.meshes[i].visible = Math.hypot(c.x - cam.x, c.z - cam.z) < limit;
    }
  }
}

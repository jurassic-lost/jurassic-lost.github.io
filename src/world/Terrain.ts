import * as THREE from 'three';
import { fbm, lerp, smoothstep } from '../core/math';
import { groundDetail, waterNormals } from '../core/textures';
import { CLEARING, LAKE, WATER_LEVEL, WORLD_HALF, WORLD_SIZE } from './config';
import { lavaDistance, volcanicAt, volcanoHeight } from './Volcano';
import { featuresHeight, tarStain } from './Features';

/** Colinas interiores fijas (x, z, radio, altura). */
const HILLS: [number, number, number, number][] = [
  [150, -130, 70, 38],
  [-170, 110, 80, 30],
  [-120, -170, 55, 24],
  [190, 160, 60, 28],
];

/** Línea central del río en función de z. */
export function riverX(z: number): number {
  return 70 + Math.sin(z * 0.011) * 45 + Math.sin(z * 0.031 + 1.3) * 12;
}

/** Altura analítica del terreno: fuente única de verdad para malla, física y colocación. */
export function sampleHeight(x: number, z: number): number {
  let h = 6 + fbm(x * 0.007, z * 0.007, 4) * 10 + fbm(x * 0.035, z * 0.035, 2) * 1.6;

  for (const [hx, hz, r, height] of HILLS) {
    const d = Math.hypot(x - hx, z - hz) / r;
    if (d < 1.6) h += height * Math.exp(-d * d * 2.2) * (0.8 + 0.2 * fbm(x * 0.05, z * 0.05, 2));
  }

  // Cordillera que rodea el mapa y actúa como límite natural.
  const edge = Math.max(Math.abs(x), Math.abs(z)) / WORLD_HALF;
  h += smoothstep(0.72, 1.0, edge) * (55 + fbm(x * 0.02, z * 0.02, 3) * 25);

  // Volcán activo con cráter y cauces de lava (ver Volcano.ts).
  h = volcanoHeight(x, z, h);

  // Claro inicial aplanado.
  const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
  h = lerp(h, 3.2 + fbm(x * 0.05, z * 0.05, 2) * 0.4, 1 - smoothstep(CLEARING.radius * 0.6, CLEARING.radius * 1.6, dc));

  // Lago con orilla irregular
  const dl = Math.hypot(x - LAKE.x, z - LAKE.z) / (LAKE.radius * (1 + fbm(x * 0.04, z * 0.04, 2) * 0.25));
  h = lerp(WATER_LEVEL - 1.6, h, smoothstep(0.55, 1.35, dl));

  // Cauce del río (poco profundo: se puede vadear).
  const dr = Math.abs(x - riverX(z));
  h = lerp(WATER_LEVEL - 1.0, h, smoothstep(5, 20, dr));
  // Charcas para beber y pozos de brea.
  return featuresHeight(x, z, h);
}

/** Normal aproximada por diferencias finitas. */
/**
 * Senderos de tierra que serpentean por la selva (como los que abren los
 * dinosaurios al pasar): 1 en el centro del camino, 0 fuera.
 */
export function trailAt(x: number, z: number): number {
  if (Math.abs(x) > WORLD_HALF - 40 || Math.abs(z) > WORLD_HALF - 40) return 0;
  const n = fbm(x * 0.0055 + 7.3, z * 0.0055 - 3.1, 2);
  return 1 - smoothstep(0.012, 0.032, Math.abs(n));
}

export function sampleSlope(x: number, z: number): number {
  const e = 1.0;
  const dx = sampleHeight(x + e, z) - sampleHeight(x - e, z);
  const dz = sampleHeight(x, z + e) - sampleHeight(x, z - e);
  return Math.hypot(dx, dz) / (2 * e);
}

/** Malla del terreno con altura precalculada en rejilla e interpolación bilineal rápida. */
export class Terrain {
  readonly mesh: THREE.Mesh;
  readonly water: THREE.Mesh;
  private readonly waterNormal: THREE.Texture;
  private readonly heights: Float32Array;
  private readonly seg: number;
  private readonly cell: number;

  constructor(segments = 200) {
    this.seg = segments;
    this.cell = WORLD_SIZE / segments;
    const n = segments + 1;
    this.heights = new Float32Array(n * n);

    const geo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, segments, segments);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    const colors = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    const grass = new THREE.Color('#6a9a3c'), grassDark = new THREE.Color('#41712a');
    const dirt = new THREE.Color('#7d6440'), rock = new THREE.Color('#857f74');
    const sand = new THREE.Color('#c9b77f'), clearingDirt = new THREE.Color('#a88e66'), snowRock = new THREE.Color('#a39d90');
    const trailDirt = new THREE.Color('#8b6b45');
    const basalt = new THREE.Color('#3b3532'), ash = new THREE.Color('#5d5652'), scorched = new THREE.Color('#5a2a14'), tar = new THREE.Color('#1c1612');

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = sampleHeight(x, z);
      pos.setY(i, h);
      // PlaneGeometry rotada: índice i corresponde a fila (z) y columna (x)
      this.heights[i] = h;

      const slope = sampleSlope(x, z);
      const patch = fbm(x * 0.04, z * 0.04, 2) * 0.5 + 0.5;
      c.copy(grass).lerp(grassDark, patch);
      if (patch > 0.75) c.lerp(dirt, (patch - 0.75) * 2);
      if (h < WATER_LEVEL + 1.6) c.lerp(sand, smoothstep(WATER_LEVEL + 1.6, WATER_LEVEL + 0.2, h));
      // Claro de tierra arenosa (como un antiguo lecho seco)
      const dc = Math.hypot(x - CLEARING.x, z - CLEARING.z);
      c.lerp(clearingDirt, (1 - smoothstep(CLEARING.radius * 0.5, CLEARING.radius * 1.3, dc)) * (0.55 + patch * 0.3));
      const tr = h > WATER_LEVEL + 0.6 ? trailAt(x, z) : 0;
      if (tr > 0) c.lerp(trailDirt, tr * (0.75 + patch * 0.2));
      c.lerp(rock, smoothstep(0.55, 1.1, slope));
      c.lerp(snowRock, smoothstep(40, 70, h));
      // Roca volcánica oscura con ceniza, orillas de la lava quemadas y manchas de brea.
      const volc = volcanicAt(x, z);
      if (volc > 0) c.lerp(basalt, volc * 0.9).lerp(ash, volc * Math.max(0, patch - 0.55));
      const ld = volc > 0 || Math.abs(x + 205) < 110 ? lavaDistance(x, z).d : 99;
      if (ld < 5) c.lerp(scorched, smoothstep(5, 0, ld) * 0.85);
      const ts = tarStain(x, z);
      if (ts > 0) c.lerp(tar, ts * 0.85);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const detail = groundDetail();
    detail.repeat.set(WORLD_SIZE / 6, WORLD_SIZE / 6);
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true, map: detail });
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.receiveShadow = true;
    this.mesh.name = 'terrain';

    const waterGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE, 1, 1);
    waterGeo.rotateX(-Math.PI / 2);
    this.waterNormal = waterNormals();
    this.waterNormal.repeat.set(WORLD_SIZE / 6, WORLD_SIZE / 6);
    const waterMat = new THREE.MeshPhongMaterial({
      color: '#2a5a5e', specular: '#5f7f88', shininess: 40, transparent: true, opacity: 0.85,
      normalMap: this.waterNormal, normalScale: new THREE.Vector2(0.25, 0.25),
    });
    this.water = new THREE.Mesh(waterGeo, waterMat);
    this.water.position.y = WATER_LEVEL - 0.05;
    this.water.name = 'water';
  }

  /** Anima las ondas del agua. */
  update(dt: number) {
    this.waterNormal.offset.x += dt * 0.006;
    this.waterNormal.offset.y += dt * 0.011;
  }

  /**
   * Zona plana fuera de la isla (la ciudad del Proyecto Génesis). Dentro de ella el suelo
   * está a la altura `h` y no hay agua; fuera, la isla sigue igual que siempre.
   */
  flatZone: { x0: number; x1: number; z0: number; z1: number; h: number } | null = null;

  /** Altura del suelo en (x, z) interpolando la malla (coincide con lo que se ve). */
  heightAt(x: number, z: number): number {
    const f = this.flatZone;
    if (f && x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1) return f.h;
    const n = this.seg + 1;
    const fx = (x + WORLD_HALF) / this.cell;
    const fz = (z + WORLD_HALF) / this.cell;
    const ix = Math.max(0, Math.min(this.seg - 1, Math.floor(fx)));
    const iz = Math.max(0, Math.min(this.seg - 1, Math.floor(fz)));
    const tx = Math.min(1, Math.max(0, fx - ix)), tz = Math.min(1, Math.max(0, fz - iz));
    const h00 = this.heights[iz * n + ix], h10 = this.heights[iz * n + ix + 1];
    const h01 = this.heights[(iz + 1) * n + ix], h11 = this.heights[(iz + 1) * n + ix + 1];
    return lerp(lerp(h00, h10, tx), lerp(h01, h11, tx), tz);
  }

  /** Profundidad del agua sobre el suelo (0 si está seco). */
  waterDepthAt(x: number, z: number): number {
    return Math.max(0, WATER_LEVEL - this.heightAt(x, z));
  }
}

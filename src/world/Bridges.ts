import * as THREE from 'three';
import { fbm, rng } from '../core/math';
import type { CollisionWorld } from '../core/Collision';
import { Terrain, riverX } from './Terrain';
import { flowCount, flowEnd, flowHalfWidth, flowPoint } from './Volcano';

/** Corteza: vetas verticales oscuras y claras (textura que se repite a lo largo del tronco). */
function barkTexture() {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#5b4330';
  g.fillRect(0, 0, 128, 256);
  const r = rng(9);
  for (let i = 0; i < 90; i++) {
    const x = r() * 128, w = 1 + r() * 4, v = r();
    g.fillStyle = v < 0.5 ? `rgba(30,20,12,${0.25 + r() * 0.4})` : `rgba(140,110,80,${0.15 + r() * 0.25})`;
    g.fillRect(x, 0, w, 256);
  }
  for (let i = 0; i < 40; i++) {
    g.fillStyle = `rgba(25,18,10,${0.3 + r() * 0.4})`;
    g.fillRect(r() * 128, r() * 256, 6 + r() * 20, 2 + r() * 3);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

/**
 * Árboles enormes caídos de orilla a orilla que sirven de puente: sobre el río de agua
 * y sobre los ríos de lava del volcán. Se puede caminar por encima (como en la imagen de Ivan:
 * troncos con musgo, lianas colgando, raíces en un extremo y ramas rotas en el otro).
 */
export class Bridges {
  readonly group = new THREE.Group();
  /** Extremos de cada puente (para pruebas y para el mapa). */
  readonly spans: { a: THREE.Vector3; b: THREE.Vector3; over: 'agua' | 'lava' }[] = [];
  private readonly bark: THREE.MeshStandardMaterial;
  private readonly cut = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 });
  private readonly moss = new THREE.MeshStandardMaterial({ color: '#4f7a2a', roughness: 1 });
  private readonly vine = new THREE.MeshStandardMaterial({ color: '#2f4f1c', roughness: 1 });
  private readonly root = new THREE.MeshStandardMaterial({ color: '#3d2c1d', roughness: 1 });
  private readonly rand = rng(2024);

  constructor(private readonly terrain: Terrain, private readonly collisions: CollisionWorld) {
    this.group.name = 'bridges';
    const tex = barkTexture();
    this.bark = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });

    // Sobre el río de agua: troncos perpendiculares a la corriente.
    for (const z of [-205, -115, -30, 150, 235]) {
      const cx = riverX(z), slope = (riverX(z + 1) - riverX(z - 1)) / 2;
      // Dirección del río (slope, 1) → perpendicular (1, -slope)
      const l = Math.hypot(1, slope), px = 1 / l, pz = -slope / l, half = 19;
      this.log(cx - px * half, z - pz * half, cx + px * half, z + pz * half, 'agua');
    }
    // Sobre la lava: dos troncos por río, a media bajada y cerca del final.
    for (let k = 0; k < flowCount; k++) {
      for (const f of [0.45, 0.8]) {
        const r = flowEnd(k) * f, p = flowPoint(k, r);
        const sx = -Math.sin(p.theta), sz = Math.cos(p.theta), half = flowHalfWidth(r) + 4.5;
        this.log(p.x - sx * half, p.z - sz * half, p.x + sx * half, p.z + sz * half, 'lava');
      }
    }
  }

  /** Tronco caído entre (ax, az) y (bx, bz), apoyado en las dos orillas. */
  private log(ax: number, az: number, bx: number, bz: number, over: 'agua' | 'lava') {
    const t = this.terrain, R = 0.75 + this.rand() * 0.2;
    // La parte de arriba del tronco queda 0,3 m sobre el suelo de cada orilla (se sube de un paso).
    const ha = t.heightAt(ax, az) + 0.3, hb = t.heightAt(bx, bz) + 0.3;
    const a = new THREE.Vector3(ax, ha - R, az), b = new THREE.Vector3(bx, hb - R, bz);
    const len = a.distanceTo(b);
    const dir = b.clone().sub(a).normalize();
    const mid = a.clone().add(b).multiplyScalar(0.5);
    const g = new THREE.Group();
    g.position.copy(mid);
    g.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
    this.group.add(g);
    this.spans.push({ a: new THREE.Vector3(ax, ha, az), b: new THREE.Vector3(bx, hb, bz), over });

    // Tronco con forma irregular (un poco más grueso en la base)
    const geo = new THREE.CylinderGeometry(R * 0.92, R * 1.08, len, 14, Math.ceil(len / 1.5), false);
    const pos = geo.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
      const n = 1 + fbm(x * 1.3 + y * 0.35, z * 1.3 - y * 0.2, 2) * 0.1;
      pos.setXYZ(i, x * n, y, z * n);
    }
    geo.computeVertexNormals();
    const uv = geo.attributes.uv as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) uv.setY(i, uv.getY(i) * len / 4);
    const trunk = new THREE.Mesh(geo, this.bark);
    trunk.castShadow = trunk.receiveShadow = true;
    g.add(trunk);
    // Extremo roto (madera clara) y, del otro lado, el plato de raíces
    const end = new THREE.Mesh(new THREE.CircleGeometry(R * 0.92, 14), this.cut);
    end.rotation.x = -Math.PI / 2;
    end.position.y = len / 2 + 0.01;
    g.add(end);
    const plate = new THREE.Mesh(new THREE.CylinderGeometry(R * 2.4, R * 1.4, 0.6, 12), this.root);
    plate.position.y = -len / 2 - 0.25;
    g.add(plate);
    for (let i = 0; i < 9; i++) {
      const rr = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.16, 1.6 + this.rand() * 1.4, 5), this.root);
      const ang = (i / 9) * Math.PI * 2;
      rr.position.set(Math.cos(ang) * R * 1.9, -len / 2 - 0.7, Math.sin(ang) * R * 1.9);
      rr.rotation.set(Math.sin(ang) * 0.9, 0, -Math.cos(ang) * 0.9);
      g.add(rr);
    }
    // Ramas rotas cerca de la copa
    for (let i = 0; i < 3; i++) {
      const br = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.22, 0.8 + this.rand() * 0.7, 6), this.bark);
      const ang = this.rand() * Math.PI * 2;
      br.position.set(Math.cos(ang) * R, len * (0.25 + this.rand() * 0.2), Math.sin(ang) * R);
      br.rotation.set(Math.sin(ang) * 1.1, 0, -Math.cos(ang) * 1.1);
      g.add(br);
    }
    // Musgo encima y lianas colgando sobre el río
    const n = Math.floor(len / 1.6);
    for (let i = 0; i < n; i++) {
      const y = -len / 2 + (i + 0.5) * (len / n);
      const m = new THREE.Mesh(new THREE.SphereGeometry(R * (0.45 + this.rand() * 0.35), 8, 6), this.moss);
      m.scale.set(1, 0.9, 0.35);
      // "Arriba" del tronco en coordenadas locales: el eje Y local va a lo largo, arriba es +Z o −Z según el giro.
      const upLocal = new THREE.Vector3(0, 1, 0).applyQuaternion(g.quaternion.clone().invert());
      upLocal.y = 0; upLocal.normalize();
      const side = (this.rand() - 0.5) * 1.2;
      m.position.set(upLocal.x * R * 0.82 + upLocal.z * side * R * 0.5, y, upLocal.z * R * 0.82 - upLocal.x * side * R * 0.5);
      g.add(m);
      if (this.rand() < 0.45 && Math.abs(y) < len * 0.35) {
        const vl = 0.8 + this.rand() * 2.2;
        const v = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, vl, 4), this.vine);
        const off = this.rand() < 0.5 ? 1 : -1;
        const sideV = new THREE.Vector3(-upLocal.z, 0, upLocal.x).multiplyScalar(off * R * 0.95);
        v.position.set(sideV.x - upLocal.x * vl * 0.5, y, sideV.z - upLocal.z * vl * 0.5);
        v.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), upLocal);
        g.add(v);
      }
    }

    // Colisiones: círculos a lo largo del tronco que se pueden pisar (la parte de arriba es el camino).
    const steps = Math.ceil(len / 0.6);
    for (let i = 0; i <= steps; i++) {
      const k = i / steps;
      const x = ax + (bx - ax) * k, z = az + (bz - az) * k;
      this.collisions.add({ x, z, r: 0.8, top: ha + (hb - ha) * k, active: true });
    }
  }

  /** ¿Está este punto sobre un puente? (la lava no quema si vas por encima del tronco) */
  onBridge(p: THREE.Vector3) {
    for (const s of this.spans) {
      const ab = s.b.clone().sub(s.a), ap = new THREE.Vector3(p.x - s.a.x, 0, p.z - s.a.z);
      ab.y = 0;
      const k = Math.max(0, Math.min(1, ap.dot(ab) / ab.lengthSq()));
      const cx = s.a.x + ab.x * k, cz = s.a.z + ab.z * k;
      if (Math.hypot(p.x - cx, p.z - cz) < 1.1 && p.y > s.a.y + (s.b.y - s.a.y) * k - 0.5) return true;
    }
    return false;
  }
}

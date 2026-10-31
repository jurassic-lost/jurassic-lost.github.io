import * as THREE from 'three';
import { clamp, damp } from '../core/math';
import type { Collider } from '../core/Collision';

const hits: Collider[] = [];
import { Terrain } from '../world/Terrain';
import { CollisionWorld } from '../core/Collision';

/** Cámara orbital en tercera persona que sigue al personaje sin atravesar el suelo. */
export class ThirdPersonCamera {
  yaw = Math.PI;      // detrás del personaje (mirando hacia -z al inicio)
  pitch = 0.32;
  distance = 6;
  sensitivity = 0.0032;
  private readonly target = new THREE.Vector3();
  private readonly desired = new THREE.Vector3();
  private initialized = false;

  constructor(readonly camera: THREE.PerspectiveCamera, private readonly terrain: Terrain, private readonly collisions: CollisionWorld) {}

  /** Coloca la cámara de golpe (tras teletransportar al personaje). */
  snap() { this.initialized = false; this.currentDist = this.distance; }

  private currentDist = 6;

  /** Distancia libre hasta el primer tronco entre el personaje y la cámara. */
  private freeDistance(dirX: number, dirY: number, dirZ: number): number {
    const step = 0.5;
    for (let d = 1.2; d < this.distance; d += step) {
      const x = this.target.x + dirX * d, y = this.target.y + dirY * d, z = this.target.z + dirZ * d;
      for (const c of this.collisions.query(x, z, 1, hits)) {
        if (c.hx !== undefined) {
          // Paredes de la ciudad: la cámara se acerca más (las habitaciones son pequeñas).
          if (c.top > y && Math.abs(x - c.x) < c.hx + 0.2 && Math.abs(z - c.z) < c.hz! + 0.2) return Math.max(0.6, d - step);
        } else if (c.top > y && Math.hypot(x - c.x, z - c.z) < c.r + 0.25) return Math.max(1.2, d - step);
      }
    }
    return this.distance;
  }

  rotate(dx: number, dy: number, zoom: number) {
    this.yaw -= dx * this.sensitivity;
    this.pitch = clamp(this.pitch + dy * this.sensitivity, -0.25, 1.25);
    this.distance = clamp(this.distance + zoom * 0.8, 2.5, 22);
  }

  update(dt: number, focus: THREE.Vector3, crouch: boolean) {
    const height = crouch ? 1.0 : 1.45;
    if (!this.initialized) { this.target.set(focus.x, focus.y + height, focus.z); this.initialized = true; }
    this.target.x = damp(this.target.x, focus.x, 14, dt);
    this.target.y = damp(this.target.y, focus.y + height, 8, dt);
    this.target.z = damp(this.target.z, focus.z, 14, dt);

    const cp = Math.cos(this.pitch);
    const dx = Math.sin(this.yaw) * cp, dy = Math.sin(this.pitch), dz = Math.cos(this.yaw) * cp;
    const free = this.freeDistance(dx, dy, dz);
    // Se acerca rápido al chocar con un tronco y se aleja suavemente.
    this.currentDist = free < this.currentDist ? free : damp(this.currentDist, free, 3, dt);
    this.desired.set(this.target.x + dx * this.currentDist, this.target.y + dy * this.currentDist, this.target.z + dz * this.currentDist);
    const ground = this.terrain.heightAt(this.desired.x, this.desired.z) + 0.6;
    if (this.desired.y < ground) this.desired.y = ground;
    this.camera.position.copy(this.desired);
    this.camera.lookAt(this.target);
  }

  /** Dirección "adelante" en el plano XZ según la cámara. */
  forward(out: THREE.Vector3) {
    return out.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
  }
}

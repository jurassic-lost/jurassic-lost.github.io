import * as THREE from 'three';
import { Terrain } from '../world/Terrain';

/** Pieza de carne que deja un dinosaurio vencido: al comerla recupera vida. */
export interface Meat { obj: THREE.Object3D; pos: THREE.Vector3; life: number; phase: number }

export const MEAT_HEALTH = 25;
export const MEAT_HUNGER = 15;

/** Trozos de carne en el suelo (pocos a la vez, con un poco de brillo para verlos entre la hierba). */
export class MeatDrops {
  readonly group = new THREE.Group();
  private readonly list: Meat[] = [];
  private readonly proto: THREE.Group;
  private time = 0;

  constructor(private readonly terrain: Terrain) {
    this.group.name = 'meat';
    const meat = new THREE.MeshStandardMaterial({ color: '#b5523b', roughness: 0.6, emissive: '#3a0d05', emissiveIntensity: 0.4 });
    const bone = new THREE.MeshStandardMaterial({ color: '#efe6d2', roughness: 0.7 });
    const g = new THREE.Group();
    const chunk = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 10), meat);
    chunk.scale.set(1, 0.85, 1.25);
    const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.32, 8), bone);
    stick.rotation.x = Math.PI / 2; stick.position.z = -0.3;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), bone);
    knob.position.z = -0.46;
    g.add(chunk, stick, knob);
    g.traverse((o) => { o.castShadow = true; });
    this.proto = g;
  }

  /** Suelta `n` trozos alrededor de un punto. */
  drop(x: number, z: number, n: number, spread: number) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.6, d = spread * (0.4 + Math.random() * 0.6);
      const px = x + Math.sin(a) * d, pz = z + Math.cos(a) * d;
      const obj = this.proto.clone();
      obj.rotation.y = Math.random() * Math.PI * 2;
      const pos = new THREE.Vector3(px, this.terrain.heightAt(px, pz) + 0.25, pz);
      obj.position.copy(pos);
      this.group.add(obj);
      this.list.push({ obj, pos, life: 300, phase: Math.random() * 6 });
    }
  }

  /** Carne más cercana al alcance, o null. */
  nearest(p: THREE.Vector3, reach: number): Meat | null {
    let best: Meat | null = null, bd = reach;
    for (const m of this.list) {
      const d = Math.hypot(m.pos.x - p.x, m.pos.z - p.z);
      if (d < bd && Math.abs(m.pos.y - p.y) < 2) { bd = d; best = m; }
    }
    return best;
  }

  take(m: Meat) {
    const i = this.list.indexOf(m);
    if (i >= 0) this.list.splice(i, 1);
    this.group.remove(m.obj);
  }

  update(dt: number) {
    this.time += dt;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const m = this.list[i];
      m.life -= dt;
      if (m.life <= 0) { this.group.remove(m.obj); this.list.splice(i, 1); continue; }
      m.obj.position.y = m.pos.y + Math.sin(this.time * 2.5 + m.phase) * 0.05;
      m.obj.rotation.y += dt * 0.8;
    }
  }
}

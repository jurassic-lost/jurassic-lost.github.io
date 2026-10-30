import * as THREE from 'three';
import { ItemId } from '../items/items';
import { Terrain } from '../world/Terrain';
import type { Dinosaur } from '../creatures/Dinosaur';

export type WeaponId = 'hand' | 'club' | 'spear' | 'sling' | 'bow';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  icon: string;
  /** Objeto del inventario necesario para equiparla (la mano siempre está). */
  item?: ItemId;
  damage: number;
  reach: number;
  cooldown: number;
  anim: 'swing' | 'thrust' | 'throw' | 'bow';
  ranged?: { ammo: ItemId; speed: number };
}

export const WEAPONS: WeaponDef[] = [
  { id: 'hand', name: 'Mano', icon: '✋', damage: 3, reach: 1.8, cooldown: 0.5, anim: 'swing' },
  { id: 'club', name: 'Garrote', icon: '🏏', item: 'club', damage: 12, reach: 2.4, cooldown: 0.6, anim: 'swing' },
  { id: 'spear', name: 'Lanza', icon: '🔱', item: 'spear', damage: 22, reach: 3.2, cooldown: 0.7, anim: 'thrust' },
  { id: 'sling', name: 'Honda', icon: '🪢', item: 'sling', damage: 14, reach: 0, cooldown: 0.8, anim: 'throw', ranged: { ammo: 'stone', speed: 32 } },
  { id: 'bow', name: 'Arco', icon: '🏹', item: 'bow', damage: 26, reach: 0, cooldown: 0.9, anim: 'bow', ranged: { ammo: 'arrows', speed: 48 } },
];

const wood = new THREE.MeshStandardMaterial({ color: '#7a5230', roughness: 0.8 });
const stone = new THREE.MeshStandardMaterial({ color: '#8d8a82', roughness: 0.7, flatShading: true });
const cord = new THREE.MeshStandardMaterial({ color: '#c9b27a', roughness: 0.9 });
const feather = new THREE.MeshStandardMaterial({ color: '#e8e2d0', roughness: 0.9, side: THREE.DoubleSide });

/** Modelo del arma en la mano (el eje y local apunta "hacia fuera" del puño). */
export function weaponModel(id: WeaponId): THREE.Object3D | null {
  const g = new THREE.Group();
  const m = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  switch (id) {
    case 'hand': return null;
    case 'club':
      m(new THREE.CylinderGeometry(0.05, 0.03, 0.75, 8), wood, 0, 0, 0.3).rotation.x = Math.PI / 2;
      m(new THREE.SphereGeometry(0.075, 8, 6), wood, 0, 0, 0.66);
      break;
    case 'spear': {
      m(new THREE.CylinderGeometry(0.025, 0.025, 1.7, 8), wood, 0, 0, 0.35).rotation.x = Math.PI / 2;
      const tip = m(new THREE.OctahedronGeometry(0.08, 0), stone, 0, 0, 1.25);
      tip.scale.set(0.6, 0.6, 1.6);
      m(new THREE.CylinderGeometry(0.03, 0.03, 0.08, 8), cord, 0, 0, 1.15).rotation.x = Math.PI / 2;
      break;
    }
    case 'sling': {
      m(new THREE.CylinderGeometry(0.02, 0.02, 0.25, 6), wood, 0, -0.05, 0);
      const strap = m(new THREE.TorusGeometry(0.12, 0.012, 4, 12, Math.PI), cord, 0, -0.18, 0);
      strap.rotation.z = Math.PI;
      break;
    }
    case 'bow': {
      const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, -0.55, 0), new THREE.Vector3(0, 0, 0.3), new THREE.Vector3(0, 0.55, 0));
      g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 12, 0.02, 5, false), wood));
      m(new THREE.CylinderGeometry(0.004, 0.004, 1.1, 3), cord, 0, 0, 0);
      g.rotation.x = -Math.PI / 2;
      break;
    }
  }
  return g;
}

function projectileModel(kind: 'stone' | 'arrow') {
  const g = new THREE.Group();
  if (kind === 'stone') {
    g.add(new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), stone));
  } else {
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.8, 5), wood);
    shaft.rotation.x = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.03, 0.1, 5), stone);
    tip.rotation.x = Math.PI / 2; tip.position.z = 0.45;
    const f = new THREE.Mesh(new THREE.PlaneGeometry(0.06, 0.15), feather);
    f.position.z = -0.35; f.rotation.y = Math.PI / 2;
    g.add(shaft, tip, f);
  }
  g.traverse((o) => (o.castShadow = true));
  return g;
}

interface Projectile { obj: THREE.Object3D; vel: THREE.Vector3; life: number; damage: number; stuck: number; kind: 'stone' | 'arrow' }

/** Piedras y flechas en vuelo con gravedad. */
export class Projectiles {
  readonly group = new THREE.Group();
  private readonly list: Projectile[] = [];
  private readonly tmp = new THREE.Vector3();
  private readonly prev = new THREE.Vector3();
  private readonly seg = new THREE.Vector3();

  constructor(private readonly terrain: Terrain) {}

  fire(kind: 'stone' | 'arrow', from: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number) {
    const obj = projectileModel(kind);
    obj.position.copy(from);
    this.group.add(obj);
    this.list.push({ obj, vel: dir.clone().multiplyScalar(speed), life: 4, damage, stuck: 0, kind });
  }

  /** Avanza y devuelve los impactos sobre dinosaurios. */
  update(dt: number, dinos: Dinosaur[], onHit: (d: Dinosaur, damage: number, dir: THREE.Vector3) => void) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const p = this.list[i];
      p.life -= dt;
      if (p.stuck > 0) {
        p.stuck -= dt;
        if (p.stuck <= 0 || p.life <= 0) { this.group.remove(p.obj); this.list.splice(i, 1); }
        continue;
      }
      p.vel.y -= 9.8 * dt * (p.kind === 'arrow' ? 0.5 : 1);
      this.prev.copy(p.obj.position);
      p.obj.position.addScaledVector(p.vel, dt);
      if (p.kind === 'arrow') p.obj.lookAt(this.tmp.copy(p.obj.position).add(p.vel));
      else p.obj.rotation.x += dt * 10;
      let hit = false;
      for (const d of dinos) {
        const c = d.hitCenter(this.tmp);
        // Distancia del centro al segmento recorrido en este fotograma (evita atravesar).
        this.seg.copy(p.obj.position).sub(this.prev);
        const len2 = this.seg.lengthSq() || 1;
        const t = Math.max(0, Math.min(1, c.clone().sub(this.prev).dot(this.seg) / len2));
        if (this.prev.clone().addScaledVector(this.seg, t).distanceTo(c) < d.hitRadius) {
          onHit(d, p.damage, p.vel.clone().normalize());
          hit = true;
          break;
        }
      }
      const ground = this.terrain.heightAt(p.obj.position.x, p.obj.position.z);
      if (hit || p.obj.position.y < ground || p.life <= 0) {
        if (!hit && p.kind === 'arrow' && p.obj.position.y < ground + 0.3) { p.obj.position.y = ground + 0.1; p.stuck = 6; continue; }
        this.group.remove(p.obj);
        this.list.splice(i, 1);
      }
    }
  }
}

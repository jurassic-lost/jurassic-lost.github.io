import * as THREE from 'three';
import { lightShaft } from '../core/textures';
import { rng } from '../core/math';
import { Terrain } from './Terrain';

/**
 * Rayos de sol que atraviesan el follaje: planos aditivos inclinados hacia el sol,
 * reciclados alrededor del jugador (efecto barato, apto para móviles).
 */
export class LightShafts {
  readonly group = new THREE.Group();
  private readonly shafts: THREE.Mesh[] = [];
  private readonly rand = rng(77);
  private time = 0;

  constructor(private readonly terrain: Terrain, sunDir: THREE.Vector3, count = 18) {
    const mat = new THREE.MeshBasicMaterial({
      map: lightShaft(), transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending,
      depthWrite: false, side: THREE.DoubleSide, fog: true,
    });
    const geo = new THREE.PlaneGeometry(1, 1);
    geo.translate(0, -0.5, 0); // el borde superior es el origen (copa de los árboles)
    const tilt = Math.atan2(Math.hypot(sunDir.x, sunDir.z), sunDir.y);
    const yaw = Math.atan2(sunDir.x, sunDir.z);
    for (let i = 0; i < count; i++) {
      const m = new THREE.Mesh(geo, mat.clone());
      m.rotation.order = 'YXZ';
      m.rotation.y = yaw + Math.PI;
      m.rotation.x = Math.min(0.35, tilt * 0.3);
      m.userData.phase = this.rand() * 10;
      m.renderOrder = 2;
      this.shafts.push(m);
      this.group.add(m);
    }
  }

  private place(m: THREE.Mesh, cx: number, cz: number) {
    const a = this.rand() * Math.PI * 2, d = 5 + this.rand() * 40;
    const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
    const w = 2 + this.rand() * 5, h = 20 + this.rand() * 12;
    m.scale.set(w, h, 1);
    m.position.set(x, this.terrain.heightAt(x, z) + h * 0.85, z);
  }

  update(dt: number, focus: THREE.Vector3, camera: THREE.Camera, daylight = 1) {
    this.time += dt;
    this.group.visible = daylight > 0.3;
    if (!this.group.visible) return;
    for (const m of this.shafts) {
      if (!m.userData.placed || Math.hypot(m.position.x - focus.x, m.position.z - focus.z) > 55) { this.place(m, focus.x, focus.z); m.userData.placed = true; }
      // Se ve mejor de lado: gira hacia la cámara alrededor del eje del rayo y titila suavemente.
      const dx = camera.position.x - m.position.x, dz = camera.position.z - m.position.z;
      m.rotation.z = 0;
      m.rotation.y = Math.atan2(dx, dz);
      (m.material as THREE.MeshBasicMaterial).opacity = (0.14 + Math.sin(this.time * 0.4 + m.userData.phase) * 0.06) * Math.min(1, (daylight - 0.3) / 0.5);
    }
  }
}

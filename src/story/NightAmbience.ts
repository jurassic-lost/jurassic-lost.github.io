import * as THREE from 'three';
import type { AudioManager } from '../audio/AudioManager';
import type { Terrain } from '../world/Terrain';

/** Algo que puede asustar: un depredador cercano y si está acechando o cazando. */
export interface Threat { readonly position: THREE.Vector3; threatening: boolean; predator: boolean }

interface Eyes { obj: THREE.Group; life: number; max: number; blinkT: number }

function glowTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grd.addColorStop(0, 'rgba(255,240,190,1)');
  grd.addColorStop(0.25, 'rgba(255,190,80,0.9)');
  grd.addColorStop(1, 'rgba(255,140,40,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Terror ambiental de la noche, basado en sonido y oscuridad (sin sustos bruscos):
 * hojas que se mueven, ramas que crujen, gruñidos lejanos, pisadas que se detienen,
 * ojos que brillan un momento entre los árboles y el silencio de los grillos
 * cuando un depredador anda cerca.
 */
export class NightAmbience {
  readonly group = new THREE.Group();
  private readonly eyes: Eyes[] = [];
  private nextRustle = 14;
  private nextGrowl = 30;
  private nextEyes = 35;
  private nextSteps = 70;
  private beatT = 0;
  private readonly queue: { t: number; fn: () => void }[] = [];
  private time = 0;
  /** Mientras un evento de la historia controla el sonido, el ambiente no lo toca. */
  override = false;

  constructor(private readonly terrain: Terrain, private readonly audio: AudioManager) {
    this.group.name = 'night-ambience';
    const mat = new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false });
    for (let i = 0; i < 2; i++) {
      const pair = new THREE.Group();
      for (const side of [-1, 1]) {
        const sp = new THREE.Sprite(mat.clone());
        sp.scale.setScalar(0.28);
        sp.position.x = side * 0.17;
        pair.add(sp);
      }
      pair.visible = false;
      this.group.add(pair);
      this.eyes.push({ obj: pair, life: 0, max: 0, blinkT: 0 });
    }
  }

  private later(sec: number, fn: () => void) { this.queue.push({ t: this.time + sec, fn }); }

  /**
   * @param night 0 (día) a 1 (noche cerrada)
   * @param pan función que da la posición estéreo de un punto
   */
  update(dt: number, night: number, player: THREE.Vector3, camera: THREE.Camera, pan: (p: THREE.Vector3) => number, threats: Threat[], sheltered: boolean) {
    this.time += dt;
    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].t <= this.time) { this.queue[i].fn(); this.queue.splice(i, 1); }
    this.updateEyes(dt, player, night);

    // Un depredador acechando cerca: los grillos se callan, sube la tensión y late el corazón.
    let near = Infinity;
    for (const t of threats) if (t.predator && t.threatening) near = Math.min(near, t.position.distanceTo(player));
    const danger = near < 45 ? 1 - near / 45 : 0;
    if (!this.override) {
      this.audio.hush(night > 0.5 && near < 45 ? 1 : 0);
      this.audio.setTension(Math.max(danger, night > 0.6 ? 0.15 : 0));
    }
    if (near < 22) {
      this.beatT -= dt;
      if (this.beatT <= 0) { this.audio.heartbeat(0.12 + danger * 0.15); this.beatT = 1.15 - danger * 0.4; }
    }

    if (night < 0.6 || this.override) return;
    const rnd = (a: number, b: number) => a + Math.random() * (b - a);
    const around = (dist: number) => {
      const a = Math.random() * Math.PI * 2;
      return new THREE.Vector3(player.x + Math.sin(a) * dist, player.y, player.z + Math.cos(a) * dist);
    };

    // Hojas que se mueven cerca y, a veces, una rama que cruje después.
    this.nextRustle -= dt;
    if (this.nextRustle <= 0) {
      this.nextRustle = rnd(10, 24);
      const p = around(rnd(6, 14)), pp = pan(p);
      this.audio.rustle(rnd(0.1, 0.22), pp);
      if (Math.random() < 0.4) this.later(rnd(0.5, 1.4), () => this.audio.twig(rnd(0.12, 0.22), pp * 0.8));
    }
    // Gruñidos y bramidos lejanos que vienen de distintos lados.
    this.nextGrowl -= dt;
    if (this.nextGrowl <= 0) {
      this.nextGrowl = rnd(35, 70);
      const p = around(80);
      if (Math.random() < 0.5) this.audio.dinoCall('growl', rnd(0.1, 0.18), pan(p));
      else this.audio.distantCall(rnd(0.12, 0.2));
    }
    // Pisadas pesadas a lo lejos que se acercan… y se detienen.
    this.nextSteps -= dt;
    if (this.nextSteps <= 0) {
      this.nextSteps = rnd(70, 120);
      const pp = pan(around(40));
      const n = 3 + Math.floor(Math.random() * 3);
      for (let i = 0; i < n; i++) this.later(i * 0.9, () => this.audio.bigStep(0.05 + i * 0.025, 6));
      this.later(n * 0.9 + 0.8, () => this.audio.breathe(0.08, pp));
    }
    // Ojos que brillan un instante en la oscuridad (no desde dentro del refugio todas las veces).
    this.nextEyes -= dt;
    if (this.nextEyes <= 0) {
      this.nextEyes = rnd(sheltered ? 70 : 35, sheltered ? 120 : 75);
      this.spawnEyes(player, camera);
    }
  }

  private spawnEyes(player: THREE.Vector3, camera: THREE.Camera) {
    const e = this.eyes.find((x) => x.life <= 0);
    if (!e) return;
    const f = new THREE.Vector3();
    camera.getWorldDirection(f);
    for (let i = 0; i < 8; i++) {
      const a = Math.atan2(f.x, f.z) + (Math.random() - 0.5) * 1.6, d = 18 + Math.random() * 12;
      const x = player.x + Math.sin(a) * d, z = player.z + Math.cos(a) * d;
      if (this.terrain.waterDepthAt(x, z) > 0.2) continue;
      e.obj.position.set(x, this.terrain.heightAt(x, z) + 1.2 + Math.random() * 1.3, z);
      e.obj.lookAt(player.x, e.obj.position.y, player.z);
      e.max = e.life = 3 + Math.random() * 3;
      e.blinkT = 1 + Math.random();
      e.obj.visible = true;
      return;
    }
  }

  private updateEyes(dt: number, player: THREE.Vector3, night: number) {
    for (const e of this.eyes) {
      if (e.life <= 0) continue;
      e.life -= dt;
      e.blinkT -= dt;
      const dist = e.obj.position.distanceTo(player);
      // Si te acercas o se hace de día, desaparecen entre la maleza.
      if (dist < 10 || night < 0.4) { e.life = 0; this.audio.rustle(0.15); }
      const fadeIn = Math.min(1, (e.max - e.life) / 0.6), fadeOut = Math.min(1, e.life / 0.6);
      const blink = e.blinkT < 0 && e.blinkT > -0.15 ? 0 : 1;
      if (e.blinkT < -0.15) e.blinkT = 1.2 + Math.random() * 1.5;
      const o = Math.max(0, Math.min(fadeIn, fadeOut)) * blink;
      for (const c of e.obj.children) (c as THREE.Sprite).material.opacity = o;
      e.obj.visible = e.life > 0;
    }
  }
}

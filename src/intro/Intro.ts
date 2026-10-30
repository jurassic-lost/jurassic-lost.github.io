import * as THREE from 'three';
import { damp } from '../core/math';
import type { Game } from '../core/Game';
import { Bedroom } from './Bedroom';

const $ = (id: string) => document.getElementById(id)!;

const SEQUENCE = ['↑', '→', '↓', '←', '⟳', '✦'];
const ROOM_END = 17.1;
const END = 27;

/**
 * Introducción cinematográfica (se puede omitir):
 * cuarto → juego misterioso en el celular → anomalía temporal → destello → llegada a la selva y título.
 */
export class Intro {
  private readonly room = new Bedroom();
  private readonly camera = new THREE.PerspectiveCamera(55, 1, 0.05, 50);
  private readonly clock = new THREE.Clock();
  private t = 0;
  private done = false;
  private readonly fired = new Set<number>();
  private readonly events: [number, () => void][];
  private readonly look = new THREE.Vector3();
  private readonly floaterBase: THREE.Vector3[];
  private readonly onKey = (e: KeyboardEvent) => {
    if (['Escape', 'Enter', 'Space'].includes(e.code)) { e.preventDefault(); this.finish(); }
  };

  constructor(private readonly game: Game, private readonly onDone: () => void) {
    this.floaterBase = this.room.floaters.map((o) => o.position.clone());
    const a = game.audio;
    const phone = $('intro-phone');
    const seq = phone.querySelector('.seq')!;
    seq.innerHTML = SEQUENCE.map((s) => `<span>${s}</span>`).join('');
    const keys = Array.from(seq.children) as HTMLElement[];
    this.events = [
      [0.6, () => this.caption('Una noche cualquiera, en su cuarto…')],
      [3.6, () => this.caption('…encontró en su celular un juego que nadie conocía.')],
      [6.2, () => { this.caption(''); phone.classList.add('show'); a.beep(520, 0.2); }],
      [7.4, () => phone.classList.add('hint')],
      ...SEQUENCE.map((_, i) => [8.2 + i * 0.6, () => { keys[i].classList.add('on'); a.beep(600 + i * 120); }] as [number, () => void]),
      [11.9, () => { phone.classList.add('error'); a.beep(220, 0.5, 0.15); }],
      [12.9, () => { phone.classList.remove('show'); $('intro').classList.add('glitch'); a.anomaly(3.8); this.caption('¿Qué está pasando…?'); }],
      [15.4, () => { a.roar(0.7); this.caption(''); }],
      [16.5, () => $('intro-flash').classList.add('on')],
      [ROOM_END, () => this.toWorld()],
      [18.6, () => $('intro-flash').classList.remove('on')],
      [19.2, () => this.caption('Despertó solo, en un lugar muy, muy antiguo…')],
      [21.0, () => { this.caption(''); $('intro-title').classList.add('show'); a.distantCall(0.3); }],
      [25.6, () => $('intro-title').classList.remove('show')],
      [END, () => this.finish()],
    ];
  }

  private caption(text: string) {
    const c = $('intro-caption');
    c.textContent = text;
    c.classList.toggle('show', !!text);
  }

  start() {
    const el = $('intro');
    el.classList.remove('hidden', 'glitch');
    $('intro-skip').onclick = () => this.finish();
    window.addEventListener('keydown', this.onKey);
    this.resize();
    this.clock.getDelta();
    this.game.renderer.setAnimationLoop(() => this.frame());
  }

  private resize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
  }

  private toWorld() {
    $('intro').classList.remove('glitch');
    this.room.dispose();
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    this.t += dt;
    this.events.forEach(([at, fn], i) => { if (this.t >= at && !this.fired.has(i)) { this.fired.add(i); fn(); } });
    if (this.done) return;
    if (this.t < ROOM_END) this.renderRoom(dt);
    else this.renderWorld(dt);
  }

  private renderRoom(dt: number) {
    const t = this.t, r = this.room, cam = this.camera;
    r.kid.update(dt, 0, true, false, 0);
    // Cámara: plano general que se acerca lentamente al niño.
    const k = Math.min(1, t / 12);
    const e = k * k * (3 - 2 * k);
    cam.position.set(1.7 - e * 2.0, 1.65 - e * 0.35, 2.3 - e * 2.0);
    this.look.set(-1.4, 0.95, -0.75);
    // Anomalía: temblor, luz del celular, portal y objetos flotando.
    const an = Math.max(0, (t - 12.9) / (ROOM_END - 12.9));
    r.phoneLight.intensity = 0.6 + Math.sin(t * 6) * 0.15 + (t > 8 ? 1.2 : 0) + an * 25;
    r.phoneLight.color.setHSL(0.52 + an * 0.25, 1, 0.6);
    if (an > 0) {
      const shake = an * an * 0.06;
      cam.position.x += (Math.random() - 0.5) * shake;
      cam.position.y += (Math.random() - 0.5) * shake;
      r.portal.scale.setScalar(0.2 + an * an * 3.5);
      r.portal.children.forEach((c, i) => { c.rotation.z += dt * (2 + i * 1.5) * (i % 2 ? -1 : 1); });
      r.floaters.forEach((o, i) => {
        const b = this.floaterBase[i];
        o.position.set(b.x, b.y + an * an * (0.6 + (i % 3) * 0.3), b.z);
        o.rotation.x += dt * an * (1 + i * 0.3);
        o.rotation.z += dt * an * 0.7;
      });
      cam.fov = 55 + an * 18;
      cam.updateProjectionMatrix();
    }
    cam.lookAt(this.look);
    this.game.renderer.render(r.scene, cam);
  }

  private renderWorld(dt: number) {
    // Vuelo de cámara sobre la selva hasta el claro donde aparece el niño.
    const k = Math.min(1, (this.t - ROOM_END) / (END - ROOM_END - 0.5));
    const e = k * k * (3 - 2 * k);
    const p = this.game.player.position;
    const pos = new THREE.Vector3(
      THREE.MathUtils.lerp(-40, p.x + 1.5, e),
      THREE.MathUtils.lerp(75, p.y + 2.6, e),
      THREE.MathUtils.lerp(-60, p.z - 5.5, e),
    );
    const far = new THREE.Vector3(-70, 22, 150);
    const near = new THREE.Vector3(p.x, p.y + 1.2, p.z);
    const lookT = Math.max(0, (e - 0.35) / 0.65);
    this.look.lerpVectors(far, near, lookT * lookT);
    this.camera.fov = damp(this.camera.fov, 60, 2, dt);
    this.game.renderCinematic(dt, pos, this.look, this.camera.fov);
  }

  finish() {
    if (this.done) return;
    this.done = true;
    window.removeEventListener('keydown', this.onKey);
    if (this.t < ROOM_END) this.room.dispose();
    $('intro').classList.add('hidden');
    ['intro-flash', 'intro-title', 'intro-caption'].forEach((id) => $(id).classList.remove('on', 'show'));
    $('intro-phone').classList.remove('show', 'hint', 'error');
    $('intro-phone').querySelectorAll('.on').forEach((s) => s.classList.remove('on'));
    this.onDone();
  }
}

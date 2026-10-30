import * as THREE from 'three';
import { CharacterModel } from '../player/CharacterModel';
import type { Appearance } from '../profile/types';

/** Vista 3D del personaje para la pantalla de personalización (girable con ratón o dedo). */
export class CharacterPreview {
  readonly model = new CharacterModel();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(30, 1, 0.1, 20);
  private running = false;
  private last = 0;
  private yaw = 0.35;
  private spin = 0;
  private dragging = false;
  private lastX = 0;
  private demoT = 0;

  constructor(private readonly canvas: HTMLCanvasElement, opts: { interactive?: boolean; width?: number; height?: number } = {}) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: !opts.interactive });
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.05;
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.scene.add(new THREE.HemisphereLight('#fff6e0', '#3b5a35', 1.6));
    const sun = new THREE.DirectionalLight('#fff1d6', 2.4);
    sun.position.set(2, 4, 3);
    this.scene.add(sun);
    const rim = new THREE.DirectionalLight('#9fd0ff', 1.2);
    rim.position.set(-3, 2, -3);
    this.scene.add(rim);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.7, 40), new THREE.MeshStandardMaterial({ color: '#4c6b3c', roughness: 1 }));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);
    this.scene.add(this.model.root);
    this.camera.position.set(0, 1.0, 4.4);
    this.camera.lookAt(0, 0.7, 0);
    if (opts.width && opts.height) this.setSize(opts.width, opts.height);

    if (opts.interactive) {
      canvas.addEventListener('pointerdown', (e) => { this.dragging = true; this.lastX = e.clientX; canvas.setPointerCapture(e.pointerId); });
      canvas.addEventListener('pointermove', (e) => {
        if (!this.dragging) return;
        this.yaw += (e.clientX - this.lastX) * 0.012;
        this.lastX = e.clientX;
      });
      const up = () => { this.dragging = false; };
      canvas.addEventListener('pointerup', up);
      canvas.addEventListener('pointercancel', up);
      new ResizeObserver(() => this.fit()).observe(canvas);
    }
  }

  setAppearance(a: Appearance) { this.model.setAppearance(a); this.spin = 0.6; }

  private setSize(w: number, h: number) {
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private fit() {
    const r = this.canvas.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) this.setSize(r.width, r.height);
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.fit();
    this.last = performance.now();
    const loop = (t: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (t - this.last) / 1000);
      this.last = t;
      this.render(dt);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  stop() { this.running = false; }

  private render(dt: number) {
    // Pequeña demostración: camina en el sitio de vez en cuando.
    this.demoT += dt;
    const walking = this.demoT % 8 > 5.5;
    if (this.spin > 0) { this.spin -= dt; }
    this.model.root.rotation.y = this.yaw;
    this.model.update(dt, walking ? 1.6 : 0, true, false, 0);
    this.model.root.position.set(0, 0, 0);
    this.renderer.render(this.scene, this.camera);
  }

  /** Imagen fija del personaje (para las tarjetas de perfil). */
  snapshot(a: Appearance): string {
    this.model.setAppearance(a);
    this.model.root.rotation.y = 0.4;
    for (let i = 0; i < 3; i++) this.model.update(0.016, 0, true, false, 0);
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }
}

import * as THREE from 'three';
import { rng } from '../core/math';

/** Cantidad de partículas por calidad. */
export interface ParticleBudget { motes: number; leaves: number; puffs: number; birds: number }
export const PARTICLE_BUDGET: Record<'low' | 'medium' | 'high', ParticleBudget> = {
  low: { motes: 160, leaves: 30, puffs: 16, birds: 10 },
  medium: { motes: 420, leaves: 80, puffs: 32, birds: 18 },
  high: { motes: 800, leaves: 150, puffs: 48, birds: 28 },
};

function softDot() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.55)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function dustCloud() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const r = rng(5);
  for (let i = 0; i < 14; i++) {
    const x = 20 + r() * 24, y = 22 + r() * 22, rad = 8 + r() * 14;
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, 'rgba(190,170,135,0.35)');
    gr.addColorStop(1, 'rgba(190,170,135,0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Hoja pequeña (forma de almendra con nervio). */
function leafTex() {
  const c = document.createElement('canvas');
  c.width = 32; c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(16, 2); g.quadraticCurveTo(31, 30, 16, 62); g.quadraticCurveTo(1, 30, 16, 2);
  g.fill();
  g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 1.5;
  g.beginPath(); g.moveTo(16, 4); g.lineTo(16, 60); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * Partículas ambientales alrededor de la cámara: motas de polvo que brillan
 * con el sol (luciérnagas de noche), hojas que caen, polvo que levantan los
 * dinosaurios grandes y bandadas de pájaros a lo lejos.
 */
export class Particles {
  readonly group = new THREE.Group();
  private readonly motes: THREE.Points;
  private readonly motePos: Float32Array;
  private readonly motePhase: Float32Array;
  private readonly leaves: THREE.InstancedMesh;
  private readonly leafState: { p: THREE.Vector3; v: number; spin: THREE.Vector3; ph: number }[] = [];
  private readonly puffs: THREE.Sprite[] = [];
  private puffNext = 0;
  private readonly birds: THREE.InstancedMesh;
  private readonly flocks: { c: THREE.Vector3; r: number; w: number; ph: number; h: number }[] = [];
  private readonly rand = rng(91);
  private budget: ParticleBudget;
  private time = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly e = new THREE.Euler();
  private readonly s = new THREE.Vector3();

  constructor(private readonly heightAt: (x: number, z: number) => number, budget: ParticleBudget) {
    const r = this.rand;
    this.budget = budget;
    // Motas.
    this.motePos = new Float32Array(budget.motes * 3);
    this.motePhase = new Float32Array(budget.motes);
    for (let i = 0; i < budget.motes; i++) {
      this.motePos.set([(r() - 0.5) * 50, r() * 9, (r() - 0.5) * 50], i * 3);
      this.motePhase[i] = r() * 100;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(this.motePos, 3));
    this.motes = new THREE.Points(g, new THREE.PointsMaterial({
      map: softDot(), size: 0.09, color: '#fff3c8', transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending, fog: true,
    }));
    this.motes.frustumCulled = false;
    // Hojas que caen.
    const lg = new THREE.PlaneGeometry(0.09, 0.17);
    const lm = new THREE.MeshLambertMaterial({ map: leafTex(), alphaTest: 0.5, side: THREE.DoubleSide });
    this.leaves = new THREE.InstancedMesh(lg, lm, budget.leaves);
    this.leaves.frustumCulled = false;
    const leafCols = ['#7a9a3a', '#a8952f', '#5f8a34', '#b7772c', '#8aa448'].map((c) => new THREE.Color(c));
    for (let i = 0; i < budget.leaves; i++) {
      this.leafState.push({ p: new THREE.Vector3(), v: 0.5 + r() * 0.5, spin: new THREE.Vector3(r() * 3, r() * 3, r() * 3), ph: r() * 10 });
      this.leaves.setColorAt(i, leafCols[i % leafCols.length]);
    }
    // Polvo de pisadas.
    const dust = dustCloud();
    for (let i = 0; i < budget.puffs; i++) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: dust, transparent: true, opacity: 0, depthWrite: false, fog: true }));
      sp.visible = false;
      sp.userData = { t: 1, life: 1, grow: 1 };
      this.puffs.push(sp);
      this.group.add(sp);
    }
    // Pájaros: dos alas que aletean (se anima la escala vertical de cada instancia).
    const bird = new THREE.BufferGeometry();
    bird.setAttribute('position', new THREE.Float32BufferAttribute([-0.7, 0.15, -0.1, 0, 0, 0.15, 0, 0, -0.15, 0.7, 0.15, -0.1, 0, 0, -0.15, 0, 0, 0.15], 3));
    bird.computeVertexNormals();
    this.birds = new THREE.InstancedMesh(bird, new THREE.MeshBasicMaterial({ color: '#1d2018', side: THREE.DoubleSide, fog: true }), budget.birds);
    this.birds.frustumCulled = false;
    for (let f = 0; f < 3; f++) this.flocks.push({ c: new THREE.Vector3((r() - 0.5) * 300, 0, (r() - 0.5) * 300), r: 40 + r() * 50, w: 0.06 + r() * 0.05, ph: r() * 6, h: 42 + r() * 25 });
    this.group.add(this.motes, this.leaves, this.birds);
  }

  /** Ajusta la cantidad de partículas a la calidad (sin crear objetos nuevos). */
  setBudget(b: ParticleBudget) {
    this.budget = {
      motes: Math.min(b.motes, this.motePhase.length), leaves: Math.min(b.leaves, this.leafState.length),
      puffs: Math.min(b.puffs, this.puffs.length), birds: Math.min(b.birds, this.birds.instanceMatrix.count),
    };
    this.leaves.count = this.budget.leaves;
    this.birds.count = this.budget.birds;
  }

  /** Nube de polvo bajo una pata (los dinosaurios grandes al caminar o correr). */
  puff(x: number, y: number, z: number, size: number) {
    const sp = this.puffs[this.puffNext];
    this.puffNext = (this.puffNext + 1) % this.budget.puffs;
    sp.position.set(x, y + size * 0.3, z);
    sp.userData.t = 0;
    sp.userData.life = 1.2 + size * 0.3;
    sp.userData.grow = size;
    sp.visible = true;
  }

  update(dt: number, cam: THREE.Vector3, daylight: number, reduceMotion = false) {
    this.time += dt;
    const t = this.time, night = 1 - daylight;
    // Motas: siguen a la cámara (se recolocan al salir del cubo de 50 m).
    const mat = this.motes.material as THREE.PointsMaterial;
    mat.color.set(night > 0.5 ? '#d8ff7a' : '#fff3c8');
    mat.size = night > 0.5 ? 0.16 : 0.09;
    mat.opacity = night > 0.5 ? 0.9 : 0.25 + daylight * 0.3;
    const P = this.motePos, n = this.budget.motes;
    const live = night > 0.5 ? Math.floor(n * 0.35) : n; // de noche, menos y más grandes: luciérnagas
    this.motes.geometry.setDrawRange(0, live);
    for (let i = 0; i < live; i++) {
      const k = i * 3, ph = this.motePhase[i];
      let x = P[k] + Math.sin(t * 0.3 + ph) * dt * 0.3, y = P[k + 1] + Math.sin(t * 0.5 + ph * 2) * dt * 0.15, z = P[k + 2] + Math.cos(t * 0.27 + ph) * dt * 0.3;
      if (x - cam.x > 25) x -= 50; else if (cam.x - x > 25) x += 50;
      if (z - cam.z > 25) z -= 50; else if (cam.z - z > 25) z += 50;
      const ground = this.heightAt(x, z);
      if (y < ground + 0.3 || y > ground + 9) y = ground + 0.5 + ((ph * 7.3) % 1) * 7;
      P[k] = x; P[k + 1] = y; P[k + 2] = z;
    }
    this.motes.geometry.attributes.position.needsUpdate = true;
    if (night > 0.5) mat.opacity = 0.55 + Math.sin(t * 3) * 0.3; // parpadeo

    // Hojas: caen balanceándose; reaparecen sobre la cámara.
    for (let i = 0; i < this.budget.leaves; i++) {
      const L = this.leafState[i];
      const ground = this.heightAt(L.p.x, L.p.z);
      if (L.p.y < ground || L.p.distanceToSquared(cam) > 30 * 30 || L.p.y === 0) {
        const a = this.rand() * Math.PI * 2, d = 3 + this.rand() * 24;
        L.p.set(cam.x + Math.cos(a) * d, 0, cam.z + Math.sin(a) * d);
        L.p.y = this.heightAt(L.p.x, L.p.z) + 4 + this.rand() * 12;
      }
      const sway = reduceMotion ? 0 : Math.sin(t * 1.7 + L.ph);
      L.p.x += (sway * 0.6 + 0.25) * dt;
      L.p.z += Math.cos(t * 1.3 + L.ph) * 0.4 * dt;
      L.p.y -= L.v * dt;
      this.e.set(L.spin.x * t, L.spin.y * t * 0.5, sway * 0.8);
      this.q.setFromEuler(this.e);
      this.m.compose(L.p, this.q, this.s.set(1, 1, 1));
      this.leaves.setMatrixAt(i, this.m);
    }
    this.leaves.instanceMatrix.needsUpdate = true;
    this.leaves.visible = daylight > 0.15;

    // Polvo.
    for (const sp of this.puffs) {
      if (!sp.visible) continue;
      const u = sp.userData as { t: number; life: number; grow: number };
      u.t += dt / u.life;
      if (u.t >= 1) { sp.visible = false; continue; }
      const sc = u.grow * (1 + u.t * 2.2);
      sp.scale.set(sc * 1.6, sc, 1);
      sp.position.y += dt * 0.25;
      (sp.material as THREE.SpriteMaterial).opacity = (1 - u.t) * 0.55 * (0.4 + daylight * 0.6);
    }

    // Pájaros: vuelan en círculos sobre la selva (solo de día).
    this.birds.visible = daylight > 0.3;
    if (this.birds.visible) {
      const per = Math.ceil(this.birds.count / this.flocks.length);
      for (let i = 0; i < this.birds.count; i++) {
        const f = this.flocks[Math.floor(i / per)], j = i % per;
        const a = t * f.w + f.ph - j * 0.05;
        const off = (j % 2 ? 1 : -1) * Math.ceil(j / 2) * 2.2;
        const x = f.c.x + Math.cos(a) * (f.r + off), z = f.c.z + Math.sin(a) * (f.r + off);
        const flap = Math.sin(t * 9 + j * 1.3);
        this.e.set(0, -a, 0);
        this.q.setFromEuler(this.e);
        this.m.compose(this.s.set(x, f.h + Math.sin(t * 0.5 + j) * 1.5 + Math.abs(j) * 0.3, z), this.q, new THREE.Vector3(1.4, 1 + flap * 1.6, 1.4));
        this.birds.setMatrixAt(i, this.m);
      }
      this.birds.instanceMatrix.needsUpdate = true;
    }
  }
}

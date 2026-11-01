import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Dinosaur, type SpeciesConfig } from '../creatures/Dinosaur';
import { buildKiro } from '../creatures/dinoModels';
import { buildQuatDino, hasQuat } from '../creatures/quatModels';

/** Kiro: el único dinosaurio de la isla que nunca ataca. */
export const KIRO: SpeciesConfig = {
  hp: Infinity, reaction: 'flee', attack: 0, bodyHeight: 0.6, friendly: true,
  name: 'Kiro', build: () => (hasQuat('velociraptor')
    // Velocirraptor animado de Quaternius (CC0), del tamaño de un perro grande y con tonos cálidos.
    ? buildQuatDino('velociraptor', { height: 1.3, speciesScale: 1, biped: true, colors: { Brown: '#4b4f55', LightBrown: '#d8c49b', Black: '#120f0b' } })
    : buildKiro()), scale: 1, radius: 0.3, walkSpeed: 2.6, fleeSpeed: 7, turnRate: 6,
  perception: 10, personal: 1.5, homeRadius: 10, stride: 0.6, graze: 0, behavior: 'curious',
} as SpeciesConfig;

/** Qué está haciendo Kiro en la historia. */
export type KiroMode = 'trapped' | 'scared' | 'friend';

/** Lianas enredadas alrededor de Kiro mientras está atrapado. */
function vines() {
  const g = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ color: '#3f5a22', roughness: 0.9 });
  const leaf = new THREE.MeshStandardMaterial({ color: '#5f8a2c', roughness: 0.8, side: THREE.DoubleSide });
  for (let i = 0; i < 5; i++) {
    const r = 0.35 + i * 0.06;
    const ring = new THREE.Mesh(new THREE.TorusGeometry(r, 0.035, 6, 18), mat);
    ring.position.y = 0.25 + i * 0.13;
    ring.rotation.set(Math.PI / 2 + (i % 2 ? 0.5 : -0.45), i * 0.9, 0);
    g.add(ring);
  }
  // Una liana larga que baja desde arriba, como si la hubiera arrastrado al caer.
  const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0.1, 0.5, 0), new THREE.Vector3(0.5, 1.6, 0.3), new THREE.Vector3(0.3, 3.2, 0.6), new THREE.Vector3(0.6, 5, 0.4)]);
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.04, 5), mat));
  for (let i = 0; i < 8; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(0.16, 0.08), leaf);
    const a = (i / 8) * Math.PI * 2;
    l.position.set(Math.sin(a) * 0.42, 0.3 + (i % 4) * 0.14, Math.cos(a) * 0.42);
    l.rotation.set(0.4, a, 0.3);
    g.add(l);
  }
  return g;
}

/**
 * Rayas finas azul cobalto en el lomo (solo arriba y sueltas, para que Kiro sea
 * un personaje propio y no se parezca a ninguno de una película).
 */
function addDorsalStreaks(root: THREE.Object3D) {
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (!m.isMesh) return;
    for (const mat of (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[]) {
      if (mat.name !== 'Brown' || mat.userData.streaks) continue;
      mat.userData.streaks = true;
      const bb = m.geometry.boundingBox ?? (m.geometry.computeBoundingBox(), m.geometry.boundingBox!);
      const size = bb.getSize(new THREE.Vector3());
      const lenAxis = size.x > size.z ? 0 : 2;
      const base = mat.onBeforeCompile;
      mat.onBeforeCompile = (sh, r) => {
        base.call(mat, sh, r);
        sh.uniforms.uStrY = { value: new THREE.Vector2(bb.min.y, size.y) };
        sh.uniforms.uStrLen = { value: (lenAxis === 0 ? size.x : size.z) };
        sh.fragmentShader = sh.fragmentShader
          .replace('uniform sampler2D tSkin;', 'uniform sampler2D tSkin;\nuniform vec2 uStrY;\nuniform float uStrLen;')
          .replace('#include <roughnessmap_fragment>', `{
  float h = (vSkinPos.y - uStrY.x) / uStrY.y;
  float up = smoothstep(0.25, 0.85, normalize(vSkinNrm).y);
  float along = ${lenAxis === 0 ? 'vSkinPos.x' : 'vSkinPos.z'} / uStrLen;
  float band = smoothstep(0.55, 0.9, sin(along * 46.0 + sin(along * 13.0) * 1.5) * 0.5 + 0.5);
  float streak = up * smoothstep(0.35, 0.6, h) * band * (0.55 + skinS.g * 0.45);
  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.09, 0.2, 0.55), streak * 0.85);
}
#include <roughnessmap_fragment>`);
      };
      mat.customProgramCacheKey = () => 'reptile-skin-streaks';
      mat.needsUpdate = true;
    }
  });
}

/** Collar metálico de CRONOS con una luz azul. */
function collar() {
  const g = new THREE.Group();
  const metal = new THREE.MeshStandardMaterial({ color: '#aeb9c2', metalness: 0.8, roughness: 0.3 });
  const glow = new THREE.MeshStandardMaterial({ color: '#4ef2ff', emissive: '#4ef2ff', emissiveIntensity: 1.6 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.02, 6, 16), metal);
  ring.rotation.x = Math.PI / 2;
  const tag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.05, 0.015), metal);
  tag.position.set(0, -0.12, 0.03);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.014, 6, 6), glow);
  led.position.set(0, -0.12, 0.04);
  led.name = 'led';
  g.add(ring, tag, led);
  return g;
}

/**
 * El compañero del capítulo 2. Atrapado en lianas al final del rastro; después de
 * liberarlo y darle bayas, te sigue a todas partes y chilla si se acerca un depredador.
 */
export class Kiro {
  readonly dino: Dinosaur;
  mode: KiroMode = 'trapped';
  private vines: THREE.Group | null = null;
  private readonly led: THREE.Mesh;
  private t = 0;
  private nextChirp = 2;
  private warnCooldown = 0;
  private scan = 0;
  private side = 1;
  private hop = 0;
  /** Dinosaurio al que Kiro está atacando por orden tuya. */
  private target: Dinosaur | null = null;
  private attackT = 0;
  private biteT = 0;
  /** Momento con guion (al liberarlo, salta y se aleja un poco). */
  private dashTo: THREE.Vector2 | null = null;
  private dashT = 0;

  constructor(private readonly game: Game, x: number, z: number, mode: KiroMode) {
    this.dino = new Dinosaur(KIRO, x, z, game.terrain, game.collisions, 1077);
    this.dino.rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    addDorsalStreaks(this.dino.rig.root);
    const c = collar();
    this.led = c.getObjectByName('led') as THREE.Mesh;
    // El collar va en el cuello, justo detrás de la cabeza.
    const neck = this.dino.rig.neckBones[Math.max(0, this.dino.rig.neckBones.length - 1)] ?? this.dino.rig.headBone;
    neck.add(c);
    // Los huesos del modelo animado vienen escalados: el collar se compensa para medir lo mismo.
    this.root.updateMatrixWorld(true);
    const ws = new THREE.Vector3();
    neck.getWorldScale(ws);
    c.scale.setScalar(0.6 / Math.max(1e-4, ws.x));
    this.dino.onStep = () => { if (this.mode === 'friend' && this.dino.position.distanceTo(game.player.position) < 14) game.audio.rustle(0.05, game.panOf(this.dino.position)); };
    this.setMode(mode);
  }

  get position() { return this.dino.position; }
  get root() { return this.dino.rig.root; }

  setMode(mode: KiroMode) {
    this.mode = mode;
    if (mode === 'trapped' && !this.vines) {
      this.vines = vines();
      this.vines.position.copy(this.dino.position);
      this.root.parent?.add(this.vines);
    }
    if (mode !== 'trapped' && this.vines) { this.vines.removeFromParent(); this.vines = null; }
  }

  /** Lo añade a la escena (y sus lianas, si sigue atrapado). */
  attach(parent: THREE.Object3D) {
    parent.add(this.root);
    if (this.vines) { this.vines.position.copy(this.dino.position); parent.add(this.vines); }
  }

  dispose() { this.root.removeFromParent(); this.vines?.removeFromParent(); }

  /** Al soltarlo de las lianas: da un salto y corre a esconderse a unos metros. */
  free() {
    this.setMode('scared');
    this.dashT = 0;
    const p = this.game.player.position, k = this.dino.position;
    const a = Math.atan2(k.x - p.x, k.z - p.z);
    this.dashTo = new THREE.Vector2(k.x + Math.sin(a) * 6, k.z + Math.cos(a) * 6);
  }

  /** Lo coloca junto al jugador (al cargar la partida o si se quedó muy atrás). */
  catchUp() {
    const p = this.game.player.position, f = this.game.player.facing;
    const x = p.x - Math.sin(f) * 2 + Math.cos(f) * 0.8, z = p.z - Math.cos(f) * 2 - Math.sin(f) * 0.8;
    this.dino.placeAt(x, z, f);
  }

  update(dt: number) {
    const g = this.game, d = this.dino, pp = g.player.position;
    this.t += dt;
    const dist = Math.hypot(d.position.x - pp.x, d.position.z - pp.z);
    (this.led.material as THREE.MeshStandardMaterial).emissiveIntensity = 0.9 + Math.sin(this.t * 4) * 0.7;

    if (this.mode === 'trapped') {
      // Forcejea entre las lianas y chilla para que lo encuentres.
      d.scripted(dt, d.position.x, d.position.z, 0, pp);
      d.rig.body.rotation.z = Math.sin(this.t * 9) * 0.06 * (Math.sin(this.t * 0.7) > 0.3 ? 1 : 0.2);
      this.nextChirp -= dt;
      if (this.nextChirp <= 0 && dist < 45) {
        g.audio.chirp(Math.min(0.3, 0.1 + (1 - dist / 45) * 0.25), g.panOf(d.position));
        this.nextChirp = 3 + Math.random() * 2;
      }
      return;
    }
    d.rig.body.rotation.z = 0;

    if (this.mode === 'scared') {
      if (this.dashTo) {
        d.scripted(dt, this.dashTo.x, this.dashTo.y, 5.5);
        this.dashT += dt;
        if (Math.hypot(d.position.x - this.dashTo.x, d.position.z - this.dashTo.y) < 1 || this.dashT > 2.5) this.dashTo = null;
        return;
      }
      // Desconfía pero no quiere quedarse solo: te sigue de lejos (unos 4 m).
      // Si te acercas sin comida, se aparta; con las bayas, se deja acercar.
      const hasFood = g.story.berriesReady();
      if (dist > 40) this.catchUp();
      if (!hasFood && dist < 2.6) {
        const a = Math.atan2(d.position.x - pp.x, d.position.z - pp.z);
        d.scripted(dt, d.position.x + Math.sin(a) * 3, d.position.z + Math.cos(a) * 3, 4);
      } else if (dist > 5.5) {
        const k = 4 / dist;
        d.scripted(dt, pp.x + (d.position.x - pp.x) * k, pp.z + (d.position.z - pp.z) * k, Math.min(6.5, 1.5 + dist * 0.5));
      } else d.scripted(dt, d.position.x, d.position.z, 0, pp);
      this.nextChirp -= dt;
      if (this.nextChirp <= 0 && dist < 20) { g.audio.chirp(0.12, g.panOf(d.position)); this.nextChirp = 6 + Math.random() * 4; }
      return;
    }

    // Atacando por orden tuya: corre hacia el dinosaurio y lo muerde hasta vencerlo.
    if (this.target) { this.updateAttack(dt); return; }

    // Compañero: te sigue un poco por detrás, a un lado.
    if (dist > 40 || (dist > 18 && g.terrain.waterDepthAt(d.position.x, d.position.z) > 0.4)) this.catchUp();
    const f = g.player.facing;
    if (Math.random() < dt * 0.05) this.side = -this.side;
    const tx = pp.x - Math.sin(f) * 1.8 + Math.cos(f) * 1.1 * this.side;
    const tz = pp.z - Math.cos(f) * 1.8 - Math.sin(f) * 1.1 * this.side;
    const td = Math.hypot(tx - d.position.x, tz - d.position.z);
    if (td > 1.2) d.scripted(dt, tx, tz, Math.min(7.5, 1.6 + td * 0.9));
    else d.scripted(dt, d.position.x, d.position.z, 0, pp);
    // Saltitos de alegría al acariciarlo.
    if (this.hop > 0) { this.hop -= dt; d.rig.root.position.y += Math.abs(Math.sin(this.hop * 12)) * 0.25; }

    // Avisa de los depredadores cercanos.
    this.warnCooldown -= dt;
    this.scan -= dt;
    if (this.scan <= 0) {
      this.scan = 0.5;
      if (this.warnCooldown <= 0) {
        const threat = g.dinos.find((o) => !o.down && !o.cfg.friendly && (o.cfg.reaction === 'hunt' || o.cfg.temper === 'apex')
          && Math.hypot(o.position.x - pp.x, o.position.z - pp.z) < 34);
        if (threat) {
          this.warnCooldown = 45;
          const pan = g.panOf(d.position);
          g.audio.chirp(0.32, pan);
          setTimeout(() => g.audio.chirp(0.3, pan), 260);
          setTimeout(() => g.audio.chirp(0.28, pan), 520);
          const ang = Math.atan2(threat.position.x - pp.x, threat.position.z - pp.z) - g.player.facing;
          const s = Math.sin(ang), c = Math.cos(ang);
          const where = c > 0.7 ? 'delante de ti' : c < -0.7 ? 'detrás de ti' : s > 0 ? 'a tu izquierda' : 'a tu derecha';
          g.hud.toast(`🦎 ¡Kiro chilla y se esconde! Un ${threat.cfg.name.toLowerCase()} anda cerca, ${where}. Agáchate o aléjate.`, true);
        }
      }
    }
  }

  /** Dinosaurios enemigos a los que Kiro puede atacar (cerca de ti). */
  private enemyNear(range: number) {
    const pp = this.game.player.position;
    let best: Dinosaur | null = null, bd = range;
    for (const o of this.game.dinos) {
      if (o.down || o.cfg.friendly || o.cfg.hp === Infinity) continue;
      const d = Math.hypot(o.position.x - pp.x, o.position.z - pp.z);
      if (d < bd) { bd = d; best = o; }
    }
    return best;
  }

  /** Orden «¡Kiro, ataca!»: va a por el enemigo más cercano a ti. */
  orderAttack() {
    const g = this.game;
    if (this.mode !== 'friend') return;
    if (this.target) { this.target = null; g.hud.toast('🦖 Kiro, ¡ven aquí! Vuelve a tu lado.'); this.sync(); return; }
    const t = this.enemyNear(30);
    if (!t) { g.audio.chirp(0.15, g.panOf(this.dino.position)); g.hud.toast('🦖 Kiro mira a su alrededor: no hay ningún dinosaurio cerca.'); return; }
    this.target = t;
    this.attackT = 0;
    this.biteT = 0;
    this.dino.roar(0.8);
    g.audio.chirp(0.35, g.panOf(this.dino.position));
    g.hud.toast(`🦖 ¡Kiro, ataca! Kiro corre hacia el ${t.cfg.name.toLowerCase()}.`);
    this.sync();
  }

  /** ¿Está atacando ahora? */
  get attacking() { return !!this.target; }

  private sync() { document.getElementById('btn-kiro')?.classList.toggle('busy', !!this.target); }

  private updateAttack(dt: number) {
    const g = this.game, d = this.dino, t = this.target!;
    this.attackT += dt;
    this.biteT -= dt;
    const pp = g.player.position;
    // Se rinde si el enemigo cae, se aleja mucho de ti o tarda demasiado.
    if (t.down || this.attackT > 20 || Math.hypot(t.position.x - pp.x, t.position.z - pp.z) > 45) {
      if (t.down) g.hud.toast('🦖 ¡Bien hecho, Kiro! Vuelve contigo moviendo la cola.');
      this.target = null;
      this.sync();
      return;
    }
    const reach = t.cfg.radius * t.cfg.scale + 0.9;
    const dx = t.position.x - d.position.x, dz = t.position.z - d.position.z, dist = Math.hypot(dx, dz);
    if (dist > reach) {
      // Corre hasta quedar al lado del enemigo.
      d.scripted(dt, t.position.x - (dx / dist) * (reach - 0.3), t.position.z - (dz / dist) * (reach - 0.3), 7.5);
    } else {
      d.scripted(dt, d.position.x, d.position.z, 0, t.position);
      if (this.biteT <= 0) {
        this.biteT = 0.9;
        d.roar(0.5);
        g.audio.chirp(0.3, g.panOf(d.position));
        // Mordisco: más débil que tus armas, pero ayuda mucho contra los grandes.
        t.takeHit(9, pp);
      }
    }
  }

  /** Acariciar a Kiro (solo cuando ya es tu amigo). */
  pet() {
    this.hop = 0.8;
    this.game.audio.chirp(0.22, this.game.panOf(this.dino.position));
  }
}

import { lavaDistance } from '../world/Volcano';
import { tarAt } from '../world/Features';
import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Dinosaur } from '../creatures/Dinosaur';
import { TREX } from '../creatures/species';
import type { Shelter } from '../building/Buildings';
import { clockAt, secondsUntilHour, formatClock } from '../world/DayNight';
import { NightAmbience } from './NightAmbience';
import { Kiro } from './Kiro';

/** Estado de la historia que se guarda con la partida. */
export interface StoryState {
  /** Momentos ya vividos: 'night_visit', 'tracks_seen', 'cronos', 'trail_end', mensajes ya recibidos… */
  flags: string[];
  /** Huellas del gran depredador: [x, z, rumbo]. */
  tracks: [number, number, number][];
  /** Dónde está la pieza CRONOS-047 (null si aún no ha aparecido o ya se recogió). */
  cronos: [number, number] | null;
  /** Donde termina el rastro (el camino hacia Kiro). */
  trailEnd: [number, number] | null;
  /** Dónde está Kiro atrapado entre las lianas (capítulo 2). */
  kiro: [number, number] | null;
}

export const newStory = (): StoryState => ({ flags: [], tracks: [], cronos: null, trailEnd: null, kiro: null });

/** Saca un estado válido de lo que haya en una partida (las antiguas no lo tienen). */
export function sanitizeStory(s: Partial<StoryState> | undefined): StoryState {
  const ok = (n: unknown) => typeof n === 'number' && Number.isFinite(n);
  const pair = (p: unknown) => (Array.isArray(p) && p.length === 2 && p.every(ok) ? (p as [number, number]) : null);
  return {
    flags: Array.isArray(s?.flags) ? s!.flags.filter((f) => typeof f === 'string') : [],
    tracks: Array.isArray(s?.tracks) ? s!.tracks.filter((t) => Array.isArray(t) && t.length === 3 && t.every(ok)).slice(0, 120) : [],
    cronos: pair(s?.cronos),
    trailEnd: pair(s?.trailEnd),
    kiro: pair(s?.kiro),
  };
}

const MAX_PRINTS = 120;

/** Textura de una huella de tres dedos (sirve para la grande y, más pequeña, para la de Kiro). */
function printTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  g.fillStyle = 'rgba(40, 26, 14, 0.85)';
  g.filter = 'blur(2px)';
  const toe = (ang: number, len: number) => {
    g.save();
    g.translate(64, 80);
    g.rotate(ang);
    g.beginPath();
    g.ellipse(0, -len / 2 - 8, 9, len / 2, 0, 0, Math.PI * 2);
    g.fill();
    g.restore();
  };
  toe(-0.5, 46); toe(0, 56); toe(0.5, 46);
  g.beginPath(); g.ellipse(64, 88, 20, 18, 0, 0, Math.PI * 2); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pieza metálica con «CRONOS-047» grabado. */
function cronosPiece() {
  const g = new THREE.Group();
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const x = c.getContext('2d')!;
  const grd = x.createLinearGradient(0, 0, 256, 128);
  grd.addColorStop(0, '#cfd8de'); grd.addColorStop(0.5, '#7f8b95'); grd.addColorStop(1, '#b9c3ca');
  x.fillStyle = grd; x.fillRect(0, 0, 256, 128);
  x.strokeStyle = '#55606a'; x.lineWidth = 6; x.strokeRect(6, 6, 244, 116);
  x.fillStyle = '#2b333b'; x.font = 'bold 38px monospace'; x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText('CRONOS-047', 128, 64);
  x.fillStyle = '#4ef2ff'; x.fillRect(20, 98, 216, 5);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  const metal = new THREE.MeshStandardMaterial({ color: '#ffffff', map: tex, metalness: 0.75, roughness: 0.32, emissive: '#1d6a72', emissiveIntensity: 0.35 });
  const edge = new THREE.MeshStandardMaterial({ color: '#7d8892', metalness: 0.8, roughness: 0.4 });
  const plate = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.035, 0.22), [edge, edge, metal, edge, edge, edge]);
  plate.rotation.z = 0.12;
  const gear = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.03, 8), edge);
  gear.position.set(0.2, 0.01, 0.12);
  g.add(plate, gear);
  // Destello que se ve de lejos.
  const gc = document.createElement('canvas');
  gc.width = gc.height = 64;
  const gg = gc.getContext('2d')!;
  const rg = gg.createRadialGradient(32, 32, 0, 32, 32, 32);
  rg.addColorStop(0, 'rgba(230,255,255,1)'); rg.addColorStop(0.2, 'rgba(125,249,255,0.8)'); rg.addColorStop(1, 'rgba(125,249,255,0)');
  gg.fillStyle = rg; gg.fillRect(0, 0, 64, 64);
  const glint = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glint.position.y = 0.15;
  glint.name = 'glint';
  g.add(glint);
  return g;
}

type Phase = 'off' | 'doze' | 'wake' | 'approach' | 'sniff' | 'leave' | 'calm' | 'dawn';

/**
 * Historia del capítulo 1: la visita nocturna de un gran depredador al refugio,
 * las huellas y la pieza CRONOS-047 al amanecer, y el rastro que lleva hacia Kiro.
 * También lleva los mensajes misteriosos del celular y el ambiente de terror nocturno.
 */
export class Story {
  state = newStory();
  readonly group = new THREE.Group();
  readonly ambience: NightAmbience;
  private readonly prints: THREE.InstancedMesh;
  private readonly smallPrints: THREE.InstancedMesh;
  private piece: THREE.Group | null = null;
  private visitor: Dinosaur | null = null;
  private phase: Phase = 'off';
  private t = 0;
  private home: Shelter | null = null;
  private sniffAt = new THREE.Vector2();
  private leaveTo = new THREE.Vector2();
  private stepSide = 1;
  private nextBreath = 0;
  private sniffs = 0;
  private spooked = false;
  private time = 0;
  private checkT = 0;
  /** El compañero del capítulo 2 (aparece al final del rastro). */
  kiro: Kiro | null = null;

  constructor(private readonly game: Game) {
    this.group.name = 'story';
    const tex = printTexture();
    const mat = new THREE.MeshStandardMaterial({ map: tex, transparent: true, depthWrite: false, roughness: 1, polygonOffset: true, polygonOffsetFactor: -2 });
    this.prints = new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1, 1.3), mat, MAX_PRINTS);
    this.prints.count = 0;
    this.prints.frustumCulled = false;
    this.smallPrints = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.22, 0.26), mat, 12);
    this.smallPrints.count = 0;
    this.smallPrints.frustumCulled = false;
    this.ambience = new NightAmbience(game.terrain, game.audio);
    this.group.add(this.prints, this.smallPrints, this.ambience.group);
  }

  has(f: string) { return this.state.flags.includes(f); }
  private flag(f: string) { if (!this.has(f)) this.state.flags.push(f); }
  /** Hay un evento con guion en marcha (no se puede dormir ni guardar en medio). */
  get visiting() { return this.phase !== 'off'; }

  load(s: Partial<StoryState> | undefined) {
    this.state = sanitizeStory(s);
    this.rebuildPrints();
    this.placePiece();
    this.kiro?.dispose();
    this.kiro = null;
  }

  export(): StoryState { return structuredClone(this.state); }

  // ---------------------------------------------------------------- huellas y pieza

  private setPrint(mesh: THREE.InstancedMesh, i: number, x: number, z: number, heading: number, lift = 0.05) {
    const o = new THREE.Object3D();
    o.position.set(x, this.game.terrain.heightAt(x, z) + lift, z);
    o.rotation.set(-Math.PI / 2, heading + Math.PI, 0, 'YXZ');
    o.updateMatrix();
    mesh.setMatrixAt(i, o.matrix);
  }

  private rebuildPrints() {
    const tr = this.state.tracks;
    tr.forEach(([x, z, h], i) => this.setPrint(this.prints, i, x, z, h));
    this.prints.count = tr.length;
    this.prints.instanceMatrix.needsUpdate = true;
    // Al final del rastro, unas huellas diminutas se meten entre los helechos.
    const end = this.state.trailEnd;
    if (end && tr.length > 1) {
      const [px, pz] = [tr[tr.length - 1][0], tr[tr.length - 1][1]];
      const h = Math.atan2(end[0] - px, end[1] - pz) + 0.9;
      for (let i = 0; i < 10; i++) {
        const d = 1 + i * 0.45, side = i % 2 ? 0.1 : -0.1;
        this.setPrint(this.smallPrints, i, end[0] + Math.sin(h) * d + Math.cos(h) * side, end[1] + Math.cos(h) * d - Math.sin(h) * side, h, 0.04);
      }
      this.smallPrints.count = 10;
      this.smallPrints.instanceMatrix.needsUpdate = true;
    } else this.smallPrints.count = 0;
  }

  private addPrint(x: number, z: number, heading: number) {
    if (this.state.tracks.length >= MAX_PRINTS) return;
    this.state.tracks.push([x, z, heading]);
    this.setPrint(this.prints, this.state.tracks.length - 1, x, z, heading);
    this.prints.count = this.state.tracks.length;
    this.prints.instanceMatrix.needsUpdate = true;
  }

  private placePiece() {
    if (this.piece) { this.group.remove(this.piece); this.piece = null; }
    const c = this.state.cronos;
    if (!c) return;
    this.piece = cronosPiece();
    this.piece.position.set(c[0], this.game.terrain.heightAt(c[0], c[1]) + 0.06, c[1]);
    this.piece.rotation.y = 0.7;
    this.group.add(this.piece);
  }

  /** Puntos de la historia para el minimapa. */
  markers(): { x: number; z: number; color: string; size: number }[] {
    const m: { x: number; z: number; color: string; size: number }[] = [];
    if (this.state.cronos) m.push({ x: this.state.cronos[0], z: this.state.cronos[1], color: '#7df9ff', size: 3.5 });
    else if (this.has('cronos') && this.state.trailEnd && !this.has('trail_end')) m.push({ x: this.state.trailEnd[0], z: this.state.trailEnd[1], color: '#7df9ff', size: 3.5 });
    else if (this.has('trail_end') && !this.has('kiro_found') && this.state.kiro) m.push({ x: this.state.kiro[0], z: this.state.kiro[1], color: '#7df9ff', size: 3.5 });
    return m;
  }

  /** ¿Está la pieza al alcance para recogerla? */
  pieceNear(p: THREE.Vector3) {
    const c = this.state.cronos;
    return !!c && Math.hypot(c[0] - p.x, c[1] - p.z) < 2.6;
  }

  async takePiece() {
    const g = this.game;
    if (!this.state.cronos) return;
    this.state.cronos = null;
    this.placePiece();
    this.flag('cronos');
    g.audio.pickup();
    g.audio.signal(0.12);
    if (g.session && !g.session.save.specialItems.includes('cronos_047')) g.session.save.specialItems.push('cronos_047');
    g.objectives.set('cronos', 1);
    g.input.enabled = false;
    await g.hud.storyCard('Pieza metálica: CRONOS-047',
      'Es metal pulido, frío y muy liso, con letras grabadas. Nada en esta isla está hecho así… ¿Alguien más llegó aquí desde el futuro? ' +
      'Junto a la pieza, las huellas gigantes siguen hacia la selva.',
      '<span class="plate">CRONOS-047</span>');
    g.input.flush();
    g.input.enabled = !g.paused && !g.hotbar.craftOpen;
    setTimeout(() => { g.audio.signal(0.14); g.hud.phone('«…CRONOS-047… señal recuperada… sigue el rastro…»'); }, 1500);
    void g.save('fragment');
  }

  // ---------------------------------------------------------------- mensajes

  /** Mensajes del celular según el momento (cada uno, una sola vez por partida). */
  private message(id: string, text: string, delay = 0) {
    if (this.has(`msg_${id}`)) return;
    this.flag(`msg_${id}`);
    setTimeout(() => { this.game.audio.signal(0.13); this.game.hud.phone(text); }, delay);
  }

  /** Al empezar a jugar tras la introducción. */
  afterIntro() { this.message('wake', 'Mensaje sin remitente: «No hagas ruido cuando oscurezca.»', 8000); }

  /** Al anochecer. */
  onDusk(day: number) {
    if (day === 1) this.message('dusk1', '«…ellos cazan de noche… escóndete y no corras…»', 3500);
    else if (this.has('cronos') && !this.has('trail_end')) this.message('dusk_trail', '«…el rastro… alguien te espera al final…»', 3500);
  }

  // ---------------------------------------------------------------- visita nocturna

  /** ¿Toca la visita del depredador? (la primera vez que duermes de noche en el refugio). */
  shouldVisit(night: boolean) { return night && !this.has('night_visit') && !this.visiting; }

  /** Busca un camino transitable que se aleja del refugio (para el rastro). */
  private findTrail(from: THREE.Vector2, avoid: number): THREE.Vector2 {
    const g = this.game;
    let best = new THREE.Vector2(from.x + 50, from.y), bestScore = -1;
    for (let k = 0; k < 16; k++) {
      const a = (k / 16) * Math.PI * 2;
      if (Math.abs(Math.atan2(Math.sin(a - avoid), Math.cos(a - avoid))) < 0.9) continue;
      let ok = 0;
      for (let d = 4; d <= 60; d += 4) {
        const x = from.x + Math.sin(a) * d, z = from.y + Math.cos(a) * d;
        if (Math.abs(x) > 230 || Math.abs(z) > 230 || g.terrain.waterDepthAt(x, z) > 0.3 || lavaDistance(x, z).d < 3 || tarAt(x, z) > 0) break;
        ok++;
      }
      if (ok > bestScore) { bestScore = ok; best = new THREE.Vector2(from.x + Math.sin(a) * ok * 4, from.y + Math.cos(a) * ok * 4); }
    }
    return best;
  }

  startVisit(home: Shelter) {
    const g = this.game;
    this.home = home;
    this.phase = 'doze';
    this.t = 0;
    this.spooked = false;
    this.sniffs = 0;
    g.resting = true;
    g.input.enabled = false;
    g.input.flush();
    g.survival.frozen = true;
    g.player.velocity.set(0, 0, 0);
    g.hud.sleepOverlay('Zzz… Duermes calentito junto a la fogata');
  }

  private doorDir() { const r = this.home!.root.rotation.y; return new THREE.Vector2(Math.sin(r), Math.cos(r)); }

  private beginWake() {
    const g = this.game, home = this.home!;
    // Despiertas de madrugada.
    const c = clockAt(g.gameTime);
    if (!(c.night && c.hour >= 0 && c.hour < 4)) g.advanceTime(secondsUntilHour(g.gameTime, 1.5));
    const p = home.inside();
    g.player.spawn(p.x, p.z);
    g.player.facing = home.root.rotation.y;
    g.cam.yaw = g.player.facing + Math.PI;
    g.cam.snap();
    g.updateTimeOfDay(true);
    g.survival.energy = Math.max(g.survival.energy, 60);
    g.hud.sleepOverlay(`${formatClock(g.worldClock)} · Un ruido te despierta…`);
    this.ambience.override = true;
    this.state.tracks = [];
    this.rebuildPrints();
    g.audio.hush(1);
    g.audio.setTension(0.5);
    // El visitante llega por delante de la puerta, para que se vea su silueta.
    const door = this.doorDir();
    const base = new THREE.Vector2(home.position.x, home.position.z);
    const side = Math.random() < 0.5 ? -1 : 1;
    const ang = Math.atan2(door.x, door.y) + side * 0.35;
    this.sniffAt.set(base.x + Math.sin(ang) * 8, base.y + Math.cos(ang) * 8);
    const startA = ang + side * 0.5;
    const start = new THREE.Vector2(base.x + Math.sin(startA) * 46, base.y + Math.cos(startA) * 46);
    this.leaveTo.copy(this.findTrail(this.sniffAt, Math.atan2(start.x - this.sniffAt.x, start.y - this.sniffAt.y)));
    if (!this.visitor) {
      this.visitor = new Dinosaur({ ...TREX, name: 'Sombra', friendly: true, scale: 1.3 }, start.x, start.y, g.terrain, g.collisions, 4747);
      this.visitor.rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
      this.visitor.onStep = (d) => this.visitorStep(d);
      this.group.add(this.visitor.rig.root);
    }
    this.visitor.placeAt(start.x, start.y, Math.atan2(this.sniffAt.x - start.x, this.sniffAt.y - start.y));
    this.visitor.rig.root.visible = true;
  }

  private visitorStep(d: Dinosaur) {
    const g = this.game, cam = g.camera.position, dist = d.position.distanceTo(cam);
    g.audio.bigStep(Math.min(0.55, 0.65 * (1 - dist / 70)), 6);
    if (dist < 40) g.shakeCamera(0.45 * (1 - dist / 40));
    if (this.phase === 'leave' || this.phase === 'sniff') {
      this.stepSide = -this.stepSide;
      const h = d.heading, off = 0.75 * this.stepSide;
      this.addPrint(d.position.x + Math.cos(h) * off, d.position.z - Math.sin(h) * off, h);
    }
  }

  private finishVisit() {
    const g = this.game, home = this.home!;
    const night = true;
    this.flag('night_visit');
    // Al amanecer: la pieza metálica brilla en el barro, junto a las huellas.
    const tr = this.state.tracks;
    const near = tr.length ? tr[Math.min(tr.length - 1, 3)] : [this.sniffAt.x, this.sniffAt.y, 0];
    const cx = near[0] + Math.cos(near[2]) * 1.6, cz = near[1] - Math.sin(near[2]) * 1.6;
    this.state.cronos = [cx, cz];
    this.state.trailEnd = tr.length ? [tr[tr.length - 1][0], tr[tr.length - 1][1]] : [this.leaveTo.x, this.leaveTo.y];
    this.placePiece();
    this.rebuildPrints();
    g.advanceTime(secondsUntilHour(g.gameTime, 6.5));
    const p = home.inside();
    g.player.spawn(p.x, p.z);
    g.player.facing = home.root.rotation.y;
    g.cam.yaw = g.player.facing + Math.PI;
    g.cam.snap();
    const sv = g.survival;
    sv.energy = 100;
    sv.add('health', night ? 50 : 20);
    sv.hunger = Math.max(15, sv.hunger - 20);
    sv.thirst = Math.max(15, sv.thirst - 20);
    if (g.session) g.session.save.world.lastSafe = [p.x, p.z];
    g.updateTimeOfDay(true);
    g.hud.sleepOverlay(`🌅 Día ${g.worldClock.day} · ${formatClock(g.worldClock)}`);
  }

  private endVisit() {
    const g = this.game;
    this.phase = 'off';
    g.hud.sleepOverlay(null);
    g.resting = false;
    g.survival.frozen = g.paused;
    if (!g.paused) { g.input.enabled = !g.hotbar.craftOpen; g.input.flush(); }
    this.ambience.override = false;
    g.audio.hush(0);
    g.audio.setTension(0);
    g.objectives.set('sleep', 1);
    g.objectives.set('night_visit', 1);
    g.hud.toast('🌅 Amanece. Junto al refugio hay huellas enormes en el barro… y algo brilla entre ellas.', true);
    void g.save('shelter');
  }

  /** Avanza el guion de la visita (se llama cada fotograma, nunca durante la pausa). */
  private updateVisit(dt: number) {
    const g = this.game, v = this.visitor;
    this.t += dt;
    const home = this.home!;
    const inside = !!g.buildings.insideShelter(g.player.position);
    switch (this.phase) {
      case 'doze':
        if (this.t > 1.3) { this.beginWake(); this.phase = 'wake'; this.t = 0; }
        break;
      case 'wake':
        if (this.t > 2.4) {
          g.hud.sleepOverlay(null);
          g.resting = false;
          g.survival.frozen = false;
          g.input.enabled = true;
          g.input.flush();
          g.hud.toast('🤫 Los grillos se han callado de golpe. Quédate dentro del refugio y no hagas ruido…', true);
          this.phase = 'approach'; this.t = 0;
        }
        break;
      case 'approach': {
        v!.scripted(dt, this.sniffAt.x, this.sniffAt.y, 2.3, home.position);
        g.audio.setTension(0.5 + Math.min(0.5, this.t / 20));
        this.breath(dt, v!);
        if (v!.position.distanceTo(new THREE.Vector3(this.sniffAt.x, v!.position.y, this.sniffAt.y)) < 1.2 || this.t > 30) {
          this.phase = 'sniff'; this.t = 0;
          const h = v!.heading;
          for (const side of [-1, 1]) this.addPrint(v!.position.x + Math.cos(h) * 0.75 * side, v!.position.z - Math.sin(h) * 0.75 * side + side * 0.3, h);
          g.hud.toast('Algo enorme olfatea alrededor del refugio… No te muevas.', true);
        }
        break;
      }
      case 'sniff': {
        v!.scripted(dt, this.sniffAt.x, this.sniffAt.y, 0, home.position);
        const pan = g.panOf(v!.position);
        if (this.sniffs < 3 && this.t > 0.6 + this.sniffs * 2.4) { g.audio.sniff(0.45, pan); this.sniffs++; v!.roar(0.5); }
        if (this.t > 8) {
          g.audio.dinoCall('growl', 0.45, pan);
          this.phase = 'leave'; this.t = 0;
        }
        break;
      }
      case 'leave': {
        v!.scripted(dt, this.leaveTo.x, this.leaveTo.y, this.spooked ? 3.4 : 2.2);
        const away = Math.hypot(v!.position.x - home.position.x, v!.position.z - home.position.z);
        g.audio.setTension(Math.max(0.1, 1 - away / 50));
        if (away > 56 || v!.position.distanceTo(new THREE.Vector3(this.leaveTo.x, v!.position.y, this.leaveTo.y)) < 1.5 || this.t > 40) {
          v!.rig.root.visible = false;
          this.phase = 'calm'; this.t = 0;
          g.audio.hush(0);
          g.hud.toast('Los grillos vuelven a cantar… Se ha ido. Intenta dormir otra vez.');
        }
        break;
      }
      case 'calm':
        g.audio.setTension(0);
        if (this.t > 3.5) {
          g.resting = true;
          g.input.enabled = false;
          g.input.flush();
          g.survival.frozen = true;
          g.hud.sleepOverlay('Zzz… Vuelves a dormirte, abrazado a tu mochila');
          this.phase = 'dawn'; this.t = 0;
        }
        break;
      case 'dawn':
        if (this.t > 1.3 && this.t - dt <= 1.3) this.finishVisit();
        if (this.t > 3.4) this.endVisit();
        break;
    }
    // Si sales del refugio mientras está cerca, te oye: gruñe y se marcha (sin atacar).
    if (v && !inside && !this.spooked && (this.phase === 'approach' || this.phase === 'sniff')) {
      this.spooked = true;
      g.audio.roar(0.5);
      v.roar(1.6);
      g.hud.toast('¡Te ha oído! Gruñe en la oscuridad y se aleja… Vuelve al refugio.', true);
      this.phase = 'leave'; this.t = 0;
    }
  }

  private breath(dt: number, v: Dinosaur) {
    this.nextBreath -= dt;
    const dist = v.position.distanceTo(this.game.player.position);
    if (this.nextBreath <= 0 && dist < 30) { this.game.audio.breathe(0.35 * (1 - dist / 30), this.game.panOf(v.position)); this.nextBreath = 3.2; }
  }

  // ---------------------------------------------------------------- cada fotograma

  update(dt: number, night: number, sheltered: boolean) {
    const g = this.game, pp = g.player.position;
    this.time += dt;
    if (this.visiting) this.updateVisit(dt);
    else this.ambience.update(dt, night, pp, g.camera, (p) => g.panOf(p), g.dinos.filter((d) => !d.down), sheltered);

    this.updateKiro(dt);
    if (this.piece) {
      const glint = this.piece.getObjectByName('glint') as THREE.Sprite;
      const s = 0.35 + (Math.sin(this.time * 3) * 0.5 + 0.5) * 0.45;
      glint.scale.setScalar(s);
      glint.material.opacity = 0.55 + Math.sin(this.time * 7) * 0.3;
    }

    this.checkT += dt;
    if (this.checkT < 0.3 || this.visiting) return;
    this.checkT = 0;
    // Los objetivos de la misión siguen a lo que ya ha pasado en la historia.
    this.checkKiro();
    if (g.objectives.current?.id === 'huellas') {
      for (const [f, id] of [['night_visit', 'night_visit'], ['tracks_seen', 'tracks'], ['cronos', 'cronos'], ['trail_end', 'follow_tracks']] as const)
        if (this.has(f)) g.objectives.set(id, 1);
    }
    // Examinar las huellas junto al refugio.
    if (this.has('night_visit') && !this.has('tracks_seen')) {
      const tr = this.state.tracks;
      if (tr.some(([x, z]) => Math.hypot(x - pp.x, z - pp.z) < 3.5)) {
        this.flag('tracks_seen');
        g.objectives.set('tracks', 1);
        g.hud.toast('🐾 Huellas de tres dedos, más grandes que tu cabeza. Lo que vino anoche era enorme.', true);
      }
    }
    // Seguir el rastro hasta el final: allí empiezan unas huellas diminutas.
    const end = this.state.trailEnd;
    if (end && this.has('cronos') && !this.has('trail_end') && Math.hypot(end[0] - pp.x, end[1] - pp.z) < 6) {
      this.flag('trail_end');
      g.objectives.set('follow_tracks', 1);
      const p = new THREE.Vector3(end[0], pp.y, end[1]);
      g.audio.chirp(0.25, g.panOf(p));
      setTimeout(() => g.audio.rustle(0.25, g.panOf(p)), 700);
      setTimeout(() => g.audio.chirp(0.15, g.panOf(p) * 0.6), 1600);
      g.hud.toast('Las huellas gigantes se pierden aquí… pero salen otras diminutas. Algo pequeño chilla entre los helechos y huye asustado.', true);
      this.message('kiro', '«No le tengas miedo. Necesita ayuda… igual que tú.»', 4500);
      void g.save('mission');
    }
  }

  // ---------------------------------------------------------------- capítulo 2: Kiro

  /** Crea a Kiro cuando toca (al final del rastro, o al cargar una partida en la que ya está). */
  private updateKiro(dt: number) {
    if (!this.has('trail_end')) return;
    const g = this.game;
    if (!this.kiro) {
      let x: number, z: number;
      if (this.state.kiro) [x, z] = this.state.kiro;
      else {
        // Unos metros más allá de las huellas diminutas, entre los helechos.
        const end = this.state.trailEnd ?? [g.player.position.x, g.player.position.z];
        const tr = this.state.tracks;
        const last = tr.length ? tr[tr.length - 1] : [end[0] - 1, end[1] - 1];
        const h = Math.atan2(end[0] - last[0], end[1] - last[1]) + 0.9;
        x = end[0] + Math.sin(h) * 11; z = end[1] + Math.cos(h) * 11;
      }
      const mode = this.has('kiro_friend') ? 'friend' : this.has('kiro_free') ? 'scared' : 'trapped';
      this.kiro = new Kiro(g, x, z, mode);
      this.kiro.attach(this.group);
      if (!this.state.kiro) this.state.kiro = [this.kiro.position.x, this.kiro.position.z];
      if (mode === 'friend') this.kiro.catchUp();
    }
    this.kiro.update(dt);
  }

  /** Avances del capítulo 2 que dependen de dónde estás (se mira unas veces por segundo). */
  private checkKiro() {
    const g = this.game, k = this.kiro, pp = g.player.position;
    if (g.objectives.current?.id === 'kiro') {
      for (const [f, id] of [['kiro_found', 'kiro_find'], ['kiro_free', 'kiro_free'], ['kiro_friend', 'kiro_feed'], ['kiro_home', 'kiro_home']] as const)
        if (this.has(f)) g.objectives.set(id, 1);
      if (this.has('kiro_friend')) g.objectives.set('kiro_berries', 3);
    }
    if (!k) return;
    const dist = Math.hypot(k.position.x - pp.x, k.position.z - pp.z);
    if (!this.has('kiro_found') && dist < 8) {
      this.flag('kiro_found');
      g.objectives.set('kiro_find', 1);
      g.audio.chirp(0.3, g.panOf(k.position));
      g.hud.toast('🌿 ¡Es un dinosaurio pequeñito! Está enredado en unas lianas y no puede soltarse. Chilla de miedo…', true);
      void g.save('mission');
    }
    if (this.has('kiro_friend') && !this.has('kiro_home')) {
      const home = g.buildings.insideShelter(pp) ?? g.buildings.nearest(pp, 6, true);
      if (home && dist < 8) {
        this.flag('kiro_home');
        g.objectives.set('kiro_home', 1);
        k.pet();
        g.hud.toast('🔥 Kiro olfatea tu refugio, da tres vueltas y se acurruca junto a la fogata. Ya no estás solo en la isla.', true);
        this.message('kiro_home', '«…K-1R0 a salvo… busquen los fragmentos del tiempo… el portal aún puede abrirse…»', 6000);
        void g.save('mission');
      }
    }
  }

  private objective(id: string) { return this.game.objectives.missions.flatMap((m) => m.list).find((o) => o.id === id); }

  /** Ya tienes las 3 bayas para Kiro. */
  berriesReady() { return !!this.objective('kiro_berries')?.done; }

  /** Las bayas que recoges ahora se guardan para Kiro en vez de comerlas. */
  wantsBerries() { return this.has('kiro_free') && !this.has('kiro_friend') && !this.berriesReady(); }

  giveBerry() {
    const g = this.game;
    g.objectives.add('kiro_berries');
    const o = this.objective('kiro_berries');
    g.hud.toast(o?.done ? '🫐 ¡Ya tienes 3 bayas! Vuelve con la criatura y ofréceselas despacio.' : `🫐 Guardas la baya para la criatura (${o?.progress ?? 0}/3)`);
  }

  /** Qué puedes hacer ahora con Kiro (para el botón de interactuar), o null. */
  kiroAction(pp: THREE.Vector3): { label: string; run: () => void } | null {
    const k = this.kiro;
    if (!k) return null;
    const dist = Math.hypot(k.position.x - pp.x, k.position.z - pp.z);
    if (k.mode === 'trapped' && dist < 2.8) return { label: 'Soltar a la criatura de las lianas 🌿', run: () => this.freeKiro() };
    if (k.mode === 'scared' && this.berriesReady() && dist < 3.2) return { label: 'Ofrecerle las bayas 🫐', run: () => void this.feedKiro() };
    return null;
  }

  /** Acariciar a Kiro (prioridad baja: solo si no hay otra cosa que hacer). */
  petAction(pp: THREE.Vector3) {
    const k = this.kiro;
    if (!k || k.mode !== 'friend' || Math.hypot(k.position.x - pp.x, k.position.z - pp.z) > 1.9) return null;
    return { label: 'Acariciar a Kiro 🦎', run: () => { k.pet(); this.game.hud.toast('💛 Kiro cierra los ojos y mueve la cola.'); } };
  }

  private freeKiro() {
    const g = this.game;
    if (!this.kiro || this.kiro.mode !== 'trapped') return;
    this.flag('kiro_free');
    g.audio.rustle(0.35, g.panOf(this.kiro.position));
    this.kiro.free();
    g.objectives.set('kiro_free', 1);
    setTimeout(() => g.hud.toast('Se suelta de un tirón y corre a esconderse. Está flaquita y tiembla… ¿tendrá hambre? Busca 3 bayas 🫐', true), 900);
    void g.save('mission');
  }

  private async feedKiro() {
    const g = this.game, k = this.kiro;
    if (!k || k.mode !== 'scared') return;
    this.flag('kiro_friend');
    k.setMode('friend');
    k.pet();
    g.objectives.set('kiro_feed', 1);
    if (g.session && !g.session.save.specialItems.includes('kiro')) g.session.save.specialItems.push('kiro');
    g.input.enabled = false;
    await g.hud.storyCard('Un nuevo amigo: Kiro',
      'Come las bayas de tu mano, una por una, y por fin deja de temblar. Al acercarse ves que lleva un collar de metal, ' +
      'del mismo metal que la pieza CRONOS-047. En la placa pone «K-1R0»… Kiro. ' +
      'Alguien más estuvo en esta isla antes que tú, y Kiro lo conoció. Ahora te sigue a todas partes y chilla si hay peligro.',
      '<span class="plate">K-1R0</span>');
    g.input.flush();
    g.input.enabled = !g.paused && !g.hotbar.craftOpen;
    setTimeout(() => { g.audio.signal(0.14); g.hud.phone('«…señal de K-1R0 detectada… no se separen…»'); }, 1500);
    setTimeout(() => g.hud.toast('🛖 Kiro te sigue. Llévalo a tu refugio para que esté a salvo.'), 9000);
    void g.save('mission');
  }
}

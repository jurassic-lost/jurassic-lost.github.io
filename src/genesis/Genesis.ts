import * as THREE from 'three';
import type { Game } from '../core/Game';
import { Dinosaur } from '../creatures/Dinosaur';
import { ALLOSAURUS } from '../creatures/species';
import { CharacterModel } from '../player/CharacterModel';
import { DAY_SECONDS, START_OFFSET, hourToCycle, clockAt } from '../world/DayNight';
import { windTime } from '../core/textures';
import type { MapMarker } from '../ui/HUD';
import { CITY, CITY_HALF, City, PLAY, blockedLine } from './city';
import { GENESIS_MISSIONS, type GenesisMission } from './missions';
import { newGenesisState, sanitizeGenesis, type GenesisState } from './state';

/** Hora del juego (día d, hora h) como segundos de partida. */
export function gameTimeAt(day: number, hour: number) {
  return (day - 1) * DAY_SECONDS + hourToCycle(hour) * DAY_SECONDS - START_OFFSET;
}

type Phase = 'play' | 'intro' | 'attack' | 'caught' | 'sleep';
type PredMode = 'off' | 'stalk' | 'leave' | 'patrol' | 'chase' | 'search';

/** Recorrido del depredador de día (calles del perímetro, lejos de la casa y de la tienda). */
const PATROL: [number, number][] = [[-60, 42], [70, 42], [81, 30], [81, -30], [70, -42], [-60, -42], [-81, -30], [-81, 30]];

const v3 = () => new THREE.Vector3();

/**
 * Proyecto Génesis — Fase 1 (vertical slice): la primera noche en la ciudad.
 * Usa el mismo jugador, cámara, controles, supervivencia, guardado y dinosaurios del juego;
 * solo cambia el escenario (ciudad) y la lógica de misiones M01–M05.
 */
export class Genesis {
  readonly city: City;
  readonly predator: Dinosaur;
  /** Persona desconocida que huye por la calle (en la escena del ataque; nunca se ve el contacto). */
  readonly runner = new CharacterModel({ character: 'boy', skin: '#c68560', hairStyle: 'corto', hairColor: '#2a1a12', shirt: '#e8c22e', pants: '#2f4d78' });
  st: GenesisState;
  phase: Phase = 'play';
  private t = 0;
  private time = 0;
  /** Escondido en el ropero. */
  hidden = false;
  /** Cuánto te ha visto el depredador (0…1; a 1 te descubre). */
  seen = 0;
  predMode: PredMode = 'off';
  private predT = 0;
  private patrolIdx = 0;
  private lastSeen = v3();
  private lostT = 0;
  private warnT = 0;
  private sniffT = 0;
  private doorOpen = false;
  private cine: { pos: THREE.Vector3; look: THREE.Vector3; fov: number } | null = null;
  private readonly skipBtn: HTMLButtonElement;
  private readonly flashlight: THREE.SpotLight;
  private readonly eye = v3();
  private readonly target = v3();
  private markers: MapMarker[] = [];
  private catchFired = false;

  constructor(private readonly game: Game) {
    const g = game;
    const shadows = g.settings.quality !== 'low';
    this.city = new City(g.collisions, shadows);
    g.scene.add(this.city.group);
    // Suelo plano de la ciudad (la isla sigue igual: la ciudad está muy lejos de ella).
    g.terrain.flatZone = { x0: CITY.x - CITY_HALF, x1: CITY.x + CITY_HALF, z0: CITY.z - CITY_HALF, z1: CITY.z + CITY_HALF, h: 0 };
    // Se ocultan la isla y sus criaturas (no se borran: la isla vuelve al elegir Historia).
    for (const o of [g.terrain.mesh, g.terrain.water, g.vegetation.group, g.shafts.group, g.volcano.group, g.tar.group, g.bridges.group,
      g.collectibles.group, g.meat.group, g.buildings.group, g.story.group, g.particles.group, g.env.backdrop]) o.visible = false;
    for (const d of g.dinos) d.rig.root.visible = false;
    for (const p of g.pterosaurs) p.root.visible = false;
    for (const tr of g.trapped) tr.d.rig.root.visible = false;
    g.audio.urban = true;
    g.player.bounds = { x0: CITY.x + PLAY.x0, x1: CITY.x + PLAY.x1, z0: CITY.z + PLAY.z0, z1: CITY.z + PLAY.z1 };
    g.hud.setMap(this.city.mapImage, CITY.x, CITY.z, CITY_HALF,
      '<span style="--c:#ffcf4a">▲ Tú</span><span style="--c:#7fb4d8">■ Tu casa</span><span style="--c:#d0533e">■ Tienda</span><span style="--c:#7df9ff">● Suministros</span>');

    // Depredador provisional (modelo GLB de Ivan / procedural): placeholder hasta tener modelos propios.
    this.predator = new Dinosaur({ ...ALLOSAURUS, name: 'Depredador', friendly: true }, CITY.x - 70, CITY.z - 1, g.terrain, g.collisions, 4242);
    this.predator.rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = shadows; });
    this.predator.onStep = () => g.audio.bigStep(0.25, 1.4);
    g.scene.add(this.predator.rig.root);
    this.predator.rig.root.visible = false;
    this.runner.root.scale.setScalar(1.18);
    this.runner.root.visible = false;
    g.scene.add(this.runner.root);

    this.flashlight = new THREE.SpotLight('#fff3d6', 0, 26, 0.45, 0.5, 1.2);
    g.scene.add(this.flashlight, this.flashlight.target);

    this.skipBtn = document.createElement('button');
    this.skipBtn.id = 'gen-skip';
    this.skipBtn.textContent = 'Omitir ⏭';
    this.skipBtn.className = 'hidden';
    this.skipBtn.style.cssText = 'position:fixed;right:calc(16px + env(safe-area-inset-right,0px));bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:8;padding:10px 16px;border-radius:12px;border:2px solid #ffcf4a;background:rgba(0,0,0,0.65);color:#fff;font-size:16px;pointer-events:auto';
    this.skipBtn.addEventListener('pointerdown', (e) => e.stopPropagation());
    this.skipBtn.addEventListener('click', (e) => { e.stopPropagation(); this.skip(); });
    document.body.appendChild(this.skipBtn);

    this.st = sanitizeGenesis(g.session?.save.genesis ?? newGenesisState());
    if (g.session) { g.session.save.genesis = this.st; g.session.save.campaignId = 'genesis_city'; g.session.save.worldId = 'ciudad_sector_piloto'; }
    // Interfaz: sin armas ni materiales de la isla (aquí se trata de esconderse, no de pelear).
    for (const id of ['materials', 'hotbar', 'btn-craft', 'btn-attack', 'btn-friends']) document.getElementById(id)?.classList.add('genesis-off');
    document.body.classList.add('genesis');
  }

  // ---------------------------------------------------------------- misiones

  has(mid: string, oid: string) { return this.st.done.includes(`${mid}.${oid}`); }
  missionDone(mid: string) { return this.st.missions.includes(mid); }
  get current(): GenesisMission | null {
    return GENESIS_MISSIONS.find((m) => !this.missionDone(m.id) && m.requires.every((r) => this.missionDone(r))) ?? null;
  }
  private active(mid: string) { return this.current?.id === mid; }

  /** Cumple un objetivo; si era el último, termina la misión y empieza la siguiente. */
  complete(mid: string, oid: string) {
    if (!this.active(mid) || this.has(mid, oid)) return;
    this.st.done.push(`${mid}.${oid}`);
    this.game.audio.pickup();
    const m = GENESIS_MISSIONS.find((x) => x.id === mid)!;
    if (m.objectives.every((o) => this.has(mid, o.id))) {
      this.st.missions.push(mid);
      this.game.session?.addXp(40, 'mission');
      const next = this.current;
      this.game.hud.toast(next ? `🏆 ${m.title}: ¡hecho! Ahora: ${next.title}` : `🏆 ${m.title}: ¡hecho!`, true);
      this.onMissionStart(next);
    }
    this.showObjective();
    void this.game.save('mission');
  }

  showObjective() {
    const m = this.current;
    if (!m) { this.game.hud.setObjective('Fin de la demo (Fase 1)', [{ text: 'Explora el barrio con tu linterna', done: false }]); return; }
    this.game.hud.setObjective(`${m.id} · ${m.title}`, m.objectives.map((o) => ({ text: o.text, done: this.has(m.id, o.id) })));
  }

  private onMissionStart(m: GenesisMission | null) {
    if (!m) return;
    if (m.id === 'M03') this.dawn();
    if (m.id === 'M04') { setTimeout(() => this.game.hud.toast('🏪 La tienda de la esquina tiene agua y comida. El auto chocado de la avenida… quizá tenga una linterna.'), 2500); this.startPatrol(); }
    if (m.id === 'M05') setTimeout(() => this.game.hud.toast('🏠 Regresa a casa y prepara tu cuarto como refugio.'), 2500);
  }

  // ---------------------------------------------------------------- arranque

  private setTime(day: number, hour: number) {
    const s = this.game.session;
    if (s) s.save.world.gameTime = gameTimeAt(day, hour);
    this.game.updateTimeOfDay(true);
  }

  private place(p: THREE.Vector3, facing: number) {
    const pl = this.game.player;
    pl.spawn(p.x, p.z);
    pl.facing = facing;
    pl.model.root.position.copy(pl.position);
    pl.model.root.rotation.y = facing;
    this.game.cam.yaw = facing + Math.PI;
    this.game.cam.pitch = 0.2;
    this.game.cam.snap();
  }

  /** Prepara el mundo según el progreso guardado y empieza a jugar. */
  begin() {
    const P = this.city.points;
    this.city.setDoorOpen(false);
    this.city.boards.visible = this.st.boarded;
    this.city.supplies.visible = this.st.stocked;
    for (const [id, o] of this.city.pickups) o.visible = !this.st.taken.includes(id);
    const m = this.current;
    if (!m || this.missionDone('M02')) {
      // De día (o la noche del final): la casa ya es tu refugio.
      this.city.damage.visible = true;
      this.city.setStreetLamps(0.15);
      this.city.setRoomLight(false);
      const day = clockAt(this.game.gameTime).day;
      if (!this.missionDone('M03') && !this.has('M03', 'receive_emergency_broadcast')) { this.dawn(); }
      else if (clockAt(this.game.gameTime).hour < 6 || day < 2) this.setTime(2, 9);
      else this.game.updateTimeOfDay(true);
      const s = this.game.session?.save.world.pos;
      const saved = s ? new THREE.Vector3(s[0], 0, s[2]) : null;
      const ok = saved && saved.x > CITY.x + PLAY.x0 && saved.x < CITY.x + PLAY.x1 && saved.z > CITY.z + PLAY.z0 && saved.z < CITY.z + PLAY.z1 && !this.game.collisions.blocked(saved.x, saved.z, 0.4);
      if (!this.missionDone('M03')) this.place(P.bedSpawn, 0);
      else this.place(ok ? saved! : P.yard, this.game.session?.save.world.facing ?? 0);
      if (this.has('M03', 'exit_house_safely')) this.openDoor(true);
      if (this.missionDone('M03')) this.startPatrol();
    } else {
      this.city.damage.visible = false;
      this.city.setStreetLamps(1);
      this.place(P.bedSpawn, 0);
      if (!this.missionDone('M01')) {
        this.setTime(1, 22.6);
        this.city.setRoomLight(true);
        this.st.lightsOff = false;
        if (this.st.done.length === 0) this.playIntro();
      } else this.setupHide(false);
    }
    this.showObjective();
    this.game.hud.toast(m ? `🏙️ Proyecto Génesis · ${m.title}` : '🏙️ Proyecto Génesis: has terminado la demo', true);
  }

  // ---------------------------------------------------------------- cinemáticas

  private lock(on: boolean) {
    const g = this.game;
    g.input.enabled = !on;
    g.input.flush();
    g.survival.frozen = on;
    this.skipBtn.classList.toggle('hidden', !on);
    document.getElementById('touch')?.classList.toggle('genesis-cine', on);
  }

  /** C01: sirenas, choque y la luz que parpadea (se puede omitir). */
  private playIntro() {
    this.phase = 'intro'; this.t = 0;
    this.lock(true);
    const P = this.city.points;
    this.cine = { pos: new THREE.Vector3(P.lightSwitch.x - 0.15, 2.0, P.window.z - 0.35), look: P.bedSpawn.clone().setY(0.9), fov: 60 };
    this.game.audio.siren(8, 0.1, 0.5);
  }

  private updateIntro(dt: number) {
    const t = (this.t += dt), a = this.game.audio;
    if (t > 2.6 && t - dt <= 2.6) { a.crash(0.5, 0.4); this.game.shakeCamera(0.4); }
    if (t > 2.8 && t < 4.4) this.city.setRoomLight(Math.random() > 0.35);
    if (t > 4.4 && t - dt <= 4.4) { this.city.setRoomLight(true); this.game.hud.toast('😨 ¿Qué fue eso? Sonó como un choque en la avenida…', true); }
    // La cámara se acerca despacio al personaje.
    this.cine!.pos.lerp(new THREE.Vector3(this.cine!.pos.x - 0.6, 1.7, this.cine!.pos.z - 0.4), dt * 0.15);
    if (t > 6.5) this.endIntro();
  }

  private endIntro() {
    this.phase = 'play'; this.cine = null;
    this.city.setRoomLight(true);
    this.lock(false);
    this.game.cam.snap();
    this.showObjective();
  }

  /** C02: la persecución vista desde la ventana. Nunca se muestra el contacto (corte a la cara). */
  private startAttack() {
    const P = this.city.points, g = this.game;
    this.phase = 'attack'; this.t = 0;
    this.lock(true);
    this.place(new THREE.Vector3(P.window.x, 0, P.window.z - 0.9), 0);
    g.player.model.root.rotation.y = 0;
    this.runner.root.visible = true;
    this.runner.root.position.set(CITY.x - 26, 0, CITY.z - 1.5);
    this.runner.root.rotation.y = Math.PI / 2;
    this.predator.placeAt(CITY.x - 44, CITY.z - 1.2, Math.PI / 2);
    this.predator.rig.root.visible = true;
    this.predMode = 'off';
    // Cámara pegada al vidrio: se ve la avenida de lado a lado.
    this.cine = { pos: new THREE.Vector3(P.window.x + 0.2, 1.7, P.window.z + 0.75), look: new THREE.Vector3(CITY.x - 12, 1.3, CITY.z - 1.5), fov: 62 };
    g.audio.siren(10, 0.12, -0.3);
    g.audio.setTension(0.8);
    this.catchFired = false;
  }

  private updateAttack(dt: number) {
    const g = this.game, P = this.city.points, t = (this.t += dt);
    const r = this.runner.root, d = this.predator;
    if (!this.catchFired) {
      r.position.x += dt * 5.6;
      this.runner.update(dt, 5.6, true, false, 0);
      d.scripted(dt, r.position.x, r.position.z, 8.8);
      // La cámara sigue a la persona que corre.
      this.cine!.look.lerp(new THREE.Vector3(THREE.MathUtils.clamp(r.position.x + 3, CITY.x - 14, CITY.x + 6), 1.3, r.position.z), Math.min(1, dt * 2));
      if (d.position.distanceTo(r.position) < 3.6 || t > 12) {
        // Corte: la cara del protagonista. Se oye un grito breve y un rugido; no se ve nada.
        this.catchFired = true; this.t = 0;
        r.visible = false;
        g.audio.distantShout(0.09, 0.1); g.audio.roar(0.5); g.audio.thud(0.5);
        d.placeAt(CITY.x + 1.5, CITY.z - 1.4, Math.PI / 2);
        const pp = g.player.position;
        this.cine = { pos: new THREE.Vector3(pp.x, 1.45, pp.z + 0.75), look: new THREE.Vector3(pp.x, 1.35, pp.z), fov: 45 };
        g.player.model.danger = 1;
      }
      return;
    }
    if (t < 2.3) return; // reacción del protagonista
    if (t - dt < 2.3) {
      this.cine = { pos: new THREE.Vector3(P.window.x + 0.2, 1.7, P.window.z + 0.75), look: new THREE.Vector3(CITY.x + 1.5, 1.9, CITY.z - 1.4), fov: 55 };
    }
    // El depredador olfatea y se gira hacia la casa.
    d.scripted(dt, d.position.x, d.position.z, 0, P.window);
    if (t > 3.8 && t - dt <= 3.8) { d.roar(1.2); g.audio.sniff(0.4, 0); }
    if (t > 5.6) this.endAttack();
  }

  private endAttack() {
    const g = this.game;
    this.runner.root.visible = false;
    this.phase = 'play'; this.cine = null;
    this.lock(false);
    g.player.model.danger = 0;
    this.complete('M01', 'walk_to_window');
    this.complete('M01', 'inspect_street');
    this.setupHide(true);
  }

  private skip() {
    if (this.phase === 'intro') this.endIntro();
    else if (this.phase === 'attack') this.endAttack();
  }

  /** M02: el depredador se queda frente a la casa; hay que apagar la luz y esconderse. */
  private setupHide(justStarted: boolean) {
    const P = this.city.points;
    // Al reintentar, la misión empieza de cero (punto seguro: el centro del cuarto).
    this.st.done = this.st.done.filter((d) => !d.startsWith('M02.'));
    this.st.lightsOff = false;
    this.city.setRoomLight(true);
    this.city.setStreetLamps(1);
    this.city.damage.visible = false;
    this.setHidden(false);
    if (!justStarted) { this.setTime(1, 22.9); this.place(P.bedSpawn, 0); }
    this.predator.placeAt(CITY.x + 1.5, CITY.z - 1.4, -Math.PI / 2);
    this.predator.rig.root.visible = true;
    this.predMode = 'stalk'; this.predT = 0; this.seen = 0;
    this.game.audio.setTension(0.7);
    this.game.audio.hush(0.6);
    this.showObjective();
    setTimeout(() => this.game.hud.toast('🤫 ¡Viene hacia la casa! Aléjate de la ventana, apaga la luz y escóndete en el ropero.', true), justStarted ? 600 : 1500);
  }

  private setHidden(h: boolean) {
    this.hidden = h;
    const g = this.game;
    g.player.model.root.visible = !h;
    g.player.velocity.set(0, 0, 0);
    if (h) this.place(this.city.points.closet, Math.PI);
  }

  /** C03: amanece; llega un aviso de emergencia (ficticio) al celular. */
  private dawn() {
    const g = this.game;
    this.phase = 'sleep';
    this.lock(true);
    g.hud.sleepOverlay('Pasan las horas… nadie duerme en el barrio.');
    setTimeout(() => {
      this.setTime(2, 6.6);
      this.city.damage.visible = true;
      this.city.setStreetLamps(0.15);
      this.city.setRoomLight(false);
      this.setHidden(false);
      this.predator.rig.root.visible = false;
      this.predMode = 'off';
      g.audio.setTension(0); g.audio.hush(0);
      this.place(this.city.points.bedSpawn, Math.PI);
      g.hud.sleepOverlay(null);
      setTimeout(async () => {
        g.audio.signal(0.16);
        g.hud.phone('ALERTA DE EMERGENCIA (aviso ficticio del juego)');
        await g.hud.storyCard('📱 Alerta de emergencia',
          'AVISO DE PROTECCIÓN CIVIL (ficticio): Se reportan animales muy peligrosos sueltos en la ciudad. ' +
          'Permanezca en un lugar seguro. Consiga agua, comida y una linterna. No se acerque a los animales. ' +
          'Las autoridades investigan una fuga en el laboratorio Génesis Biological Research.',
          '<span class="plate">⚠ ALERTA</span>');
        g.input.flush();
        this.phase = 'play';
        this.lock(false);
        this.complete('M03', 'receive_emergency_broadcast');
        g.hud.toast('🚪 Ya es de día. Sal con cuidado por la puerta principal.');
      }, 900);
    }, 2200);
  }

  private openDoor(silent = false) {
    this.doorOpen = true;
    this.city.setDoorOpen(true);
    if (!silent) this.game.audio.click(0.25);
  }

  // ---------------------------------------------------------------- depredador

  private startPatrol() {
    const d = this.predator;
    let best = 0, bd = Infinity;
    PATROL.forEach(([x, z], i) => { const dd = Math.hypot(x - (d.position.x - CITY.x), z - (d.position.z - CITY.z)); if (dd < bd) { bd = dd; best = i; } });
    if (this.predMode === 'off' || !d.rig.root.visible) { const [x, z] = PATROL[0]; d.placeAt(CITY.x + x, CITY.z + z, Math.PI / 2); best = 1; }
    this.patrolIdx = best;
    d.rig.root.visible = true;
    this.predMode = 'patrol';
  }

  /** ¿Puede verte ahora? (distancia, luz y paredes de por medio: no ve a través de muros). */
  canSee(range: number) {
    const g = this.game, d = this.predator;
    if (this.hidden || !d.rig.root.visible) return false;
    const pp = g.player.position;
    this.eye.set(d.position.x, d.position.y + d.cfg.bodyHeight * d.cfg.scale * 0.95, d.position.z);
    this.target.set(pp.x, pp.y + (g.player.crouching ? 0.6 : 1.0), pp.z);
    const dist = this.eye.distanceTo(this.target);
    if (dist > range * (g.player.crouching ? 0.6 : 1)) return false;
    return !blockedLine(this.eye, this.target, this.city.occluders);
  }

  private updatePredator(dt: number) {
    const g = this.game, d = this.predator, P = this.city.points, pp = g.player.position;
    const mode = this.predMode;
    if (mode === 'off') return;
    const night = clockAt(g.gameTime).night;
    if (mode === 'stalk' || mode === 'leave') {
      if (mode === 'stalk') {
        // Junto a la barda de la casa, mirando a la ventana; olfatea de vez en cuando.
        d.scripted(dt, P.windowOut.x + 0.4, P.windowOut.z + 2.6, 2.2, P.window);
        if ((this.sniffT -= dt) <= 0) { g.audio.sniff(0.25, 0); this.sniffT = 3 + Math.random() * 3; }
        if (this.hidden && this.st.lightsOff) {
          this.predT += dt;
          if (this.predT > 10) { this.predMode = 'leave'; this.predT = 0; g.audio.roar(0.25); }
        } else this.predT = 0;
      } else {
        d.scripted(dt, CITY.x + 70, CITY.z - 1.2, 3.2);
        this.predT += dt;
        if (this.predT > 9 || d.position.x > CITY.x + 60) {
          d.rig.root.visible = false;
          this.predMode = 'off';
          g.audio.setTension(0); g.audio.hush(0);
          g.hud.toast('😮‍💨 Sus pasos se alejan… Se fue.', true);
          this.complete('M02', 'wait_until_creature_leaves');
          return;
        }
      }
      // Te ve si estás a la vista por la ventana: con la luz encendida, desde lejos.
      const range = this.st.lightsOff ? 4.5 : 22;
      const arrived = Math.hypot(d.position.x - P.windowOut.x - 0.4, d.position.z - P.windowOut.z - 2.6) < 2;
      this.detect(dt, arrived && this.canSee(range), 0.45);
      return;
    }
    // De día: patrulla por las calles del perímetro; si te ve, te persigue un rato.
    const range = night ? 12 : 20;
    const sees = this.canSee(range);
    if (mode === 'patrol') {
      const [x, z] = PATROL[this.patrolIdx];
      d.scripted(dt, CITY.x + x, CITY.z + z, 2.2);
      if (Math.hypot(d.position.x - CITY.x - x, d.position.z - CITY.z - z) < 2) this.patrolIdx = (this.patrolIdx + 1) % PATROL.length;
      if (sees) this.detect(dt, true, 1.6); else this.seen = Math.max(0, this.seen - dt * 0.5);
      if (this.seen >= 1) { this.predMode = 'chase'; this.predT = 0; this.seen = 0; d.roar(1.0); g.audio.setTension(1); g.hud.toast('🏃 ¡Te vio! ¡Corre y escóndete detrás de algo!', true); }
    } else if (mode === 'chase') {
      this.predT += dt;
      if (sees) { this.lastSeen.copy(pp); this.lostT = 0; } else this.lostT += dt;
      d.scripted(dt, this.lastSeen.x, this.lastSeen.z, 6.0);
      if (d.position.distanceTo(pp) < 2.4 && !this.hidden) { this.caught(); return; }
      if (this.lostT > 2.5 || this.predT > 12) { this.predMode = 'search'; this.predT = 0; }
    } else if (mode === 'search') {
      this.predT += dt;
      d.scripted(dt, this.lastSeen.x, this.lastSeen.z, 2.0);
      if (sees) this.detect(dt, true, 2.5);
      if (this.seen >= 1) { this.predMode = 'chase'; this.predT = 0; this.seen = 0; }
      else if (this.predT > 5) { this.predMode = 'patrol'; g.audio.setTension(0); this.startPatrol(); }
    }
    // No atraviesa casas ni autos: se le empuja fuera de las colisiones como al jugador.
    g.collisions.resolve(d.position, d.cfg.radius * d.cfg.scale * 0.7);
  }

  private detect(dt: number, visible: boolean, speed: number) {
    const g = this.game;
    this.seen = THREE.MathUtils.clamp(this.seen + (visible ? dt * speed : -dt * 0.6), 0, 1);
    this.warnT -= dt;
    if (visible && this.seen > 0.2 && this.warnT <= 0 && (this.predMode === 'stalk' || this.predMode === 'leave')) {
      g.hud.toast('👁 ¡Te está mirando! Quítate de su vista.');
      this.warnT = 4;
    }
    if (this.seen >= 1 && (this.predMode === 'stalk' || this.predMode === 'leave')) this.caught();
  }

  /** Te descubrió: sin heridas ni sangre; fundido y vuelta al punto seguro. */
  private caught() {
    const g = this.game, night = this.predMode === 'stalk' || this.predMode === 'leave';
    this.st.caught++;
    this.phase = 'caught';
    this.lock(true);
    this.predator.roar(1.0);
    g.hud.sleepOverlay(night
      ? '¡Te vio por la ventana! Golpeó la reja y se fue rugiendo… Inténtalo otra vez: apaga la luz y escóndete.'
      : '¡Casi te alcanza! Lograste escapar corriendo y volviste a casa.');
    setTimeout(() => {
      g.hud.sleepOverlay(null);
      this.phase = 'play';
      this.lock(false);
      this.seen = 0;
      if (night) this.setupHide(false);
      else {
        this.place(this.city.points.yard, Math.PI);
        const [x, z] = PATROL[0];
        this.predator.placeAt(CITY.x + x, CITY.z + z, Math.PI / 2);
        this.patrolIdx = 1; this.predMode = 'patrol';
        g.audio.setTension(0);
      }
      void g.save('mission');
    }, 2800);
  }

  // ---------------------------------------------------------------- interacción

  private near(p: THREE.Vector3, r: number) {
    const pp = this.game.player.position;
    return Math.hypot(pp.x - p.x, pp.z - p.z) < r;
  }

  private interact() {
    const g = this.game, P = this.city.points, key = g.isTouch ? '✋' : 'E';
    const say = (text: string, act?: () => void) => {
      g.hud.setPrompt(text, key);
      if (g.input.consume('interact') && act) act();
      return true;
    };
    if (this.hidden) return say('Salir del ropero', () => { this.setHidden(false); this.place(new THREE.Vector3(P.closet.x, 0, P.closet.z + 0.5), Math.PI); });

    // Ventana del cuarto
    if (this.near(P.window, 1.4)) {
      if (this.active('M01') && this.has('M01', 'walk_to_window')) return say('Mirar hacia la calle 👀', () => this.startAttack());
      if (this.active('M05') && !this.has('M05', 'secure_room')) return say('Tapar la ventana con tablas 🪵', () => {
        this.st.boarded = true; this.city.boards.visible = true; g.audio.thud(0.35);
        this.complete('M05', 'secure_room');
      });
    }
    // Interruptor de la luz
    if (this.near(P.lightSwitch, 0.95)) {
      const on = !this.st.lightsOff;
      return say(on ? 'Apagar la luz 💡' : 'Encender la luz 💡', () => {
        this.st.lightsOff = on;
        this.city.setRoomLight(!on);
        g.audio.click();
        if (on && this.active('M02')) {
          if (!this.has('M02', 'move_from_window')) this.complete('M02', 'move_from_window');
          this.complete('M02', 'switch_off_lights');
        }
      });
    }
    // Cama disponible (refugio): si está más cerca que el ropero, gana la cama.
    const bedOk = this.near(P.bed, 1.5) && this.missionDone('M04') && (!this.active('M05') || this.has('M05', 'place_supplies'));
    const pp = g.player.position;
    const bedFirst = bedOk && Math.hypot(pp.x - P.bed.x, pp.z - P.bed.z) < Math.hypot(pp.x - P.closet.x, pp.z - P.closet.z);
    // Ropero
    if (!bedFirst && this.near(P.closet, 1.2) && this.missionDone('M01')) {
      if (this.active('M02') && !this.st.lightsOff) return say('Primero apaga la luz (el interruptor está junto a la puerta)');
      return say('Esconderse en el ropero 🚪', () => {
        this.setHidden(true);
        if (this.active('M02') && this.st.lightsOff) this.complete('M02', 'enter_hide_spot');
      });
    }
    // Puerta principal
    if (this.near(P.frontDoor, 1.3) && !this.doorOpen) {
      if (!this.missionDone('M02') || (this.active('M03') && !this.has('M03', 'receive_emergency_broadcast'))) return say('La puerta está cerrada con llave. Afuera es peligroso.');
      return say('Abrir la puerta 🚪', () => this.openDoor());
    }
    // Suministros
    const items: [string, string, string, 'water_bottle' | 'canned_food' | 'flashlight'][] = [
      ['water', 'collect_water', 'Tomar botellas de agua 💧', 'water_bottle'],
      ['food', 'collect_food', 'Tomar latas de comida 🥫', 'canned_food'],
      ['flashlight', 'collect_flashlight', 'Tomar la linterna del auto 🔦', 'flashlight'],
    ];
    for (const [id, oid, label, item] of items) {
      const o = this.city.pickups.get(id)!;
      if (!o.visible || !this.missionDone('M03')) continue;
      const at = new THREE.Vector3(o.position.x + CITY.x, 0, o.position.z + CITY.z);
      if (this.near(at, 1.6)) return say(label, () => {
        o.visible = false;
        this.st.taken.push(id);
        g.inventory.add(item, item === 'flashlight' ? 1 : 3);
        g.player.model.playPickup();
        if (item === 'water_bottle') { g.survival.add('thirst', 35); g.audio.drink(); }
        if (item === 'canned_food') g.survival.add('hunger', 30);
        g.hud.toast(item === 'flashlight' ? '🔦 ¡Una linterna! Se encenderá sola cuando oscurezca.' : item === 'water_bottle' ? '💧 Bebes un poco y guardas 3 botellas.' : '🥫 Comes un poco y guardas 3 latas.');
        this.complete('M04', oid);
      });
    }
    // Estante y cama (refugio, M05)
    if (this.near(P.shelf, 1.3) && this.active('M05') && this.has('M05', 'secure_room') && !this.st.stocked) return say('Guardar los suministros en el estante 📦', () => {
      this.st.stocked = true; this.city.supplies.visible = true; g.audio.pickup();
      this.complete('M05', 'place_supplies');
    });
    if (bedOk) return say('Descansar en tu cama (se guarda) 🛏', () => this.rest());
    if (this.near(P.window, 1.4) && this.active('M01') && !this.has('M01', 'walk_to_window')) return false;
    g.hud.setPrompt(null);
    g.input.consume('interact');
    return false;
  }

  private rest() {
    const g = this.game;
    this.phase = 'sleep';
    this.lock(true);
    g.hud.sleepOverlay('Zzz… Descansas en tu cuarto, con la ventana tapada y provisiones a la mano.');
    setTimeout(async () => {
      const c = clockAt(g.gameTime);
      this.setTime(c.hour >= 20 ? c.day + 1 : c.day, c.hour >= 20 ? 9 : 20.5);
      g.survival.energy = 100;
      g.hud.sleepOverlay(null);
      const finish = this.active('M05');
      this.complete('M05', 'save_or_rest');
      await g.save('mission');
      if (finish) {
        await g.hud.storyCard('Fin de la demo · Capítulo 1',
          'Sobreviviste a la primera noche y preparaste tu refugio. Esta noche se oyen sirenas a lo lejos… ' +
          'y una radio que llama pidiendo ayuda. Continuará en la Fase 2: «Ecos en la ciudad».',
          '<span class="plate">GÉNESIS</span>');
        g.hud.toast('🔦 Ya es de noche: tu linterna se encendió. Explora con cuidado.', true);
      }
      g.input.flush();
      this.phase = 'play';
      this.lock(false);
    }, 2400);
  }

  // ---------------------------------------------------------------- bucle

  frame(dt: number) {
    const g = this.game, pp = g.player.position;
    this.time += dt;
    g.input.update();
    const [lx, ly, zoom] = g.input.consumeLook();
    if (!this.cine) g.cam.rotate(lx, ly, zoom);

    if (this.phase === 'intro') this.updateIntro(dt);
    else if (this.phase === 'attack') this.updateAttack(dt);

    if (this.phase === 'play') {
      if (!this.hidden) g.player.update(dt, g.input, g.cam, g.survival);
      else g.player.model.update(dt, 0, true, false, 0);
      // M01: llegar a la ventana; M02: alejarse de ella.
      if (this.active('M01') && !this.has('M01', 'walk_to_window') && this.near(this.city.points.window, 1.5)) this.complete('M01', 'walk_to_window');
      if (this.active('M02') && !this.has('M02', 'move_from_window') && !this.near(this.city.points.window, 3)) this.complete('M02', 'move_from_window');
      // M03: salir de la casa (al patio, por la puerta).
      if (this.active('M03') && this.has('M03', 'receive_emergency_broadcast') && pp.z > this.city.points.houseMax.y + 0.6 && Math.abs(pp.x - CITY.x) < 4) this.complete('M03', 'exit_house_safely');
      this.interact();
      g.survival.update(dt, { running: g.player.running, moving: g.player.speed > 0.5, inWater: false });
      if (g.survival.dead) {
        g.survival.respawn();
        this.place(this.city.points.bedSpawn, 0);
        g.hud.toast('Te desmayaste de cansancio y despertaste en casa. Bebe agua y come algo.', true);
      }
    } else { g.hud.setPrompt(null); g.player.model.update(dt, 0, true, false, 0); }
    if (this.phase === 'play' || this.phase === 'attack' || this.phase === 'caught') this.updatePredator(dt);
    else if (this.predator.rig.root.visible) this.predator.scripted(dt, this.predator.position.x, this.predator.position.z, 0);

    g.updateTimeOfDay(false, dt);
    windTime.value += dt;
    this.city.update(dt, this.time);

    // Techo de la casa: se oculta estando dentro (vista en corte).
    const H0 = this.city.points.houseMin, H1 = this.city.points.houseMax;
    const inside = pp.x > H0.x && pp.x < H1.x && pp.z > H0.y && pp.z < H1.y + 0.1;
    this.city.houseRoof.visible = !inside;

    // Cámara: cinemática, dentro del ropero o la normal en tercera persona.
    if (this.cine) {
      g.camera.position.copy(this.cine.pos);
      g.camera.fov = this.cine.fov; g.camera.updateProjectionMatrix();
      g.camera.lookAt(this.cine.look);
    } else if (this.hidden) {
      const P = this.city.points;
      g.camera.position.copy(P.closetCam);
      if (g.camera.fov !== 62) { g.camera.fov = 62; g.camera.updateProjectionMatrix(); }
      g.camera.lookAt(P.window.x, 1.2, P.window.z);
    } else {
      if (g.camera.fov !== 62) { g.camera.fov = 62; g.camera.updateProjectionMatrix(); }
      g.cam.update(dt, pp, g.player.crouching);
    }
    // Linterna: se enciende sola de noche si la tienes.
    const dark = g.env.daylight < 0.35, has = g.inventory.get('flashlight') > 0;
    this.flashlight.intensity = dark && has && !this.hidden ? 60 : 0;
    if (this.flashlight.intensity) {
      const fwd = new THREE.Vector3(Math.sin(g.player.facing), -0.15, Math.cos(g.player.facing));
      this.flashlight.position.set(pp.x, pp.y + 1.3, pp.z).addScaledVector(fwd, 0.3);
      this.flashlight.target.position.copy(this.flashlight.position).addScaledVector(fwd, 6);
    }

    g.env.update(pp, g.camera);
    g.audio.update(dt);
    g.hud.updateStats(g.survival);
    this.markers.length = 0;
    this.markers.push({ x: CITY.x, z: CITY.z - 12.7, color: '#7fb4d8', size: 4, icon: '🏠' });
    if (this.missionDone('M03') && !this.missionDone('M04')) {
      for (const [id, o] of this.city.pickups) if (o.visible) this.markers.push({ x: o.position.x + CITY.x, z: o.position.z + CITY.z, color: '#7df9ff', size: 4, icon: id === 'water' ? '💧' : id === 'food' ? '🥫' : '🔦' });
    }
    g.hud.drawMinimap(pp.x, pp.z, Math.PI - g.player.facing, this.markers);
    g.player.model.danger = this.predMode === 'chase' || (this.predMode === 'stalk' && !this.hidden) ? 1 : 0;
    g.post.setMood(g.env.daylight, g.env.dusk);
    g.post.render(dt);
    if (g.settings.showFps) g.hud.tickFps(dt, `${g.renderer.info.render.calls} draws`);
    if (this.phase === 'play') g.session?.tick(g, dt);
  }
}

import * as THREE from 'three';
import { AudioManager } from '../audio/AudioManager';
import { Narrator } from '../audio/Narrator';
import { Dinosaur } from '../creatures/Dinosaur';
import { MeatDrops, Meat, MEAT_HEALTH, MEAT_HUNGER } from '../items/MeatDrops';
import { POPULATION, Species, TREX, TRICERATOPS } from '../creatures/species';
import { Pterosaur } from '../creatures/Pterosaur';
import { Collectibles, Pickup } from '../items/Collectibles';
import { BUILDS, ITEMS, Inventory, RECIPES } from '../items/items';
import { Buildings, Shelter } from '../building/Buildings';
import { Clock, clockAt, formatClock, hourToCycle, secondsUntilHour, DAY_SECONDS } from '../world/DayNight';
import { Player } from '../player/Player';
import { ThirdPersonCamera } from '../player/ThirdPersonCamera';
import { Survival } from '../survival/Survival';
import { HUD } from '../ui/HUD';
import { Hotbar } from '../ui/Hotbar';
import { Projectiles, WEAPONS, weaponModel } from '../combat/Weapons';
import { TouchControls } from '../ui/TouchControls';
import { Environment } from '../world/Environment';
import { Terrain } from '../world/Terrain';
import { Vegetation } from '../world/Vegetation';
import { LightShafts } from '../world/LightShafts';
import { SPAWN, WATER_LEVEL } from '../world/config';
import { CollisionWorld } from './Collision';
import { windTime } from './textures';
import { Intro } from '../intro/Intro';
import { Story } from '../story/Story';
import { Multiplayer, RemotePlayer } from '../net/Multiplayer';
import nightSkyUrl from '../world/sky/cielo-noche.jpg';
import dayLightUrl from '../world/sky/luz-dia.jpg';
import { PostFX } from './PostFX';
import { patchAtmosphere } from '../world/Atmosphere';
import { PARTICLE_BUDGET, Particles } from '../world/Particles';
import { Input } from './Input';
import { Objectives } from './Objectives';
import { PRESETS, Quality, SettingsData, isTouchDevice, saveSettings } from './Settings';
import { PlayerSession, SaveReason } from '../profile/session';
import { XP } from '../profile/experience';
import type { ProfileSettings } from '../profile/types';

/** Une todos los sistemas y ejecuta el bucle principal. */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly terrain: Terrain;
  readonly collisions = new CollisionWorld();
  readonly env: Environment;
  readonly vegetation: Vegetation;
  readonly shafts: LightShafts;
  readonly collectibles: Collectibles;
  readonly meat: MeatDrops;
  private meatFocus: Meat | null = null;
  readonly buildings: Buildings;
  /** Historia (capítulo 1): visita nocturna, huellas, CRONOS-047 y mensajes del celular. */
  readonly story: Story;
  /** Jugar con amigos en la misma isla (salas con código, PeerJS). */
  readonly mp: Multiplayer;
  readonly post: PostFX;
  readonly particles: Particles;
  private shake = 0;
  /** Hora del mundo (sin perfil se cuenta aquí; con perfil, en la partida guardada). */
  private localTime = 0;
  worldClock: Clock = clockAt(0);
  private envT = 1;
  private wasNight = false;
  private duskWarned = -1;
  /** Descansando en un refugio (pantalla en negro, controles bloqueados). */
  resting = false;
  readonly player: Player;
  readonly cam: ThirdPersonCamera;
  readonly input: Input;
  readonly survival = new Survival();
  readonly inventory = new Inventory();
  readonly objectives = new Objectives();
  readonly dinos: Dinosaur[] = [];
  readonly pterosaurs: Pterosaur[] = [];
  private trexWarned = 0;
  /** Juego por equipos: golpes recibidos de rivales, tiempo para olvidarlos y protección tras ser atrapado. */
  private pvpHits = 0;
  private pvpForget = 0;
  private pvpSafe = 0;
  readonly audio = new AudioManager();
  /** Voz que lee los textos importantes (se puede apagar en Opciones). */
  readonly narrator = new Narrator();
  readonly hud: HUD;
  readonly hotbar: Hotbar;
  readonly projectiles: Projectiles;
  private weaponCd = 0;
  readonly touch: TouchControls | null = null;
  readonly isTouch = isTouchDevice();
  private readonly clock = new THREE.Clock();
  private focus: Pickup | null = null;
  private nearWater = false;
  private playing = false;
  paused = false;
  /** Perfil y partida activos. */
  session: PlayerSession | null = null;
  /** Se llama cuando cambian las opciones (para guardarlas en el perfil). */
  onSettingsChanged?: () => void;
  private wasLocked = false;
  private startPos = new THREE.Vector3();
  private quality: Quality;

  constructor(canvas: HTMLCanvasElement, readonly settings: SettingsData) {
    this.quality = settings.quality;
    const preset = PRESETS[this.quality];
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality !== 'low', powerPreference: 'high-performance' });
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.85;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 500);

    patchAtmosphere();
    this.env = new Environment(this.scene);
    this.env.loadSkies(this.renderer, nightSkyUrl, dayLightUrl, this.quality !== 'low');
    this.terrain = new Terrain(this.quality === 'low' ? 160 : 200);
    this.scene.add(this.terrain.mesh, this.terrain.water);
    this.vegetation = new Vegetation(this.terrain, this.collisions, { decor: preset.decor });
    this.scene.add(this.vegetation.group);
    this.shafts = new LightShafts(this.terrain, this.env.sunDir, this.quality === 'low' ? 10 : this.quality === 'medium' ? 22 : 30);
    this.scene.add(this.shafts.group);
    this.collectibles = new Collectibles(this.terrain, this.collisions);
    this.scene.add(this.collectibles.group);
    this.meat = new MeatDrops(this.terrain);
    this.scene.add(this.meat.group);
    this.buildings = new Buildings(this.terrain, this.collisions);
    this.scene.add(this.buildings.group);
    this.buildings.onBuilt = (s) => this.onShelterBuilt(s);
    this.story = new Story(this);
    this.scene.add(this.story.group);
    this.particles = new Particles((x, z) => this.terrain.heightAt(x, z), PARTICLE_BUDGET.high);
    this.scene.add(this.particles.group);
    this.post = new PostFX(this.renderer, this.scene, this.camera);

    this.player = new Player(this.terrain, this.collisions);
    this.player.spawn(SPAWN.x, SPAWN.z);
    this.scene.add(this.player.model.root);
    this.cam = new ThirdPersonCamera(this.camera, this.terrain, this.collisions);
    const me = this.player, game = this;
    this.mp = new Multiplayer(this.terrain, {
      get position() { return me.position; },
      get facing() { return me.facing; },
      get speed() { return me.speed; },
      get grounded() { return me.grounded; },
      get crouching() { return me.crouching; },
      get vy() { return me.velocity.y; },
      get sitting() { return me.model.sitting || game.resting; },
      get aiming() { return me.model.aiming; },
      get weapon() { return game.hotbar?.selected ?? 'hand'; },
      profile: () => ({
        name: this.session?.profile.displayName ?? 'Explorador',
        look: me.model.currentAppearance,
        lvl: this.session?.level.level ?? 1,
      }),
    });
    this.scene.add(this.mp.group);
    me.model.onAction = (k) => this.mp.action(k);
    this.mp.onHit = (from) => this.pvpHit(from);

    // Manada de triceratops visible desde el claro inicial y un gigante a lo lejos.
    let seed = 100;
    for (const [sp, x, z, n] of POPULATION)
      for (let i = 0; i < n; i++) this.addDino(sp, x + (i % 3) * 8 - 8, z + Math.floor(i / 3) * 8, seed++);
    for (let i = 0; i < 6; i++) {
      const p = new Pterosaur(new THREE.Vector3(-80 + i * 40, 45 + i * 4, 40 - i * 25), 50 + i * 12, 9 + i, i + 1);
      this.pterosaurs.push(p);
      this.scene.add(p.root);
    }
    // Tres más bajos, rozando las copas, para que se vean bien desde el suelo.
    for (let i = 0; i < 3; i++) {
      const p = new Pterosaur(new THREE.Vector3(-20 + i * 35, 30 + i * 3, 10 - i * 30), 32 + i * 8, 8 + i, 10 + i);
      this.pterosaurs.push(p);
      this.scene.add(p.root);
    }

    this.input = new Input(canvas);
    if (this.isTouch) this.touch = new TouchControls(this.input);
    this.hud = new HUD(this.terrain);
    this.hud.onSpeak = (t, k) => this.narrator.say(t, k);
    this.projectiles = new Projectiles(this.terrain);
    this.scene.add(this.projectiles.group);
    this.hotbar = new Hotbar(this.inventory);
    this.hotbar.onSelect = (id) => this.player.model.hold(weaponModel(id));
    this.hotbar.onCraft = (i) => this.craft(i);
    this.hotbar.onBuild = (i) => this.startBuild(i);
    this.hotbar.onToggleCraft = (open) => {
      this.input.enabled = !open && this.playing;
      this.input.flush();
      if (open && document.pointerLockElement) document.exitPointerLock();
    };
    document.getElementById('btn-craft')!.addEventListener('click', () => { if (this.buildings.placing) this.cancelBuild(); else this.hotbar.toggleCraft(); });
    document.getElementById('btn-craft')!.addEventListener('pointerdown', (e) => e.stopPropagation());
    document.getElementById('btn-attack')?.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); this.input.press('attack'); });
    this.wireEvents();
    this.applySettings();
    this.updateTimeOfDay(true);
    this.hud.updateMaterials(this.inventory);
    this.hud.setObjective(this.objectives.title, this.objectives.view());
    window.addEventListener('resize', () => this.resize());
    this.resize();
    // Primer render para que se vea la selva detrás del menú.
    this.cam.update(0.016, this.player.position, false);
    this.renderer.render(this.scene, this.camera);
  }

  private addDino(cfg: Species, x: number, z: number, seed: number) {
    const d = new Dinosaur(cfg, x, z, this.terrain, this.collisions, seed);
    d.onAlert = (dd) => {
      const dist = dd.position.distanceTo(this.player.position), pan = this.panOf(dd.position);
      const name = cfg.name.toLowerCase(), kind = dd.alertKind;
      const say = (msg: string, big = false) => {
        if (!this.playing || performance.now() - this.trexWarned < 25000) return;
        this.trexWarned = performance.now();
        this.hud.toast(msg, big);
      };
      if (kind === 'look') { if (dist < 40) this.audio.snort(0.2 * (1 - dist / 40)); return; }
      if (cfg === TREX) {
        dd.roar();
        if (dist < 60) this.audio.roar(0.7 * (1 - dist / 60));
        say('🦖 ¡Un tiranosaurio te ha visto! Aguanta muchos golpes: lucha con tus mejores armas o escóndete.', true);
      } else if (kind === 'stalk') {
        // El acecho casi no se oye: un gruñido bajo y hojas que se mueven.
        if (dist < 45) { this.audio.dinoCall('growl', 0.18 * (1 - dist / 45), pan); this.audio.rustle(0.18, pan); }
        say(cfg.temper === 'pack'
          ? '🦎 Unos compis te siguen entre la hierba… si te quedas quieto cerca, te picarán.'
          : `👀 Algo te observa… un ${name} te está acechando. Agáchate, aléjate o prepárate.`);
      } else if (kind === 'warn') {
        if (dist < 45) this.audio.snort(0.35 * (1 - dist / 45));
        say(`⚠️ El ${name} te advierte: bufa y pisotea. ¡Aléjate o embestirá!`);
      } else if (kind === 'flee') {
        if (dist < 50) this.audio.dinoCall('honk', 0.3 * (1 - dist / 50), pan);
        say(`El ${name} da la alarma y huye. Si lo arrinconas, se defenderá.`);
      } else if (cfg.reaction === 'hunt') {
        if (dist < 50) this.audio.roar(0.45 * (1 - dist / 50));
        say(`🦖 ¡El ${name} sale de su escondite y viene a por ti! Defiéndete con tus armas.`, true);
      } else {
        if (dist < 40) this.audio.snort(0.3 * (1 - dist / 40));
        say(`¡El ${name} te embiste! Defiéndete 🏏 o corre.`);
      }
    };
    d.onAttackPlayer = (dd, dmg) => this.hurtPlayer(dd, dmg);
    d.onDefeated = (dd) => {
      // Más carne cuanto más grande es el dinosaurio.
      const big = dd.cfg.scale * dd.cfg.bodyHeight;
      const n = big < 1 ? 1 : big < 2.5 ? 2 : big < 4.5 ? 3 : 4;
      this.meat.drop(dd.position.x, dd.position.z, n, dd.cfg.radius * dd.cfg.scale + 0.8);
      this.audio.thud(0.6);
      this.hud.toast(`¡Venciste al ${dd.cfg.name.toLowerCase()}! Dejó ${n} ${n === 1 ? 'trozo' : 'trozos'} de carne 🍖`, true);
    };
    // Pisadas de los grandes: polvo, golpe sordo y (el tiranosaurio) un leve temblor.
    const big = cfg.scale * cfg.bodyHeight;
    d.onStep = (dd, run) => {
      if (big < 1.4) return;
      const cam = this.camera.position, dist = dd.position.distanceTo(cam);
      if (dist > 80) return;
      if (run || big > 3) this.particles.puff(dd.position.x, dd.position.y, dd.position.z, Math.min(2.5, big * 0.35) * (run ? 1.3 : 0.8));
      if (dist < 50) this.audio.bigStep(Math.min(0.5, big * 0.06) * (1 - dist / 50), big);
      if (cfg === TREX && dist < 35) this.shake = Math.max(this.shake, 0.6 * (1 - dist / 35));
    };
    d.onCall = (dd) => {
      const dist = dd.position.distanceTo(this.player.position);
      if (dist < 140) this.audio.dinoCall(dd.cfg.reaction === 'hunt' ? 'growl' : big > 4 ? 'boom' : 'honk', 0.35 * (1 - dist / 140), this.panOf(dd.position));
    };
    d.rig.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
    this.dinos.push(d);
    this.scene.add(d.rig.root);
  }

  /** Posición estéreo (-1 izquierda, 1 derecha) de un punto respecto a la cámara. */
  panOf(p: THREE.Vector3) {
    const dx = p.x - this.camera.position.x, dz = p.z - this.camera.position.z;
    const rx = Math.cos(this.cam.yaw), rz = -Math.sin(this.cam.yaw);
    return THREE.MathUtils.clamp((dx * rx + dz * rz) / (Math.hypot(dx, dz) || 1), -1, 1);
  }

  private wireEvents() {
    this.player.model.onStep = () => this.audio.step(this.player.inWater);
    this.player.onJump = () => this.audio.jump();
    this.player.onLand = (impact) => {
      if (impact > 15) {
        this.survival.damage((impact - 15) * 4);
        this.hud.toast('¡Ay! Caída fuerte');
      }
    };
    this.inventory.onChange = () => { this.hud.updateMaterials(this.inventory); this.hotbar?.render(); };
    this.survival.onCritical = (s) => {
      const msg = { hunger: 'Tienes hambre: busca bayas 🫐', thirst: 'Tienes sed: bebe agua del río 💧', health: '¡Cuidado! Tu salud está baja', energy: '' }[s];
      if (msg) this.hud.toast(msg);
    };
    this.objectives.onChange = () => this.hud.setObjective(this.objectives.title, this.objectives.view());
    this.objectives.onComplete = (o) => {
      this.hud.toast(`✔ ${o.text(o.target)}`);
      this.audio.pickup();
      this.session?.addXp(15, 'objective');
      void this.save('mission');
    };
    this.objectives.onMissionComplete = (m, next) => {
      this.hud.toast(next ? `🏆 ¡${m.title} completado! Nueva misión: ${next.title}` : `🏆 ¡${m.title} completado!`, true);
      if (next?.id === 'refugio') setTimeout(() => this.hud.toast('🛖 Reúne materiales y abre 🛠 para construir un refugio. Allí podrás dormir a salvo.'), 2500);
      if (next?.id === 'huellas' && this.storyMode && !this.story.has('night_visit')) setTimeout(() => this.hud.toast('🌙 Cuando anochezca, duerme en tu refugio… y escucha con atención.'), 2500);
      if (next?.id === 'kiro') setTimeout(() => this.hud.toast('🌿 Capítulo 2 muy pronto: ¿quién chilla entre los helechos?', true), 6000);
      this.session?.addXp(XP.mission, 'mission');
      // Los materiales que ya llevas cuentan para la nueva misión.
      for (const id of ['wood', 'stone', 'fiber', 'leaves'] as const) this.objectives.setItem(id, this.inventory.get(id));
      void this.save('mission');
    };

    document.addEventListener('pointerlockchange', () => {
      const locked = document.pointerLockElement === this.renderer.domElement;
      if (this.wasLocked && !locked && this.playing && !this.paused && !this.hotbar.craftOpen) this.setPaused(true);
      this.wasLocked = locked;
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.playing) this.setPaused(true);
    });
    // Último intento al cerrar (no se depende solo de esto: hay guardado cada 60 s).
    window.addEventListener('pagehide', () => { if (this.playing) void this.save('hidden'); });
  }

  applySettings() {
    const s = this.settings;
    const p = PRESETS[s.quality];
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, p.pixelRatio) * (s.quality === 'low' ? 0.85 : 1));
    this.renderer.shadowMap.enabled = p.shadows;
    this.env.setShadows(p.shadows, p.shadowMap);
    this.env.setViewDistance(p.viewDistance);
    this.post?.setLevel(p.post);
    this.particles?.setBudget(PARTICLE_BUDGET[s.quality]);
    this.camera.far = Math.max(p.viewDistance + 260, 520);
    this.camera.updateProjectionMatrix();
    this.cam.sensitivity = 0.0032 * s.sensitivity;
    this.audio.volume = s.volume;
    const ps = s as Partial<ProfileSettings>;
    this.audio.setMix(ps.musicVolume ?? 0.8, ps.sfxVolume ?? 1);
    this.narrator.enabled = ps.narration !== false;
    this.narrator.volume = s.volume;
    if (!this.narrator.enabled) this.narrator.cancel();
    document.body.classList.toggle('large-text', !!ps.largeText);
    document.body.classList.toggle('high-contrast', !!ps.highContrast);
    document.body.classList.toggle('reduce-motion', !!ps.reduceMotion);
    this.onSettingsChanged?.();
    this.hud.showFps(s.showFps);
    // Los materiales deben recompilarse si cambia el uso de sombras.
    this.scene.traverse((o) => {
      const m = (o as THREE.Mesh).material as THREE.Material | THREE.Material[] | undefined;
      if (m) (Array.isArray(m) ? m : [m]).forEach((mm) => (mm.needsUpdate = true));
    });
    saveSettings(s);
  }

  private resize() {
    const w = window.innerWidth, h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.post?.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  /** Carga el perfil elegido y su partida en el mundo (antes de empezar). */
  setSession(session: PlayerSession) {
    this.session = session;
    const ps = session.profile.settings;
    Object.assign(this.settings, ps);
    session.profile.settings = this.settings as unknown as ProfileSettings;
    this.applySettings();
    this.player.model.setAppearance(session.profile.appearance);
    session.applyTo(this);
    this.updateTimeOfDay(true);
    session.onXp = () => this.hud.setExplorer(session.profile.displayName, session.level.level);
    session.onSaved = (ok) => this.hud.saveIndicator(ok);
    this.startPos.copy(this.player.position);
    this.hud.setExplorer(session.profile.displayName, session.level.level);
    this.hud.setObjective(this.objectives.title, this.objectives.view());
    this.hud.updateStats(this.survival);
    this.hud.updateMaterials(this.inventory);
    this.hotbar.render();
    this.cam.snap();
  }

  /** Guarda la partida del perfil activo. */
  save(reason: SaveReason = 'auto') {
    if (!this.session || !this.playing) return Promise.resolve(false);
    return this.session.persist(this, reason);
  }

  /** Guarda y vuelve al menú principal. */
  async exitToMenu() {
    await this.save('exit');
    location.reload();
  }

  /** Reinicia la partida del perfil activo (el perfil y su apariencia se conservan). */
  async resetSave() {
    await this.session?.reset();
    location.reload();
  }

  /** Comienza la partida; en una partida nueva se reproduce antes la introducción. */
  /** 'historia' (con la trama) o 'abierto' (mundo abierto para jugar en salas con amigos). */
  get mode() { return this.session?.mode ?? 'historia'; }
  get storyMode() { return this.mode === 'historia'; }

  start(withIntro = this.storyMode && (this.session?.isNew ?? true)) {
    this.audio.start();
    if (!withIntro) { this.begin(false); return; }
    this.playing = false;
    this.input.enabled = false;
    this.hud.show(false);
    if (this.touch) document.getElementById('touch')!.classList.add('hidden');
    new Intro(this, () => this.begin(true)).start();
  }

  private begin(afterIntro: boolean) {
    this.playing = true;
    this.input.enabled = true;
    this.input.flush();
    this.hud.show(true);
    if (this.touch) document.getElementById('touch')!.classList.remove('hidden');
    this.camera.fov = 62;
    this.camera.updateProjectionMatrix();
    this.cam.snap();
    this.clock.getDelta();
    this.renderer.setAnimationLoop(() => this.frame());
    if (afterIntro) {
      setTimeout(() => this.hud.toast('SOBREVIVE. ENCUENTRA LA MANERA DE REGRESAR A CASA.', true), 400);
      setTimeout(() => this.hud.toast('📱 Tu celular dice: ERROR TEMPORAL'), 3800);
      this.story.afterIntro();
    }
    document.getElementById('objective')!.classList.toggle('hidden', !this.storyMode);
    document.getElementById('btn-friends')!.classList.toggle('hidden', this.storyMode);
    if (!this.storyMode) {
      // Mundo abierto: sin trama; se abre directamente la pantalla de salas.
      setTimeout(() => this.hud.toast('🌍 Mundo abierto: crea una sala o entra en la de un amigo', true), 300);
      setTimeout(() => { if (!this.mp.active && !this.paused) { this.setPaused(true); document.getElementById('btn-friends')!.click(); } }, 1200);
    }
  }

  /** Vuelve a ver la introducción desde el menú de pausa. */
  replayIntro() {
    this.paused = false;
    this.survival.frozen = false;
    document.getElementById('pause-menu')!.classList.add('hidden');
    this.audio.resume();
    this.start(true);
  }

  /** Renderiza el mundo con una cámara de cinemática (usada por la introducción). */
  renderCinematic(dt: number, pos: THREE.Vector3, look: THREE.Vector3, fov: number) {
    this.env.setTime(clockAt(0)); // la introducción siempre es de día
    for (const d of this.dinos) d.update(dt, pos, 0);
    for (const p of this.pterosaurs) p.update(dt);
    this.terrain.update(dt);
    windTime.value += dt;
    this.player.model.update(dt, 0, true, false, 0);
    this.camera.position.copy(pos);
    this.camera.fov = fov;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(look);
    this.env.update(this.player.position, this.camera);
    this.shafts.update(dt, this.player.position, this.camera);
    this.vegetation.updateVisibility(this.camera.position, PRESETS[this.settings.quality].viewDistance, PRESETS[this.settings.quality].decorDistance);
    this.audio.update(dt);
    this.post.setMood(this.env.daylight, this.env.dusk);
    this.post.render(dt);
    this.envT = 1; // al volver al juego se recupera la hora real
  }

  setPaused(p: boolean) {
    this.paused = p;
    this.survival.frozen = p;
    document.getElementById('pause-menu')!.classList.toggle('hidden', !p);
    this.input.enabled = !p;
    this.input.flush();
    if (p) this.narrator.pause(); else this.narrator.resume();
    if (p) { this.audio.suspend(); if (document.pointerLockElement) document.exitPointerLock(); void this.save('pause'); }
    else { this.audio.resume(); this.clock.getDelta(); }
  }

  respawnAtSafePoint(penalty: boolean) {
    // Si tienes un refugio, despiertas en el más cercano; si no, en el claro.
    const home = this.buildings.nearest(this.player.position, Infinity, true);
    if (home) {
      const p = home.inside();
      this.player.spawn(p.x, p.z);
      this.player.facing = home.root.rotation.y;
    } else this.player.spawn(SPAWN.x, SPAWN.z);
    this.cam.snap();
    if (penalty) {
      this.inventory.losePortion(0.25);
      this.survival.respawn();
      this.hud.toast(home ? 'Te desmayaste y despertaste en tu refugio. Perdiste algunos materiales.' : 'Te desmayaste y despertaste en el claro. Perdiste algunos materiales.', true);
    }
  }

  private frame() {
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.paused) return;
    if (this.input.consume('pause')) { this.setPaused(true); return; }
    this.input.update();
    const [lx, ly, zoom] = this.input.consumeLook();
    this.cam.rotate(lx, ly, zoom);

    this.weaponCd -= dt;
    if (this.input.consume('craft')) {
      if (this.buildings.placing) this.cancelBuild();
      else this.hotbar.toggleCraft();
    }
    for (let i = 1; i <= 5; i++) if (this.input.consume(`slot${i}` as 'slot1')) this.hotbar.selectIndex(i - 1);
    if (this.input.consume('attack') && !this.hotbar.craftOpen) this.attack();
    this.player.model.aiming = this.hotbar.selected === 'bow' && this.weaponCd > -0.6;
    this.projectiles.update(dt, this.dinos, (d, dmg) => this.hitDino(d, dmg));

    const wasCrouch = this.input.state.crouch;
    this.player.update(dt, this.input, this.cam, this.survival);
    if (this.touch && wasCrouch !== this.input.state.crouch) this.touch.syncCrouch(this.input.state.crouch);
    const pp = this.player.position;

    // Empuje físico entre el jugador y los dinosaurios.
    // Dentro de un refugio terminado los dinosaurios no te ven.
    const sheltered = !!this.buildings.insideShelter(pp);
    const stealth = sheltered || this.resting ? 0 : this.player.crouching ? 0.55 : 1;
    // De noche los depredadores perciben más lejos; correr hace ruido.
    Dinosaur.night = THREE.MathUtils.clamp((0.6 - this.env.daylight) / 0.5, 0, 1);
    Dinosaur.noise = this.player.running ? 1.35 : 1;
    const lodDist = PRESETS[this.settings.quality].dinoLod;
    for (const d of this.dinos) {
      d.lodFar = d.position.distanceTo(this.camera.position) > lodDist;
      d.update(dt, pp, stealth);
      if (d.down) continue;
      const r = d.cfg.radius * d.cfg.scale + 0.35;
      const dx = pp.x - d.position.x, dz = pp.z - d.position.z, dist = Math.hypot(dx, dz);
      if (dist < r && dist > 1e-3 && pp.y < d.position.y + 2.5 * d.cfg.scale) {
        pp.x = d.position.x + (dx / dist) * r;
        pp.z = d.position.z + (dz / dist) * r;
        this.player.model.root.position.copy(pp);
      }
      if (d.cfg === TRICERATOPS && dist < 20) this.objectives.set('dino', 1);
    }

    for (const p of this.pterosaurs) p.update(dt);
    this.updateInteraction();
    this.survival.update(dt, { running: this.player.running, moving: this.player.speed > 0.5, inWater: this.player.inWater });
    if (this.survival.dead) this.respawnAtSafePoint(true);
    if (pp.distanceTo(this.startPos) > 15) this.objectives.set('explore', 15);

    this.collectibles.update(dt, this.focus);
    this.meat.update(dt);
    if (this.storyMode) this.story.update(dt, Dinosaur.night, sheltered);
    this.mp.update(dt);
    this.pvpSafe = Math.max(0, this.pvpSafe - dt);
    if (this.pvpHits && (this.pvpForget -= dt) <= 0) this.pvpHits = 0;
    this.updateBuilding(dt);
    this.updateTimeOfDay(false, dt);
    this.terrain.update(dt);
    windTime.value += dt;
    this.cam.update(dt, pp, this.player.crouching);
    if (this.shake > 0) {
      // Temblor de cámara por las pisadas del tiranosaurio (desactivado con "reducir movimiento").
      if (!(this.settings as Partial<ProfileSettings>).reduceMotion) this.camera.position.y += Math.sin(performance.now() * 0.09) * this.shake * 0.06;
      this.shake = Math.max(0, this.shake - dt * 2.5);
    }
    this.env.update(pp, this.camera);
    this.particles.update(dt, this.camera.position, this.env.daylight, !!(this.settings as Partial<ProfileSettings>).reduceMotion);
    this.shafts.update(dt, pp, this.camera, this.env.daylight);
    this.vegetation.updateVisibility(this.camera.position, PRESETS[this.settings.quality].viewDistance, PRESETS[this.settings.quality].decorDistance);
    this.audio.update(dt);

    this.hud.updateStats(this.survival);
    this.hud.drawMinimap(pp.x, pp.z, Math.PI - this.player.facing, this.dinos.filter((d) => !d.down).map((d) => ({
      x: d.position.x, z: d.position.z, color: (d.cfg as Species).map.color, size: (d.cfg as Species).map.size,
    })).concat(this.buildings.shelters.map((s) => ({ x: s.position.x, z: s.position.z, color: '#ffcf4a', size: 4 }))).concat(this.story.markers()).concat(this.mp.markers()));
    this.post.setMood(this.env.daylight, this.env.dusk);
    this.post.render(dt);
    if (this.settings.showFps) this.hud.tickFps(dt, `${this.renderer.info.render.calls} draws`);

    this.session?.tick(this, dt);
    // Postura de alerta si un depredador caza cerca.
    this.player.model.danger = this.dinos.some((d) => d.threatening && d.position.distanceTo(pp) < 30) ? 1 : 0;
  }

  private craft(i: number) {
    const r = RECIPES[i];
    if (!r || !this.inventory.spend(r.cost)) return;
    this.inventory.add(r.id, r.amount);
    this.audio.pickup();
    this.hud.toast(`🛠 Fabricaste: ${ITEMS[r.id].name}${r.amount > 1 ? ` ×${r.amount}` : ''} ${ITEMS[r.id].icon}`);
    const w = WEAPONS.find((x) => x.item === r.id);
    if (w) this.hotbar.select(w.id);
    this.hotbar.render();
    void this.save('craft');
  }

  /** Ataque con el arma equipada (cuerpo a cuerpo o a distancia). */
  private attack() {
    const w = WEAPONS.find((x) => x.id === this.hotbar.selected)!;
    const m = this.player.model;
    if (this.weaponCd > 0 || m.busy || m.attacking) return;
    const f = this.cam.forward(new THREE.Vector3());
    this.player.facing = Math.atan2(f.x, f.z);
    const pp = this.player.position;
    if (w.ranged) {
      const ammo = w.ranged.ammo;
      if (this.inventory.get(ammo) <= 0) { this.hud.toast(`No tienes ${ITEMS[ammo].name.toLowerCase()} ${ITEMS[ammo].icon}`); return; }
      this.inventory.add(ammo, -1);
      const from = new THREE.Vector3(pp.x + f.x * 0.5, pp.y + 1.35, pp.z + f.z * 0.5);
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      // Punto al que apunta la mira; ayuda de puntería hacia el dinosaurio más alineado.
      let target = this.camera.position.clone().addScaledVector(dir, 40);
      let bestDot = Math.cos(0.14);
      const c = new THREE.Vector3();
      for (const d of this.dinos) {
        if (d.down) continue;
        d.hitCenter(c);
        const to = c.clone().sub(this.camera.position);
        const dist = to.length();
        if (dist > 70) continue;
        const dot = to.divideScalar(dist).dot(dir);
        if (dot > bestDot) { bestDot = dot; target = c.clone(); }
      }
      // Rivales (juego por equipos): si el más alineado es un rival, le llega el golpe al caer el proyectil.
      let foe: RemotePlayer | null = null;
      for (const e of this.mp.enemies()) {
        c.copy(e.position).setY(e.position.y + 1.1);
        const to = c.clone().sub(this.camera.position);
        const dist = to.length();
        if (dist > 45) continue;
        const dot = to.divideScalar(dist).dot(dir);
        if (dot > bestDot) { bestDot = dot; target = c.clone(); foe = e; }
      }
      if (foe) {
        const hitFoe = foe, flight = Math.hypot(target.x - from.x, target.z - from.z) / w.ranged.speed;
        setTimeout(() => { if (this.mp.enemies().includes(hitFoe)) { this.mp.hit(hitFoe); this.audio.thud(0.3); } }, flight * 1000);
      }
      const flat = Math.hypot(target.x - from.x, target.z - from.z);
      const aim = target.sub(from).normalize();
      // Compensa la caída del proyectil.
      const g = w.id === 'bow' ? 4.9 : 9.8;
      aim.y += (0.5 * g * (flat / w.ranged.speed) ** 2) / Math.max(flat, 1);
      this.projectiles.fire(w.id === 'bow' ? 'arrow' : 'stone', from, aim.normalize(), w.ranged.speed, w.damage);
      this.player.facing = Math.atan2(aim.x, aim.z);
    } else {
      // Ayuda de puntería: golpea al dinosaurio más cercano delante del jugador.
      let best: Dinosaur | null = null, bestDist = Infinity;
      for (const d of this.dinos) {
        if (d.down) continue;
        const dx = d.position.x - pp.x, dz = d.position.z - pp.z;
        const dist = Math.hypot(dx, dz) - d.cfg.radius * d.cfg.scale;
        if (dist > w.reach || dist >= bestDist) continue;
        const ang = Math.abs(((Math.atan2(dx, dz) - this.player.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (ang > 1.2 && dist > 0.4) continue;
        best = d; bestDist = dist;
      }
      let foe: RemotePlayer | null = null;
      for (const e of this.mp.enemies()) {
        const dx = e.position.x - pp.x, dz = e.position.z - pp.z;
        const dist = Math.hypot(dx, dz) - 0.35;
        if (dist > w.reach || dist >= bestDist) continue;
        const ang = Math.abs(((Math.atan2(dx, dz) - this.player.facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        if (ang > 1.2 && dist > 0.4) continue;
        foe = e; best = null; bestDist = dist;
      }
      if (foe) {
        this.player.facing = Math.atan2(foe.position.x - pp.x, foe.position.z - pp.z);
        this.audio.thud(0.4);
        this.mp.hit(foe);
      }
      const hit = !!best || !!foe;
      if (best) {
        this.player.facing = Math.atan2(best.position.x - pp.x, best.position.z - pp.z);
        this.hitDino(best, w.damage);
      }
      if (!hit) this.audio.whoosh();
    }
    m.playAttack(w.anim);
    this.weaponCd = w.cooldown;
    if (w.ranged) this.audio.whoosh();
  }

  private hitDino(d: Dinosaur, damage: number) {
    this.audio.thud(0.45);
    d.takeHit(damage, this.player.position);
    this.hud.showTarget(d.cfg.name, d.hpFraction);
  }

  /**
   * Un rival (juego por equipos) te golpea: empujón y aviso, sin quitar salud.
   * Al tercer golpe te atrapa: vuelves a tu refugio sin perder nada y su equipo gana un punto.
   */
  private pvpHit(from: RemotePlayer) {
    const pp = this.player.position;
    if (this.pvpSafe > 0 || this.resting || this.buildings.insideShelter(pp)) return;
    this.pvpHits++;
    this.pvpForget = 10;
    this.audio.thud(0.6);
    this.player.model.playHurt();
    const dx = pp.x - from.position.x, dz = pp.z - from.position.z, l = Math.hypot(dx, dz) || 1;
    this.player.velocity.x += (dx / l) * 7;
    this.player.velocity.z += (dz / l) * 7;
    this.player.velocity.y = 3.5;
    this.player.grounded = false;
    const el = document.getElementById('hurt')!;
    if (!(this.settings as Partial<ProfileSettings>).reduceMotion) {
      el.classList.add('on');
      setTimeout(() => el.classList.remove('on'), 160);
    }
    if (this.pvpHits < 3) { this.hud.toast(`¡${from.info.name} te golpeó! (${this.pvpHits}/3) ¡Escapa o defiéndete!`); return; }
    this.pvpHits = 0;
    this.pvpSafe = 8;
    this.respawnAtSafePoint(false);
    this.hud.toast(`🏁 ¡${from.info.name} te atrapó! Vuelves a tu refugio (no pierdes nada).`, true);
    this.mp.caught(from);
  }

  /** Un dinosaurio embiste o muerde al jugador: daño, empujón y aviso. */
  private hurtPlayer(d: Dinosaur, dmg: number) {
    const pp = this.player.position;
    this.survival.damage(dmg);
    this.audio.thud(0.7);
    this.player.model.playHurt();
    const dx = pp.x - d.position.x, dz = pp.z - d.position.z, l = Math.hypot(dx, dz) || 1;
    this.player.velocity.x += (dx / l) * 9;
    this.player.velocity.z += (dz / l) * 9;
    this.player.velocity.y = 4.5;
    this.player.grounded = false;
    const el = document.getElementById('hurt')!;
    if (!(this.settings as Partial<ProfileSettings>).reduceMotion) {
      el.classList.add('on');
      setTimeout(() => el.classList.remove('on'), 160);
    }
    this.hud.toast(d.cfg.reaction === 'hunt' ? `¡El ${d.cfg.name.toLowerCase()} te muerde! ¡Huye!` : `¡El ${d.cfg.name.toLowerCase()} te embiste!`);
  }

  get gameTime() { return this.session ? this.session.save.world.gameTime : this.localTime; }
  /** Temblor de cámara (pisadas enormes). */
  shakeCamera(v: number) { this.shake = Math.max(this.shake, v); }
  advanceTime(sec: number) {
    if (this.session) this.session.save.world.gameTime += sec;
    else this.localTime += sec;
  }

  /** Luz, cielo y reloj según la hora; avisa al anochecer y al amanecer. */
  updateTimeOfDay(force: boolean, dt = 0) {
    if (!this.session) this.localTime += dt;
    this.envT += dt;
    if (!force && this.envT < 0.1) return;
    this.envT = 0;
    const c = (this.worldClock = clockAt(this.gameTime));
    this.env.setTime(c);
    this.audio.setDaylight(c.daylight);
    this.hud.setClock(c);
    if (force) { this.wasNight = c.night; return; }
    if (c.hour === 18 && this.duskWarned !== c.day && this.playing && !this.resting) {
      this.duskWarned = c.day;
      this.hud.toast(this.buildings.shelters.some((s) => s.built)
        ? '🌇 Está anocheciendo. Vuelve a tu refugio para dormir.'
        : '🌇 Está anocheciendo. Construye un refugio para pasar la noche a salvo.', true);
      if (this.storyMode) this.story.onDusk(c.day);
    }
    if (this.wasNight && !c.night && !this.resting) this.hud.toast(`🌅 ¡Amanece! Día ${c.day}`, true);
    this.wasNight = c.night;
  }

  private restLabel() {
    const h = this.worldClock.hour;
    return this.worldClock.night || h >= 17 ? 'Dormir hasta el amanecer 🌙' : 'Descansar hasta la tarde 🛖';
  }

  /** Descansa en un refugio: pasa el tiempo, recupera fuerzas y fija el punto seguro. */
  rest(home: Shelter) {
    if (this.resting || this.story.visiting) return;
    const night = this.worldClock.night || this.worldClock.hour >= 17;
    // La primera noche en el refugio, algo enorme se acerca…
    if (this.storyMode && this.story.shouldVisit(night)) { this.story.startVisit(home); return; }
    const skip = night ? secondsUntilHour(this.gameTime, 6.5) : Math.max(60, (hourToCycle(17.5) - this.worldClock.cycle) * DAY_SECONDS);
    this.resting = true;
    this.input.enabled = false;
    this.input.flush();
    this.survival.frozen = true;
    this.player.velocity.set(0, 0, 0);
    const p = home.inside();
    this.hud.sleepOverlay(night ? 'Zzz… Duermes calentito junto a la fogata' : 'Descansas un rato en tu refugio…');
    setTimeout(() => {
      this.player.spawn(p.x, p.z);
      this.player.facing = home.root.rotation.y;
      this.cam.yaw = this.player.facing + Math.PI;
      this.cam.snap();
      this.advanceTime(skip);
      const sv = this.survival;
      sv.energy = 100;
      sv.add('health', night ? 50 : 20);
      sv.hunger = Math.max(15, sv.hunger - (night ? 20 : 8));
      sv.thirst = Math.max(15, sv.thirst - (night ? 20 : 8));
      if (this.session) this.session.save.world.lastSafe = [p.x, p.z];
      this.updateTimeOfDay(true);
      this.hud.sleepOverlay(night ? `🌅 Día ${this.worldClock.day} · ${formatClock(this.worldClock)}` : `🌇 ${formatClock(this.worldClock)}`);
    }, 1300);
    setTimeout(() => {
      this.hud.sleepOverlay(null);
      this.resting = false;
      this.survival.frozen = this.paused;
      if (!this.paused) { this.input.enabled = !this.hotbar.craftOpen; this.input.flush(); }
      this.objectives.set('sleep', 1);
      this.hud.toast(night ? '¡Buenos días! Has recuperado energía y salud.' : 'Has descansado: energía al máximo.');
      void this.save('shelter');
    }, 3400);
  }

  /** Abre la vista previa para colocar una construcción. */
  private startBuild(i: number) {
    const b = BUILDS[i];
    if (!b || !this.inventory.has(b.cost) || this.buildings.building) return;
    this.hotbar.toggleCraft(false);
    this.buildings.startPlacing();
    this.hud.toast(`Elige dónde construir el ${b.name.toLowerCase()} y pulsa ${this.isTouch ? '✋' : 'E'}`);
  }

  private cancelBuild() {
    this.buildings.cancelPlacing();
    this.hud.toast('Construcción cancelada');
  }

  private placeBuild() {
    const b = BUILDS[0];
    if (!this.buildings.valid) { this.hud.toast('Aquí no cabe: busca un sitio llano y despejado'); return; }
    if (!this.inventory.spend(b.cost)) { this.buildings.cancelPlacing(); this.hud.toast('Te faltan materiales'); return; }
    const s = this.buildings.place();
    if (!s) return;
    this.player.facing = Math.atan2(s.position.x - this.player.position.x, s.position.z - this.player.position.z);
    this.audio.thud(0.4);
    this.hud.toast('🔨 Construyendo el refugio…');
  }

  private updateBuilding(dt: number) {
    const b = this.buildings, pp = this.player.position;
    if (b.placing) b.updateGhost(pp, this.cam.yaw + Math.PI);
    if (b.building && !this.player.model.building && b.building.position.distanceTo(pp) < 7) {
      this.player.model.playBuild();
      this.audio.thud(0.25);
    }
    b.update(dt, pp, this.env.daylight);
  }

  private onShelterBuilt(_s: Shelter) {
    this.audio.pickup();
    this.hud.toast('🛖 ¡Refugio terminado! Entra y pulsa ' + (this.isTouch ? '✋' : 'E') + ' para descansar. Aquí los dinosaurios no te ven.', true);
    this.objectives.set('build_shelter', 1);
    this.session?.addXp(XP.shelter, 'shelter');
    void this.save('shelter');
  }

  private updateInteraction() {
    const pp = this.player.position;
    this.focus = this.player.grounded ? this.collectibles.nearest(pp) : null;
    this.meatFocus = this.player.grounded ? this.meat.nearest(pp, 1.8) : null;
    if (this.meatFocus) this.focus = null;
    const t = this.terrain;
    this.nearWater = false;
    if (!this.focus) {
      // Agua al alcance: en el agua o en la orilla.
      for (const [ox, oz] of [[0, 0], [1.5, 0], [-1.5, 0], [0, 1.5], [0, -1.5]]) {
        if (t.heightAt(pp.x + ox, pp.z + oz) < WATER_LEVEL - 0.15) { this.nearWater = true; break; }
      }
    }
    const key = this.isTouch ? '✋' : 'E';
    const home = this.focus || this.resting ? null : this.buildings.insideShelter(pp) ?? this.buildings.nearest(pp, 3.2, true);
    if (this.buildings.placing) {
      this.hud.setPrompt(this.buildings.valid ? `Colocar el refugio aquí 🛖 · ${this.isTouch ? '🛠' : 'T'} cancela` : 'Aquí no cabe: busca un sitio llano y despejado', key);
      if (this.input.consume('interact')) this.placeBuild();
      return;
    }
    if (this.resting) { this.hud.setPrompt(null); this.input.consume('interact'); return; }
    if (this.story.visiting) { this.hud.setPrompt('Quédate quieto dentro del refugio…', '🤫'); this.input.consume('interact'); return; }
    if (!this.focus && this.story.pieceNear(pp)) {
      this.hud.setPrompt('Recoger la pieza metálica que brilla ✨', key);
      if (!this.player.model.busy && this.input.consume('interact')) { this.player.model.playPickup(); void this.story.takePiece(); }
      return;
    }
    if (home && !this.focus) {
      this.hud.setPrompt(this.restLabel(), key);
      if (this.input.consume('interact') && !this.player.model.busy) this.rest(home);
      return;
    }
    if (this.meatFocus) this.hud.setPrompt(`Comer carne 🍖 (+${MEAT_HEALTH} vida)`, key);
    else if (this.focus) {
      const def = ITEMS[this.focus.type];
      this.hud.setPrompt(def.eatOnPickup ? `Comer ${def.name.toLowerCase()} ${def.icon}` : `Recoger ${def.name.toLowerCase()} ${def.icon}`, key);
    } else if (this.nearWater) this.hud.setPrompt('Beber agua 💧', key);
    else this.hud.setPrompt(null);

    if (!this.input.consume('interact') || this.player.model.busy) return;
    if (this.meatFocus) {
      const m = this.meatFocus;
      this.player.model.playPickup();
      this.player.facing = Math.atan2(m.pos.x - pp.x, m.pos.z - pp.z);
      this.meat.take(m);
      this.audio.pickup();
      this.survival.add('health', MEAT_HEALTH);
      this.survival.add('hunger', MEAT_HUNGER);
      this.hud.toast(`¡Ñam! +${MEAT_HEALTH} vida ❤️ +${MEAT_HUNGER} hambre 🍖`);
    } else if (this.focus) {
      const p = this.focus, def = ITEMS[p.type];
      this.player.model.playPickup();
      this.player.facing = Math.atan2(p.pos.x - pp.x, p.pos.z - pp.z);
      this.collectibles.take(p);
      this.audio.pickup();
      if (def.eatOnPickup) {
        this.survival.add(def.eatOnPickup.stat, def.eatOnPickup.amount);
        this.hud.toast(`¡Ñam! +${def.eatOnPickup.amount} hambre ${def.icon}`);
      } else {
        this.inventory.add(p.type);
        this.session?.resource(this, p.type, ITEMS[p.type].name);
        this.hud.updateMaterials(this.inventory, p.type);
        this.hud.toast(`+1 ${def.name} ${def.icon}`);
        this.objectives.setItem(p.type, this.inventory.get(p.type));
      }
    } else if (this.nearWater) {
      this.player.model.playPickup();
      this.survival.add('thirst', 35);
      this.audio.drink();
      this.hud.toast('Agua fresca +35 💧');
      this.objectives.set('water', 1);
    }
  }
}

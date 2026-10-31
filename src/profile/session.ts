import type { Game } from '../core/Game';
import type { ItemId } from '../items/items';
import { PLAY_LIMIT, SPAWN } from '../world/config';
import { regionAt, regionName } from '../world/regions';
import { daysSurvived } from '../world/DayNight';
import { XP, levelFor } from './experience';
import { genesisId, openWorldId, type PersistenceService } from './persistence';

export type GameMode = 'historia' | 'abierto' | 'genesis';
import { GameSave, Profile, SCHEMA_VERSION, newCompanion } from './types';

export { DAY_SECONDS } from '../world/DayNight';
const AUTOSAVE_SECONDS = 60;
const MISSION_ID = 'primeros_pasos';

export type SaveReason = 'auto' | 'mission' | 'fragment' | 'shelter' | 'character' | 'exit' | 'pause' | 'craft' | 'hidden';

/**
 * Une el perfil activo con la partida: restaura, registra descubrimientos y
 * guarda automáticamente (cada 60 s y en los momentos importantes).
 */
export class PlayerSession {
  save: GameSave;
  private autosaveT = 0;
  private scanT = 0;
  private safeT = 0;
  private revision = 0;
  private saving: Promise<void> | null = null;
  private pending = false;
  onSaved?: (ok: boolean) => void;
  onXp?: (amount: number, why: string) => void;

  /**
   * @param mode 'historia' (la aventura con trama) o 'abierto' (mundo abierto con salas de amigos,
   *   con su propia partida guardada aparte).
   */
  constructor(readonly profile: Profile, private readonly store: PersistenceService, existing: GameSave | null, readonly mode: GameMode = 'historia') {
    this.save = existing ?? PlayerSession.blank(mode === 'abierto' ? openWorldId(profile.id) : mode === 'genesis' ? genesisId(profile.id) : profile.id);
    if (mode === 'genesis') { this.save.campaignId = 'genesis_city'; this.save.worldId = 'ciudad_sector_piloto'; }
    this.revision = this.save.revision;
  }

  static blank(profileId: string): GameSave {
    return {
      schemaVersion: SCHEMA_VERSION, profileId, savedAt: 0, revision: 0,
      progress: { completedMissions: [], currentMission: MISSION_ID, objectives: {}, fragments: [], unlockedRegions: [] },
      survival: { health: 100, hunger: 100, thirst: 100, energy: 100 },
      inventory: {}, equipped: 'hand', specialItems: [], constructions: [], companion: newCompanion(),
      world: { region: 'claro', pos: [SPAWN.x, 0, SPAWN.z], facing: Math.PI, lastSafe: [SPAWN.x, SPAWN.z], gameTime: 0, depleted: [] },
      stats: { playTime: 0, daysSurvived: 0, dinosDiscovered: [], missionsCompleted: 0, resourcesDiscovered: [], xp: 0 },
    };
  }

  get level() { return levelFor(this.save.stats.xp); }
  get isNew() { return this.save.savedAt === 0; }

  /** ¿Es un buen sitio para reaparecer? (dentro del mapa, en seco y sin obstáculos). */
  static safeSpot(game: Game, x: number, z: number) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    if (Math.abs(x) > PLAY_LIMIT - 4 || Math.abs(z) > PLAY_LIMIT - 4) return false;
    if (game.terrain.waterDepthAt(x, z) > 0.3) return false;
    return !game.collisions.blocked(x, z, 0.6);
  }

  /** Aplica la partida al mundo (una sola vez, al empezar). */
  applyTo(game: Game) {
    const s = this.save;
    game.inventory.load(s.inventory as Partial<Record<ItemId, number>>);
    game.objectives.restoreProgress(s.progress.objectives, s.progress.completedMissions);
    game.buildings.import(s.constructions);
    Object.assign(game.survival, s.survival);
    if (game.survival.health < 20) game.survival.health = 20;
    game.collectibles.importDepleted(s.world.depleted ?? []);
    game.story.load(s.story);
    game.hud.importExplored(s.world.explored);
    const [x, , z] = s.world.pos;
    const [sx, sz] = s.world.lastSafe;
    if (PlayerSession.safeSpot(game, x, z)) game.player.spawn(x, z);
    else if (PlayerSession.safeSpot(game, sx, sz)) game.player.spawn(sx, sz);
    else game.player.spawn(SPAWN.x, SPAWN.z);
    game.player.facing = s.world.facing;
    game.cam.yaw = s.world.facing + Math.PI;
    game.hotbar.select(s.equipped as never);
  }

  /** Copia el estado del juego en la partida. */
  capture(game: Game) {
    const s = this.save, p = game.player.position, sv = game.survival;
    s.inventory = game.inventory.toJSON();
    s.progress.objectives = game.objectives.progressMap();
    s.progress.currentMission = game.objectives.current?.id ?? 'proximamente';
    for (const id of game.objectives.completedMissions()) if (!s.progress.completedMissions.includes(id)) s.progress.completedMissions.push(id);
    s.constructions = game.buildings.export();
    s.stats.missionsCompleted = s.progress.completedMissions.length;
    s.survival = { health: sv.health, hunger: sv.hunger, thirst: sv.thirst, energy: sv.energy };
    s.equipped = game.hotbar.selected;
    s.world.pos = [p.x, p.y, p.z];
    s.world.facing = game.player.facing;
    s.world.region = regionAt(p.x, p.z).id;
    s.world.depleted = game.collectibles.exportDepleted();
    s.world.explored = game.hud.exportExplored();
    s.story = game.story.export();
    s.stats.daysSurvived = daysSurvived(s.world.gameTime);
  }

  /** Guarda (si ya hay un guardado en curso, encola uno más). */
  async persist(game: Game, reason: SaveReason): Promise<boolean> {
    if (this.saving) { this.pending = true; await this.saving; if (!this.pending) return true; }
    this.pending = false;
    this.capture(game);
    this.save.savedAt = Date.now();
    this.save.revision = ++this.revision;
    const snapshot = structuredClone(this.save);
    let ok = true;
    this.saving = this.store.saveGame(snapshot).catch((e) => { ok = false; console.warn('No se pudo guardar', reason, e); });
    await this.saving;
    this.saving = null;
    this.autosaveT = 0;
    this.onSaved?.(ok);
    return ok;
  }

  /** Empieza de cero la partida de este perfil (se guarda una partida vacía). */
  async reset() {
    // Se reinicia la partida de este modo (no la de los otros modos).
    this.save = PlayerSession.blank(this.save.profileId);
    if (this.mode === 'genesis') { this.save.campaignId = 'genesis_city'; this.save.worldId = 'ciudad_sector_piloto'; }
    this.save.revision = ++this.revision;
    await this.store.saveGame(structuredClone(this.save)).catch(() => {});
  }

  addXp(amount: number, why: string) {
    const before = this.level.level;
    this.save.stats.xp += amount;
    this.onXp?.(amount, why);
    return this.level.level > before;
  }

  /** Llamar cada fotograma mientras se juega. */
  tick(game: Game, dt: number) {
    const s = this.save;
    s.stats.playTime += dt;
    s.world.gameTime += dt;
    this.autosaveT += dt;
    if (this.autosaveT >= AUTOSAVE_SECONDS) void this.persist(game, 'auto');

    const p = game.player.position;
    // Último punto seguro: en el suelo, en seco y sin un depredador cazando cerca.
    this.safeT += dt;
    if (this.safeT > 2) {
      this.safeT = 0;
      const hunted = game.dinos.some((d) => d.threatening && d.position.distanceTo(p) < 40);
      if (this.mode !== 'genesis' && game.player.grounded && !game.player.inWater && !hunted && PlayerSession.safeSpot(game, p.x, p.z)) s.world.lastSafe = [p.x, p.z];
    }

    this.scanT += dt;
    if (this.scanT < 0.5) return;
    // En la ciudad no hay regiones de la isla ni dinosaurios que descubrir todavía.
    if (this.mode === 'genesis') return;
    this.scanT = 0;
    const r = regionAt(p.x, p.z);
    if (!s.progress.unlockedRegions.includes(r.id)) {
      s.progress.unlockedRegions.push(r.id);
      if (s.progress.unlockedRegions.length > 1) {
        game.hud.toast(`🗺 Nueva región: ${r.name}`);
        this.addXp(XP.region, 'region');
      }
    }
    for (const d of game.dinos) {
      const name = d.cfg.name;
      if (s.stats.dinosDiscovered.includes(name)) continue;
      if (d.position.distanceTo(p) < 28) {
        s.stats.dinosDiscovered.push(name);
        game.hud.toast(`🦕 Nuevo dinosaurio descubierto: ${name}`);
        this.addXp(XP.dinosaur, 'dino');
      }
    }
  }

  /** Primer hallazgo de un tipo de recurso. */
  resource(game: Game, id: string, name: string) {
    if (this.save.stats.resourcesDiscovered.includes(id)) return;
    this.save.stats.resourcesDiscovered.push(id);
    game.hud.toast(`✨ Descubriste un recurso: ${name}`);
    this.addXp(XP.resource, 'resource');
  }

  regionName() { return regionName(this.save.world.region); }
}

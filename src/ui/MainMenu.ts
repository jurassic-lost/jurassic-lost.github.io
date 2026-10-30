import type { Game } from '../core/Game';
import { isTouchDevice } from '../core/Settings';
import { FRAGMENTS_TOTAL, GameSave, MAX_PROFILES, Profile, SCHEMA_VERSION } from '../profile/types';
import { HAIR_COLORS, HAIR_STYLES, OUTFIT_NAMES, PANTS_COLORS, SHIRT_COLORS, SKIN_TONES, defaultAppearance, defaultSettings, sanitizeAppearance, starterOutfit } from '../profile/appearance';
import { checkName } from '../profile/nameFilter';
import { PersistenceService, newId } from '../profile/persistence';
import { PlayerSession } from '../profile/session';
import { daysSurvived } from '../world/DayNight';
import { MISSIONS } from '../core/Objectives';
import { levelFor } from '../profile/experience';
import { regionName } from '../world/regions';
import { CharacterPreview } from './CharacterPreview';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const LAST_KEY = 'jurassic-lost-last-profile';
const LEGACY_KEY = 'jurassic-lost-save-v1';

interface Summary { profile: Profile; save: GameSave | null }

/**
 * Menú principal: perfiles locales (hasta 3), bienvenida, creación y
 * personalización del personaje, configuración y estadísticas.
 */
export class MainMenu {
  private summaries: Summary[] = [];
  private active: Summary | null = null;
  private preview: CharacterPreview;
  private thumbs: CharacterPreview;
  private editing: Profile | null = null;
  private draft = defaultAppearance('boy');
  private nameOk = false;
  /** Se llama al empezar a jugar. */
  onPlay?: (profile: Profile, save: GameSave | null) => void;

  constructor(private readonly store: PersistenceService, private readonly persistent: boolean, private readonly game: Game) {
    this.preview = new CharacterPreview($<HTMLCanvasElement>('creator-canvas'), { interactive: true });
    const tc = document.createElement('canvas');
    this.thumbs = new CharacterPreview(tc, { width: 172, height: 220 });
    this.wireCreator();
    this.wireMain();
    this.wireDelete();
  }

  // ---------- Pantalla principal ----------
  async show() {
    await this.migrateLegacy();
    await this.refresh();
    $('loading').classList.add('hidden');
    $('storage-warn').classList.toggle('hidden', this.persistent);
    this.screen('menu-main');
  }

  private async refresh() {
    const profiles = await this.store.listProfiles();
    this.summaries = await Promise.all(profiles.map(async (p) => ({ profile: p, save: await this.store.loadGame(p.id) })));
    let lastId: string | null = null;
    try { lastId = localStorage.getItem(LAST_KEY); } catch { /* sin acceso */ }
    this.active = this.summaries.find((s) => s.profile.id === lastId) ?? this.summaries[0] ?? null;
    this.renderMain();
  }

  private setActive(s: Summary) {
    this.active = s;
    try { localStorage.setItem(LAST_KEY, s.profile.id); } catch { /* ignorar */ }
    this.renderMain();
  }

  private renderMain() {
    const a = this.active;
    $('menu-buttons').classList.remove('hidden');
    $('welcome').classList.toggle('hidden', !a);
    $('btn-continue').classList.toggle('hidden', !a);
    $('btn-character').textContent = a ? 'MI PERSONAJE' : 'MI PERSONAJE';
    $('btn-new').classList.toggle('primary', !a);
    if (a) {
      $<HTMLImageElement>('welcome-img').src = this.thumbs.snapshot(a.profile.appearance);
      $('welcome-name').textContent = a.profile.displayName;
      const sv = a.save;
      $('welcome-region').textContent = `📍 Región: ${sv ? regionName(sv.world.region) : 'Claro inicial'}`;
      $('welcome-mission').textContent = `🎯 Misión: ${sv ? missionName(sv) : 'Primeros pasos'}`;
      $('welcome-saved').textContent = `💾 Último guardado: ${sv && sv.savedAt ? formatDate(sv.savedAt) : 'todavía no hay partida'}`;
      $('btn-continue').textContent = sv && sv.savedAt ? 'CONTINUAR AVENTURA' : 'COMENZAR AVENTURA';
    }
    const slots = $('profile-slots');
    slots.classList.toggle('hidden', this.summaries.length === 0);
    slots.innerHTML = '';
    for (let i = 0; i < MAX_PROFILES; i++) {
      const s = this.summaries[i];
      const el = document.createElement('div');
      el.className = 'pslot' + (s && s === a ? ' active' : '');
      if (s) {
        const lv = levelFor(s.save?.stats.xp ?? 0).level;
        const days = s.save ? daysSurvived(s.save.world.gameTime) : 0;
        const frags = s.save?.progress.fragments.length ?? 0;
        el.innerHTML = `<img alt="" /><b></b><span>Nivel ${lv}</span><span>Días: ${days}</span><span>Fragmentos: ${frags}/${FRAGMENTS_TOTAL}</span>`;
        (el.querySelector('img') as HTMLImageElement).src = this.thumbs.snapshot(s.profile.appearance);
        el.querySelector('b')!.textContent = `PERFIL ${i + 1} — ${s.profile.displayName}`;
        const del = document.createElement('button');
        del.className = 'del'; del.textContent = '🗑'; del.title = 'Borrar perfil'; del.setAttribute('aria-label', `Borrar ${s.profile.displayName}`);
        del.onclick = (e) => { e.stopPropagation(); this.askDelete(s.profile); };
        el.appendChild(del);
        el.onclick = () => this.setActive(s);
      } else {
        el.innerHTML = `<div class="new">＋</div><b>PERFIL ${i + 1}</b><span>Nueva aventura</span><span>Crear personaje</span>`;
        el.onclick = () => this.openCreator(null);
      }
      slots.appendChild(el);
    }
  }

  private wireMain() {
    $('btn-continue').onclick = () => { if (this.active) this.play(this.active.profile, this.active.save); };
    $('btn-new').onclick = () => {
      if (this.summaries.length >= MAX_PROFILES) { this.status('⚠️ Ya hay 3 perfiles. Borra uno con 🗑 para crear otro.', 'menu'); return; }
      this.openCreator(null);
    };
    $('btn-character').onclick = () => this.openCreator(this.active?.profile ?? null);
    $('btn-settings').onclick = () => this.openSettings(this.active?.profile ?? null);
  }

  private status(text: string, where: 'menu' | 'creator') {
    if (where === 'creator') { $('cr-status').textContent = text; return; }
    const w = $('storage-warn');
    w.textContent = text; w.classList.remove('hidden');
    setTimeout(() => { w.classList.toggle('hidden', this.persistent); w.textContent = 'Este navegador no permite guardar datos: tu progreso se perderá al cerrar.'; }, 4000);
  }

  private screen(id: 'menu-main' | 'menu-creator' | 'menu-delete') {
    for (const s of ['menu-main', 'menu-creator', 'menu-delete']) $(s).classList.toggle('hidden', s !== id);
    if (id === 'menu-creator') this.preview.start(); else this.preview.stop();
  }

  private play(profile: Profile, save: GameSave | null) {
    try { localStorage.setItem(LAST_KEY, profile.id); } catch { /* ignorar */ }
    this.preview.stop();
    this.onPlay?.(profile, save);
  }

  // ---------- Creador de personaje ----------
  private openCreator(profile: Profile | null) {
    if (!profile && this.summaries.length >= MAX_PROFILES) { this.status('⚠️ Ya hay 3 perfiles. Borra uno para crear otro.', 'menu'); return; }
    this.editing = profile;
    this.draft = profile ? { ...profile.appearance } : defaultAppearance('boy');
    $('cr-title').textContent = profile ? 'Mi personaje' : 'Crea tu explorador';
    const name = $<HTMLInputElement>('cr-name');
    name.value = profile?.displayName ?? '';
    $('cr-status').textContent = '';
    this.validateName();
    this.renderCreator();
    this.screen('menu-creator');
    if (!isTouchDevice()) name.focus();
  }

  private validateName() {
    const v = $<HTMLInputElement>('cr-name').value;
    const msg = $('cr-name-msg');
    if (!v.trim()) { msg.textContent = ''; msg.className = 'name-msg'; this.nameOk = false; return; }
    const r = checkName(v);
    const taken = r.ok && this.summaries.some((s) => s.profile.id !== this.editing?.id && s.profile.displayName.toLowerCase() === r.name.toLowerCase());
    this.nameOk = r.ok && !taken;
    msg.textContent = taken ? '⚠️ Ya tienes un perfil con ese nombre.' : r.message;
    msg.className = 'name-msg ' + (this.nameOk ? 'ok' : 'bad');
  }

  private renderCreator() {
    const d = this.draft;
    this.preview.setAppearance(d);
    document.querySelectorAll<HTMLButtonElement>('#cr-char button').forEach((b) => b.classList.toggle('on', b.dataset.v === d.character));
    const swatches = (id: string, list: string[], key: 'skin' | 'hairColor' | 'shirt' | 'pants', label: string) => {
      const el = $(id); el.innerHTML = '';
      list.forEach((c, i) => {
        const b = document.createElement('button');
        b.style.background = c; b.className = d[key] === c ? 'on' : '';
        b.setAttribute('aria-label', `${label} ${i + 1}`);
        b.onclick = () => { this.draft[key] = c; this.renderCreator(); };
        el.appendChild(b);
      });
    };
    swatches('cr-skin', SKIN_TONES, 'skin', 'Piel');
    swatches('cr-hair-color', HAIR_COLORS, 'hairColor', 'Cabello');
    swatches('cr-shirt', SHIRT_COLORS, 'shirt', 'Camiseta');
    swatches('cr-pants', PANTS_COLORS, 'pants', 'Pantalón');
    const hair = $('cr-hair'); hair.innerHTML = '';
    for (const h of HAIR_STYLES) {
      const b = document.createElement('button');
      b.textContent = h.name; b.className = d.hairStyle === h.id ? 'on' : '';
      b.onclick = () => { this.draft.hairStyle = h.id; this.renderCreator(); };
      hair.appendChild(b);
    }
    const outfit = starterOutfit();
    $('cr-outfit').innerHTML = [outfit.shirt, outfit.pants, outfit.boots, outfit.backpack].map((k) => `<li>${OUTFIT_NAMES[k]}</li>`).join('');
  }

  private wireCreator() {
    $<HTMLInputElement>('cr-name').addEventListener('input', () => this.validateName());
    document.querySelectorAll<HTMLButtonElement>('#cr-char button').forEach((b) => {
      b.onclick = () => {
        const c = b.dataset.v === 'girl' ? 'girl' : 'boy';
        if (c === this.draft.character) return;
        // Cambia el modelo base y propone un peinado; el resto de colores se conservan.
        this.draft = { ...this.draft, character: c, hairStyle: defaultAppearance(c).hairStyle };
        this.renderCreator();
      };
    });
    $('cr-back').onclick = () => this.screen('menu-main');
    $('cr-confirm').onclick = async () => { if (await this.confirmCharacter()) { $('cr-status').textContent = '✅ Personaje guardado.'; } };
    $('cr-start').onclick = async () => {
      const p = await this.confirmCharacter();
      if (!p) return;
      const s = this.summaries.find((x) => x.profile.id === p.id);
      this.play(p, s?.save ?? null);
    };
  }

  /** Valida y guarda el perfil. Devuelve el perfil guardado o null. */
  private async confirmCharacter(): Promise<Profile | null> {
    this.validateName();
    if (!this.nameOk) {
      $('cr-status').textContent = $<HTMLInputElement>('cr-name').value.trim() ? '⚠️ Revisa el nombre del explorador.' : '⚠️ Escribe un nombre de explorador.';
      return null;
    }
    const r = checkName($<HTMLInputElement>('cr-name').value);
    if (!r.ok) return null;
    const now = Date.now();
    const p: Profile = this.editing
      ? { ...this.editing, displayName: r.name, appearance: sanitizeAppearance(this.draft), updatedAt: now }
      : {
        schemaVersion: SCHEMA_VERSION, id: newId(), displayName: r.name, appearance: sanitizeAppearance(this.draft),
        outfit: starterOutfit(), settings: { ...defaultSettings(isTouchDevice()), ...this.game.settings }, createdAt: now, updatedAt: now,
      };
    try {
      await this.store.saveProfile(p);
    } catch (e) {
      $('cr-status').textContent = '⚠️ No se pudo guardar el perfil.';
      console.warn(e);
      return null;
    }
    this.editing = p;
    await this.refresh();
    const s = this.summaries.find((x) => x.profile.id === p.id);
    if (s) this.setActive(s);
    return p;
  }

  // ---------- Borrado protegido ----------
  private deleting: Profile | null = null;
  private askDelete(p: Profile) {
    this.deleting = p;
    $('del-name').textContent = p.displayName;
    const inp = $<HTMLInputElement>('del-input');
    inp.value = '';
    $<HTMLButtonElement>('del-confirm').disabled = true;
    this.screen('menu-delete');
  }
  private wireDelete() {
    const inp = $<HTMLInputElement>('del-input');
    inp.addEventListener('input', () => { $<HTMLButtonElement>('del-confirm').disabled = inp.value.trim() !== this.deleting?.displayName; });
    $('del-cancel').onclick = () => { this.deleting = null; this.screen('menu-main'); };
    $('del-confirm').onclick = async () => {
      if (!this.deleting || inp.value.trim() !== this.deleting.displayName) return;
      await this.store.deleteProfile(this.deleting.id);
      this.deleting = null;
      await this.refresh();
      this.screen('menu-main');
    };
  }

  // ---------- Configuración y estadísticas (también desde la pausa) ----------
  openSettings(profile: Profile | null, onClose?: () => void) {
    const s = this.game.settings as unknown as Profile['settings'];
    if (profile && profile !== this.game.session?.profile) Object.assign(s, profile.settings);
    const bind = <K extends keyof Profile['settings']>(id: string, key: K, kind: 'range' | 'check' | 'select') => {
      const el = $<HTMLInputElement>(id);
      if (kind === 'check') el.checked = !!s[key]; else el.value = String(s[key]);
      const ev = kind === 'range' ? 'oninput' : 'onchange';
      el[ev] = () => {
        (s as unknown as Record<string, unknown>)[key] = kind === 'check' ? el.checked : kind === 'range' ? +el.value : el.value;
        this.game.applySettings();
      };
    };
    bind('set-volume', 'volume', 'range');
    bind('set-music', 'musicVolume', 'range');
    bind('set-sfx', 'sfxVolume', 'range');
    bind('set-quality', 'quality', 'select');
    bind('set-sens', 'sensitivity', 'range');
    bind('set-lang', 'language', 'select');
    bind('set-large', 'largeText', 'check');
    bind('set-contrast', 'highContrast', 'check');
    bind('set-motion', 'reduceMotion', 'check');
    bind('set-fps', 'showFps', 'check');
    $('set-note').textContent = profile ? `Las preferencias se guardan en el perfil de ${profile.displayName}.` : 'Crea un perfil para guardar tus preferencias.';
    $('settings-screen').classList.remove('hidden');
    $('set-back').onclick = async () => {
      $('settings-screen').classList.add('hidden');
      if (profile) {
        profile.settings = { ...profile.settings, ...s };
        await this.store.saveProfile(profile).catch(() => {});
      }
      onClose?.();
    };
  }

  static showStats(session: PlayerSession, onClose?: () => void) {
    const sv = session.save, st = sv.stats, lv = levelFor(st.xp);
    const kiro = sv.companion.state === 'not_met' ? 'Aún no lo conoces' : `Amistad ${sv.companion.friendship}`;
    const rows: [string, string][] = [
      ['Nombre del explorador', session.profile.displayName],
      ['Personaje', session.profile.appearance.character === 'girl' ? 'Niña exploradora' : 'Niño explorador'],
      ['Nivel', String(lv.level)],
      ['Experiencia', `${lv.into} / ${lv.next}`],
      ['Días sobrevividos', String(daysSurvived(sv.world.gameTime))],
      ['Tiempo de juego', formatTime(st.playTime)],
      ['Dinosaurios descubiertos', String(st.dinosDiscovered.length)],
      ['Misiones completadas', String(sv.progress.completedMissions.length)],
      ['Fragmentos temporales', `${sv.progress.fragments.length} / ${FRAGMENTS_TOTAL}`],
      ['Kiro', kiro],
      ['Regiones exploradas', String(sv.progress.unlockedRegions.length)],
    ];
    const body = $('stats-body');
    body.innerHTML = '';
    for (const [k, v] of rows) {
      const a = document.createElement('span'); a.className = 'k'; a.textContent = k;
      const b = document.createElement('span'); b.className = 'v'; b.textContent = v;
      body.append(a, b);
      if (k === 'Experiencia') {
        const bar = document.createElement('div'); bar.className = 'xpbar';
        bar.innerHTML = `<i style="width:${Math.round((lv.into / lv.next) * 100)}%"></i>`;
        body.append(bar);
      }
    }
    $('stats-screen').classList.remove('hidden');
    $('stats-back').onclick = () => { $('stats-screen').classList.add('hidden'); onClose?.(); };
  }

  // ---------- Partida antigua (antes de los perfiles) ----------
  private async migrateLegacy() {
    let raw: string | null = null;
    try { raw = localStorage.getItem(LEGACY_KEY); } catch { return; }
    if (!raw) return;
    const profiles = await this.store.listProfiles();
    if (profiles.length >= MAX_PROFILES) return;
    try {
      const old = JSON.parse(raw) as { inventory?: Record<string, number>; objectives?: string[]; stats?: GameSave['survival']; pos?: [number, number] };
      const now = Date.now();
      const p: Profile = {
        schemaVersion: SCHEMA_VERSION, id: newId(), displayName: 'Explorador', appearance: defaultAppearance('boy'),
        outfit: starterOutfit(), settings: defaultSettings(isTouchDevice()), createdAt: now, updatedAt: now,
      };
      const save = PlayerSession.blank(p.id);
      save.inventory = old.inventory ?? {};
      for (const id of old.objectives ?? []) save.progress.objectives[id] = 999;
      if (old.stats) save.survival = old.stats;
      if (old.pos) save.world.pos = [old.pos[0], 0, old.pos[1]];
      save.savedAt = now; save.revision = 1;
      await this.store.saveProfile(p);
      await this.store.saveGame(save);
      localStorage.removeItem(LEGACY_KEY);
    } catch (e) { console.warn('No se pudo importar la partida antigua', e); }
  }
}

function missionName(s: GameSave) {
  return MISSIONS().find((m) => m.id === s.progress.currentMission)?.title ?? 'Próximamente: nuevas misiones';
}

function formatDate(t: number) {
  return new Date(t).toLocaleString('es', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function formatTime(sec: number) {
  const m = Math.floor(sec / 60), h = Math.floor(m / 60);
  return h ? `${h} h ${m % 60} min` : `${m} min`;
}

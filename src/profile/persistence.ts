import { GameSave, MAX_PROFILES, Profile, SCHEMA_VERSION } from './types';

/**
 * Servicio de persistencia. El juego solo conoce esta interfaz, de modo que
 * más adelante se puede cambiar IndexedDB por un servidor (con sincronización
 * entre dispositivos) sin tocar el resto del código.
 */
export interface PersistenceService {
  listProfiles(): Promise<Profile[]>;
  saveProfile(p: Profile): Promise<void>;
  /** Borra el perfil y todas sus partidas. */
  deleteProfile(id: string): Promise<void>;
  /** Devuelve la última partida válida (o la copia anterior si la última está dañada). */
  loadGame(profileId: string): Promise<GameSave | null>;
  /** Guarda de forma transaccional, conservando la copia anterior. */
  saveGame(save: GameSave): Promise<void>;
  /** Fecha del último guardado. */
  lastSaved(profileId: string): Promise<number | null>;
}

/** Identificador aleatorio no predecible. */
export function newId(): string {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  return [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
}

/** Comprueba que una partida tiene la forma esperada antes de usarla. */
export function isValidSave(s: unknown): s is GameSave {
  const g = s as GameSave;
  return !!g && typeof g === 'object' && typeof g.profileId === 'string' && typeof g.schemaVersion === 'number'
    && !!g.inventory && typeof g.inventory === 'object' && !!g.survival && !!g.world && Array.isArray(g.world.pos)
    && g.world.pos.every((n) => Number.isFinite(n)) && !!g.progress && !!g.stats;
}

/** Migraciones de versiones antiguas del formato. */
export function migrateSave(s: GameSave): GameSave {
  // v1 es la primera versión; aquí se añadirán los pasos v1 → v2, etc.
  if (s.schemaVersion > SCHEMA_VERSION) throw new Error('Partida de una versión más nueva del juego');
  return s;
}

/** El mundo abierto tiene su propia partida (no toca la del modo historia). */
export const openWorldId = (profileId: string) => `${profileId}~abierto`;

const DB_NAME = 'jurassic-lost';
const DB_VERSION = 1;

const req = <T>(r: IDBRequest<T>) => new Promise<T>((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = (t: IDBTransaction) => new Promise<void>((res, rej) => { t.oncomplete = () => res(); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error ?? new Error('abort')); });

export class IndexedDBPersistence implements PersistenceService {
  private db: Promise<IDBDatabase>;

  constructor() {
    this.db = new Promise((res, rej) => {
      const r = indexedDB.open(DB_NAME, DB_VERSION);
      r.onupgradeneeded = () => {
        const db = r.result;
        // profiles: un registro por perfil. saves: "<id>:current" y "<id>:backup".
        if (!db.objectStoreNames.contains('profiles')) db.createObjectStore('profiles', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
      };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
      r.onblocked = () => rej(new Error('IndexedDB bloqueada'));
    });
  }

  async listProfiles() {
    const db = await this.db;
    const all = await req(db.transaction('profiles').objectStore('profiles').getAll()) as Profile[];
    return all.sort((a, b) => a.createdAt - b.createdAt);
  }

  async saveProfile(p: Profile) {
    const db = await this.db;
    const t = db.transaction('profiles', 'readwrite');
    const store = t.objectStore('profiles');
    const existing = await req(store.get(p.id));
    if (!existing) {
      const count = await req(store.count());
      if (count >= MAX_PROFILES) { t.abort(); throw new Error('Máximo de perfiles alcanzado'); }
    }
    store.put({ ...p, updatedAt: Date.now() });
    await done(t);
  }

  async deleteProfile(id: string) {
    const db = await this.db;
    const t = db.transaction(['profiles', 'saves'], 'readwrite');
    t.objectStore('profiles').delete(id);
    t.objectStore('saves').delete(`${id}:current`);
    t.objectStore('saves').delete(`${id}:backup`);
    t.objectStore('saves').delete(`${openWorldId(id)}:current`);
    t.objectStore('saves').delete(`${openWorldId(id)}:backup`);
    await done(t);
  }

  async loadGame(profileId: string) {
    const db = await this.db;
    const store = db.transaction('saves').objectStore('saves');
    for (const slot of ['current', 'backup']) {
      const s = await req(store.get(`${profileId}:${slot}`));
      if (isValidSave(s) && s.profileId === profileId) {
        try { return migrateSave(s); } catch { /* prueba la copia */ }
      }
    }
    return null;
  }

  async saveGame(save: GameSave) {
    if (!isValidSave(save)) throw new Error('Partida no válida');
    const db = await this.db;
    // Una sola transacción: la copia actual pasa a ser la de respaldo y se escribe la nueva.
    const t = db.transaction('saves', 'readwrite');
    const store = t.objectStore('saves');
    const key = `${save.profileId}:current`;
    const prev = await req(store.get(key));
    if (isValidSave(prev)) store.put(prev, `${save.profileId}:backup`);
    store.put(save, key);
    await done(t);
  }

  async lastSaved(profileId: string) {
    const s = await this.loadGame(profileId);
    return s ? s.savedAt : null;
  }
}

/** Respaldo en memoria si IndexedDB no está disponible (modo privado estricto). */
export class MemoryPersistence implements PersistenceService {
  private profiles = new Map<string, Profile>();
  private saves = new Map<string, GameSave>();
  async listProfiles() { return [...this.profiles.values()].sort((a, b) => a.createdAt - b.createdAt); }
  async saveProfile(p: Profile) {
    if (!this.profiles.has(p.id) && this.profiles.size >= MAX_PROFILES) throw new Error('Máximo de perfiles alcanzado');
    this.profiles.set(p.id, { ...p, updatedAt: Date.now() });
  }
  async deleteProfile(id: string) { this.profiles.delete(id); this.saves.delete(id); this.saves.delete(openWorldId(id)); }
  async loadGame(id: string) { return this.saves.get(id) ?? null; }
  async saveGame(s: GameSave) { this.saves.set(s.profileId, structuredClone(s)); }
  async lastSaved(id: string) { return this.saves.get(id)?.savedAt ?? null; }
}

export async function createPersistence(): Promise<{ service: PersistenceService; persistent: boolean }> {
  try {
    if (!('indexedDB' in window)) throw new Error('sin IndexedDB');
    const s = new IndexedDBPersistence();
    await s.listProfiles();
    // Pide al navegador que no borre los datos automáticamente.
    void navigator.storage?.persist?.().catch(() => {});
    return { service: s, persistent: true };
  } catch (e) {
    console.warn('IndexedDB no disponible; el progreso no se conservará al cerrar.', e);
    return { service: new MemoryPersistence(), persistent: false };
  }
}

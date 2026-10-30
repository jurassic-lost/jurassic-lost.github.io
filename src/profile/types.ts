/**
 * Modelo de datos de jugadores y partidas (versión local, sin servidor).
 * El perfil (apariencia, nombre visible) está separado de cualquier identidad
 * de cuenta futura: aquí no se guarda ningún dato personal real.
 */
export const SCHEMA_VERSION = 1;
export const MAX_PROFILES = 3;

export type Gender = 'boy' | 'girl';
export type HairStyle = 'corto' | 'despeinado' | 'coleta' | 'melena';

export interface Appearance {
  /** Solo cambia el modelo visual; no afecta a las habilidades. */
  character: Gender;
  skin: string;
  hairStyle: HairStyle;
  hairColor: string;
  shirt: string;
  pants: string;
}

/** Ranuras de equipamiento preparadas para futuros atuendos (sin tienda). */
export interface Outfit {
  shirt: string;
  pants: string;
  boots: string;
  backpack: string;
  hat: string | null;
  accessory: string | null;
}

export type Language = 'es' | 'en';

export interface ProfileSettings {
  volume: number;
  musicVolume: number;
  sfxVolume: number;
  quality: 'low' | 'medium' | 'high';
  sensitivity: number;
  language: Language;
  showFps: boolean;
  /** Accesibilidad básica. */
  largeText: boolean;
  highContrast: boolean;
  reduceMotion: boolean;
}

export interface Profile {
  schemaVersion: number;
  /** Identificador interno aleatorio; no depende del nombre visible. */
  id: string;
  displayName: string;
  appearance: Appearance;
  outfit: Outfit;
  settings: ProfileSettings;
  createdAt: number;
  updatedAt: number;
}

export interface Construction {
  id: string;
  type: string;
  pos: [number, number, number];
  rotation: number;
  state: 'building' | 'built' | 'damaged';
  storage: Record<string, number>;
}

export interface CompanionState {
  name: string;
  state: 'not_met' | 'following' | 'waiting' | 'resting';
  friendship: number;
  abilities: string[];
  progress: number;
}

export interface GameSave {
  schemaVersion: number;
  profileId: string;
  savedAt: number;
  /** Número creciente de guardado (detecta copias antiguas). */
  revision: number;
  progress: {
    completedMissions: string[];
    currentMission: string;
    /** Objetivos de la misión actual: id → progreso. */
    objectives: Record<string, number>;
    fragments: string[];
    unlockedRegions: string[];
  };
  survival: { health: number; hunger: number; thirst: number; energy: number };
  inventory: Record<string, number>;
  /** Herramientas fabricadas y arma equipada. */
  equipped: string;
  specialItems: string[];
  constructions: Construction[];
  companion: CompanionState;
  world: {
    region: string;
    pos: [number, number, number];
    facing: number;
    lastSafe: [number, number];
    gameTime: number;
    /** Recursos recogidos que aún no han vuelto a crecer: índice → segundos restantes. */
    depleted: [number, number][];
  };
  stats: {
    playTime: number;
    daysSurvived: number;
    dinosDiscovered: string[];
    missionsCompleted: number;
    resourcesDiscovered: string[];
    xp: number;
  };
}

export const FRAGMENTS_TOTAL = 6;

export function newCompanion(): CompanionState {
  return { name: 'Kiro', state: 'not_met', friendship: 0, abilities: [], progress: 0 };
}

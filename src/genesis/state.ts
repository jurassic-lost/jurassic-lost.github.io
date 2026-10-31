/**
 * Proyecto Génesis: estado guardado de la campaña de la ciudad (va dentro de su propia
 * partida `<perfil>~genesis`, así que nunca cambia las partidas de la isla).
 */
import { GENESIS_MISSIONS } from './missions';

/** Ids que existen en la Fase 1 (lo demás se descarta al cargar). */
const MISSION_IDS = new Set(GENESIS_MISSIONS.map((m) => m.id));
const OBJECTIVE_IDS = new Set(GENESIS_MISSIONS.flatMap((m) => m.objectives.map((o) => `${m.id}.${o.id}`)));
const PICKUP_IDS = new Set(['water', 'food', 'flashlight']);

export interface GenesisState {
  /** Versión de este bloque (para migraciones futuras). */
  v: 1;
  /** Objetivos cumplidos (ids `M01.walk_to_window`, …). */
  done: string[];
  /** Misiones terminadas (M01…M05). */
  missions: string[];
  /** Objetos de la ciudad ya recogidos (id de cada objeto). */
  taken: string[];
  /** Cambios en la casa: luz apagada, ventana tapiada, provisiones guardadas. */
  lightsOff: boolean;
  boarded: boolean;
  stocked: boolean;
  /** Veces que el depredador te descubrió (para el reporte; no penaliza). */
  caught: number;
}

export function newGenesisState(): GenesisState {
  return { v: 1, done: [], missions: [], taken: [], lightsOff: false, boarded: false, stocked: false, caught: 0 };
}

const strings = (a: unknown, ok: Set<string>) =>
  (Array.isArray(a) ? [...new Set(a.filter((x): x is string => typeof x === 'string' && ok.has(x)))] : []);

/** Valida un estado leído del almacenamiento (valores raros → por defecto, sin perder lo válido). */
export function sanitizeGenesis(s: unknown): GenesisState {
  const g = (s && typeof s === 'object' ? s : {}) as Partial<GenesisState>;
  return {
    v: 1,
    done: strings(g.done, OBJECTIVE_IDS),
    missions: strings(g.missions, MISSION_IDS),
    taken: strings(g.taken, PICKUP_IDS),
    lightsOff: g.lightsOff === true,
    boarded: g.boarded === true,
    stocked: g.stocked === true,
    caught: Number.isFinite(g.caught) ? Math.max(0, Math.min(999, Math.floor(g.caught!))) : 0,
  };
}

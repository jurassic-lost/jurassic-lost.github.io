/** Configuración gráfica/sonido con detección de dispositivo y guardado local. */
export type Quality = 'low' | 'medium' | 'high';

export interface QualityPreset {
  pixelRatio: number;
  shadows: boolean;
  shadowMap: number;
  viewDistance: number;
  decor: number;
  /** Posprocesado: nada, etalonaje de color o etalonaje + resplandor. */
  post: 'off' | 'grade' | 'full';
  /** Distancia a la que los dinosaurios pasan a animarse con menos detalle. */
  dinoLod: number;
  /** Distancia a la que se dejan de dibujar las plantas pequeñas (helechos, hierba). */
  decorDistance: number;
}

export const PRESETS: Record<Quality, QualityPreset> = {
  low: { pixelRatio: 0.75, shadows: false, shadowMap: 512, viewDistance: 150, decor: 0.45, post: 'off', dinoLod: 45, decorDistance: 55 },
  medium: { pixelRatio: 1.25, shadows: true, shadowMap: 1024, viewDistance: 200, decor: 0.75, post: 'grade', dinoLod: 70, decorDistance: 80 },
  high: { pixelRatio: 2, shadows: true, shadowMap: 2048, viewDistance: 260, decor: 1, post: 'full', dinoLod: 110, decorDistance: 100 },
};

export interface SettingsData {
  quality: Quality;
  volume: number;
  sensitivity: number;
  showFps: boolean;
}

const KEY = 'jurassic-lost-settings-v1';

export const isTouchDevice = () =>
  window.matchMedia?.('(pointer: coarse)').matches || ('ontouchstart' in window && navigator.maxTouchPoints > 0);

export function loadSettings(): SettingsData {
  const defaults: SettingsData = { quality: isTouchDevice() ? 'low' : 'medium', volume: 0.7, sensitivity: 1, showFps: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...defaults, ...JSON.parse(raw) };
  } catch { /* almacenamiento no disponible */ }
  return defaults;
}

export function saveSettings(s: SettingsData) {
  try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* ignorar */ }
}

/** Partida guardada (Etapa 1: inventario, objetivos e indicadores). */
export interface SaveData {
  inventory: Record<string, number>;
  objectives: string[];
  stats: { health: number; hunger: number; thirst: number; energy: number };
  pos: [number, number];
}
const SAVE_KEY = 'jurassic-lost-save-v1';

export function loadGame(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    return raw ? (JSON.parse(raw) as SaveData) : null;
  } catch { return null; }
}
export function saveGame(d: SaveData) {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(d)); } catch { /* ignorar */ }
}
export function clearGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch { /* ignorar */ }
}

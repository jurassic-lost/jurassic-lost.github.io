import type { Appearance, Gender, HairStyle, Outfit, ProfileSettings } from './types';

/** Paletas de personalización (inspiradas en la hoja de diseño del juego). */
export const SKIN_TONES = ['#f2c9a5', '#e0a77e', '#c68560', '#9a5f3e', '#6e4128'];
export const HAIR_COLORS = ['#2a1a12', '#5a3519', '#8a5a2b', '#d9b26a', '#b5481d'];
export const SHIRT_COLORS = ['#d8c8a8', '#4f9ad8', '#6fae3c', '#e0562b', '#8a4fb8', '#e8c22e'];
export const PANTS_COLORS = ['#5b5d43', '#b89a6c', '#3b3d3f', '#2f4d78', '#6e4f33'];
export const HAIR_STYLES: { id: HairStyle; name: string }[] = [
  { id: 'corto', name: 'Corto' },
  { id: 'despeinado', name: 'Despeinado' },
  { id: 'coleta', name: 'Coleta' },
  { id: 'melena', name: 'Melena' },
];

export function defaultAppearance(character: Gender): Appearance {
  return character === 'boy'
    ? { character, skin: SKIN_TONES[1], hairStyle: 'despeinado', hairColor: HAIR_COLORS[1], shirt: SHIRT_COLORS[0], pants: PANTS_COLORS[0] }
    : { character, skin: SKIN_TONES[1], hairStyle: 'coleta', hairColor: HAIR_COLORS[0], shirt: SHIRT_COLORS[4], pants: PANTS_COLORS[0] };
}

/** Atuendo inicial, idéntico para todos los personajes (sin ventajas). */
export function starterOutfit(): Outfit {
  return { shirt: 'camiseta_explorador', pants: 'pantalon_aventura', boots: 'botas_basicas', backpack: 'mochila_pequena', hat: null, accessory: null };
}

export const OUTFIT_NAMES: Record<string, string> = {
  camiseta_explorador: 'Camiseta de explorador',
  pantalon_aventura: 'Pantalón de aventura',
  botas_basicas: 'Botas de exploración',
  mochila_pequena: 'Mochila pequeña',
};

export function defaultSettings(touch: boolean): ProfileSettings {
  return {
    volume: 0.7, musicVolume: 0.8, sfxVolume: 1, quality: touch ? 'low' : 'medium', sensitivity: 1,
    language: 'es', showFps: false, largeText: false, highContrast: false, reduceMotion: false, narration: true,
  };
}

const isColor = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

/** Normaliza una apariencia leída del almacenamiento (valores desconocidos → por defecto). */
export function sanitizeAppearance(a: Partial<Appearance> | undefined): Appearance {
  const base = defaultAppearance(a?.character === 'girl' ? 'girl' : 'boy');
  return {
    character: base.character,
    skin: isColor(a?.skin) ? a!.skin! : base.skin,
    hairStyle: HAIR_STYLES.some((h) => h.id === a?.hairStyle) ? a!.hairStyle! : base.hairStyle,
    hairColor: isColor(a?.hairColor) ? a!.hairColor! : base.hairColor,
    shirt: isColor(a?.shirt) ? a!.shirt! : base.shirt,
    pants: isColor(a?.pants) ? a!.pants! : base.pants,
  };
}

import { SpeciesConfig } from './Dinosaur';
import { buildGlbDino, GlbName, hasGlb } from './glbModels';
import { buildQuatDino, hasQuat, QuatName } from './quatModels';
import type { DinoRig } from './dinoModels';
import { buildCompy, buildIguanodon, buildLongNeck, buildStegosaurus, buildTRex, buildTriceratops } from './dinoModels';

/** Especies del juego y dónde viven. `map` define cómo se ven en el minimapa. */
export type Species = SpeciesConfig & { map: { color: string; size: number }; diet: 'herbivore' | 'carnivore'; size: 'small' | 'large' };

/**
 * Modelo con esqueleto y animaciones (Quaternius, CC0) recoloreado con tonos
 * naturales; si no se pudo cargar, se usa el modelo procedural de siempre.
 */
const quat = (name: QuatName, height: number, scale: number, biped: boolean, colors: Record<string, string>, fallback: () => DinoRig) =>
  () => (name === 't-rex' && hasQuat('trex-real') ? buildQuatDino('trex-real', { height, speciesScale: scale, biped, colors: {} })
    : hasQuat(name) ? buildQuatDino(name, { height, speciesScale: scale, biped, colors }) : fallback());

export const TRICERATOPS: Species = {
  hp: 160, reaction: 'defend', attack: 15, bodyHeight: 1.8,
  temper: 'territorial', name: 'Triceratops', build: quat('triceratops', 2.7, 0.75, false, { Purple: '#7a6a4e', LightBrown: '#c9b48a', Brown: '#e8dcc0' }, buildTriceratops), scale: 0.75, radius: 1.9, walkSpeed: 1.6, fleeSpeed: 3.4, turnRate: 1.6,
  perception: 16, personal: 5.5, homeRadius: 45, stride: 2.4, graze: 0.55, behavior: 'calm',
  map: { color: '#ff8a3d', size: 4 }, diet: 'herbivore', size: 'large',
};
export const LONG_NECK: Species = {
  hp: 260, reaction: 'defend', attack: 20, bodyHeight: 6.5,
  temper: 'gentle', name: 'Apatosaurio', build: quat('apatosaurus', 7.2, 0.85, false, { Brown: '#7d7a68', LightBrown: '#b9ab8c', Material: '#3d3a33' }, buildLongNeck), scale: 0.85, radius: 3.4, walkSpeed: 1.3, fleeSpeed: 2.2, turnRate: 0.6,
  perception: 25, personal: 9, homeRadius: 60, stride: 5, graze: 0.8, behavior: 'calm',
  map: { color: '#9fd3ff', size: 6 }, diet: 'herbivore', size: 'large',
};
export const STEGOSAURUS: Species = {
  hp: 140, reaction: 'defend', attack: 12, bodyHeight: 2.2,
  temper: 'territorial', name: 'Estegosaurio', build: quat('stegosaurus', 3.2, 0.8, false, { DarkBrown: '#5f6b45', LightBrown: '#c2b58c', Brown: '#a8552f' }, buildStegosaurus), scale: 0.8, radius: 1.7, walkSpeed: 1.4, fleeSpeed: 3.0, turnRate: 1.4,
  perception: 14, personal: 5, homeRadius: 50, stride: 2.4, graze: 0.45, behavior: 'calm',
  map: { color: '#d9a441', size: 4 }, diet: 'herbivore', size: 'large',
};
export const IGUANODON: Species = {
  hp: 60, reaction: 'flee', attack: 8, bodyHeight: 2.1,
  temper: 'skittish', name: 'Iguanodonte', build: buildIguanodon, scale: 0.8, radius: 1.2, walkSpeed: 1.8, fleeSpeed: 4.8, turnRate: 2,
  perception: 18, personal: 7, homeRadius: 55, stride: 2.2, graze: 0.5, behavior: 'calm',
  map: { color: '#c8c3ff', size: 3 }, diet: 'herbivore', size: 'small',
};
export const COMPY: Species = {
  hp: 9, reaction: 'flee', attack: 4, bodyHeight: 0.5,
  temper: 'pack', name: 'Compsognathus', build: buildCompy, scale: 1, radius: 0.25, walkSpeed: 2.4, fleeSpeed: 6.5, turnRate: 5,
  perception: 12, personal: 2.2, homeRadius: 30, stride: 0.55, graze: 0.3, behavior: 'curious',
  map: { color: '#b6e35a', size: 2 }, diet: 'carnivore', size: 'small',
};
export const TREX: Species = {
  hp: 300, reaction: 'hunt', attack: 30, bodyHeight: 4.0,
  temper: 'apex', name: 'Tiranosaurio', build: quat('t-rex', 5.0, 1.15, true, { Green: '#5a5340', LightGreen: '#a89a78', Red: '#7a2a25', LightYellow: '#e6dcc0' }, buildTRex), scale: 1.15, radius: 2.0, walkSpeed: 2.0, fleeSpeed: 5.4, turnRate: 1.2,
  perception: 34, personal: 0, homeRadius: 55, stride: 3.6, graze: 0.25, behavior: 'apex',
  map: { color: '#ff4040', size: 6 }, diet: 'carnivore', size: 'large',
};

/** Modelo GLB provisional; si no se pudo cargar, usa el modelo procedural. */
const glb = (name: GlbName, fallback: () => ReturnType<typeof buildTRex>) => () => (hasGlb(name) ? buildGlbDino(name) : fallback());

/** Depredadores medianos (modelos GLB de Ivan). */
const predator = (name: string, file: GlbName, scale: number, hp: number, attack: number, color: string): Species => ({
  hp, reaction: 'hunt', attack, bodyHeight: 2.6, temper: 'stalker',
  name, build: glb(file, buildTRex), scale, radius: 1.5, walkSpeed: 1.9, fleeSpeed: 5.0, turnRate: 1.4,
  perception: 26, personal: 0, homeRadius: 50, stride: 3.2, graze: 0.2, behavior: 'apex',
  map: { color, size: 5 }, diet: 'carnivore', size: 'large',
});
export const ALLOSAURUS = predator('Alosaurio', 'Allosaurus', 0.85, 120, 22, '#ff6a3d');
export const CERATOSAURUS = predator('Ceratosaurio', 'Ceratosaurus', 0.9, 90, 18, '#ff7d5a');
export const TORVOSAURUS = predator('Torvosaurio', 'Torvosaurus', 0.85, 140, 25, '#ff5a2a');
export const MEGALOSAURUS = predator('Megalosaurio', 'Megalosaurus', 0.9, 110, 20, '#ff7040');
export const COMPY_GLB: Species = { ...COMPY, build: glb('Compsognathus', buildCompy), scale: 0.9 };

/** Grupos iniciales: [especie, x, z, cuántos]. */
export const POPULATION: [Species, number, number, number][] = [
  [TRICERATOPS, -14, 52, 3],
  [LONG_NECK, 40, 118, 3],
  [LONG_NECK, -90, 170, 1],
  [STEGOSAURUS, -60, 40, 2],
  [IGUANODON, -40, 90, 4],
  [COMPY, 14, -14, 5],
  [COMPY_GLB, -120, -40, 4],
  [TREX, -170, -170, 1],
  [ALLOSAURUS, 200, -60, 1],
  [CERATOSAURUS, -210, 90, 1],
  [TORVOSAURUS, 190, 210, 1],
  [MEGALOSAURUS, 60, -240, 1],
];

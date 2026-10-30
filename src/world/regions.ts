/** Regiones con nombre del mapa (para progreso, experiencia y la pantalla de bienvenida). */
export interface Region { id: string; name: string; x: number; z: number; r: number }

export const REGIONS: Region[] = [
  { id: 'claro', name: 'Claro inicial', x: 0, z: 8, r: 35 },
  { id: 'lago', name: 'Lago esmeralda', x: 34, z: 66, r: 40 },
  { id: 'gigantes', name: 'Llanura de los gigantes', x: 40, z: 130, r: 70 },
  { id: 'helechos', name: 'Bosque de helechos', x: -60, z: 60, r: 60 },
  { id: 'compis', name: 'Hondonada de los compis', x: -120, z: -40, r: 55 },
  { id: 'tirano', name: 'Territorio del tirano', x: -170, z: -170, r: 80 },
  { id: 'este', name: 'Colinas del este', x: 200, z: -60, r: 90 },
  { id: 'oeste', name: 'Cañadas del oeste', x: -210, z: 90, r: 90 },
  { id: 'norte', name: 'Selva alta del norte', x: 190, z: 210, r: 90 },
  { id: 'sur', name: 'Riberas del sur', x: 60, z: -240, r: 90 },
];
export const WILD: Region = { id: 'selva', name: 'Selva profunda', x: 0, z: 0, r: 0 };

export function regionAt(x: number, z: number): Region {
  let best: Region = WILD, bd = Infinity;
  for (const r of REGIONS) {
    const d = Math.hypot(x - r.x, z - r.z) / r.r;
    if (d < 1 && d < bd) { bd = d; best = r; }
  }
  return best;
}

export const regionName = (id: string) => (REGIONS.find((r) => r.id === id) ?? WILD).name;

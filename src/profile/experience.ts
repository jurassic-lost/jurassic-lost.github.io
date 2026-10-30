/**
 * Experiencia sencilla: se gana explorando y aprendiendo, nunca por volver
 * cada día ni por jugar más tiempo (sin rachas, sin premios diarios, sin temporizadores).
 */
export const XP = {
  region: 50,
  mission: 40,
  dinosaur: 30,
  shelter: 60,
  resource: 10,
};

/** Nivel a partir de la experiencia: cada nivel pide un poco más que el anterior. */
export function levelFor(xp: number): { level: number; into: number; next: number } {
  let level = 1, need = 100, rest = xp;
  while (rest >= need) { rest -= need; level++; need = Math.round(need * 1.25); }
  return { level, into: rest, next: need };
}

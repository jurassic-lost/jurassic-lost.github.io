import { ALLOW, BLOCK_ANYWHERE, BLOCK_WORD, CONTACT, STAFF } from './nameRules';

/**
 * Filtro de nombres de explorador para un juego infantil.
 * No es perfecto: se combina con otros controles (perfiles solo locales, sin chat)
 * y en la versión en línea debe repetirse obligatoriamente en el servidor.
 */
export const NAME_MIN = 3;
export const NAME_MAX = 16;
export const MSG_OK = '✅ Nombre aceptado.';
export const MSG_BAD = '⚠️ Ese nombre no está permitido. Elige otro.';

export type NameCheck =
  | { ok: true; name: string; message: string }
  | { ok: false; reason: 'length' | 'chars' | 'blocked' | 'staff' | 'personal' | 'repeat'; message: string };

const ALLOWED = /^[A-Za-z0-9_ÁÉÍÓÚÜÑáéíóúüñ]+$/;

/** Letras parecidas de otros alfabetos y símbolos usados para disfrazar palabras. */
const LOOKALIKE: Record<string, string> = {
  а: 'a', е: 'e', о: 'o', р: 'p', с: 'c', х: 'x', у: 'y', і: 'i', ј: 'j', ѕ: 's', ԁ: 'd', ɡ: 'g', ո: 'n', ս: 'u', ν: 'v', κ: 'k', ο: 'o', α: 'a', ε: 'e', ι: 'i', τ: 't', ρ: 'p',
  '@': 'a', '$': 's', '€': 'e', '£': 'l', '!': 'i', '|': 'l', '+': 't',
};
const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '6': 'g', '7': 't', '8': 'b', '9': 'g' };

/** Minúsculas, sin acentos (ñ → n), parecidos sustituidos. */
export function baseNormalize(raw: string): string {
  let s = raw.normalize('NFKC').toLowerCase();
  s = [...s].map((ch) => LOOKALIKE[ch] ?? ch).join('');
  s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
  return s;
}

const collapse = (s: string) => s.replace(/(.)\1+/g, '$1');

/** Variantes que se revisan: con números como letras, sin separadores y sin letras repetidas. */
export function variants(raw: string): string[] {
  const base = baseNormalize(raw);
  const out = new Set<string>();
  for (const oneAs of ['i', 'l']) {
    const leet = [...base].map((c) => (c === '1' ? oneAs : LEET[c] ?? c)).join('');
    const letters = leet.replace(/[^a-z]/g, '');
    for (const v of [leet, letters, collapse(letters), collapse(leet)]) out.add(v);
  }
  return [...out];
}

/** Palabras del nombre: separadas por _ , números o MayúsculaInterna. */
function tokens(raw: string): string[] {
  const parts = raw.replace(/([a-záéíóúñ])([A-ZÁÉÍÓÚÑ])/g, '$1_$2').split(/[_\d]+/);
  return parts.map((p) => collapse(baseNormalize(p))).filter(Boolean);
}

function stripAllowed(s: string): string {
  let r = s;
  for (const a of ALLOW) r = r.split(a.replace(/_/g, '')).join('·');
  return r;
}

const containsAny = (s: string, list: string[]) => list.some((w) => { const k = w.replace(/_/g, ''); return k.length > 0 && s.includes(k); });

export function checkName(input: string): NameCheck {
  const name = input.trim();
  const bad = (reason: Exclude<NameCheck, { ok: true }>['reason']): NameCheck => ({ ok: false, reason, message: MSG_BAD });
  const len = [...name].length;
  if (len < NAME_MIN || len > NAME_MAX) {
    return { ok: false, reason: 'length', message: `⚠️ El nombre debe tener entre ${NAME_MIN} y ${NAME_MAX} caracteres.` };
  }
  if (!ALLOWED.test(name)) {
    return { ok: false, reason: 'chars', message: '⚠️ Usa solo letras, números y guion bajo (_).' };
  }
  if (/(.)\1{3,}/i.test(name)) return bad('repeat');
  // Datos personales: secuencias largas de números (teléfonos) o pistas de contacto.
  if ((name.match(/\d/g) ?? []).length >= 6 || /\d{5,}/.test(name)) return bad('personal');

  const vs = variants(name);
  const toks = tokens(name);
  const compact = vs.map(stripAllowed);

  if (vs.some((v) => containsAny(v, CONTACT))) return bad('personal');
  if (vs.some((v) => STAFF.some((w) => {
    const k = w.replace(/_/g, '');
    // los marcadores cortos (gm_, mod_…) solo cuentan como palabra suelta
    return w.includes('_') ? toks.includes(k) : v.includes(k);
  }))) return bad('staff');
  if (compact.some((v) => containsAny(v, BLOCK_ANYWHERE))) return bad('blocked');
  // Palabras cortas: como palabra completa, o si el nombre entero (sin separadores) es esa palabra.
  const words = new Set(BLOCK_WORD);
  if (toks.some((t) => words.has(t))) return bad('blocked');
  if (vs.some((v) => words.has(v))) return bad('blocked');
  // Separación artificial (p_u_t_o, p.u.t.o): si casi todo son letras sueltas, se juntan.
  const single = toks.filter((t) => t.length === 1).length;
  if (single >= 3) {
    const joined = toks.join('');
    if (words.has(joined) || containsAny(stripAllowed(joined), BLOCK_ANYWHERE)) return bad('blocked');
  }
  return { ok: true, name, message: MSG_OK };
}

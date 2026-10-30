/**
 * Reloj del mundo. Un día dura DAY_SECONDS segundos reales (20 min): el día
 * (6:00-20:00) ocupa el 70 % y la noche el 30 %, para que la noche sea corta.
 * La partida nueva empieza a las 8:00.
 */
export const DAY_SECONDS = 20 * 60;
const DAY_PART = 0.7;
const SUNRISE = 6, SUNSET = 20;
/** Segundos de juego que corresponden a las 8:00 del primer día. */
export const START_OFFSET = hourToCycle(8) * DAY_SECONDS;

/** Hora (0-24) → fracción del ciclo (0 = amanecer, 6:00). */
export function hourToCycle(h: number) {
  const d = (((h - SUNRISE) % 24) + 24) % 24;
  const dayLen = SUNSET - SUNRISE;
  return d < dayLen ? (d / dayLen) * DAY_PART : DAY_PART + ((d - dayLen) / (24 - dayLen)) * (1 - DAY_PART);
}

export interface Clock {
  /** Día de la partida, empezando en 1. */
  day: number;
  hour: number;
  minute: number;
  /** Fracción del ciclo (0 = amanecer). */
  cycle: number;
  night: boolean;
  /** Altura del sol: 0 al amanecer y al anochecer, 1 a mediodía, negativa de noche. */
  sun: number;
  /** Luz de día de 0 (noche) a 1 (pleno día), con transiciones suaves. */
  daylight: number;
  /** Avance del arco del sol (0 → 1) para orientar su dirección. */
  arc: number;
}

export function clockAt(gameTime: number): Clock {
  const t = gameTime + START_OFFSET;
  const day = Math.floor(t / DAY_SECONDS) + 1;
  const cycle = (t % DAY_SECONDS) / DAY_SECONDS;
  let hours: number, arc: number, sun: number;
  if (cycle < DAY_PART) {
    arc = cycle / DAY_PART;
    hours = SUNRISE + arc * (SUNSET - SUNRISE);
    sun = Math.sin(arc * Math.PI);
  } else {
    arc = (cycle - DAY_PART) / (1 - DAY_PART);
    hours = SUNSET + arc * (24 - SUNSET + SUNRISE);
    sun = -Math.sin(arc * Math.PI);
  }
  hours %= 24;
  const daylight = Math.min(1, Math.max(0, (sun + 0.12) / 0.4));
  return { day, hour: Math.floor(hours), minute: Math.floor((hours % 1) * 60), cycle, night: cycle >= DAY_PART, sun, daylight, arc };
}

/** Segundos de juego hasta la próxima hora indicada (por ejemplo, el amanecer). */
export function secondsUntilHour(gameTime: number, hour: number) {
  const now = clockAt(gameTime).cycle;
  let target = hourToCycle(hour);
  if (target <= now + 1e-6) target += 1;
  return (target - now) * DAY_SECONDS;
}

export const formatClock = (c: Clock) => `${String(c.hour).padStart(2, '0')}:${String(c.minute).padStart(2, '0')}`;

/** Días completos que ha pasado el jugador en el mundo. */
export const daysSurvived = (gameTime: number) => clockAt(gameTime).day - 1;

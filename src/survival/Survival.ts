import { clamp } from '../core/math';

/**
 * Indicadores de supervivencia. Los ritmos están pensados para que la partida
 * sea relajada: el hambre tarda ~12 min y la sed ~9 min en vaciarse.
 */
export type Stat = 'health' | 'hunger' | 'thirst' | 'energy';

export interface Activity {
  running: boolean;
  moving: boolean;
  inWater: boolean;
}

export class Survival {
  health = 100;
  hunger = 100;
  thirst = 100;
  energy = 100;
  /** Si es true, los indicadores no bajan (p. ej. durante pausa o menús). */
  frozen = false;
  onCritical?: (stat: Stat) => void;
  private warned = new Set<Stat>();

  update(dt: number, a: Activity) {
    if (this.frozen) return;
    this.hunger = clamp(this.hunger - dt * (100 / 720) * (a.running ? 1.5 : 1), 0, 100);
    this.thirst = clamp(this.thirst - dt * (100 / 540) * (a.running ? 1.6 : 1), 0, 100);

    if (a.running) this.energy -= dt * 9;
    else this.energy += dt * (a.moving ? 6 : 12) * (this.hunger > 15 && this.thirst > 15 ? 1 : 0.4);
    this.energy = clamp(this.energy, 0, 100);

    // Sin comida o sin agua se pierde salud lentamente; bien alimentado se recupera.
    if (this.hunger <= 0 || this.thirst <= 0) this.health -= dt * 0.8;
    else if (this.hunger > 50 && this.thirst > 50 && this.health > 0) this.health += dt * 0.5;
    this.health = clamp(this.health, 0, 100);

    for (const s of ['hunger', 'thirst', 'health'] as Stat[]) {
      if (this[s] < 25 && !this.warned.has(s)) { this.warned.add(s); this.onCritical?.(s); }
      if (this[s] > 40) this.warned.delete(s);
    }
  }

  add(stat: Stat, amount: number) {
    this[stat] = clamp(this[stat] + amount, 0, 100);
  }

  damage(amount: number) {
    this.health = clamp(this.health - amount, 0, 100);
  }

  get dead() { return this.health <= 0; }

  /** Valores tras volver al punto seguro (penalización moderada). */
  respawn() {
    this.health = 60;
    this.hunger = Math.max(this.hunger, 50);
    this.thirst = Math.max(this.thirst, 50);
    this.energy = 60;
    this.warned.clear();
  }
}

/** Catálogo de objetos recolectables (madera, piedra, fibra, hojas y fruta) y fabricables. */
export type ItemId = 'wood' | 'stone' | 'berries' | 'fiber' | 'leaves' | 'club' | 'spear' | 'sling' | 'bow' | 'arrows';

export interface ItemDef {
  id: ItemId;
  name: string;
  icon: string;
  description: string;
  /** Si se consume al recogerlo en lugar de guardarse. */
  eatOnPickup?: { stat: 'hunger' | 'thirst'; amount: number };
}

export const ITEMS: Record<ItemId, ItemDef> = {
  wood: { id: 'wood', name: 'Madera', icon: '🪵', description: 'Ramas resistentes. Sirven para herramientas y refugios.' },
  stone: { id: 'stone', name: 'Piedra', icon: '🪨', description: 'Piedras del suelo. Útiles para construir o distraer.' },
  fiber: { id: 'fiber', name: 'Fibra', icon: '🌿', description: 'Tiras de hoja de palmera. Sirven para atar y trenzar.' },
  leaves: { id: 'leaves', name: 'Hojas grandes', icon: '🍃', description: 'Hojas anchas de la selva. Sirven para techar un refugio.' },
  club: { id: 'club', name: 'Garrote', icon: '🏏', description: 'Un palo grueso para golpear.' },
  spear: { id: 'spear', name: 'Lanza', icon: '🔱', description: 'Palo con punta de piedra. Golpea desde más lejos.' },
  sling: { id: 'sling', name: 'Honda', icon: '🪢', description: 'Lanza piedras a distancia. Usa piedras como munición.' },
  bow: { id: 'bow', name: 'Arco', icon: '🏹', description: 'Dispara flechas lejos y con fuerza.' },
  arrows: { id: 'arrows', name: 'Flechas', icon: '➶', description: 'Munición para el arco.' },
  berries: { id: 'berries', name: 'Bayas', icon: '🫐', description: 'Bayas silvestres y jugosas.', eatOnPickup: { stat: 'hunger', amount: 18 } },
};

/** Recetas de fabricación (Etapa 2 añadirá más). */
export interface Recipe { id: ItemId; amount: number; cost: Partial<Record<ItemId, number>>; hint: string }
export const RECIPES: Recipe[] = [
  { id: 'club', amount: 1, cost: { wood: 2 }, hint: 'Golpe cuerpo a cuerpo' },
  { id: 'spear', amount: 1, cost: { wood: 2, stone: 1, fiber: 1 }, hint: 'Más daño y alcance' },
  { id: 'sling', amount: 1, cost: { wood: 1, fiber: 3 }, hint: 'Dispara piedras' },
  { id: 'bow', amount: 1, cost: { wood: 3, fiber: 3 }, hint: 'Dispara flechas' },
  { id: 'arrows', amount: 5, cost: { wood: 1, stone: 1, fiber: 1 }, hint: '5 flechas' },
];

/** Construcciones (se colocan en el mundo en lugar de guardarse en la mochila). */
export type BuildId = 'shelter';
export interface BuildDef { id: BuildId; name: string; icon: string; cost: Partial<Record<ItemId, number>>; hint: string }
export const BUILDS: BuildDef[] = [
  { id: 'shelter', name: 'Refugio', icon: '🛖', cost: { wood: 10, leaves: 6, fiber: 4 }, hint: 'Para dormir y estar a salvo' },
];

export class Inventory {
  private readonly counts = new Map<ItemId, number>();
  onChange?: () => void;

  add(id: ItemId, n = 1) {
    this.counts.set(id, this.get(id) + n);
    this.onChange?.();
  }

  get(id: ItemId) { return this.counts.get(id) ?? 0; }

  has(cost: Partial<Record<ItemId, number>>) {
    return Object.entries(cost).every(([k, n]) => this.get(k as ItemId) >= (n ?? 0));
  }

  /** Gasta materiales; devuelve false si no hay suficientes. */
  spend(cost: Partial<Record<ItemId, number>>): boolean {
    if (!this.has(cost)) return false;
    for (const [k, n] of Object.entries(cost)) this.counts.set(k as ItemId, this.get(k as ItemId) - (n ?? 0));
    this.onChange?.();
    return true;
  }

  /** Pierde una fracción de los materiales (penalización moderada al caer). */
  losePortion(fraction: number) {
    for (const [id, n] of this.counts) if (['wood', 'stone', 'fiber', 'leaves', 'arrows'].includes(id)) this.counts.set(id, n - Math.floor(n * fraction));
    this.onChange?.();
  }

  toJSON() { return Object.fromEntries(this.counts); }
  load(data: Partial<Record<ItemId, number>>) {
    this.counts.clear();
    for (const [k, v] of Object.entries(data)) if (typeof v === 'number') this.counts.set(k as ItemId, v);
    this.onChange?.();
  }
}

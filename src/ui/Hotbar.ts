import { WEAPONS, WeaponId } from '../combat/Weapons';
import { BUILDS, ITEMS, Inventory, RECIPES } from '../items/items';

/** Barra de armas (1-5), panel de fabricación y mira para armas a distancia. */
export class Hotbar {
  private readonly bar = document.getElementById('hotbar')!;
  private readonly craft = document.getElementById('craft')!;
  private readonly list = document.getElementById('craft-list')!;
  private readonly cross = document.getElementById('crosshair')!;
  selected: WeaponId = 'hand';
  onSelect?: (id: WeaponId) => void;
  onCraft?: (index: number) => void;
  onBuild?: (index: number) => void;
  onToggleCraft?: (open: boolean) => void;

  constructor(private readonly inv: Inventory) {
    this.bar.addEventListener('pointerdown', (e) => {
      const slot = (e.target as HTMLElement).closest('[data-w]') as HTMLElement | null;
      if (!slot) return;
      e.stopPropagation(); e.preventDefault();
      this.select(slot.dataset.w as WeaponId);
    });
    this.list.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest('button[data-r]') as HTMLButtonElement | null;
      if (b && !b.disabled) this.onCraft?.(Number(b.dataset.r));
      const bb = (e.target as HTMLElement).closest('button[data-b]') as HTMLButtonElement | null;
      if (bb && !bb.disabled) this.onBuild?.(Number(bb.dataset.b));
    });
    document.getElementById('craft-close')!.addEventListener('click', () => this.toggleCraft(false));
    this.render();
  }

  get craftOpen() { return !this.craft.classList.contains('hidden'); }

  owns(id: WeaponId) {
    const w = WEAPONS.find((x) => x.id === id)!;
    return !w.item || this.inv.get(w.item) > 0;
  }

  select(id: WeaponId) {
    if (!this.owns(id)) return;
    this.selected = id;
    this.render();
    this.onSelect?.(id);
  }

  selectIndex(i: number) { const w = WEAPONS[i]; if (w) this.select(w.id); }

  toggleCraft(open = !this.craftOpen) {
    this.craft.classList.toggle('hidden', !open);
    if (open) this.render();
    this.onToggleCraft?.(open);
  }

  render() {
    if (!this.owns(this.selected)) this.selected = 'hand';
    this.bar.innerHTML = WEAPONS.map((w, i) => {
      const owned = this.owns(w.id);
      const ammo = w.ranged ? `<small>${this.inv.get(w.ranged.ammo)}</small>` : '';
      return `<div class="slot ${owned ? '' : 'locked'} ${w.id === this.selected ? 'sel' : ''}" data-w="${w.id}" title="${w.name}">
        <span class="k">${i + 1}</span><span class="i">${w.icon}</span>${ammo}</div>`;
    }).join('');
    const ranged = !!WEAPONS.find((w) => w.id === this.selected)!.ranged;
    this.cross.classList.toggle('hidden', !ranged);
    if (this.craftOpen) {
      const costOf = (c: Partial<Record<keyof typeof ITEMS, number>>) => Object.entries(c).map(([k, n]) => {
        const have = this.inv.get(k as keyof typeof ITEMS);
        return `<span class="${have >= (n ?? 0) ? 'ok' : 'miss'}">${ITEMS[k as keyof typeof ITEMS].icon} ${have}/${n}</span>`;
      }).join(' ');
      this.list.innerHTML = RECIPES.map((r, i) => {
        const it = ITEMS[r.id];
        return `<div class="recipe"><div class="ri">${it.icon}</div><div class="rt"><b>${it.name}${r.amount > 1 ? ` ×${r.amount}` : ''}</b><small>${r.hint}</small><div class="cost">${costOf(r.cost)}</div></div>
          <button data-r="${i}" ${this.inv.has(r.cost) ? '' : 'disabled'}>Fabricar</button></div>`;
      }).join('') + '<h4 class="craft-sec">🏗 Construir</h4>' + BUILDS.map((b, i) =>
        `<div class="recipe"><div class="ri">${b.icon}</div><div class="rt"><b>${b.name}</b><small>${b.hint}</small><div class="cost">${costOf(b.cost)}</div></div>
          <button data-b="${i}" ${this.inv.has(b.cost) ? '' : 'disabled'}>Construir</button></div>`).join('');
    }
  }
}

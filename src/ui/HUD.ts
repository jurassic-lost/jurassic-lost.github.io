import { ItemId, ITEMS, Inventory } from '../items/items';
import { Stat, Survival } from '../survival/Survival';
import { Terrain } from '../world/Terrain';
import { WATER_LEVEL, WORLD_HALF } from '../world/config';
import { Clock, formatClock } from '../world/DayNight';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

export interface MapMarker { x: number; z: number; color: string; size: number }

/** Interfaz en pantalla: indicadores, objetivo, minimapa, materiales, avisos. */
export class HUD {
  private readonly bars = new Map<Stat, { el: HTMLElement; fill: HTMLElement }>();
  private readonly prompt = $('#prompt');
  private readonly toasts = $('#toasts');
  private readonly fps = $('#fps');
  private readonly vignette = $('#vignette');
  private readonly mapCanvas = $<HTMLCanvasElement>('#minimap canvas');
  private readonly mapCtx = this.mapCanvas.getContext('2d')!;
  private mapImage: HTMLCanvasElement;
  private readonly bigMap = $<HTMLElement>('#bigmap');
  private readonly bigCanvas = $<HTMLCanvasElement>('#bigmap canvas');
  get mapOpen() { return !this.bigMap.classList.contains('hidden'); }
  private readonly matEls = new Map<ItemId, HTMLElement>();
  private lastPrompt = '';
  private frames = 0;
  private fpsTime = 0;

  constructor(terrain: Terrain) {
    for (const s of ['health', 'hunger', 'thirst', 'energy'] as Stat[]) {
      const el = $(`.stat[data-stat=${s}]`);
      this.bars.set(s, { el, fill: el.querySelector('i') as HTMLElement });
    }
    const mats = $('#materials');
    for (const id of ['wood', 'stone', 'fiber', 'leaves'] as ItemId[]) {
      const el = document.createElement('div');
      el.className = 'mat';
      el.title = ITEMS[id].name;
      mats.appendChild(el);
      this.matEls.set(id, el);
    }
    this.mapImage = this.renderMap(terrain);
    // Tocar el minimapa abre el mapa grande; tocar fuera o la ✕ lo cierra.
    const stop = (e: Event) => e.stopPropagation();
    $('#minimap').addEventListener('pointerdown', stop);
    $('#minimap').addEventListener('click', () => this.toggleMap(true));
    this.bigMap.addEventListener('pointerdown', stop);
    this.bigMap.addEventListener('click', (e) => { if (e.target === this.bigMap) this.toggleMap(false); });
    $('#bigmap-close').addEventListener('click', () => this.toggleMap(false));
  }

  show(v: boolean) { $('#hud').classList.toggle('hidden', !v); }

  private lastClock = '';
  /** Reloj del mundo: día, hora y sol o luna. */
  setClock(c: Clock) {
    const icon = c.night ? '🌙' : c.hour < 8 ? '🌅' : c.hour >= 18 ? '🌇' : '☀️';
    const t = `${icon} Día ${c.day} · ${formatClock(c)}`;
    if (t === this.lastClock) return;
    this.lastClock = t;
    $('#clock').textContent = t;
  }

  /** Pantalla de descanso: fundido a negro con un mensaje. */
  sleepOverlay(text: string | null) {
    const el = $('#sleep');
    if (text) el.querySelector('p')!.textContent = text;
    el.classList.toggle('on', !!text);
  }

  /** Pinta una vez el mapa completo a baja resolución. */
  private renderMap(terrain: Terrain): HTMLCanvasElement {
    const size = 256;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const ctx = c.getContext('2d')!;
    const img = ctx.createImageData(size, size);
    for (let j = 0; j < size; j++)
      for (let i = 0; i < size; i++) {
        const x = (i / size) * WORLD_HALF * 2 - WORLD_HALF, z = (j / size) * WORLD_HALF * 2 - WORLD_HALF;
        const h = terrain.heightAt(x, z);
        let r: number, g: number, b: number;
        if (h < WATER_LEVEL) { r = 60; g = 150; b = 200; }
        else if (h > 30) { const t = Math.min(1, (h - 30) / 40); r = 110 + t * 60; g = 105 + t * 55; b = 90 + t * 60; }
        else { const t = h / 30; r = 60 + t * 40; g = 120 + t * 10; b = 50 + t * 20; }
        const k = (j * size + i) * 4;
        img.data[k] = r; img.data[k + 1] = g; img.data[k + 2] = b; img.data[k + 3] = 255;
      }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  updateStats(s: Survival) {
    for (const [stat, { el, fill }] of this.bars) {
      const v = s[stat];
      fill.style.width = `${v.toFixed(1)}%`;
      el.classList.toggle('low', v < 25);
    }
    this.vignette.style.opacity = s.health < 30 ? String((30 - s.health) / 30) : '0';
  }

  updateMaterials(inv: Inventory, bump?: ItemId) {
    for (const [id, el] of this.matEls) {
      el.innerHTML = `<span>${ITEMS[id].icon}</span><b>${inv.get(id)}</b>`;
      if (id === bump) { el.classList.add('bump'); setTimeout(() => el.classList.remove('bump'), 180); }
    }
  }

  setPrompt(text: string | null, key = 'E') {
    const t = text ? `${key}|${text}` : '';
    if (t === this.lastPrompt) return;
    this.lastPrompt = t;
    this.prompt.classList.toggle('hidden', !text);
    if (text) this.prompt.innerHTML = `<kbd>${key}</kbd>${text}`;
  }

  /** Nombre del explorador y nivel, sobre los indicadores. */
  setExplorer(name: string, level: number) {
    const el = $('#explorer');
    el.textContent = `${name} · Nv. ${level}`;
    el.classList.remove('hidden');
  }

  /** Pequeño aviso de "Guardado" en la esquina. */
  saveIndicator(ok: boolean) {
    const el = $('#save-ind');
    el.textContent = ok ? '💾 Guardado' : '⚠️ No se pudo guardar';
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }

  private targetTimer = 0;
  /** Muestra la vida del dinosaurio golpeado durante unos segundos. */
  showTarget(name: string, fraction: number) {
    const el = $('#target');
    el.querySelector('b')!.textContent = fraction > 0 ? `🦖 ${name}` : `🦖 ${name} vencido`;
    (el.querySelector('.tbar i') as HTMLElement).style.width = `${Math.round(fraction * 100)}%`;
    el.classList.remove('hidden');
    clearTimeout(this.targetTimer);
    this.targetTimer = window.setTimeout(() => el.classList.add('hidden'), 3500);
  }

  /** Se llama con los textos que conviene leer en voz alta. */
  onSpeak?: (text: string, kind: 'narrator' | 'phone' | 'story') => void;

  toast(text: string, big = false, kind = '', ms = 3300) {
    if (big && kind !== 'phone') this.onSpeak?.(text, 'narrator');
    const el = document.createElement('div');
    el.className = 'toast' + (big ? ' big' : '') + (kind ? ` ${kind}` : '');
    el.textContent = text;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 4) this.toasts.firstChild?.remove();
    setTimeout(() => el.remove(), ms);
  }

  /** Mensaje misterioso que llega al celular (dura más en pantalla). */
  phone(text: string) { this.onSpeak?.(text, 'phone'); this.toast(`📱 ${text}`, false, 'phone', 6500); }

  /** Tarjeta de la historia (un hallazgo importante). Se cierra con «Continuar». */
  storyCard(title: string, body: string, artHtml: string): Promise<void> {
    const el = $('#story-card');
    el.querySelector('.art')!.innerHTML = artHtml;
    el.querySelector('h3')!.textContent = title;
    el.querySelector('.body')!.textContent = body;
    this.onSpeak?.(`${title}. ${body}`, 'story');
    el.classList.remove('hidden');
    const btn = el.querySelector('button') as HTMLButtonElement;
    setTimeout(() => btn.focus(), 50);
    return new Promise((res) => {
      const close = (e: Event) => { e.stopPropagation(); el.classList.add('hidden'); btn.removeEventListener('click', close); res(); };
      btn.addEventListener('click', close);
    });
  }
  get cardOpen() { return !$('#story-card').classList.contains('hidden'); }

  setObjective(title: string, items: { text: string; done: boolean }[]) {
    $('#objective h3').textContent = title;
    $('#objective ul').innerHTML = items.map((i) => `<li class="${i.done ? 'done' : ''}">${i.text}</li>`).join('');
  }

  showFps(v: boolean) { this.fps.classList.toggle('hidden', !v); }

  tickFps(dt: number, info: string) {
    this.frames++;
    this.fpsTime += dt;
    if (this.fpsTime >= 0.5) {
      this.fps.textContent = `${Math.round(this.frames / this.fpsTime)} FPS · ${info}`;
      this.frames = 0;
      this.fpsTime = 0;
    }
  }

  toggleMap(open = !this.mapOpen) {
    if (open === this.mapOpen) return;
    this.bigMap.classList.toggle('hidden', !open);
  }

  /** Mapa grande de toda la isla, con el jugador, refugios y dinosaurios. */
  private drawBigMap(px: number, pz: number, arrow: number, markers: MapMarker[]) {
    const c = this.bigCanvas, ctx = c.getContext('2d')!, W = c.width;
    ctx.drawImage(this.mapImage, 0, 0, W, W);
    const k = W / (WORLD_HALF * 2), at = (x: number) => (x + WORLD_HALF) * k;
    for (const m of markers) {
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(at(m.x), at(m.z), m.size * 1.3, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.7)'; ctx.lineWidth = 1.5; ctx.stroke();
    }
    ctx.save();
    ctx.translate(at(px), at(pz));
    ctx.rotate(arrow);
    ctx.fillStyle = '#ffcf4a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(0, -14); ctx.lineTo(10, 10); ctx.lineTo(0, 5); ctx.lineTo(-10, 10); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
    ctx.fillStyle = '#ffcf4a'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('N', W / 2, 26);
  }

  /** Minimapa orientado al norte con el jugador en el centro; la flecha (ángulo en el mapa) indica hacia dónde camina. */
  drawMinimap(px: number, pz: number, arrow: number, markers: MapMarker[]) {
    if (this.mapOpen) this.drawBigMap(px, pz, arrow, markers);
    const ctx = this.mapCtx, W = this.mapCanvas.width;
    const range = 90; // metros visibles desde el centro
    const scale = this.mapImage.width / (WORLD_HALF * 2);
    const sx = (px + WORLD_HALF) * scale - range * scale, sz = (pz + WORLD_HALF) * scale - range * scale;
    ctx.fillStyle = '#22381f';
    ctx.fillRect(0, 0, W, W);
    ctx.drawImage(this.mapImage, sx, sz, range * 2 * scale, range * 2 * scale, 0, 0, W, W);
    const toMap = (x: number, z: number) => [W / 2 + ((x - px) / range) * (W / 2), W / 2 + ((z - pz) / range) * (W / 2)];
    for (const m of markers) {
      const [mx, my] = toMap(m.x, m.z);
      ctx.fillStyle = m.color;
      ctx.beginPath(); ctx.arc(mx, my, m.size, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    }
    // Flecha del jugador (dirección de la cámara)
    ctx.save();
    ctx.translate(W / 2, W / 2);
    ctx.rotate(arrow);
    ctx.fillStyle = '#ffcf4a'; ctx.strokeStyle = '#000'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 6); ctx.lineTo(0, 3); ctx.lineTo(-6, 6); ctx.closePath();
    ctx.fill(); ctx.stroke();
    ctx.restore();
  }
}

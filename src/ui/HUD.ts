import { ItemId, ITEMS, Inventory } from '../items/items';
import { Stat, Survival } from '../survival/Survival';
import { Terrain } from '../world/Terrain';
import { WATER_LEVEL, WORLD_HALF } from '../world/config';
import { Clock, formatClock } from '../world/DayNight';

const $ = <T extends HTMLElement = HTMLElement>(sel: string) => document.querySelector(sel) as T;

/** Punto del mapa; con `icon` se dibuja un emoji (refugios, volcán) en vez de un círculo. */
export interface MapMarker { x: number; z: number; color: string; size: number; icon?: string }

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
  /** Niebla del mapa: cada celda (8 m) se descubre al pasar cerca. 1 = explorada. */
  static readonly FOG_N = 80;
  private readonly explored = new Uint8Array(HUD.FOG_N * HUD.FOG_N);
  private readonly fog = document.createElement('canvas');
  private fogDirty = true;

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
    this.fog.width = this.fog.height = HUD.FOG_N;
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

  /**
   * Avisos: uno solo a la vez en pantalla (los demás esperan en fila) y sin repetir
   * el mismo texto, para no tapar el juego (petición de Ivan: «llenas la escena de información»).
   */
  private toastQueue: { text: string; big: boolean; kind: string; ms: number }[] = [];
  private toastEl: HTMLElement | null = null;
  private toastText = '';
  private toastTimer = 0;
  private toastShownAt = 0;

  toast(text: string, big = false, kind = '', ms = 3300) {
    if (big && kind !== 'phone') this.onSpeak?.(text, 'narrator');
    // El mismo aviso que ya se ve o que ya espera: no se repite.
    if (text === this.toastText || this.toastQueue.some((t) => t.text === text)) return;
    this.toastQueue.push({ text, big, kind, ms });
    // Como mucho 3 en espera: se descartan los avisos normales más viejos (los del celular se quedan).
    while (this.toastQueue.length > 3) {
      const i = this.toastQueue.findIndex((t) => t.kind !== 'phone');
      this.toastQueue.splice(i >= 0 ? i : 0, 1);
    }
    if (!this.toastEl) this.nextToast();
    else {
      // Hay otro esperando: el actual se acorta (pero se deja leer al menos 1,4 s).
      clearTimeout(this.toastTimer);
      const left = Math.max(0, 1400 - (performance.now() - this.toastShownAt));
      this.toastTimer = window.setTimeout(() => this.nextToast(), left);
    }
  }

  private nextToast() {
    clearTimeout(this.toastTimer);
    this.toastEl?.remove();
    this.toastEl = null;
    this.toastText = '';
    const t = this.toastQueue.shift();
    if (!t) return;
    const el = document.createElement('div');
    el.className = 'toast' + (t.big ? ' big' : '') + (t.kind ? ` ${t.kind}` : '');
    el.textContent = t.text;
    el.style.animationDuration = `${t.ms}ms`;
    this.toasts.appendChild(el);
    this.toastEl = el;
    this.toastText = t.text;
    this.toastShownAt = performance.now();
    // Si ya hay otro esperando, este dura menos.
    this.toastTimer = window.setTimeout(() => this.nextToast(), this.toastQueue.length ? Math.min(t.ms, 2200) : t.ms);
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

  // ---------------------------------------------------------------- niebla del mapa

  private cell(x: number, z: number) {
    const n = HUD.FOG_N, k = n / (WORLD_HALF * 2);
    const i = Math.floor((x + WORLD_HALF) * k), j = Math.floor((z + WORLD_HALF) * k);
    return i < 0 || j < 0 || i >= n || j >= n ? -1 : j * n + i;
  }

  /** Descubre el mapa alrededor del jugador (radio en metros). */
  reveal(x: number, z: number, radius = 36) {
    const n = HUD.FOG_N, size = (WORLD_HALF * 2) / n;
    for (let dz = -radius; dz <= radius; dz += size / 2) {
      for (let dx = -radius; dx <= radius; dx += size / 2) {
        if (dx * dx + dz * dz > radius * radius) continue;
        const c = this.cell(x + dx, z + dz);
        if (c >= 0 && !this.explored[c]) { this.explored[c] = 1; this.fogDirty = true; }
      }
    }
  }

  isExplored(x: number, z: number) { const c = this.cell(x, z); return c >= 0 && this.explored[c] === 1; }

  /** Para guardar: las celdas exploradas en base64 (1 bit por celda). */
  exportExplored() {
    const bytes = new Uint8Array(Math.ceil(this.explored.length / 8));
    this.explored.forEach((v, i) => { if (v) bytes[i >> 3] |= 1 << (i & 7); });
    let bin = '';
    bytes.forEach((b) => { bin += String.fromCharCode(b); });
    return btoa(bin);
  }

  /** Carga lo explorado (las partidas antiguas no lo tienen: el mapa empieza oscuro). */
  importExplored(data?: string) {
    this.explored.fill(0);
    this.fogDirty = true;
    if (!data) return;
    try {
      const bin = atob(data);
      for (let i = 0; i < this.explored.length; i++) this.explored[i] = (bin.charCodeAt(i >> 3) >> (i & 7)) & 1;
    } catch { this.explored.fill(0); }
  }

  private fogImage() {
    if (this.fogDirty) {
      const n = HUD.FOG_N, ctx = this.fog.getContext('2d')!, img = ctx.createImageData(n, n);
      for (let i = 0; i < this.explored.length; i++) {
        const o = i * 4;
        img.data[o] = 10; img.data[o + 1] = 16; img.data[o + 2] = 12;
        img.data[o + 3] = this.explored[i] ? 0 : 255;
      }
      ctx.putImageData(img, 0, 0);
      this.fogDirty = false;
    }
    return this.fog;
  }

  /** Mapa grande de toda la isla: solo se ve lo explorado, con el jugador y los refugios. */
  private drawBigMap(px: number, pz: number, arrow: number, markers: MapMarker[]) {
    const c = this.bigCanvas, ctx = c.getContext('2d')!, W = c.width;
    ctx.drawImage(this.mapImage, 0, 0, W, W);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogImage(), 0, 0, W, W);
    const k = W / (WORLD_HALF * 2), at = (x: number) => (x + WORLD_HALF) * k;
    for (const m of markers) {
      if (m.icon) { this.drawIcon(ctx, m, at(m.x), at(m.z), 22); continue; }
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
  private drawIcon(ctx: CanvasRenderingContext2D, m: MapMarker, x: number, y: number, size: number) {
    ctx.fillStyle = m.color;
    ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.arc(x, y, size * 0.62, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.font = `${size}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(m.icon!, x, y + 1);
  }

  drawMinimap(px: number, pz: number, arrow: number, markers: MapMarker[]) {
    if (this.mapOpen) this.drawBigMap(px, pz, arrow, markers);
    const ctx = this.mapCtx, W = this.mapCanvas.width;
    const range = 90; // metros visibles desde el centro
    const scale = this.mapImage.width / (WORLD_HALF * 2);
    const sx = (px + WORLD_HALF) * scale - range * scale, sz = (pz + WORLD_HALF) * scale - range * scale;
    ctx.fillStyle = '#22381f';
    ctx.fillRect(0, 0, W, W);
    ctx.drawImage(this.mapImage, sx, sz, range * 2 * scale, range * 2 * scale, 0, 0, W, W);
    const fk = HUD.FOG_N / (WORLD_HALF * 2);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogImage(), (px - range + WORLD_HALF) * fk, (pz - range + WORLD_HALF) * fk, range * 2 * fk, range * 2 * fk, 0, 0, W, W);
    const toMap = (x: number, z: number) => [W / 2 + ((x - px) / range) * (W / 2), W / 2 + ((z - pz) / range) * (W / 2)];
    for (const m of markers) {
      const [mx, my] = toMap(m.x, m.z);
      if (m.icon) {
        // Los refugios lejanos se quedan en el borde del minimapa, para saber hacia dónde están.
        const c = W / 2, dx = mx - c, dy = my - c, d = Math.hypot(dx, dy), max = c - 10;
        const k = d > max ? max / d : 1;
        this.drawIcon(ctx, m, c + dx * k, c + dy * k, 15);
        continue;
      }
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

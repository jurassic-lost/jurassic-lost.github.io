import rugidoUrl from './sounds/rugido.mp3';
import llamadaUrl from './sounds/llamada.mp3';
import grunidoUrl from './sounds/grunido.mp3';

/** Sonidos grabados de dinosaurios (Pixabay, ver sounds/CREDITOS.txt). */
const SAMPLES = { rugido: rugidoUrl, llamada: llamadaUrl, grunido: grunidoUrl };
type SampleName = keyof typeof SAMPLES;

/**
 * Sonido sintetizado con Web Audio: viento/hojas, pájaros e insectos, pasos, recoger objetos…
 * Los rugidos y llamadas de dinosaurio usan grabaciones (Pixabay) y, mientras cargan
 * o si fallan, la versión sintetizada.
 */
export class AudioManager {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  /** Ambiente y música (por ahora solo ambiente: viento y animales lejanos). */
  private musicBus!: GainNode;
  private sfx!: GainNode;
  private _music = 0.8;
  private _sfx = 1;
  private ambience!: GainNode;
  private noiseBuf!: AudioBuffer;
  private nextBird = 2;
  private nextRumble = 25;
  private _volume = 0.7;
  /** Eco de selva (reverberación) para llamadas y rugidos lejanos. */
  private reverb!: ConvolverNode;
  private night!: GainNode;
  private dayBed!: GainNode;
  private daylight = 1;
  private nextNight = 1;
  /** 0..1: los grillos y ranas se callan (señal de que algo grande anda cerca). */
  private hushV = 0;
  private drone: GainNode | null = null;
  muted = false;
  private readonly samples = new Map<SampleName, AudioBuffer>();

  /** Debe llamarse tras un gesto del usuario (requisito de los navegadores). */
  start() {
    if (this.ctx) { void this.ctx.resume(); return; }
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain();
    this.master.gain.value = this._volume;
    this.master.connect(ctx.destination);
    this.musicBus = ctx.createGain(); this.musicBus.gain.value = this._music; this.musicBus.connect(this.master);
    this.sfx = ctx.createGain(); this.sfx.gain.value = this._sfx; this.sfx.connect(this.master);
    void this.loadSamples(ctx);

    // Ruido marrón reutilizable
    const len = ctx.sampleRate * 3;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; d[i] = last * 3.5; }

    // Viento entre las hojas con modulación lenta
    this.ambience = ctx.createGain();
    this.ambience.gain.value = 0.35;
    this.ambience.connect(this.musicBus);
    const wind = ctx.createBufferSource();
    wind.buffer = this.noiseBuf; wind.loop = true;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain(); lfoGain.gain.value = 300;
    lfo.connect(lfoGain).connect(lp.frequency);
    wind.connect(lp).connect(this.ambience);
    wind.start(); lfo.start();

    // Zumbido suave de insectos
    const ins = ctx.createOscillator(); ins.type = 'sawtooth'; ins.frequency.value = 3800;
    const insGain = ctx.createGain(); insGain.gain.value = 0.004;
    const insLfo = ctx.createOscillator(); insLfo.frequency.value = 11;
    const insLfoG = ctx.createGain(); insLfoG.gain.value = 0.004;
    insLfo.connect(insLfoG).connect(insGain.gain);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 4000; bp.Q.value = 8;
    this.dayBed = ctx.createGain(); this.dayBed.connect(this.ambience);
    ins.connect(bp).connect(insGain).connect(this.dayBed);
    ins.start(); insLfo.start();

    // Reverberación: respuesta de impulso generada (ruido que se apaga), como el eco de un bosque.
    this.reverb = ctx.createConvolver();
    const rl = Math.floor(ctx.sampleRate * 2.6), ir = ctx.createBuffer(2, rl, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d2 = ir.getChannelData(ch);
      for (let i = 0; i < rl; i++) d2[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3.2) * (i < 400 ? i / 400 : 1);
    }
    this.reverb.buffer = ir;
    const wet = ctx.createGain(); wet.gain.value = 0.45;
    this.reverb.connect(wet).connect(this.sfx);

    // Noche: grillos (pulsos agudos) en un bus propio que sube al oscurecer.
    this.night = ctx.createGain(); this.night.gain.value = 0; this.night.connect(this.ambience);
    for (const [f, rate] of [[4300, 13], [5100, 17]] as const) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0;
      const lfo2 = ctx.createOscillator(); lfo2.type = 'square'; lfo2.frequency.value = rate;
      const lg = ctx.createGain(); lg.gain.value = 0.012;
      const slow = ctx.createOscillator(); slow.frequency.value = 0.4 + Math.random() * 0.3;
      const sg = ctx.createGain(); sg.gain.value = 0.008;
      lfo2.connect(lg).connect(g.gain); slow.connect(sg).connect(g.gain);
      o.connect(g).connect(this.night);
      o.start(); lfo2.start(); slow.start();
    }
    this.setDaylight(this.daylight);
  }

  /** Mezcla del ambiente según la hora: pájaros e insectos de día, grillos y ranas de noche. */
  setDaylight(d: number) {
    this.daylight = d;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.night.gain.setTargetAtTime((1 - d) * (1 - this.hushV), t, this.hushV > 0.5 ? 0.6 : 1.5);
    this.dayBed.gain.setTargetAtTime(0.3 + d * 0.7, t, 1.5);
  }

  set volume(v: number) {
    this._volume = v;
    if (this.master) this.master.gain.value = this.muted ? 0 : v;
  }
  get volume() { return this._volume; }

  setMix(music: number, sfx: number) {
    this._music = music; this._sfx = sfx;
    if (this.musicBus) this.musicBus.gain.value = music;
    if (this.sfx) this.sfx.gain.value = sfx;
  }

  setMuted(m: boolean) { this.muted = m; this.volume = this._volume; }

  suspend() { void this.ctx?.suspend(); }
  resume() { void this.ctx?.resume(); }

  update(dt: number) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    this.nextBird -= dt;
    this.nextRumble -= dt;
    if (this.nextBird <= 0) { if (this.daylight > 0.3) this.bird(); this.nextBird = 2 + Math.random() * 6; }
    this.nextNight -= dt;
    if (this.nextNight <= 0) { if (this.daylight < 0.4 && this.hushV < 0.5) this.frog(); this.nextNight = 1.5 + Math.random() * 4; }
    if (this.nextRumble <= 0) { this.distantCall(); this.nextRumble = 40 + Math.random() * 50; }
  }

  private env(g: GainNode, t: number, peak: number, attack: number, decay: number) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private bird() {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const notes = 2 + Math.floor(Math.random() * 4);
    const base = 1800 + Math.random() * 1600;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1;
    pan.connect(this.ambience);
    for (let i = 0; i < notes; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      const st = t + i * 0.13;
      o.frequency.setValueAtTime(base, st);
      o.frequency.exponentialRampToValueAtTime(base * (1.3 + Math.random() * 0.5), st + 0.08);
      this.env(g, st, 0.05, 0.01, 0.1);
      o.connect(g).connect(pan); o.start(st); o.stop(st + 0.15);
    }
  }

  /** Croar de rana lejana (de noche). */
  private frog() {
    const ctx = this.ctx!; const t = ctx.currentTime;
    const pan = ctx.createStereoPanner(); pan.pan.value = Math.random() * 2 - 1; pan.connect(this.ambience);
    const n = 2 + Math.floor(Math.random() * 3), base = 180 + Math.random() * 120;
    for (let i = 0; i < n; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square';
      const st = t + i * 0.22;
      o.frequency.setValueAtTime(base, st); o.frequency.exponentialRampToValueAtTime(base * 0.7, st + 0.12);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 700;
      this.env(g, st, 0.03, 0.01, 0.12);
      o.connect(lp).connect(g).connect(pan); o.start(st); o.stop(st + 0.16);
    }
  }

  /** Pisada de un dinosaurio grande: golpe grave y crujido de tierra. */
  bigStep(volume: number, size: number) {
    if (!this.ctx || volume < 0.01) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    const f0 = Math.max(32, 90 - size * 8);
    o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f0 * 0.55, t + 0.25);
    this.env(g, t, volume, 0.008, 0.32); o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.4);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 500;
    const ng = ctx.createGain(); this.env(ng, t, volume * 0.6, 0.005, 0.18);
    n.connect(lp).connect(ng).connect(this.sfx); n.start(t, Math.random() * 2); n.stop(t + 0.25);
  }

  /** Llamada de un dinosaurio con dirección: bramido grave (boom), bocinazo (honk) o gruñido (growl). */
  dinoCall(kind: 'boom' | 'honk' | 'growl', volume: number, pan = 0) {
    if (!this.ctx || volume < 0.01) return;
    // Grabaciones: los saurópodos con la llamada más grave y lenta; los depredadores gruñen.
    if (kind === 'boom' && this.playSample('llamada', volume * 1.4, pan, 0.6, 0.8)) return;
    if (kind === 'honk' && this.playSample('llamada', volume * 1.1, pan, 1, 0.6)) return;
    if (kind === 'growl' && this.playSample('grunido', volume * 1.3, pan, 0.8, 0.6)) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const p = ctx.createStereoPanner(); p.pan.value = pan;
    const out = ctx.createGain(); out.gain.value = 1;
    p.connect(out); out.connect(this.sfx); out.connect(this.reverb);
    const g = ctx.createGain(); g.connect(p);
    if (kind === 'boom') {
      // Saurópodo: dos notas muy graves que suben y bajan.
      const o = ctx.createOscillator(), o2 = ctx.createOscillator(); o.type = 'triangle'; o2.type = 'sine';
      o.frequency.setValueAtTime(55, t); o.frequency.linearRampToValueAtTime(78, t + 0.8); o.frequency.linearRampToValueAtTime(50, t + 2.6);
      o2.frequency.setValueAtTime(110, t); o2.frequency.linearRampToValueAtTime(150, t + 0.8); o2.frequency.linearRampToValueAtTime(96, t + 2.6);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
      this.env(g, t, volume, 0.5, 2.3);
      o.connect(lp); o2.connect(lp); lp.connect(g);
      [o, o2].forEach((x) => { x.start(t); x.stop(t + 3); });
    } else if (kind === 'honk') {
      // Herbívoro mediano: bocina nasal con vibrato.
      const o = ctx.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(170, t); o.frequency.linearRampToValueAtTime(240, t + 0.25); o.frequency.linearRampToValueAtTime(150, t + 1.1);
      const vib = ctx.createOscillator(); vib.frequency.value = 7; const vg = ctx.createGain(); vg.gain.value = 9;
      vib.connect(vg).connect(o.frequency);
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 2.5;
      this.env(g, t, volume * 0.8, 0.08, 1.0);
      o.connect(bp).connect(g);
      o.start(t); vib.start(t); o.stop(t + 1.3); vib.stop(t + 1.3);
    } else {
      // Depredador: gruñido rasposo (ruido modulado + tono grave).
      const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 3;
      bp.frequency.setValueAtTime(260, t); bp.frequency.linearRampToValueAtTime(420, t + 0.4); bp.frequency.linearRampToValueAtTime(200, t + 1.4);
      const am = ctx.createOscillator(); am.frequency.value = 23; const ag = ctx.createGain(); ag.gain.value = 0.5;
      const ng = ctx.createGain(); ng.gain.value = 0.6; am.connect(ag).connect(ng.gain);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(70, t); o.frequency.linearRampToValueAtTime(55, t + 1.4);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 300;
      this.env(g, t, volume * 1.2, 0.15, 1.3);
      n.connect(bp).connect(ng).connect(g); o.connect(lp).connect(g);
      [n, am, o].forEach((x) => { x.start(t); x.stop(t + 1.6); });
    }
  }

  /** Llamada grave lejana de un dinosaurio (no da miedo, da misterio). */
  distantCall(volume = 0.25) {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'triangle';
    o.frequency.setValueAtTime(90, t); o.frequency.linearRampToValueAtTime(140, t + 0.5); o.frequency.linearRampToValueAtTime(70, t + 1.8);
    o2.frequency.setValueAtTime(45, t); o2.frequency.linearRampToValueAtTime(60, t + 0.6); o2.frequency.linearRampToValueAtTime(38, t + 1.8);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 380;
    this.env(g, t, volume, 0.35, 1.6);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.sfx);
    o.start(t); o2.start(t); o.stop(t + 2.1); o2.stop(t + 2.1);
  }

  /** Bufido corto de un herbívoro cercano. */
  snort(volume = 0.2) {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 400; bp.Q.value = 1.5;
    const g = ctx.createGain(); this.env(g, t, volume, 0.04, 0.45);
    n.connect(bp).connect(g).connect(this.sfx);
    n.start(t, Math.random()); n.stop(t + 0.6);
  }

  step(inWater: boolean) {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const f = ctx.createBiquadFilter(); f.type = inWater ? 'bandpass' : 'lowpass'; f.frequency.value = inWater ? 1200 : 900 + Math.random() * 300;
    const g = ctx.createGain(); this.env(g, t, inWater ? 0.18 : 0.12, 0.005, inWater ? 0.2 : 0.09);
    n.connect(f).connect(g).connect(this.sfx);
    n.start(t, Math.random() * 2); n.stop(t + 0.25);
  }

  pickup() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    [660, 880, 1320].forEach((fr, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle';
      o.frequency.value = fr; this.env(g, t + i * 0.07, 0.12, 0.01, 0.18);
      o.connect(g).connect(this.sfx); o.start(t + i * 0.07); o.stop(t + i * 0.07 + 0.25);
    });
  }

  drink() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      const st = t + i * 0.16;
      o.frequency.setValueAtTime(500, st); o.frequency.exponentialRampToValueAtTime(1100, st + 0.08);
      this.env(g, st, 0.12, 0.01, 0.1); o.connect(g).connect(this.sfx); o.start(st); o.stop(st + 0.15);
    }
  }

  jump() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(300, t); o.frequency.exponentialRampToValueAtTime(520, t + 0.12);
    this.env(g, t, 0.06, 0.01, 0.12); o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.16);
  }

  /** Pitido del celular. */
  beep(freq = 880, dur = 0.12, volume = 0.12) {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square';
    o.frequency.value = freq; this.env(g, t, volume, 0.005, dur);
    o.connect(g).connect(this.sfx); o.start(t); o.stop(t + dur + 0.05);
  }

  /** Zumbido creciente de la anomalía temporal. */
  anomaly(duration = 3.5) {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sine';
    o.frequency.setValueAtTime(60, t); o.frequency.exponentialRampToValueAtTime(900, t + duration);
    o2.frequency.setValueAtTime(120, t); o2.frequency.exponentialRampToValueAtTime(2400, t + duration);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(300, t); lp.frequency.exponentialRampToValueAtTime(5000, t + duration);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + duration * 0.9); g.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.3);
    o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.sfx);
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf; n.loop = true;
    const ng = ctx.createGain(); ng.gain.setValueAtTime(0.0001, t); ng.gain.exponentialRampToValueAtTime(0.5, t + duration); ng.gain.exponentialRampToValueAtTime(0.0001, t + duration + 0.4);
    n.connect(ng).connect(this.sfx);
    [o, o2, n].forEach((s) => { s.start(t); s.stop(t + duration + 0.5); });
  }

  /** Rugido potente (estilizado, sintetizado). */
  roar(volume = 0.6) {
    if (!this.ctx) return;
    if (this.playSample('rugido', volume * 1.2, 0, 0.92, 0.7)) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 2;
    bp.frequency.setValueAtTime(200, t); bp.frequency.linearRampToValueAtTime(700, t + 0.5); bp.frequency.linearRampToValueAtTime(150, t + 2.2);
    const ng = ctx.createGain(); this.env(ng, t, volume * 1.6, 0.25, 2.0);
    n.connect(bp).connect(ng).connect(this.sfx);
    ng.connect(this.reverb);
    n.start(t); n.stop(t + 2.4);
    // Capa grave con "vibración" de garganta.
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(60, t); o.frequency.linearRampToValueAtTime(95, t + 0.6); o.frequency.linearRampToValueAtTime(45, t + 2.2);
    const am = ctx.createOscillator(); am.frequency.value = 31; const ag = ctx.createGain(); ag.gain.value = 0.4;
    const og = ctx.createGain(); og.gain.value = 0.6; am.connect(ag).connect(og.gain);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 350;
    const eg = ctx.createGain(); this.env(eg, t, volume * 0.9, 0.3, 1.9);
    o.connect(lp).connect(og).connect(eg).connect(this.sfx); eg.connect(this.reverb);
    [o, am].forEach((x) => { x.start(t); x.stop(t + 2.4); });
    this.distantCall(volume);
  }

  /** Silbido de un golpe o lanzamiento. */
  whoosh() {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const n = ctx.createBufferSource(); n.buffer = this.noiseBuf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
    bp.frequency.setValueAtTime(600, t); bp.frequency.exponentialRampToValueAtTime(2400, t + 0.18);
    const g = ctx.createGain(); this.env(g, t, 0.25, 0.03, 0.18);
    n.connect(bp).connect(g).connect(this.sfx); n.start(t, Math.random()); n.stop(t + 0.25);
  }

  /** Golpe sordo (impacto). */
  thud(volume = 0.4) {
    if (!this.ctx) return;
    const ctx = this.ctx; const t = ctx.currentTime;
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
    o.frequency.setValueAtTime(140, t); o.frequency.exponentialRampToValueAtTime(50, t + 0.18);
    this.env(g, t, volume, 0.005, 0.2); o.connect(g).connect(this.sfx); o.start(t); o.stop(t + 0.25);
  }

  /** Silencio repentino de la selva (h = 1: no se oye ni un grillo). */
  hush(h: number) {
    h = Math.max(0, Math.min(1, h));
    if (Math.abs(h - this.hushV) < 0.05) return;
    this.hushV = h;
    this.setDaylight(this.daylight);
  }

  /** Tensión: un zumbido muy grave y casi inaudible que sube cuando algo acecha (0..1). */
  setTension(v: number) {
    if (!this.ctx) return;
    const ctx = this.ctx;
    if (!this.drone) {
      this.drone = ctx.createGain(); this.drone.gain.value = 0; this.drone.connect(this.musicBus);
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 160; lp.connect(this.drone);
      for (const [f, type] of [[41, 'sine'], [61.5, 'triangle'], [43.2, 'sine']] as const) {
        const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
        const g = ctx.createGain(); g.gain.value = type === 'sine' ? 0.5 : 0.18;
        o.connect(g).connect(lp); o.start();
      }
    }
    this.drone.gain.setTargetAtTime(Math.max(0, Math.min(1, v)) * 0.16, ctx.currentTime, 1.2);
  }

  private async loadSamples(ctx: AudioContext) {
    await Promise.all((Object.keys(SAMPLES) as SampleName[]).map(async (name) => {
      try {
        const data = await (await fetch(SAMPLES[name])).arrayBuffer();
        this.samples.set(name, await ctx.decodeAudioData(data));
      } catch (e) { console.warn('[sonido] no se pudo cargar', name, e); }
    }));
  }

  /** ¿Están cargadas las grabaciones? (útil para pruebas) */
  get samplesLoaded() { return this.samples.size; }

  /**
   * Reproduce una grabación con dirección y eco. `rate` < 1 la hace más grave y lenta
   * (animales más grandes). Devuelve false si aún no está cargada.
   */
  private playSample(name: SampleName, volume: number, pan = 0, rate = 1, echo = 0.5) {
    const buf = this.samples.get(name);
    if (!this.ctx || !buf) return false;
    if (volume < 0.01) return true;
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = rate * (0.95 + Math.random() * 0.1);
    const g = ctx.createGain(); g.gain.value = Math.min(1.5, volume);
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g).connect(p);
    p.connect(this.sfx);
    const e = ctx.createGain(); e.gain.value = echo;
    p.connect(e).connect(this.reverb);
    src.start();
    return true;
  }

  private panned(pan: number) {
    const p = this.ctx!.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.sfx); p.connect(this.reverb);
    return p;
  }

  /** Hojas que se mueven entre los arbustos (algo pasa cerca). */
  rustle(volume = 0.2, pan = 0) {
    if (!this.ctx || volume < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this.panned(pan);
    const n = 3 + Math.floor(Math.random() * 4);
    for (let i = 0; i < n; i++) {
      const st = t + i * (0.07 + Math.random() * 0.12);
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2200 + Math.random() * 2000; hp.Q.value = 0.8;
      const g = ctx.createGain(); this.env(g, st, volume * (0.5 + Math.random() * 0.5), 0.01, 0.12 + Math.random() * 0.1);
      src.connect(hp).connect(g).connect(out); src.start(st, Math.random() * 2); src.stop(st + 0.3);
    }
  }

  /** Una rama seca que cruje bajo una pata. */
  twig(volume = 0.25, pan = 0) {
    if (!this.ctx || volume < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this.panned(pan);
    for (let i = 0; i < 2; i++) {
      const st = t + i * 0.05;
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 1500;
      const g = ctx.createGain(); this.env(g, st, volume * (i ? 0.6 : 1), 0.002, 0.05);
      src.connect(hp).connect(g).connect(out); src.start(st, Math.random() * 2); src.stop(st + 0.08);
    }
  }

  /** Olfateo de un animal grande: tres inspiraciones cortas y un resoplido. */
  sniff(volume = 0.3, pan = 0) {
    if (!this.ctx || volume < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this.panned(pan);
    for (let i = 0; i < 4; i++) {
      const last = i === 3, st = t + i * 0.28 + (last ? 0.25 : 0);
      const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.Q.value = 1.2;
      bp.frequency.setValueAtTime(last ? 380 : 900, st); bp.frequency.linearRampToValueAtTime(last ? 220 : 1300, st + 0.2);
      const g = ctx.createGain(); this.env(g, st, volume * (last ? 1.3 : 0.7), last ? 0.03 : 0.06, last ? 0.6 : 0.14);
      src.connect(bp).connect(g).connect(out); src.start(st, Math.random() * 2); src.stop(st + (last ? 0.8 : 0.3));
    }
  }

  /** Respiración lenta y profunda de un gran depredador. */
  breathe(volume = 0.25, pan = 0) {
    if (!this.ctx || volume < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this.panned(pan);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.setValueAtTime(250, t); lp.frequency.linearRampToValueAtTime(520, t + 0.9); lp.frequency.linearRampToValueAtTime(180, t + 2);
    const g = ctx.createGain(); this.env(g, t, volume, 0.7, 1.4);
    src.connect(lp).connect(g).connect(out); src.start(t, Math.random()); src.stop(t + 2.2);
  }

  /** Latido del corazón (dos golpes graves). */
  heartbeat(volume = 0.2) {
    if (!this.ctx || volume < 0.01) return;
    const ctx = this.ctx, t = ctx.currentTime;
    for (const [dt, v] of [[0, 1], [0.24, 0.7]] as const) {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine';
      o.frequency.setValueAtTime(58, t + dt); o.frequency.exponentialRampToValueAtTime(38, t + dt + 0.15);
      this.env(g, t + dt, volume * v, 0.01, 0.16); o.connect(g).connect(this.sfx); o.start(t + dt); o.stop(t + dt + 0.22);
    }
  }

  /** Interferencia de radio y pitido: un mensaje misterioso llega al celular. */
  signal(volume = 0.18) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf;
    const hp = ctx.createBiquadFilter(); hp.type = 'bandpass'; hp.frequency.value = 2600; hp.Q.value = 0.6;
    const am = ctx.createOscillator(); am.type = 'square'; am.frequency.value = 9; const ag = ctx.createGain(); ag.gain.value = 0.5;
    const g = ctx.createGain(); g.gain.value = 0.5; am.connect(ag).connect(g.gain);
    const g2 = ctx.createGain(); this.env(g2, t, volume, 0.03, 0.9);
    src.connect(hp).connect(g).connect(g2).connect(this.sfx); src.start(t, Math.random()); src.stop(t + 1); am.start(t); am.stop(t + 1);
    for (const [dt, f] of [[0.95, 1320], [1.12, 990]] as const) {
      const o = ctx.createOscillator(), og = ctx.createGain(); o.type = 'square'; o.frequency.value = f;
      this.env(og, t + dt, volume * 0.35, 0.005, 0.12); o.connect(og).connect(this.sfx); o.start(t + dt); o.stop(t + dt + 0.15);
    }
  }

  /** Chillido agudo y tímido de una criatura pequeña. */
  chirp(volume = 0.2, pan = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime, out = this.panned(pan);
    for (let i = 0; i < 3; i++) {
      const st = t + i * 0.16, o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'triangle';
      o.frequency.setValueAtTime(1100 + i * 140, st); o.frequency.exponentialRampToValueAtTime(1700 + i * 200, st + 0.07); o.frequency.exponentialRampToValueAtTime(900, st + 0.13);
      this.env(g, st, volume, 0.01, 0.12); o.connect(g).connect(out); o.start(st); o.stop(st + 0.16);
    }
  }
}

/**
 * Voz que lee en voz alta los textos importantes (narración, avisos grandes, mensajes del
 * celular y hallazgos). Usa la voz en español del propio dispositivo (gratis, sin descargas);
 * si el navegador no tiene voz, el juego sigue con los textos de siempre.
 */
export type VoiceKind = 'narrator' | 'phone' | 'story';

export class Narrator {
  enabled = true;
  volume = 0.8;
  private voice: SpeechSynthesisVoice | null = null;
  private readonly synth: SpeechSynthesis | null = typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null;

  constructor() {
    if (!this.synth) return;
    const pick = () => {
      const vs = this.synth!.getVoices().filter((v) => v.lang.toLowerCase().startsWith('es'));
      // Preferencia: español de América (México, EE. UU., Latinoamérica) y luego cualquier español.
      this.voice = vs.find((v) => /es-(mx|us|419)/i.test(v.lang)) ?? vs.find((v) => !/es-es/i.test(v.lang)) ?? vs[0] ?? null;
    };
    pick();
    this.synth.addEventListener?.('voiceschanged', pick);
  }

  get available() { return !!this.synth; }

  /** Lee un texto. `interrupt` corta lo que se estuviera leyendo. */
  say(text: string, kind: VoiceKind = 'narrator', interrupt = false) {
    if (!this.synth || !this.enabled || this.volume <= 0) return;
    const clean = text
      .replace(/\p{Extended_Pictographic}|️|‍/gu, '')
      .replace(/[«»"…]/g, (c) => (c === '…' ? '...' : ''))
      .replace(/\(\d+\/\d+\)/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!clean) return;
    // Los textos en MAYÚSCULAS algunas voces los deletrean: se leen en minúsculas.
    const spoken = /[a-záéíóúñ]/.test(clean) ? clean : clean.toLowerCase();
    try {
      if (interrupt) this.synth.cancel();
      const u = new SpeechSynthesisUtterance(spoken);
      u.lang = this.voice?.lang ?? 'es-MX';
      if (this.voice) u.voice = this.voice;
      u.volume = this.volume;
      // El celular suena más grave y lento (una voz desconocida); la historia, pausada.
      u.rate = kind === 'phone' ? 0.85 : kind === 'story' ? 0.95 : 1;
      u.pitch = kind === 'phone' ? 0.6 : 1;
      this.synth.speak(u);
    } catch { /* sin voz: solo texto */ }
  }

  cancel() { try { this.synth?.cancel(); } catch { /* nada */ } }
  pause() { try { this.synth?.pause(); } catch { /* nada */ } }
  resume() { try { this.synth?.resume(); } catch { /* nada */ } }
}

import { Input } from '../core/Input';

/** Joystick virtual, zona de cámara por deslizamiento y botones de acción táctiles. */
export class TouchControls {
  private stickId: number | null = null;
  private lookId: number | null = null;
  private lastLook = { x: 0, y: 0 };
  private runToggle = false;

  constructor(private readonly input: Input) {
    // Los controles (#touch) se muestran al empezar a jugar (Game.begin).
    document.body.classList.add('touch');

    const stick = document.getElementById('joystick')!;
    const knob = stick.querySelector('.knob') as HTMLElement;
    const setKnob = (x: number, y: number) => (knob.style.transform = `translate(${x}px, ${y}px)`);

    const moveStick = (e: PointerEvent) => {
      const r = stick.getBoundingClientRect();
      const max = r.width / 2;
      let dx = e.clientX - (r.left + max), dy = e.clientY - (r.top + max);
      const d = Math.hypot(dx, dy);
      if (d > max) { dx *= max / d; dy *= max / d; }
      setKnob(dx, dy);
      const dead = 0.12;
      const nx = dx / max, ny = -dy / max;
      const m = Math.hypot(nx, ny);
      const k = m < dead ? 0 : (m - dead) / (1 - dead) / m;
      this.input.touchMove.x = nx * k;
      this.input.touchMove.y = ny * k;
    };
    stick.addEventListener('pointerdown', (e) => {
      this.stickId = e.pointerId;
      stick.setPointerCapture(e.pointerId);
      moveStick(e);
      e.preventDefault();
    });
    stick.addEventListener('pointermove', (e) => { if (e.pointerId === this.stickId) moveStick(e); });
    const endStick = (e: PointerEvent) => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      setKnob(0, 0);
      this.input.touchMove.x = this.input.touchMove.y = 0;
    };
    stick.addEventListener('pointerup', endStick);
    stick.addEventListener('pointercancel', endStick);

    const look = document.getElementById('look-zone')!;
    look.addEventListener('pointerdown', (e) => {
      this.lookId = e.pointerId;
      look.setPointerCapture(e.pointerId);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    look.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.lookId) return;
      this.input.addLook((e.clientX - this.lastLook.x) * 1.6, (e.clientY - this.lastLook.y) * 1.6);
      this.lastLook = { x: e.clientX, y: e.clientY };
    });
    const endLook = (e: PointerEvent) => { if (e.pointerId === this.lookId) this.lookId = null; };
    look.addEventListener('pointerup', endLook);
    look.addEventListener('pointercancel', endLook);

    const tap = (id: string, fn: (el: HTMLElement) => void) => {
      const el = document.getElementById(id)!;
      el.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fn(el); });
    };
    tap('btn-jump', () => this.input.press('jump'));
    tap('btn-action', () => this.input.press('interact'));
    tap('btn-crouch', (el) => { this.input.press('crouch'); el.classList.toggle('active'); });
    tap('btn-run', (el) => {
      this.runToggle = !this.runToggle;
      this.input.touchRun = this.runToggle;
      el.classList.toggle('active', this.runToggle);
    });
  }

  /** Sincroniza el estado visual del botón de agacharse (p. ej. al saltar). */
  syncCrouch(on: boolean) {
    document.getElementById('btn-crouch')!.classList.toggle('active', on);
  }
}

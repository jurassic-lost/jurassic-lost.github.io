/**
 * Entrada unificada: teclado + ratón (con bloqueo de puntero o arrastre) y
 * controles táctiles. El resto del juego solo lee el estado abstracto.
 */
export interface InputState {
  moveX: number; // -1..1 (derecha +)
  moveY: number; // -1..1 (adelante +)
  run: boolean;
  crouch: boolean;
}

export type Action = 'jump' | 'interact' | 'crouch' | 'pause' | 'inventory' | 'map' | 'attack' | 'craft' | 'slot1' | 'slot2' | 'slot3' | 'slot4' | 'slot5';

export class Input {
  readonly state: InputState = { moveX: 0, moveY: 0, run: false, crouch: false };
  /** Delta de cámara acumulado en píxeles desde el último consumo. */
  private lookDX = 0;
  private lookDY = 0;
  private zoomDelta = 0;
  private readonly keys = new Set<string>();
  private readonly pressed = new Set<Action>();
  private dragging = false;
  private crouchToggle = false;
  /** Fuentes táctiles (las rellena TouchControls). */
  touchMove = { x: 0, y: 0 };
  touchRun = false;
  enabled = false;

  constructor(canvas: HTMLCanvasElement) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.keys.clear());

    canvas.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement !== canvas) {
        this.dragging = true;
        canvas.requestPointerLock?.();
      } else if (e.button === 0) this.press('attack');
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => (this.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.enabled) return;
      if (document.pointerLockElement === canvas || this.dragging) this.addLook(e.movementX, e.movementY);
    });
    canvas.addEventListener('wheel', (e) => { this.zoomDelta += Math.sign(e.deltaY); e.preventDefault(); }, { passive: false });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  private onKey(e: KeyboardEvent, down: boolean) {
    const k = e.code;
    if (down) {
      if (!this.keys.has(k)) {
        if (k === 'Space') this.press('jump');
        if (k === 'KeyE') this.press('interact');
        if (k === 'KeyC') this.press('crouch');
        if (k === 'Escape' || k === 'KeyP') this.press('pause');
        if (k === 'KeyI') this.press('inventory');
        if (k === 'KeyM') this.press('map');
        if (k === 'KeyF') this.press('attack');
        if (k === 'KeyT') this.press('craft');
        const m = /^Digit([1-5])$/.exec(k);
        if (m) this.press(`slot${m[1]}` as Action);
      }
      this.keys.add(k);
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k) && this.enabled) e.preventDefault();
    } else this.keys.delete(k);
  }

  addLook(dx: number, dy: number) {
    // Se ignoran saltos enormes que a veces produce el bloqueo de puntero.
    if (Math.abs(dx) > 300 || Math.abs(dy) > 300) return;
    this.lookDX += dx;
    this.lookDY += dy;
  }

  press(a: Action) {
    if (a === 'crouch') this.crouchToggle = !this.crouchToggle;
    this.pressed.add(a);
  }

  /** Devuelve true una sola vez por pulsación. */
  consume(a: Action): boolean {
    const had = this.pressed.has(a);
    this.pressed.delete(a);
    return had;
  }

  consumeLook(): [number, number, number] {
    const r: [number, number, number] = [this.lookDX, this.lookDY, this.zoomDelta];
    this.lookDX = this.lookDY = this.zoomDelta = 0;
    return r;
  }

  setCrouch(v: boolean) { this.crouchToggle = v; }

  update() {
    const k = this.keys;
    let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    let y = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
    if (Math.abs(this.touchMove.x) + Math.abs(this.touchMove.y) > 0.01) { x = this.touchMove.x; y = this.touchMove.y; }
    this.state.moveX = x;
    this.state.moveY = y;
    this.state.run = k.has('ShiftLeft') || k.has('ShiftRight') || this.touchRun;
    this.state.crouch = this.crouchToggle;
  }

  /** Limpia pulsaciones pendientes (p. ej. al reanudar tras pausa). */
  flush() {
    this.pressed.clear();
    this.lookDX = this.lookDY = this.zoomDelta = 0;
  }
}

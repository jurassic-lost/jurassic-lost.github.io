/** Misiones encadenadas con sus objetivos (antesala del sistema de misiones de la Etapa 5). */
export interface Objective {
  id: string;
  text: (p: number) => string;
  target: number;
  progress: number;
  done: boolean;
  /** Si el progreso es la cantidad de este material en la mochila. */
  item?: string;
}

export interface Mission { id: string; title: string; list: Objective[] }

export const MISSIONS = (): Mission[] => [
  {
    id: 'primeros_pasos', title: 'Primeros pasos', list: [
      { id: 'explore', text: () => 'Levántate y explora', target: 15, progress: 0, done: false },
      { id: 'wood', item: 'wood', text: (p) => `Recoge madera (${p}/5)`, target: 5, progress: 0, done: false },
      { id: 'stone', item: 'stone', text: (p) => `Recoge piedras (${p}/5)`, target: 5, progress: 0, done: false },
      { id: 'water', text: () => 'Bebe agua en el río', target: 1, progress: 0, done: false },
      { id: 'dino', text: () => 'Observa al triceratops de cerca', target: 1, progress: 0, done: false },
    ],
  },
  {
    id: 'refugio', title: 'Un lugar seguro', list: [
      { id: 'shelter_wood', item: 'wood', text: (p) => `Reúne madera (${p}/10)`, target: 10, progress: 0, done: false },
      { id: 'shelter_leaves', item: 'leaves', text: (p) => `Recoge hojas grandes (${p}/6)`, target: 6, progress: 0, done: false },
      { id: 'shelter_fiber', item: 'fiber', text: (p) => `Recoge fibra (${p}/4)`, target: 4, progress: 0, done: false },
      { id: 'build_shelter', text: () => 'Construye un refugio (🛠 → Construir)', target: 1, progress: 0, done: false },
      { id: 'sleep', text: () => 'Duerme en tu refugio', target: 1, progress: 0, done: false },
    ],
  },
  {
    id: 'huellas', title: 'Algo ronda en la noche', list: [
      { id: 'night_visit', text: () => 'Pasa la noche en tu refugio', target: 1, progress: 0, done: false },
      { id: 'tracks', text: () => 'Examina las huellas junto al refugio', target: 1, progress: 0, done: false },
      { id: 'cronos', text: () => 'Recoge la pieza metálica que brilla', target: 1, progress: 0, done: false },
      { id: 'follow_tracks', text: () => 'Sigue el rastro de huellas hasta donde termina', target: 1, progress: 0, done: false },
    ],
  },
  {
    // Capítulo 2 (en preparación): el encuentro con Kiro.
    id: 'kiro', title: 'Una voz entre los helechos', list: [
      { id: 'kiro_meet', text: () => 'Busca a la criatura que chilla (capítulo 2, muy pronto)', target: 1, progress: 0, done: false },
    ],
  },
];

export class Objectives {
  readonly missions = MISSIONS();
  onComplete?: (o: Objective) => void;
  /** Se termina una misión; `next` es la siguiente (o null si no hay más). */
  onMissionComplete?: (m: Mission, next: Mission | null) => void;
  onChange?: () => void;

  /** Misión en curso (la primera sin terminar). */
  get current(): Mission | null { return this.missions.find((m) => m.list.some((o) => !o.done)) ?? null; }
  get title() { return this.current?.title ?? 'Misiones completadas'; }
  get list() { return this.current?.list ?? []; }

  /** Fija el progreso (absoluto) de un objetivo de la misión en curso. */
  set(id: string, value: number) {
    const m = this.current;
    const o = m?.list.find((x) => x.id === id);
    if (!m || !o || o.done) return;
    const v = Math.min(o.target, value);
    if (v === o.progress) return;
    o.progress = v;
    if (o.progress >= o.target) {
      o.done = true;
      this.onComplete?.(o);
      if (m.list.every((x) => x.done)) this.onMissionComplete?.(m, this.current);
    }
    this.onChange?.();
  }

  add(id: string, n = 1) {
    const o = this.list.find((x) => x.id === id);
    if (o) this.set(id, o.progress + n);
  }

  /** Actualiza los objetivos que cuentan un material (con lo que hay en la mochila). */
  setItem(item: string, count: number) {
    for (const o of this.list) if (o.item === item) this.set(o.id, count);
  }

  /** Progreso de cada objetivo (para guardar también lo que va a medias). */
  progressMap(): Record<string, number> {
    return Object.fromEntries(this.missions.flatMap((m) => m.list.map((o) => [o.id, o.progress])));
  }
  restoreProgress(map: Record<string, number>, completedMissions: string[] = []) {
    for (const m of this.missions) for (const o of m.list) {
      const v = completedMissions.includes(m.id) ? o.target : map[o.id];
      if (typeof v === 'number' && Number.isFinite(v)) { o.progress = Math.max(0, Math.min(o.target, v)); o.done = o.progress >= o.target; }
    }
    this.onChange?.();
  }
  get allDone() { return this.current === null; }
  completedMissions() { return this.missions.filter((m) => m.list.every((o) => o.done)).map((m) => m.id); }
  /** Primer objetivo pendiente (para mostrar la "misión actual"). */
  get currentText() { const o = this.list.find((x) => !x.done); return o ? o.text(o.progress) : 'Misiones completadas'; }

  view() { return this.list.map((o) => ({ text: o.text(o.progress), done: o.done })); }
  completedIds() { return this.missions.flatMap((m) => m.list).filter((o) => o.done).map((o) => o.id); }
  restore(ids: string[]) {
    for (const o of this.missions.flatMap((m) => m.list)) if (ids.includes(o.id)) { o.done = true; o.progress = o.target; }
    this.onChange?.();
  }
}

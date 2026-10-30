/**
 * Colisiones estáticas en el plano XZ con rejilla espacial.
 * Cada obstáculo es un cilindro vertical (x, z, radio) con una altura superior:
 * si el personaje está por encima de `top` puede pararse sobre él (rocas grandes).
 */
export interface Collider {
  x: number;
  z: number;
  r: number;
  top: number;
  /** false para obstáculos que se pueden atravesar temporalmente (desactivados). */
  active: boolean;
}

export class CollisionWorld {
  private readonly cellSize: number;
  private readonly cells = new Map<number, Collider[]>();

  constructor(cellSize = 8) {
    this.cellSize = cellSize;
  }

  private key(cx: number, cz: number) {
    return (cx + 1024) * 4096 + (cz + 1024);
  }

  add(c: Collider): Collider {
    const s = this.cellSize;
    const x0 = Math.floor((c.x - c.r) / s), x1 = Math.floor((c.x + c.r) / s);
    const z0 = Math.floor((c.z - c.r) / s), z1 = Math.floor((c.z + c.r) / s);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const k = this.key(cx, cz);
        let list = this.cells.get(k);
        if (!list) this.cells.set(k, (list = []));
        list.push(c);
      }
    return c;
  }

  /** Obstáculos cercanos a un punto (puede contener duplicados entre celdas). */
  query(x: number, z: number, radius: number, out: Collider[] = []): Collider[] {
    out.length = 0;
    const s = this.cellSize;
    const x0 = Math.floor((x - radius) / s), x1 = Math.floor((x + radius) / s);
    const z0 = Math.floor((z - radius) / s), z1 = Math.floor((z + radius) / s);
    for (let cx = x0; cx <= x1; cx++)
      for (let cz = z0; cz <= z1; cz++) {
        const list = this.cells.get(this.key(cx, cz));
        if (list) for (const c of list) if (c.active && !out.includes(c)) out.push(c);
      }
    return out;
  }

  /** ¿Hay algún obstáculo que bloquee un círculo en (x, z)? */
  blocked(x: number, z: number, radius: number): boolean {
    for (const c of this.query(x, z, radius + 4, tmp)) {
      if (Math.hypot(x - c.x, z - c.z) < c.r + radius) return true;
    }
    return false;
  }

  /**
   * Empuja un círculo fuera de los obstáculos. Devuelve la altura de la
   * superficie más alta sobre la que podría apoyarse (o -Infinity).
   */
  resolve(pos: { x: number; y: number; z: number }, radius: number): number {
    let support = -Infinity;
    for (const c of this.query(pos.x, pos.z, radius + 4, tmp)) {
      const dx = pos.x - c.x, dz = pos.z - c.z;
      const d = Math.hypot(dx, dz);
      const min = c.r + radius;
      if (d >= min) continue;
      if (pos.y >= c.top - 0.35) {
        // Encima del obstáculo: puede apoyarse si está suficientemente dentro.
        if (d < c.r + radius * 0.3) support = Math.max(support, c.top);
        continue;
      }
      if (d < 1e-4) { pos.x += min; continue; }
      const push = (min - d) / d;
      pos.x += dx * push;
      pos.z += dz * push;
    }
    return support;
  }
}

const tmp: Collider[] = [];

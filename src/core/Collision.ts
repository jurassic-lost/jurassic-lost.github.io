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
  /**
   * Opcional: caja alineada a los ejes (medias medidas en X y Z) en lugar de cilindro.
   * Se usa para paredes, casas y autos de la ciudad (Proyecto Génesis). `r` debe cubrir la caja.
   */
  hx?: number;
  hz?: number;
}

/** Crea una caja de colisión (centro, medias medidas y altura superior). */
export function boxCollider(x: number, z: number, hx: number, hz: number, top: number): Collider {
  return { x, z, hx, hz, r: Math.hypot(hx, hz), top, active: true };
}

/** Punto más cercano de la caja al punto (x, z). */
function closestOnBox(c: Collider, x: number, z: number): [number, number] {
  return [Math.max(c.x - c.hx!, Math.min(c.x + c.hx!, x)), Math.max(c.z - c.hz!, Math.min(c.z + c.hz!, z))];
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
      if (c.hx !== undefined) {
        const [qx, qz] = closestOnBox(c, x, z);
        if (Math.hypot(x - qx, z - qz) < radius) return true;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + radius) return true;
    }
    return false;
  }

  /** ¿Hay un obstáculo en este punto (x, y, z) más alto que y? (para la cámara). */
  pointBlocked(x: number, y: number, z: number, pad: number): boolean {
    for (const c of this.query(x, z, pad + 1, tmp)) {
      if (c.top <= y) continue;
      if (c.hx !== undefined) {
        if (Math.abs(x - c.x) < c.hx + pad && Math.abs(z - c.z) < c.hz! + pad) return true;
      } else if (Math.hypot(x - c.x, z - c.z) < c.r + pad) return true;
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
      if (c.hx !== undefined) {
        const inside = Math.abs(pos.x - c.x) <= c.hx && Math.abs(pos.z - c.z) <= c.hz!;
        const [qx, qz] = closestOnBox(c, pos.x, pos.z);
        const bx = pos.x - qx, bz = pos.z - qz, bd = Math.hypot(bx, bz);
        if (!inside && bd >= radius) continue;
        if (pos.y >= c.top - 0.35) {
          if (inside || bd < radius * 0.3) support = Math.max(support, c.top);
          continue;
        }
        if (inside) {
          // Dentro de la caja: sale por el lado más cercano.
          const ex = c.hx - Math.abs(pos.x - c.x), ez = c.hz! - Math.abs(pos.z - c.z);
          if (ex < ez) pos.x = c.x + Math.sign(pos.x - c.x || 1) * (c.hx + radius);
          else pos.z = c.z + Math.sign(pos.z - c.z || 1) * (c.hz! + radius);
        } else {
          const push = (radius - bd) / bd;
          pos.x += bx * push;
          pos.z += bz * push;
        }
        continue;
      }
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

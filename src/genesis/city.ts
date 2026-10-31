import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from '../core/math';
import { boxCollider, CollisionWorld } from '../core/Collision';

/**
 * Proyecto Génesis — Sector piloto de la ciudad (Fase 1).
 *
 * Barrio FICTICIO inspirado en una ciudad fronteriza del norte de México: 6 cuadras con
 * casas modulares, bardas con reja, banquetas, postes, autos, un parque y una tienda de
 * abarrotes. Toda la geometría es original y procedural (cajas y cilindros); no viene de
 * Google Maps/Earth ni de ningún mapa real, y los nombres de calles y negocios son inventados.
 *
 * Está lejos de la isla (x ≈ 2000) sobre una zona plana del terreno, así que la isla y sus
 * partidas siguen intactas.
 */
export const CITY = { x: 2000, z: 0 };
/** Medio lado de la zona plana y del mapa del barrio. */
export const CITY_HALF = 130;

/** Calles: centros de las calles N–S (x) y E–O (z), en coordenadas locales. */
export const STREETS_X = [-81, -27, 27, 81];
export const STREETS_Z = [-42, 0, 42];
const ROAD = 10;          // ancho de calle (incluye la banqueta exterior de la cuadra)
const WALK = 1.6;         // banqueta dentro de la cuadra
export const PLAY = { x0: -88, x1: 88, z0: -48, z1: 48 };

/** Caja que tapa la vista (para que el dinosaurio no vea a través de paredes). */
export interface Occluder { min: THREE.Vector3; max: THREE.Vector3 }

/** Puntos importantes del barrio (coordenadas MUNDIALES). */
export interface CityPoints {
  bedSpawn: THREE.Vector3;
  window: THREE.Vector3;         // centro de la ventana del cuarto (por dentro)
  windowOut: THREE.Vector3;      // frente a la ventana, en el patio
  lightSwitch: THREE.Vector3;
  closet: THREE.Vector3;
  closetCam: THREE.Vector3;
  shelf: THREE.Vector3;
  bed: THREE.Vector3;
  frontDoor: THREE.Vector3;
  yard: THREE.Vector3;           // patio delantero (reaparición segura)
  street: THREE.Vector3;         // avenida frente a la casa
  houseMin: THREE.Vector2;       // huella de la casa (para ocultar el techo dentro)
  houseMax: THREE.Vector2;
  storeDoor: THREE.Vector3;
  water: THREE.Vector3;
  food: THREE.Vector3;
  flashlight: THREE.Vector3;
  crashedCar: THREE.Vector3;
}

// ---------------------------------------------------------------- texturas

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}

/** Aplanado (repellado) de pared: claro con manchitas, se multiplica por el color. */
function stucco() {
  const r = rng(31);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#e6e6e6'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2600; i++) {
      const v = 180 + r() * 75;
      g.fillStyle = `rgba(${v},${v},${v},0.35)`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 3, 1 + r() * 3);
    }
    // Manchas de humedad abajo
    const grd = g.createLinearGradient(0, 200, 0, 256);
    grd.addColorStop(0, 'rgba(90,80,70,0)'); grd.addColorStop(1, 'rgba(90,80,70,0.25)');
    g.fillStyle = grd; g.fillRect(0, 0, 256, 256);
  });
}

function asphalt() {
  const r = rng(7);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#4a4b4e'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 5000; i++) {
      const v = 55 + r() * 60;
      g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 1 + r() * 2);
    }
    g.strokeStyle = 'rgba(25,25,28,0.55)'; g.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) { g.beginPath(); let x = r() * 256, y = r() * 256; g.moveTo(x, y); for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 40; y += (r() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); }
  });
}

function sidewalk() {
  return canvasTex(128, 128, (g) => {
    g.fillStyle = '#b9b3a7'; g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(80,75,70,0.45)'; g.lineWidth = 2;
    for (let i = 0; i <= 128; i += 64) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 128); g.moveTo(0, i); g.lineTo(128, i); g.stroke(); }
    const r = rng(3);
    for (let i = 0; i < 900; i++) { const v = 150 + r() * 80; g.fillStyle = `rgba(${v},${v},${v - 8},0.4)`; g.fillRect(r() * 128, r() * 128, 2, 2); }
  });
}

function grass() {
  const r = rng(5);
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#6f7d3d'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 6000; i++) {
      const v = r();
      g.fillStyle = v < 0.5 ? `rgba(70,95,40,0.5)` : v < 0.8 ? `rgba(150,150,80,0.4)` : `rgba(120,100,70,0.4)`;
      g.fillRect(r() * 256, r() * 256, 1 + r() * 2, 2 + r() * 3);
    }
  });
}

function textSign(text: string, bg: string, fg: string, w = 512, h = 128, font = 'bold 64px sans-serif') {
  return canvasTex(w, h, (g) => {
    g.fillStyle = bg; g.fillRect(0, 0, w, h);
    g.strokeStyle = fg; g.lineWidth = 6; g.strokeRect(6, 6, w - 12, h - 12);
    g.fillStyle = fg; g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, h / 2 + 4);
  }, false);
}

// ---------------------------------------------------------------- utilidades de geometría

/** UV en metros (la textura se repite según el tamaño real, sin estirarse). */
function worldUV(geo: THREE.BufferGeometry, scale: number) {
  const pos = geo.attributes.position, nor = geo.attributes.normal, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const nx = Math.abs(nor.getX(i)), ny = Math.abs(nor.getY(i));
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (ny > 0.5) uv.setXY(i, x / scale, z / scale);
    else if (nx > 0.5) uv.setXY(i, z / scale, y / scale);
    else uv.setXY(i, x / scale, y / scale);
  }
  uv.needsUpdate = true;
  return geo;
}

/** Junta muchas piezas que comparten material en una sola malla (menos llamadas de dibujo). */
class Batch {
  private readonly lists = new Map<THREE.Material, THREE.BufferGeometry[]>();
  private readonly flags = new Map<THREE.Material, { cast: boolean; uv: number }>();

  add(mat: THREE.Material, geo: THREE.BufferGeometry, cast = true, uvScale = 0) {
    if (geo.index) geo = geo.toNonIndexed();
    if (uvScale) worldUV(geo, uvScale);
    let l = this.lists.get(mat);
    if (!l) { this.lists.set(mat, (l = [])); this.flags.set(mat, { cast, uv: uvScale }); }
    l.push(geo);
  }

  box(mat: THREE.Material, w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, cast = true, uvScale = 0) {
    const g = new THREE.BoxGeometry(w, h, d);
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    this.add(mat, g, cast, uvScale);
  }

  cyl(mat: THREE.Material, rt: number, rb: number, h: number, x: number, y: number, z: number, seg = 8, cast = true) {
    const g = new THREE.CylinderGeometry(rt, rb, h, seg);
    g.translate(x, y, z);
    this.add(mat, g, cast);
  }

  build(into: THREE.Group, shadows: boolean) {
    for (const [mat, list] of this.lists) {
      const geo = mergeGeometries(list, false);
      if (!geo) continue;
      const m = new THREE.Mesh(geo, mat);
      const f = this.flags.get(mat)!;
      m.castShadow = shadows && f.cast;
      m.receiveShadow = shadows;
      into.add(m);
    }
    this.lists.clear();
  }
}

const std = (color: THREE.ColorRepresentation, extra: THREE.MeshStandardMaterialParameters = {}) =>
  new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra });

// ---------------------------------------------------------------- el barrio

export class City {
  readonly group = new THREE.Group();
  /** Techo y segundo piso de la casa del protagonista (se ocultan al entrar). */
  readonly houseRoof = new THREE.Group();
  readonly occluders: Occluder[] = [];
  readonly points: CityPoints;
  /** Luces interiores de la casa. */
  readonly roomLight: THREE.PointLight;
  readonly livingLight: THREE.PointLight;
  readonly roomBulb: THREE.MeshBasicMaterial;
  /** Farola frente a la casa (parpadea en la introducción). */
  readonly streetLight: THREE.PointLight;
  /** Puerta principal (se abre en M03) y su colisión. */
  readonly door: THREE.Mesh;
  private readonly doorCollider;
  /** Tablas de la ventana (M05) y provisiones en el estante. */
  readonly boards = new THREE.Group();
  readonly supplies = new THREE.Group();
  /** Objetos que se pueden recoger (agua, comida, linterna). */
  readonly pickups = new Map<string, THREE.Object3D>();
  /** Daños que aparecen al amanecer (escombros, auto chocado humeando). */
  readonly damage = new THREE.Group();
  readonly smoke: THREE.Sprite[] = [];
  /** Imagen del mapa del barrio (para el minimapa). */
  readonly mapImage: HTMLCanvasElement;
  private readonly lamps: THREE.MeshBasicMaterial;

  constructor(private readonly collisions: CollisionWorld, readonly shadows: boolean) {
    const g = this.group;
    g.name = 'genesis-city';
    g.position.set(CITY.x, 0, CITY.z);
    const b = new Batch();
    const r = rng(2026);
    const stuccoTex = stucco();

    // --- materiales
    const asph = std('#ffffff', { map: asphalt(), roughness: 0.95 });
    const walk = std('#ffffff', { map: sidewalk() });
    const curb = std('#9c968c');
    const grassM = std('#ffffff', { map: grass(), roughness: 1 });
    const dirt = std('#8a7a5e', { roughness: 1 });
    const line = std('#e9d98a', { roughness: 0.7 });
    const white = std('#e8e6df', { roughness: 0.7 });
    const palette = ['#e0b07a', '#d98c6a', '#9fc3c9', '#e7d3a1', '#c9a0b4', '#b7c99a', '#efe9de', '#d7c46e', '#a7b8d8', '#cf7f5d']
      .map((c) => std(c, { map: stuccoTex }));
    const wallIn = std('#d9d4c9', { map: stuccoTex });
    const roomPaint = std('#3b4466', { map: stuccoTex });
    const roofM = std('#9a958c', { map: stuccoTex });
    const glass = std('#1d2a35', { roughness: 0.15, metalness: 0.3 });
    const iron = std('#26282b', { roughness: 0.6, metalness: 0.4 });
    const tank = std('#1c1d1f', { roughness: 0.5 });
    const wood = std('#6b4a2f');
    const floorM = std('#b9a58a', { roughness: 0.8 });
    const tile = std('#c8c2b6', { roughness: 0.6 });
    const metalDoor = std('#7d8086', { roughness: 0.5, metalness: 0.4 });
    this.lamps = new THREE.MeshBasicMaterial({ color: '#ffd9a0', toneMapped: false });
    const lamp = this.lamps;

    const W = (x: number, z: number) => [x + CITY.x, z + CITY.z] as const;
    const collide = (x: number, z: number, hx: number, hz: number, top: number) => {
      const [wx, wz] = W(x, z);
      return this.collisions.add(boxCollider(wx, wz, hx, hz, top));
    };
    const occlude = (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => {
      const [a, c] = W(x0, z0), [bb, d] = W(x1, z1);
      this.occluders.push({ min: new THREE.Vector3(Math.min(a, bb), y0, Math.min(c, d)), max: new THREE.Vector3(Math.max(a, bb), y1, Math.max(c, d)) });
    };
    /** Caja sólida: se ve, choca y tapa la vista. */
    const solid = (mat: THREE.Material, x: number, y0: number, z: number, w: number, h: number, d: number, uv = 2) => {
      b.box(mat, w, h, d, x, y0 + h / 2, z, 0, true, uv);
      collide(x, z, w / 2, d / 2, y0 + h);
      occlude(x - w / 2, y0, z - d / 2, x + w / 2, y0 + h, z + d / 2);
    };

    // --- suelo: terreno baldío alrededor, calles y cuadras
    b.add(dirt, new THREE.PlaneGeometry(CITY_HALF * 2, CITY_HALF * 2).rotateX(-Math.PI / 2).translate(0, -0.02, 0), false);
    const xs = STREETS_X, zs = STREETS_Z;
    for (const x of xs) {
      const geo = new THREE.PlaneGeometry(ROAD, (zs[2] - zs[0]) + ROAD + 40).rotateX(-Math.PI / 2).translate(x, 0.0, 0);
      b.add(asph, geo, false, 6);
    }
    for (const z of zs) {
      const geo = new THREE.PlaneGeometry((xs[3] - xs[0]) + ROAD + 40, ROAD).rotateX(-Math.PI / 2).translate(0, 0.005, z);
      b.add(asph, geo, false, 6);
      // Línea central amarilla discontinua
      for (let x = xs[0] - 20; x < xs[3] + 20; x += 6) b.box(line, 2.6, 0.01, 0.16, x, 0.012, z, 0, false);
    }
    for (const x of xs) for (let z = zs[0] - 20; z < zs[2] + 20; z += 6) b.box(line, 0.16, 0.01, 2.6, x, 0.012, z, 0, false);

    // Cuadras: 3 columnas × 2 filas. [cx, cz, tipo]
    const blocks: [number, number, 'casas' | 'parque' | 'tienda'][] = [];
    for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) {
      const cx = (xs[i] + xs[i + 1]) / 2, cz = (zs[j] + zs[j + 1]) / 2;
      blocks.push([cx, cz, i === 0 && j === 1 ? 'parque' : i === 2 && j === 1 ? 'tienda' : 'casas']);
    }
    const BW = (xs[1] - xs[0]) - ROAD, BD = (zs[1] - zs[0]) - ROAD; // 44 × 32

    for (const [cx, cz, kind] of blocks) {
      // Banqueta (anillo) y bordillo
      b.box(walk, BW, 0.05, WALK, cx, 0.025, cz - BD / 2 + WALK / 2, 0, false, 2);
      b.box(walk, BW, 0.05, WALK, cx, 0.025, cz + BD / 2 - WALK / 2, 0, false, 2);
      b.box(walk, WALK, 0.05, BD - WALK * 2, cx - BW / 2 + WALK / 2, 0.025, cz, 0, false, 2);
      b.box(walk, WALK, 0.05, BD - WALK * 2, cx + BW / 2 - WALK / 2, 0.025, cz, 0, false, 2);
      for (const s of [-1, 1]) {
        b.box(curb, BW, 0.12, 0.15, cx, 0.06, cz + s * (BD / 2), 0, false);
        b.box(curb, 0.15, 0.12, BD, cx + s * (BW / 2), 0.06, cz, 0, false);
      }
      const innerW = BW - WALK * 2, innerD = BD - WALK * 2;
      if (kind === 'parque') {
        b.box(grassM, innerW, 0.04, innerD, cx, 0.02, cz, 0, false, 8);
        this.park(b, cx, cz, innerW, innerD, r, { wood, iron, white, dirt }, collide, occlude);
        continue;
      }
      // Patio interior de la cuadra (tierra)
      b.box(dirt, innerW, 0.03, innerD, cx, 0.015, cz, 0, false);
      // Casas a los dos lados largos (norte y sur), 5 lotes por lado.
      const lots = 5, lotW = innerW / lots;
      for (const side of [-1, 1]) {
        for (let k = 0; k < lots; k++) {
          const lx = cx - innerW / 2 + lotW * (k + 0.5);
          const front = cz + side * (innerD / 2); // línea de la barda (borde de la banqueta)
          const isHero = cx === 0 && cz < 0 && side === 1 && k === 2;
          const isStore = kind === 'tienda' && side === -1 && k === 0;
          if (isHero || isStore) continue; // se construyen aparte
          this.house(b, lx, front, side, lotW, palette[Math.floor(r() * palette.length)], r, { roofM, glass, iron, tank, metalDoor, white }, solid, collide, occlude);
        }
      }
      // Bardas de fondo entre lotes (separan los patios traseros; no se puede entrar)
      collide(cx, cz, innerW / 2, 1.2, 2.2);
      b.box(palette[6], innerW, 2.2, 0.2, cx, 1.1, cz, 0, true, 2);
    }

    // --- casa del protagonista (cuadra centro-norte, frente a la avenida)
    this.points = this.heroHouse(b, { wallIn, roomPaint, floorM, tile, glass, iron, tank, roofM, wood, metalDoor, white, facade: palette[2] }, collide, occlude);
    const doorGeo = new THREE.BoxGeometry(1.0, 2.1, 0.08);
    this.door = new THREE.Mesh(doorGeo, std('#5a3b26'));
    this.door.geometry.translate(0.5, 0, 0); // bisagra a la izquierda
    this.door.position.set(0.4, 1.05, -8.5);
    this.door.castShadow = shadows;
    g.add(this.door);
    this.doorCollider = collide(0.9, -8.5, 0.5, 0.12, 2.1);

    // --- tienda de abarrotes (cuadra este-sur, esquina con la avenida)
    this.store(b, { roofM, glass, iron, wood, white, metalDoor, facade: palette[7] }, collide, occlude);

    // --- autos estacionados
    const carColors = ['#b8b8bc', '#2f4f7f', '#8c1d1d', '#e8e8e8', '#2b2b2e', '#3f6b3f', '#c9a54a'].map((c) => std(c, { roughness: 0.35, metalness: 0.5 }));
    const parked: [number, number, number][] = [
      [-12, 3.6, Math.PI / 2], [14, -3.6, -Math.PI / 2], [-60, 3.6, Math.PI / 2], [52, 3.6, Math.PI / 2], [-30.6, 18, 0], [23.4, -24, Math.PI],
      [-55, -45.6, Math.PI / 2], [60, 38.4, Math.PI / 2], [84.6, 10, 0], [-84.6, -20, Math.PI], [6, 45.6, -Math.PI / 2], [-36, 38.4, Math.PI / 2],
    ];
    for (const [x, z, ry] of parked) this.car(b, x, z, ry, carColors[Math.floor(r() * carColors.length)], { glass, iron }, collide, occlude);

    // --- auto chocado contra un poste en la avenida (allí está la linterna)
    const crash = new THREE.Vector3(-40, 0, 2.5);
    this.car(b, crash.x, crash.z, 0.45, carColors[1], { glass, iron }, collide, occlude, true);
    b.cyl(iron, 0.09, 0.11, 6.2, -42.6, 3.1 - 0.6, 4.6, 8);

    // --- postes de luz y cables
    const poles: [number, number][] = [];
    for (const z of zs) for (let x = xs[0] - 10; x <= xs[3] + 10; x += 18) poles.push([x + 4, z + (z === 0 ? -5.6 : 5.6)]);
    for (const [x, z] of poles) {
      if (Math.abs(x + 42.6) < 3 && Math.abs(z - 4.6) < 3) continue;
      b.cyl(iron, 0.08, 0.12, 6.4, x, 3.2, z, 8);
      b.box(iron, 1.2, 0.08, 0.1, x, 6.3, z + (z > 0 ? 0 : 0), 0);
      b.box(lamp, 0.45, 0.08, 0.22, x + 0.5, 6.22, z, 0, false);
      const [wx, wz] = W(x, z);
      this.collisions.add({ x: wx, z: wz, r: 0.18, top: 6.4, active: true });
    }
    // Farola con luz real frente a la casa (el resto solo brilla).
    this.streetLight = new THREE.PointLight('#ffcf8a', 30, 22, 1.6);
    this.streetLight.position.set(4.5, 6, -5.6 + 1.2);
    g.add(this.streetLight);

    // --- letreros de calles (nombres inventados)
    const names: [string, number, number, number][] = [
      ['AV. DE LOS FRESNOS', 0 - 8, 5.4, 0], ['C. MEZQUITE', -27 + 5.4, -10, Math.PI / 2], ['C. HUIZACHE', 27 + 5.4, -10, Math.PI / 2],
      ['C. NOGAL', 0, -36.6, 0], ['C. SABINO', 0, 47.4, 0],
    ];
    for (const [t, x, z, ry] of names) {
      b.cyl(iron, 0.04, 0.04, 2.6, x, 1.3, z, 6);
      const sign = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.4), new THREE.MeshStandardMaterial({ map: textSign(t, '#1f5c2e', '#ffffff', 512, 112, 'bold 52px sans-serif'), side: THREE.DoubleSide }));
      sign.position.set(x, 2.55, z); sign.rotation.y = ry;
      g.add(sign);
    }

    // --- barrio de fondo (sin acceso): más casas a lo lejos y bloques de 2–3 pisos
    for (let i = 0; i < 70; i++) {
      const a = r() * Math.PI * 2, d = 105 + r() * 22;
      const x = Math.cos(a) * d * 1.05, z = Math.sin(a) * d * 0.75;
      if (Math.abs(x) < PLAY.x1 + 12 && Math.abs(z) < PLAY.z1 + 12) continue;
      const h = 3 + Math.floor(r() * 3) * 3, w = 7 + r() * 9, dd = 7 + r() * 8;
      b.box(palette[Math.floor(r() * palette.length)], w, h, dd, x, h / 2, z, 0, true, 2);
      if (r() < 0.6) b.cyl(tank, 0.55, 0.55, 1.1, x + w * 0.25, h + 0.55, z, 10);
    }
    // Barricadas en los bordes de la zona jugable ("Paso cerrado").
    const closed = textSign('PASO CERRADO', '#f0c419', '#1a1a1a', 512, 128, 'bold 64px sans-serif');
    const barricade = std('#ffffff', { map: closed });
    for (const x of xs) for (const z of [PLAY.z0 + 1, PLAY.z1 - 1]) b.box(barricade, ROAD - 1, 1.1, 0.4, x, 0.55, z);
    for (const z of zs) for (const x of [PLAY.x0 + 1, PLAY.x1 - 1]) b.box(barricade, 0.4, 1.1, ROAD - 1, x, 0.55, z);
    // Paredes invisibles: no se puede salir del sector piloto.
    collide(0, PLAY.z0 - 1, PLAY.x1 + 2, 1, 50);
    collide(0, PLAY.z1 + 1, PLAY.x1 + 2, 1, 50);
    collide(PLAY.x0 - 1, 0, 1, PLAY.z1 + 2, 50);
    collide(PLAY.x1 + 1, 0, 1, PLAY.z1 + 2, 50);

    b.build(g, shadows);

    // --- daños del amanecer (escombros, basura, humo del auto)
    const debris = std('#6d6a64');
    for (let i = 0; i < 24; i++) {
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.3 + r() * 0.6, 0.1 + r() * 0.2, 0.3 + r() * 0.5), debris);
      m.position.set(-46 + r() * 14, 0.08, -2 + r() * 9); m.rotation.y = r() * 3;
      this.damage.add(m);
    }
    const smokeTex = canvasTex(64, 64, (c) => {
      const grd = c.createRadialGradient(32, 32, 2, 32, 32, 30);
      grd.addColorStop(0, 'rgba(70,70,70,0.75)'); grd.addColorStop(1, 'rgba(70,70,70,0)');
      c.fillStyle = grd; c.fillRect(0, 0, 64, 64);
    }, false);
    for (let i = 0; i < 8; i++) {
      const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0.6 }));
      s.position.set(crash.x + 1.2, 1.2 + i * 0.6, crash.z - 0.4);
      s.scale.setScalar(1.2 + i * 0.4);
      this.smoke.push(s); this.damage.add(s);
    }
    g.add(this.damage);
    g.add(this.houseRoof, this.boards, this.supplies);

    // --- luces de la casa
    this.roomBulb = new THREE.MeshBasicMaterial({ color: '#fff2cc', toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.09, 10, 8), this.roomBulb);
    bulb.position.set(-2.3, 2.62, -10.6);
    g.add(bulb);
    this.roomLight = new THREE.PointLight('#ffe2b0', 9, 9, 1.4);
    this.roomLight.position.set(-2.3, 2.45, -10.6);
    this.livingLight = new THREE.PointLight('#ffe2b0', 6, 8, 1.4);
    this.livingLight.position.set(2.1, 2.45, -10.6);
    g.add(this.roomLight, this.livingLight);
    // Pantalla de la computadora (brillo azul en el cuarto)
    const pcLight = new THREE.PointLight('#5fa8ff', 2.2, 3.5, 1.5);
    pcLight.position.set(-3.1, 1.3, -9.45);
    g.add(pcLight);

    // --- objetos que se recogen (agua y comida en la tienda; linterna en el auto chocado)
    const glowRing = (color: string) => {
      const m = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.04, 6, 24), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, toneMapped: false }));
      m.rotation.x = Math.PI / 2; m.position.y = 0.05; return m;
    };
    const P = this.points;
    const mk = (id: string, at: THREE.Vector3, build: (o: THREE.Group) => void) => {
      const o = new THREE.Group(); build(o); o.add(glowRing('#7df9ff'));
      o.position.set(at.x - CITY.x, at.y, at.z - CITY.z);
      g.add(o); this.pickups.set(id, o);
    };
    mk('water', P.water, (o) => { for (let i = 0; i < 3; i++) o.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), std('#7fc8ff', { transparent: true, opacity: 0.85, roughness: 0.1 })).translateX(i * 0.14 - 0.14).translateY(0.15)); });
    mk('food', P.food, (o) => { for (let i = 0; i < 3; i++) o.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12), std(i ? '#c33b2a' : '#d9a33a', { metalness: 0.6, roughness: 0.4 })).translateX(i * 0.16 - 0.16).translateY(0.06)); });
    mk('flashlight', P.flashlight, (o) => {
      const body = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 10), std('#2a2a2e', { metalness: 0.5 }));
      body.rotation.z = Math.PI / 2; body.position.y = 0.06; o.add(body);
      const head = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.05, 0.08, 12), std('#e0c040', { metalness: 0.5 }));
      head.rotation.z = Math.PI / 2; head.position.set(0.17, 0.06, 0); o.add(head);
    });

    // --- tablas para la ventana (M05) y provisiones en el estante
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.2, 0.05), wood);
      p.position.set(-2.4, 1.0 + i * 0.3, -8.68); p.rotation.z = (i % 2 ? 1 : -1) * 0.05;
      this.boards.add(p);
    }
    this.boards.visible = false;
    const sx = P.shelf.x - CITY.x, sz = P.shelf.z - CITY.z;
    for (let i = 0; i < 3; i++) this.supplies.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.3, 10), std('#7fc8ff', { transparent: true, opacity: 0.85 })).translateX(sx).translateY(1.35).translateZ(sz - 0.3 + i * 0.15));
    for (let i = 0; i < 2; i++) this.supplies.add(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.12, 12), std('#c33b2a', { metalness: 0.6 })).translateX(sx).translateY(0.86).translateZ(sz - 0.2 + i * 0.18));
    this.supplies.add(new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 0.28, 10), std('#2a2a2e')).rotateX(Math.PI / 2).translateX(sx).translateY(0.86).translateZ(sz + 0.25));
    this.supplies.visible = false;

    this.mapImage = this.drawMap(blocks, BW, BD, parked, crash);
  }

  // ---------------------------------------------------------------- piezas

  /** Casa modular de un lote (fachada hacia la calle: side = +1 mira al sur, −1 al norte). */
  private house(
    b: Batch, lx: number, front: number, side: number, lotW: number, facade: THREE.Material, r: () => number,
    m: { roofM: THREE.Material; glass: THREE.Material; iron: THREE.Material; tank: THREE.Material; metalDoor: THREE.Material; white: THREE.Material },
    solid: (mat: THREE.Material, x: number, y0: number, z: number, w: number, h: number, d: number, uv?: number) => void,
    collide: (x: number, z: number, hx: number, hz: number, top: number) => unknown,
    occlude: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => void,
  ) {
    const s = side;
    const floors = r() < 0.3 ? 2 : 1, h = floors * 2.9;
    const w = lotW - 1.4 - r() * 0.8, depth = 8 + r() * 2;
    const setback = 2 + r() * 1.5;
    const fz = front - s * setback;            // línea de fachada
    const cz = fz - s * depth / 2;
    solid(facade, lx, 0, cz, w, h, depth);
    // Pretil y techo
    b.box(m.roofM, w + 0.1, 0.35, depth + 0.1, lx, h + 0.17, cz, 0, true, 2);
    if (r() < 0.8) b.cyl(m.tank, 0.55, 0.55, 1.1, lx + (r() - 0.5) * w * 0.5, h + 0.9, cz + (r() - 0.5) * 2, 10);
    // Ventanas con reja y puerta
    const fzOut = fz + s * 0.03;
    const winX = lx - w * 0.22, doorX = lx + w * 0.22;
    for (let f = 0; f < floors; f++) {
      const y = f * 2.9 + 1.45;
      b.box(m.glass, 1.3, 1.0, 0.06, winX, y, fzOut, 0, false);
      for (let k = 0; k < 6; k++) b.box(m.iron, 0.03, 1.1, 0.03, winX - 0.6 + k * 0.24, y, fzOut + s * 0.06, 0, false);
      if (f > 0) b.box(m.glass, 1.0, 1.0, 0.06, doorX, y, fzOut, 0, false);
    }
    if (r() < 0.5) b.box(m.metalDoor, 2.4, 2.2, 0.06, doorX, 1.1, fzOut, 0, false); // cochera
    else b.box(m.metalDoor, 0.95, 2.1, 0.06, doorX, 1.05, fzOut, 0, false);
    // Barda baja con reja encima (se ve a través de la reja)
    const bz = front - s * 0.1;
    b.box(facade, lotW - 0.05, 0.9, 0.2, lx, 0.45, bz, 0, true, 2);
    for (let x = lx - lotW / 2 + 0.15; x < lx + lotW / 2; x += 0.2) b.box(m.iron, 0.025, 1.0, 0.025, x, 1.4, bz, 0, false);
    b.box(m.iron, lotW, 0.05, 0.05, lx, 1.9, bz, 0, false);
    collide(lx, bz, lotW / 2, 0.12, 2.6);
    occlude(lx - lotW / 2, 0, bz - 0.1, lx + lotW / 2, 0.9, bz + 0.1);
    // Paredes laterales del lote (dividen las casas vecinas)
    for (const e of [-1, 1]) {
      const ex = lx + e * lotW / 2, zmid = (bz + cz) / 2, len = Math.abs(bz - (cz - s * depth / 2));
      b.box(facade, 0.15, 2.0, len, ex, 1.0, (bz + (cz - s * depth / 2)) / 2, 0, true, 2);
      collide(ex, zmid, 0.1, len / 2, 2.0);
    }
  }

  /** Árboles, juegos y bancas del parque. */
  private park(
    b: Batch, cx: number, cz: number, w: number, d: number, r: () => number,
    m: { wood: THREE.Material; iron: THREE.Material; white: THREE.Material; dirt: THREE.Material },
    collide: (x: number, z: number, hx: number, hz: number, top: number) => unknown,
    occlude: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => void,
  ) {
    const leaves = [std('#4f6b2c'), std('#5d7a33'), std('#3f5a26')];
    const trunk = std('#5b4632');
    for (let i = 0; i < 14; i++) {
      const x = cx + (r() - 0.5) * (w - 4), z = cz + (r() - 0.5) * (d - 4);
      if (Math.abs(x - cx) < 6 && Math.abs(z - cz) < 5) continue; // claro central
      const h = 3 + r() * 2.5;
      b.cyl(trunk, 0.16, 0.24, h, x, h / 2, z, 7);
      const crown = new THREE.IcosahedronGeometry(1.6 + r() * 1.2, 1);
      crown.scale(1, 0.75, 1); crown.translate(x, h + 0.8, z);
      b.add(leaves[i % 3], crown);
      this.collisions.add({ x: x + CITY.x, z: z + CITY.z, r: 0.35, top: h, active: true });
      occlude(x - 0.25, 0, z - 0.25, x + 0.25, h, z + 0.25);
    }
    // Camino de tierra en cruz
    b.box(m.dirt, w, 0.045, 2, cx, 0.025, cz, 0, false);
    b.box(m.dirt, 2, 0.045, d, cx, 0.025, cz, 0, false);
    // Columpios
    for (const e of [-1, 1]) b.box(m.iron, 0.08, 2.4, 0.08, cx + 9 + e * 1.6, 1.2, cz + 7, 0);
    b.box(m.iron, 3.3, 0.08, 0.08, cx + 9, 2.4, cz + 7, 0);
    for (const e of [-0.7, 0.7]) b.box(m.wood, 0.5, 0.05, 0.25, cx + 9 + e, 0.55, cz + 7, 0);
    collide(cx + 9, cz + 7, 1.7, 0.2, 2.4);
    // Bancas
    for (const [x, z] of [[cx - 4, cz - 2], [cx + 4, cz + 2], [cx - 12, cz + 8]]) {
      b.box(m.wood, 1.8, 0.08, 0.5, x, 0.5, z, 0); b.box(m.wood, 1.8, 0.5, 0.06, x, 0.8, z - 0.25, 0);
      collide(x, z, 0.9, 0.3, 0.55);
    }
    // Malla baja alrededor (con entradas en las esquinas)
    for (const s of [-1, 1]) {
      b.box(m.iron, w - 6, 0.9, 0.04, cx, 0.45, cz + s * d / 2, 0, false);
      b.box(m.iron, 0.04, 0.9, d - 6, cx + s * w / 2, 0.45, cz, 0, false);
    }
  }

  /** Auto sencillo (carrocería, cabina, ruedas). */
  private car(
    b: Batch, x: number, z: number, ry: number, paint: THREE.Material,
    m: { glass: THREE.Material; iron: THREE.Material },
    collide: (x: number, z: number, hx: number, hz: number, top: number) => unknown,
    occlude: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => void,
    crashed = false,
  ) {
    const c = Math.cos(ry), s = Math.sin(ry);
    const at = (lx: number, lz: number) => [x + lx * c + lz * s, z - lx * s + lz * c] as const;
    const body = new THREE.BoxGeometry(1.8, 0.7, 4.2); body.rotateY(ry); body.translate(x, 0.65, z); b.add(paint, body);
    const cab = new THREE.BoxGeometry(1.6, 0.6, 2.1); cab.rotateY(ry); const [cx, cz] = at(0, -0.2); cab.translate(cx, 1.3, cz); b.add(m.glass, cab);
    const roof = new THREE.BoxGeometry(1.62, 0.08, 1.9); roof.rotateY(ry); roof.translate(cx, 1.62, cz); b.add(paint, roof);
    for (const [wx, wz] of [[-0.85, 1.3], [0.85, 1.3], [-0.85, -1.3], [0.85, -1.3]]) {
      const w = new THREE.CylinderGeometry(0.34, 0.34, 0.25, 12); w.rotateZ(Math.PI / 2); w.rotateY(ry);
      const [px, pz] = at(wx, wz); w.translate(px, crashed && wx > 0 && wz > 0 ? 0.25 : 0.34, pz); b.add(m.iron, w);
    }
    // Colisión: caja que cubre el auto girado (o círculos si va en diagonal).
    if (Math.abs(s) < 0.05 || Math.abs(c) < 0.05) {
      const hx = Math.abs(c) > 0.5 ? 0.95 : 2.15, hz = Math.abs(c) > 0.5 ? 2.15 : 0.95;
      collide(x, z, hx, hz, 1.65);
      occlude(x - hx, 0.2, z - hz, x + hx, 1.2, z + hz);
    } else {
      for (const k of [-1.4, 0, 1.4]) {
        const [px, pz] = at(0, k);
        this.collisions.add({ x: px + CITY.x, z: pz + CITY.z, r: 1.0, top: 1.65, active: true });
      }
    }
  }

  /** Tienda de abarrotes de la esquina (inventada), con estantes; se entra por el frente. */
  private store(
    b: Batch, m: { roofM: THREE.Material; glass: THREE.Material; iron: THREE.Material; wood: THREE.Material; white: THREE.Material; metalDoor: THREE.Material; facade: THREE.Material },
    collide: (x: number, z: number, hx: number, hz: number, top: number) => unknown,
    occlude: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => void,
  ) {
    // Lote: x 33.8..41.6, z 7.2..16 (frente al norte, hacia la avenida).
    const x0 = 33.8, x1 = 41.6, z0 = 7.2, z1 = 16.0, h = 3.2, t = 0.2;
    const wall = (ax: number, az: number, bx: number, bz: number) => {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, w = Math.abs(bx - ax) || t, d = Math.abs(bz - az) || t;
      b.box(m.facade, w, h, d, cx, h / 2, cz, 0, true, 2);
      collide(cx, cz, w / 2, d / 2, h);
      occlude(cx - w / 2, 0, cz - d / 2, cx + w / 2, h, cz + d / 2);
    };
    wall(x0, z1, x1, z1);           // fondo
    wall(x0, z0, x0, z1);           // lado oeste
    wall(x1, z0, x1, z1);           // lado este
    wall(x0, z0, 36.4, z0);         // frente izquierda
    wall(38.6, z0, x1, z0);         // frente derecha (la puerta queda en 36.4–38.6)
    b.box(m.facade, 2.2, 0.8, t, 37.5, h - 0.4, z0, 0, true, 2);
    b.box(m.roofM, x1 - x0 + 0.3, 0.3, z1 - z0 + 0.3, (x0 + x1) / 2, h + 0.15, (z0 + z1) / 2, 0, true, 2);
    b.box(m.iron, 2.2, 0.06, 0.06, 37.5, 2.4, z0 - 0.05, 0, false);
    // Suelo de mosaico
    b.box(m.white, x1 - x0, 0.03, z1 - z0, (x0 + x1) / 2, 0.02, (z0 + z1) / 2, 0, false);
    // Estantes
    for (const sx of [35.2, 40.4]) {
      b.box(m.wood, 0.5, 1.8, 5.5, sx, 0.9, 12.2, 0);
      collide(sx, 12.2, 0.25, 2.75, 1.8);
      for (let y = 0.4; y < 1.8; y += 0.45) for (let z = 9.8; z < 14.6; z += 0.35) b.box(m.metalDoor, 0.3, 0.25, 0.22, sx, y, z, 0, false);
    }
    // Mostrador y refrigerador
    b.box(m.white, 2.4, 1.0, 0.6, 37.8, 0.5, 15.2, 0);
    collide(37.8, 15.2, 1.2, 0.3, 1.0);
    b.box(m.glass, 0.9, 2.0, 0.6, 41.0, 1.0, 15.4, 0);
    // Letrero
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6.5, 1.1), new THREE.MeshStandardMaterial({ map: textSign('ABARROTES "LA ESPERANZA"', '#c0392b', '#fff6d6', 1024, 170, 'bold 76px sans-serif') }));
    sign.position.set(37.7, h + 0.75, z0 - 0.14); sign.rotation.y = Math.PI;
    this.group.add(sign);
    b.box(m.facade, 6.8, 1.4, 0.15, 37.7, h + 0.7, z0 - 0.04, 0, true, 2);
  }

  /** Casa del protagonista: cuarto gamer, sala, cocina, ropero para esconderse. */
  private heroHouse(
    b: Batch, m: Record<string, THREE.Material>,
    collide: (x: number, z: number, hx: number, hz: number, top: number) => unknown,
    occlude: (x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) => void,
  ): CityPoints {
    const H = 2.8, T = 0.2;
    const X0 = -3.9, X1 = 3.9, Z0 = -17, ZF = -8.5; // ZF = fachada (frente al sur)
    /** Tramo de pared (con colisión y oclusión). Si y0 > 0 es un tramo sobre/bajo una abertura. */
    const wall = (mat: THREE.Material, ax: number, az: number, bx: number, bz: number, y0 = 0, y1 = H) => {
      const cx = (ax + bx) / 2, cz = (az + bz) / 2, w = Math.abs(bx - ax) || T, d = Math.abs(bz - az) || T;
      b.box(mat, w, y1 - y0, d, cx, (y0 + y1) / 2, cz, 0, true, 2);
      // Bajo una ventana la colisión llega hasta el techo: no se puede salir por la ventana.
      if (y0 < 1.2) collide(cx, cz, w / 2, d / 2, y1 < H && y0 === 0 ? H : y1);
      occlude(cx - w / 2, y0, cz - d / 2, cx + w / 2, y1, cz + d / 2);
    };
    const facade = m.facade, inner = m.wallIn, room = m.roomPaint;
    // Fachada (z = ZF) con ventana del cuarto (x −3.2…−1.6), puerta (0.4…1.4) y ventana de la sala (2.6…3.8).
    wall(facade, X0, ZF, -3.2, ZF);
    wall(facade, -3.2, ZF, -1.6, ZF, 0, 0.9); wall(facade, -3.2, ZF, -1.6, ZF, 2.0, H);
    wall(facade, -1.6, ZF, 0.4, ZF);
    wall(facade, 0.4, ZF, 1.4, ZF, 2.1, H);
    wall(facade, 1.4, ZF, 2.6, ZF);
    wall(facade, 2.6, ZF, 3.8, ZF, 0, 0.9); wall(facade, 2.6, ZF, 3.8, ZF, 2.0, H);
    wall(facade, 3.8, ZF, X1, ZF);
    // Vidrio de las ventanas (no tapa la vista) y reja por fuera
    for (const [a, c] of [[-3.2, -1.6], [2.6, 3.8]]) {
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(c - a, 1.1), new THREE.MeshStandardMaterial({ color: '#9fc3d8', transparent: true, opacity: 0.18, roughness: 0.05, side: THREE.DoubleSide, depthWrite: false }));
      gl.position.set((a + c) / 2, 1.45, ZF); this.group.add(gl);
      for (let x = a + 0.1; x < c; x += 0.2) b.box(m.iron, 0.025, 1.15, 0.025, x, 1.45, ZF + 0.14, 0, false);
    }
    // Paredes exteriores laterales y del fondo
    wall(facade, X0, ZF, X0, Z0); wall(facade, X1, ZF, X1, Z0); wall(facade, X0, Z0, X1, Z0);
    // Interiores: cuarto (x X0…−0.4, z −12.6…ZF), sala (−0.4…X1), cocina al fondo.
    wall(room, -0.4, ZF, -0.4, -11.2); wall(room, -0.4, -12.2, -0.4, -12.6); wall(room, -0.4, -11.2, -0.4, -12.2, 2.1, H);
    wall(inner, X0, -12.6, 1.8, -12.6); wall(inner, 2.8, -12.6, X1, -12.6); wall(inner, 1.8, -12.6, 2.8, -12.6, 2.1, H);
    // Pintura del cuarto (paredes azul oscuro por dentro)
    b.box(room, 3.4, H - 0.02, 0.02, -2.15, H / 2, -12.48, 0, false, 2);
    b.box(room, 0.02, H - 0.02, 4.0, X0 + 0.11, H / 2, -10.55, 0, false, 2);
    // Pisos
    b.box(m.floorM, 3.5, 0.04, 4.1, -2.15, 0.02, -10.55, 0, false, 1);
    b.box(m.tile, 4.3, 0.04, 4.1, 1.75, 0.02, -10.55, 0, false, 1);
    b.box(m.tile, 7.8, 0.04, 4.4, 0, 0.02, -14.8, 0, false, 1);
    // Techo (se oculta al entrar) y tinaco
    const roofGeo = new THREE.BoxGeometry(X1 - X0 + 0.3, 0.3, ZF - Z0 + 0.3); roofGeo.translate(0, H + 0.15, (Z0 + ZF) / 2);
    const roof = new THREE.Mesh(roofGeo, m.roofM); roof.castShadow = this.shadows; roof.receiveShadow = this.shadows;
    const tankM = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.1, 12), m.tank); tankM.position.set(2.5, H + 0.85, -15);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(X1 - X0, ZF - Z0).rotateX(Math.PI / 2), std('#d8d2c4'));
    ceil.position.set(0, H - 0.01, (Z0 + ZF) / 2);
    this.houseRoof.add(roof, tankM, ceil);

    // --- muebles del cuarto gamer
    const dark = std('#1d1d22'), red = std('#b01822'), sheet = std('#d8d8d8'), blanket = std('#3a5a8c');
    // Cama (pared izquierda, al fondo)
    b.box(dark, 1.1, 0.35, 2.1, -3.25, 0.18, -11.4); b.box(sheet, 1.05, 0.16, 2.0, -3.25, 0.43, -11.4); b.box(blanket, 1.08, 0.08, 1.3, -3.25, 0.55, -11.0);
    b.box(sheet, 0.7, 0.14, 0.35, -3.25, 0.58, -12.2);
    collide(-3.25, -11.4, 0.55, 1.05, 0.6);
    // Escritorio con PC junto a la ventana (pared izquierda, al frente)
    b.box(dark, 0.7, 0.05, 1.3, -3.45, 0.78, -9.45); b.box(dark, 0.05, 0.78, 0.7, -3.45, 0.39, -10.05); b.box(dark, 0.05, 0.78, 0.7, -3.45, 0.39, -8.85);
    collide(-3.45, -9.45, 0.35, 0.65, 0.8);
    b.box(dark, 0.05, 0.55, 0.9, -3.72, 1.18, -9.45);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.48), new THREE.MeshBasicMaterial({ color: '#4d7cff', toneMapped: false }));
    screen.position.set(-3.69, 1.18, -9.45); screen.rotation.y = Math.PI / 2; this.group.add(screen);
    b.box(red, 0.5, 0.1, 0.5, -2.8, 0.5, -9.45); b.box(red, 0.08, 0.6, 0.5, -2.55, 0.85, -9.45);
    // Ropero (escondite), pared del fondo
    b.box(m.wood, 1.3, 2.1, 0.6, -1.4, 1.05, -12.25);
    b.box(std('#4a3220'), 0.02, 1.9, 0.02, -1.4, 1.05, -11.94, 0, false);
    collide(-1.4, -12.25, 0.65, 0.3, 2.1);
    // Estante para provisiones (pared derecha del cuarto)
    for (const y of [0.8, 1.3, 1.8]) b.box(m.wood, 0.35, 0.04, 1.2, -0.62, y, -9.6, 0);
    b.box(m.wood, 0.35, 1.9, 0.04, -0.62, 0.95, -9.0); b.box(m.wood, 0.35, 1.9, 0.04, -0.62, 0.95, -10.2);
    collide(-0.62, -9.6, 0.18, 0.6, 1.9);
    // Interruptor de la luz junto a la puerta del cuarto
    b.box(m.white, 0.03, 0.12, 0.08, -0.52, 1.25, -10.4, 0, false);
    // Sala: sillón, mesita y tele; cocina: barra y refri
    b.box(std('#6b4a6b'), 2.0, 0.45, 0.8, 2.4, 0.3, -12.1); b.box(std('#6b4a6b'), 2.0, 0.5, 0.2, 2.4, 0.7, -12.4); collide(2.4, -12.1, 1.0, 0.45, 0.8);
    b.box(dark, 1.2, 0.5, 0.4, 2.4, 0.25, -9.0); b.box(dark, 1.1, 0.65, 0.05, 2.4, 0.85, -8.9); collide(2.4, -9.0, 0.6, 0.25, 1.2);
    b.box(m.white, 3.0, 0.9, 0.6, 2.4, 0.45, -16.6); collide(2.4, -16.6, 1.5, 0.3, 0.9);
    b.box(m.white, 0.8, 1.8, 0.7, -3.3, 0.9, -16.5); collide(-3.3, -16.5, 0.4, 0.35, 1.8);
    b.box(m.wood, 1.2, 0.05, 0.8, -1.0, 0.75, -15.0); collide(-1.0, -15.0, 0.6, 0.4, 0.78);

    // --- patio delantero: barda baja con reja y portón abierto
    const BZ = -6.7, lot = 8.16, gl = -1.2, gr = 1.6; // portón abierto entre gl y gr
    const lw = gl + lot / 2, rw = lot / 2 - gr;
    b.box(facade, lw, 0.9, 0.2, -lot / 2 + lw / 2, 0.45, BZ, 0, true, 2);
    b.box(facade, rw, 0.9, 0.2, gr + rw / 2, 0.45, BZ, 0, true, 2);
    for (let x = -lot / 2 + 0.1; x < lot / 2; x += 0.2) if (x < gl || x > gr) b.box(m.iron, 0.025, 1.0, 0.025, x, 1.4, BZ, 0, false);
    b.box(m.iron, lw, 0.05, 0.05, -lot / 2 + lw / 2, 1.9, BZ, 0, false); b.box(m.iron, rw, 0.05, 0.05, gr + rw / 2, 1.9, BZ, 0, false);
    collide(-lot / 2 + lw / 2, BZ, lw / 2, 0.12, 2.6);
    collide(gr + rw / 2, BZ, rw / 2, 0.12, 2.6);
    occlude(-lot / 2, 0, BZ - 0.1, gl, 0.9, BZ + 0.1);
    occlude(gr, 0, BZ - 0.1, lot / 2, 0.9, BZ + 0.1);
    for (const e of [-1, 1]) { b.box(facade, 0.15, 2.0, 10.3, e * lot / 2, 1.0, -11.85, 0, true, 2); collide(e * lot / 2, -11.85, 0.1, 5.15, 2.6); }

    const P = (x: number, y: number, z: number) => new THREE.Vector3(x + CITY.x, y, z + CITY.z);
    return {
      bedSpawn: P(-2.3, 0, -11.0),
      window: P(-2.4, 1.45, -8.7),
      windowOut: P(-2.4, 1.45, -7.6),
      lightSwitch: P(-0.6, 1.2, -10.4),
      closet: P(-1.4, 0, -11.6),
      closetCam: P(-1.4, 1.5, -12.3),
      shelf: P(-0.62, 0, -9.6),
      bed: P(-2.6, 0, -11.4),
      frontDoor: P(0.9, 0, -9.0),
      yard: P(0.9, 0, -7.4),
      street: P(0, 0, 1.5),
      houseMin: new THREE.Vector2(X0 + CITY.x, Z0 + CITY.z),
      houseMax: new THREE.Vector2(X1 + CITY.x, ZF + CITY.z),
      storeDoor: P(37.5, 0, 6.0),
      water: P(35.75, 0.95, 10.4),
      food: P(39.85, 0.95, 13.2),
      flashlight: P(-38.4, 0.75, 1.0),
      crashedCar: P(-40, 0, 2.5),
    };
  }

  // ---------------------------------------------------------------- estados

  setRoomLight(on: boolean) {
    this.roomLight.visible = on;
    this.roomBulb.color.set(on ? '#fff2cc' : '#3a3a36');
  }

  /** Abre o cierra la puerta principal. */
  setDoorOpen(open: boolean) {
    this.door.rotation.y = open ? -Math.PI / 2 * 0.95 : 0;
    this.doorCollider.active = !open;
  }

  /** Farolas: brillo de las lámparas (0 = apagadas). */
  setStreetLamps(v: number) {
    this.lamps.color.setRGB(1 * v + 0.15, 0.85 * v + 0.13, 0.63 * v + 0.12);
    this.streetLight.intensity = 30 * v;
  }

  update(dt: number, time: number) {
    for (let i = 0; i < this.smoke.length; i++) {
      const s = this.smoke[i];
      s.position.y += dt * 0.5;
      s.material.opacity = Math.max(0, 0.55 - (s.position.y - 1.2) / 8);
      if (s.position.y > 6) s.position.y = 1.2;
    }
    for (const o of this.pickups.values()) if (o.visible) { o.rotation.y += dt * 0.8; o.children[o.children.length - 1].position.y = 0.05 + Math.sin(time * 3) * 0.03; }
  }

  /** Mapa del barrio dibujado desde el mismo trazado (calles, cuadras, parque, tienda). */
  private drawMap(blocks: [number, number, string][], BW: number, BD: number, parked: [number, number, number][], crash: THREE.Vector3) {
    const S = 512, c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d')!, k = S / (CITY_HALF * 2), at = (v: number) => (v + CITY_HALF) * k;
    g.fillStyle = '#6b6450'; g.fillRect(0, 0, S, S);
    g.fillStyle = '#3d3e42';
    for (const x of STREETS_X) g.fillRect(at(x - ROAD / 2), at(PLAY.z0 - 6), ROAD * k, (PLAY.z1 - PLAY.z0 + 12) * k);
    for (const z of STREETS_Z) g.fillRect(at(PLAY.x0 - 6), at(z - ROAD / 2), (PLAY.x1 - PLAY.x0 + 12) * k, ROAD * k);
    for (const [cx, cz, kind] of blocks) {
      g.fillStyle = '#b9b3a7'; g.fillRect(at(cx - BW / 2), at(cz - BD / 2), BW * k, BD * k);
      g.fillStyle = kind === 'parque' ? '#5f7f35' : '#c9a882';
      g.fillRect(at(cx - BW / 2 + WALK), at(cz - BD / 2 + WALK), (BW - WALK * 2) * k, (BD - WALK * 2) * k);
    }
    g.fillStyle = '#7fb4d8'; g.fillRect(at(-3.9), at(-17), 7.8 * k, 8.5 * k);   // tu casa
    g.fillStyle = '#d0533e'; g.fillRect(at(33.8), at(7.2), 7.8 * k, 8.8 * k);    // tienda
    g.fillStyle = '#2b2b2e';
    for (const [x, z] of parked) g.fillRect(at(x) - 3, at(z) - 3, 6, 6);
    g.fillStyle = '#ff9f43'; g.fillRect(at(crash.x) - 4, at(crash.z) - 4, 8, 8);
    // Fuera del sector: oscurecido
    g.fillStyle = 'rgba(10,12,14,0.55)';
    g.fillRect(0, 0, S, at(PLAY.z0)); g.fillRect(0, at(PLAY.z1), S, S - at(PLAY.z1));
    g.fillRect(0, at(PLAY.z0), at(PLAY.x0), at(PLAY.z1) - at(PLAY.z0)); g.fillRect(at(PLAY.x1), at(PLAY.z0), S - at(PLAY.x1), at(PLAY.z1) - at(PLAY.z0));
    return c;
  }
}

// ---------------------------------------------------------------- línea de vista

const _dir = new THREE.Vector3();
/** ¿Hay una pared (u otro objeto opaco) entre a y b? Prueba de segmento contra cajas. */
export function blockedLine(a: THREE.Vector3, b: THREE.Vector3, occ: Occluder[]): boolean {
  _dir.subVectors(b, a);
  const len = _dir.length();
  if (len < 1e-4) return false;
  for (const o of occ) {
    let t0 = 0, t1 = 1, hit = true;
    for (const ax of ['x', 'y', 'z'] as const) {
      const d = _dir[ax], p = a[ax], lo = o.min[ax], hi = o.max[ax];
      if (Math.abs(d) < 1e-9) { if (p < lo || p > hi) { hit = false; break; } continue; }
      let ta = (lo - p) / d, tb = (hi - p) / d;
      if (ta > tb) [ta, tb] = [tb, ta];
      t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
      if (t0 > t1) { hit = false; break; }
    }
    if (hit && t1 > 0.001 && t0 < 0.999) return true;
  }
  return false;
}

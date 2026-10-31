import * as THREE from 'three';
import { CharacterModel } from '../player/CharacterModel';
import { buildTRex, buildTriceratops } from '../creatures/dinoModels';
import { buildQuatDino, hasQuat } from '../creatures/quatModels';
import portadaUrl from '../ui/portada.jpg';

const lambert = (c: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color: c, ...extra });
const glow = (c: THREE.ColorRepresentation, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color: c, transparent: opacity < 1, opacity, toneMapped: false });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Imagen de portada como textura (pantalla de la computadora y póster). */
function portadaTexture(onLoad?: (img: HTMLImageElement) => void) {
  const t = new THREE.TextureLoader().load(portadaUrl, (tex) => onLoad?.(tex.image as HTMLImageElement));
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Pantalla del juego en la computadora: portada y botones del menú. */
function monitorTexture() {
  const c = document.createElement('canvas');
  c.width = 768; c.height = 432;
  const g = c.getContext('2d')!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const draw = (img?: HTMLImageElement) => {
    g.fillStyle = '#071425'; g.fillRect(0, 0, 768, 432);
    if (img) g.drawImage(img, 0, -40, 768, 512);
    g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(0, 0, 768, 432);
    const btns: [string, string][] = [['JUGAR ▶', '#2fb84a'], ['⚙ OPCIONES', '#1b2a3c'], ['📂 CARGAR', '#1b2a3c'], ['⏻ SALIR', '#1b2a3c']];
    btns.forEach(([label, col], i) => {
      const y = 196 + i * 50;
      g.fillStyle = col; g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 2;
      g.beginPath(); g.roundRect(560, y, 180, 40, 8); g.fill(); g.stroke();
      g.fillStyle = '#fff'; g.font = 'bold 22px sans-serif'; g.textBaseline = 'middle';
      g.fillText(label, 576, y + 21);
    });
    t.needsUpdate = true;
  };
  draw();
  const img = new Image();
  img.onload = () => draw(img);
  img.src = portadaUrl;
  return t;
}

/** Letrero de neón: cráneo de tiranosaurio de perfil (líneas brillantes). */
function neonSkullTexture() {
  return canvasTex(512, 384, (g) => {
    g.clearRect(0, 0, 512, 384);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const path = () => {
      g.beginPath();
      // Cráneo
      g.moveTo(40, 150); g.quadraticCurveTo(120, 70, 260, 60); g.quadraticCurveTo(380, 55, 450, 120);
      g.quadraticCurveTo(480, 160, 440, 200); g.lineTo(300, 205);
      // Mandíbula
      g.moveTo(80, 190); g.quadraticCurveTo(200, 260, 330, 250); g.quadraticCurveTo(420, 240, 440, 200);
      g.moveTo(40, 150); g.lineTo(80, 190);
      // Ojo y fosas
      g.moveTo(345, 110); g.arc(330, 110, 22, 0, Math.PI * 2);
      g.moveTo(250, 120); g.ellipse(230, 125, 30, 18, -0.2, 0, Math.PI * 2);
      g.moveTo(115, 120); g.ellipse(105, 122, 14, 9, 0, 0, Math.PI * 2);
      // Dientes
      for (let i = 0; i < 9; i++) {
        const x = 80 + i * 24;
        g.moveTo(x, 172 + i * 2); g.lineTo(x + 7, 196 + i * 2); g.lineTo(x + 14, 174 + i * 2);
      }
    };
    g.strokeStyle = 'rgba(255,140,40,0.35)'; g.lineWidth = 22; path(); g.stroke();
    g.strokeStyle = '#ff9a3c'; g.lineWidth = 9; path(); g.stroke();
    g.strokeStyle = '#fff1d6'; g.lineWidth = 3; path(); g.stroke();
  });
}

function windowTexture() {
  return canvasTex(256, 256, (g) => {
    const grad = g.createLinearGradient(0, 0, 0, 256);
    grad.addColorStop(0, '#0a1838'); grad.addColorStop(1, '#23407a');
    g.fillStyle = grad; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 50; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`; g.fillRect(Math.random() * 256, Math.random() * 150, 2, 2); }
    g.fillStyle = '#f4f2e0'; g.beginPath(); g.arc(70, 70, 22, 0, Math.PI * 2); g.fill();
    // Árboles y un volcán a lo lejos
    g.fillStyle = '#16244a'; g.beginPath(); g.moveTo(120, 200); g.lineTo(175, 120); g.lineTo(230, 200); g.fill();
    g.fillStyle = '#ff6a2a'; g.fillRect(170, 118, 10, 6);
    g.fillStyle = '#0a1428';
    for (let x = 0; x < 256; x += 20) { const h = 40 + ((x * 37) % 50); g.beginPath(); g.ellipse(x + 10, 256 - h * 0.5, 16, h * 0.6, 0, 0, Math.PI * 2); g.fill(); }
  });
}

/** Lomo de libro con título. */
function bookTexture(title: string, color: string) {
  return canvasTex(512, 96, (g) => {
    g.fillStyle = color; g.fillRect(0, 0, 512, 96);
    g.fillStyle = 'rgba(255,255,255,0.15)'; g.fillRect(0, 8, 512, 6); g.fillRect(0, 82, 512, 6);
    g.fillStyle = '#f2ead6'; g.font = 'bold 44px sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
    g.fillText(title, 256, 50);
  });
}

/** Manta con siluetas de dinosaurio. */
function blanketTexture() {
  return canvasTex(256, 256, (g) => {
    g.fillStyle = '#8c8f9a'; g.fillRect(0, 0, 256, 256);
    g.fillStyle = '#23252c';
    const rex = (x: number, y: number, s: number) => {
      g.save(); g.translate(x, y); g.scale(s, s);
      g.beginPath(); g.ellipse(0, 0, 40, 18, -0.2, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(25, -10); g.lineTo(55, -35); g.lineTo(75, -30); g.lineTo(70, -15); g.lineTo(40, 0); g.fill();
      g.beginPath(); g.moveTo(-30, 0); g.lineTo(-90, 15); g.lineTo(-30, 12); g.fill();
      g.fillRect(-5, 10, 8, 30); g.fillRect(12, 8, 8, 32);
      g.restore();
    };
    rex(120, 100, 1.1); rex(60, 200, 0.6); rex(200, 210, 0.5);
  });
}

/** Cuarto gamer del niño para la introducción (basado en el arte de Ivan). */
export class Bedroom {
  readonly scene = new THREE.Scene();
  readonly kid = new CharacterModel();
  /** Luz de la pantalla (crece con la anomalía). */
  readonly phoneLight: THREE.PointLight;
  readonly portal: THREE.Group;
  readonly floaters: THREE.Object3D[] = [];
  /** Centro de la pantalla de la computadora (para encuadrar la cámara). */
  readonly phonePos = new THREE.Vector3();
  private readonly leds: THREE.MeshBasicMaterial[] = [];
  private time = 0;

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#07060d');

    // Paredes oscuras, suelo de madera oscura.
    const wall = lambert('#2b3040', { side: THREE.BackSide });
    const room = new THREE.Mesh(new THREE.BoxGeometry(7, 3.2, 6.4), [
      wall, wall, lambert('#1a1c24', { side: THREE.BackSide }), lambert('#3a3533', { side: THREE.BackSide }), wall, wall,
    ]);
    room.position.y = 1.6;
    s.add(room);
    for (let i = -3.25; i <= 3.25; i += 0.5) s.add(box(0.015, 0.004, 6.4, lambert('#24201f'), i, 0.003, 0));

    // Ventana con persiana, de noche (pared izquierda).
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({ map: windowTexture() }));
    win.position.set(-3.48, 1.85, -1.4); win.rotation.y = Math.PI / 2;
    s.add(win);
    const blind = lambert('#1b1e26');
    for (let y = 2.45; y > 2.0; y -= 0.06) s.add(box(0.03, 0.035, 1.55, blind, -3.45, y, -1.4));

    // Cama con manta de dinosaurios y luz LED roja debajo.
    s.add(box(1.4, 0.32, 2.3, lambert('#15161b'), -2.7, 0.2, 0.9));
    s.add(box(1.36, 0.18, 2.2, lambert('#d8d8d8'), -2.7, 0.45, 0.9));
    const blanket = new THREE.Mesh(new THREE.BoxGeometry(1.42, 0.1, 1.5), [
      lambert('#8c8f9a'), lambert('#8c8f9a'), new THREE.MeshLambertMaterial({ map: blanketTexture() }), lambert('#8c8f9a'), lambert('#8c8f9a'), lambert('#8c8f9a'),
    ]);
    blanket.position.set(-2.7, 0.58, 1.25);
    s.add(blanket);
    s.add(box(0.6, 0.18, 0.4, lambert('#9b1d22'), -2.8, 0.64, -0.05), box(0.55, 0.2, 0.35, lambert('#5a5f6c'), -2.5, 0.66, 0.15));
    this.led(-2.7, 0.05, 2.08, 1.4, '#ff2030', 'x');
    this.led(-1.98, 0.05, 0.9, 2.3, '#ff2030', 'z');

    // Póster con la portada (pared del fondo, izquierda).
    const posterImg = portadaTexture();
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.4), new THREE.MeshLambertMaterial({ map: posterImg }));
    posterImg.repeat.set(0.62, 1); posterImg.offset.set(0.19, 0);
    poster.position.set(-2.2, 1.95, -3.18);
    s.add(poster);

    // Estantería con libros, figuras de dinosaurio, globo terráqueo y lámpara de lava.
    const shelfMat = lambert('#1e1b1a');
    for (const y of [0.9, 1.5, 2.1]) s.add(box(1.3, 0.04, 0.35, shelfMat, -0.75, y, -3.0));
    s.add(box(0.04, 2.3, 0.35, shelfMat, -1.4, 1.15, -3.0), box(0.04, 2.3, 0.35, shelfMat, -0.1, 1.15, -3.0));
    ['#7a1f1f', '#203a5c', '#3d2c1a', '#5c1f3a', '#1f4a2e', '#4a3a1a', '#26263a'].forEach((c, i) => {
      const b = box(0.07, 0.32 + (i % 3) * 0.03, 0.22, lambert(c), -1.3 + i * 0.08, 1.08, -3.0);
      s.add(b); this.floaters.push(b);
    });
    const lava = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.3, 12), glow('#ff6a20', 0.85));
    lava.position.set(-0.4, 1.07, -3.0);
    s.add(lava);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.13, 18, 12), glow('#2f8bff', 0.8));
    globe.position.set(-1.05, 1.68, -3.0);
    s.add(globe); this.floaters.push(globe);
    this.figure('t-rex', 0.42, -0.55, 2.13, -3.0, 0.6, buildTRex);
    this.figure('triceratops', 0.28, -0.6, 1.53, -3.0, -0.6, buildTriceratops);
    this.led(-0.75, 2.14, -2.82, 1.3, '#2f6bff', 'x');

    // Neón del cráneo (pared del fondo, derecha).
    const neon = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 0.98), new THREE.MeshBasicMaterial({ map: neonSkullTexture(), transparent: true, toneMapped: false, depthWrite: false }));
    neon.position.set(2.4, 2.35, -3.17);
    s.add(neon);
    const neonLight = new THREE.PointLight('#ff8a30', 3, 3.5, 1.6);
    neonLight.position.set(2.4, 2.3, -2.7);
    s.add(neonLight);
    // Repisa con un geodo morado.
    s.add(box(0.9, 0.04, 0.3, shelfMat, 2.6, 1.6, -3.02));
    const geode = new THREE.Mesh(new THREE.DodecahedronGeometry(0.13, 0), glow('#9b4dff', 0.9));
    geode.position.set(2.75, 1.72, -3.0);
    s.add(geode); this.floaters.push(geode);
    this.led(2.6, 1.58, -2.86, 0.9, '#ff2030', 'x');

    // Escritorio gamer con monitor, teclado RGB, ratón, mando y libros.
    const desk = lambert('#1d1d22');
    s.add(box(2.6, 0.06, 0.85, desk, 1.3, 0.78, -2.45));
    for (const x of [0.1, 2.5]) s.add(box(0.06, 0.78, 0.8, desk, x, 0.39, -2.45));
    this.led(1.3, 0.74, -2.03, 2.6, '#2f6bff', 'x');
    // Monitor
    s.add(box(1.62, 0.95, 0.05, lambert('#0c0c10'), 1.15, 1.4, -2.72));
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.54, 0.87), new THREE.MeshBasicMaterial({ map: monitorTexture(), toneMapped: false }));
    screen.position.set(1.15, 1.4, -2.69);
    s.add(screen);
    s.add(box(0.08, 0.4, 0.06, lambert('#141418'), 1.15, 0.98, -2.75), box(0.5, 0.02, 0.25, lambert('#141418'), 1.15, 0.82, -2.7));
    this.phonePos.set(1.15, 1.4, -2.68);
    // Teclado con luz y ratón
    s.add(box(0.7, 0.025, 0.22, lambert('#101014'), 1.0, 0.825, -2.2));
    const keys = new THREE.Mesh(new THREE.PlaneGeometry(0.66, 0.18), glow('#5a7bff', 0.55));
    keys.rotation.x = -Math.PI / 2; keys.position.set(1.0, 0.84, -2.2);
    s.add(keys);
    s.add(box(0.36, 0.005, 0.28, glow('#181018'), 1.65, 0.812, -2.2));
    s.add(box(0.07, 0.035, 0.11, lambert('#16161a'), 1.65, 0.83, -2.2));
    const pad = box(0.22, 0.05, 0.13, lambert('#e8e8ec'), 2.1, 0.84, -2.15);
    s.add(pad); this.floaters.push(pad);
    // Libros: Dinosaurios, Viajes en el tiempo, Supervivencia.
    [['DINOSAURIOS', '#7a1f1f'], ['VIAJES EN EL TIEMPO', '#1f2f4a'], ['SUPERVIVENCIA', '#232830']].forEach(([title, col], i) => {
      const side = new THREE.MeshLambertMaterial({ map: bookTexture(title, col) });
      const plain = lambert(col);
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.09, 0.34), [plain, plain, plain, plain, side, plain]);
      b.position.set(2.25, 0.86 + i * 0.09, -2.25 - 0.08 * 0);
      b.rotation.y = (i - 1) * 0.06;
      s.add(b); this.floaters.push(b);
    });
    // Lapicero, botella y "dispositivo portal" con anillo brillante.
    s.add(box(0.08, 0.14, 0.08, lambert('#141418'), 1.95, 0.88, -2.6));
    s.add(new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 12), lambert('#141418')).translateX(2.45).translateY(0.96).translateZ(-2.6));
    const device = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.03, 8, 28), glow('#45c8ff'));
    device.position.set(0.3, 0.98, -2.6);
    s.add(device, box(0.2, 0.05, 0.12, lambert('#26262c'), 0.3, 0.83, -2.6)); this.floaters.push(device);

    // Mochila en el suelo.
    s.add(box(0.36, 0.45, 0.2, lambert('#1c1f26'), -1.6, 0.23, -1.2));

    // Silla gamer roja y negra.
    const black = lambert('#141418'), red = lambert('#b01822');
    const chair = new THREE.Group();
    chair.add(box(0.55, 0.1, 0.55, black, 0, 0.5, 0));
    chair.add(box(0.5, 0.62, 0.1, black, 0, 0.86, 0.27));
    chair.add(box(0.07, 0.62, 0.11, red, -0.2, 0.86, 0.27), box(0.07, 0.62, 0.11, red, 0.2, 0.86, 0.27));
    chair.add(box(0.06, 0.45, 0.06, black, 0, 0.25, 0));
    chair.add(box(0.06, 0.05, 0.4, black, -0.3, 0.68, 0.05), box(0.06, 0.05, 0.4, black, 0.3, 0.68, 0.05));
    for (let i = 0; i < 5; i++) {
      const leg = box(0.05, 0.04, 0.32, black, 0, 0.04, 0);
      leg.rotation.y = (i / 5) * Math.PI * 2; leg.translateZ(0.16);
      chair.add(leg);
    }
    chair.position.set(1.1, 0, -1.45);
    s.add(chair);

    // Niño sentado frente a la computadora, con auriculares.
    this.kid.sitting = true;
    this.kid.sitHead = 0.05;
    this.kid.root.position.set(1.1, 0.02, -1.5);
    this.kid.root.rotation.y = Math.PI;
    s.add(this.kid.root);
    const phones = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 20, Math.PI), black);
    phones.position.set(1.1, 1.45, -1.5); phones.rotation.y = Math.PI / 2;
    // Los auriculares están colgados del cuello (se ven como un arco bajo la cabeza).
    phones.rotation.x = Math.PI;
    phones.position.y = 1.18;
    s.add(phones);

    // Luces: poca luz ambiente; la pantalla, los LED y el neón dan el color.
    s.add(new THREE.HemisphereLight('#6a7ac0', '#2a1818', 1.2));
    const fill = new THREE.PointLight('#8a9cff', 2.5, 7, 1.2);
    fill.position.set(0, 2.6, 0.5);
    s.add(fill);
    const moon = new THREE.DirectionalLight('#7f98e0', 0.5);
    moon.position.set(-4, 3, -1);
    s.add(moon);
    const red1 = new THREE.PointLight('#ff2030', 4, 4.5, 1.4);
    red1.position.set(-2.5, 0.3, 1.5);
    const blue1 = new THREE.PointLight('#2f6bff', 3.5, 4.5, 1.4);
    blue1.position.set(-0.7, 2.0, -2.6);
    s.add(red1, blue1);
    this.phoneLight = new THREE.PointLight('#5fb8ff', 3, 4, 1.2);
    this.phoneLight.position.copy(this.phonePos).add(new THREE.Vector3(0, 0, 0.5));
    s.add(this.phoneLight);

    // Portal temporal: anillos que salen de la pantalla.
    this.portal = new THREE.Group();
    this.portal.position.copy(this.phonePos).add(new THREE.Vector3(0, 0, 0.25));
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.42 + i * 0.16, 0.035 + i * 0.01, 8, 48),
        new THREE.MeshBasicMaterial({ color: ['#7df9ff', '#4d8bff', '#ffffff'][i], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
      );
      this.portal.add(ring);
    }
    this.portal.scale.setScalar(0.001);
    s.add(this.portal);
  }

  /** Tira LED (brilla y "respira" suavemente). */
  private led(x: number, y: number, z: number, len: number, color: string, axis: 'x' | 'z') {
    const m = glow(color);
    m.transparent = true;
    this.leds.push(m);
    this.scene.add(box(axis === 'x' ? len : 0.025, 0.025, axis === 'z' ? len : 0.025, m, x, y, z));
  }

  /** Figura de dinosaurio para la estantería (modelo CC0 si está cargado). */
  private figure(name: 't-rex' | 'triceratops', height: number, x: number, y: number, z: number, rotY: number, fallback: typeof buildTRex) {
    let root: THREE.Object3D;
    if (hasQuat(name)) {
      const rig = buildQuatDino(name, { height, speciesScale: 1, biped: name === 't-rex', colors: { Green: '#7a6a4e', LightGreen: '#b9a98a', Purple: '#8a8378', LightBrown: '#c9bfa8', Brown: '#e8dcc0', Red: '#7a2a25', LightYellow: '#e6dcc0' } });
      rig.clips?.update(0.5, 0, 1, 2);
      root = rig.root;
    } else {
      root = fallback().root;
      root.scale.setScalar(height / 4.5);
    }
    root.position.set(x, y, z);
    root.rotation.y = rotY;
    this.scene.add(root);
    this.floaters.push(root);
  }

  /** Brillo de los LED y del neón. */
  update(dt: number) {
    this.time += dt;
    const k = 0.85 + Math.sin(this.time * 1.5) * 0.15;
    for (const m of this.leds) m.opacity = k;
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => {
          (mm as THREE.MeshBasicMaterial).map?.dispose();
          mm.dispose();
        });
      }
    });
  }
}

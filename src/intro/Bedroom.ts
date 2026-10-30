import * as THREE from 'three';
import { CharacterModel } from '../player/CharacterModel';
import { buildTriceratops } from '../creatures/dinoModels';

const lambert = (c: THREE.ColorRepresentation, extra: THREE.MeshLambertMaterialParameters = {}) =>
  new THREE.MeshLambertMaterial({ color: c, flatShading: true, ...extra });

function box(w: number, h: number, d: number, m: THREE.Material, x: number, y: number, z: number) {
  const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  o.position.set(x, y, z);
  return o;
}

/** Póster original dibujado en un canvas: silueta de dinosaurio y texto. */
function posterTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 340;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 340);
  grad.addColorStop(0, '#ffb347'); grad.addColorStop(1, '#e8553e');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 340);
  g.fillStyle = '#ffe9a8';
  g.beginPath(); g.arc(128, 150, 80, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#2b1a12';
  // Silueta de saurópodo
  g.beginPath();
  g.ellipse(120, 200, 55, 30, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(150, 190); g.quadraticCurveTo(185, 120, 175, 80); g.lineTo(190, 78); g.quadraticCurveTo(200, 130, 168, 205); g.fill();
  g.beginPath(); g.ellipse(186, 78, 14, 8, -0.2, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(70, 195); g.quadraticCurveTo(30, 200, 15, 230); g.quadraticCurveTo(45, 212, 75, 215); g.fill();
  for (const x of [85, 105, 135, 155]) g.fillRect(x, 215, 13, 45);
  g.fillRect(0, 258, 256, 6);
  g.fillStyle = '#fff8e6'; g.font = 'bold 34px Trebuchet MS, sans-serif'; g.textAlign = 'center';
  g.fillText('¡DINOS!', 128, 305);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function windowTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 192;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, 192);
  grad.addColorStop(0, '#0b1640'); grad.addColorStop(1, '#2a3f7a');
  g.fillStyle = grad; g.fillRect(0, 0, 256, 192);
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${0.4 + Math.random() * 0.6})`; g.fillRect(Math.random() * 256, Math.random() * 140, 2, 2); }
  g.fillStyle = '#fff6cf'; g.beginPath(); g.arc(190, 50, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0b1640'; g.beginPath(); g.arc(200, 44, 20, 0, Math.PI * 2); g.fill();
  g.fillStyle = '#0d1a2e';
  for (let x = 0; x < 256; x += 28) { const h = 25 + ((x * 37) % 40); g.fillRect(x, 192 - h, 24, h); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Cuarto del niño para la introducción. */
export class Bedroom {
  readonly scene = new THREE.Scene();
  readonly kid = new CharacterModel();
  readonly phoneLight: THREE.PointLight;
  readonly portal: THREE.Group;
  readonly floaters: THREE.Object3D[] = [];
  /** Punto donde está el celular (para encuadrar la cámara). */
  readonly phonePos = new THREE.Vector3();

  constructor() {
    const s = this.scene;
    s.background = new THREE.Color('#120d1c');

    const room = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 6), [
      lambert('#6d8fb5', { side: THREE.BackSide }), lambert('#6d8fb5', { side: THREE.BackSide }),
      lambert('#e9e2d0', { side: THREE.BackSide }), lambert('#a5713f', { side: THREE.BackSide }),
      lambert('#7b9cc0', { side: THREE.BackSide }), lambert('#6d8fb5', { side: THREE.BackSide }),
    ]);
    room.position.y = 1.5;
    s.add(room);
    // Tablas del suelo
    for (let i = -2.5; i <= 2.5; i += 0.5) s.add(box(0.02, 0.005, 6, lambert('#8b5a2e'), i, 0.003, 0));

    // Ventana nocturna
    const win = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.2), new THREE.MeshBasicMaterial({ map: windowTexture() }));
    win.position.set(0.6, 1.75, -2.98);
    s.add(win);
    const frame = lambert('#f4efe3');
    s.add(box(1.75, 0.08, 0.06, frame, 0.6, 2.38, -2.96), box(1.75, 0.08, 0.06, frame, 0.6, 1.12, -2.96));
    s.add(box(0.08, 1.3, 0.06, frame, -0.24, 1.75, -2.96), box(0.08, 1.3, 0.06, frame, 1.44, 1.75, -2.96), box(0.05, 1.2, 0.05, frame, 0.6, 1.75, -2.95));

    // Cama
    s.add(box(1.3, 0.35, 2.3, lambert('#7a4b2a'), -2.3, 0.18, -1.0));
    s.add(box(1.2, 0.2, 2.2, lambert('#f2f2f2'), -2.3, 0.45, -1.0));
    s.add(box(1.25, 0.08, 1.4, lambert('#3a6fd8'), -2.3, 0.58, -0.6));
    s.add(box(0.8, 0.16, 0.45, lambert('#ffffff'), -2.3, 0.62, -1.85));
    s.add(box(1.3, 0.9, 0.1, lambert('#7a4b2a'), -2.3, 0.6, -2.15));

    // Escritorio, lámpara y juguete
    const wood = lambert('#b07a45');
    s.add(box(1.4, 0.06, 0.7, wood, 1.9, 0.78, -2.5));
    for (const [x, z] of [[1.25, -2.8], [2.55, -2.8], [1.25, -2.2], [2.55, -2.2]]) s.add(box(0.06, 0.78, 0.06, wood, x, 0.39, z));
    s.add(box(0.12, 0.04, 0.12, lambert('#333'), 2.35, 0.83, -2.65));
    s.add(box(0.03, 0.4, 0.03, lambert('#333'), 2.35, 1.03, -2.65));
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.18, 10, 1, true), lambert('#ffcf4a', { side: THREE.DoubleSide, emissive: '#ffb020', emissiveIntensity: 0.6 }));
    shade.position.set(2.35, 1.25, -2.65);
    s.add(shade);
    const toy = buildTriceratops();
    toy.root.scale.setScalar(0.09);
    toy.root.position.set(1.7, 0.81, -2.45);
    toy.root.rotation.y = 0.8;
    s.add(toy.root);
    this.floaters.push(toy.root);

    // Estante con libros
    s.add(box(1.4, 0.05, 0.3, wood, -0.6, 1.9, -2.85));
    const colors = ['#e74c3c', '#f1c40f', '#2ecc71', '#9b59b6', '#3498db', '#e67e22'];
    colors.forEach((c, i) => {
      const b = box(0.12, 0.3 + (i % 3) * 0.04, 0.22, lambert(c), -1.15 + i * 0.16, 2.08, -2.85);
      s.add(b); this.floaters.push(b);
    });

    // Póster
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 1.06), new THREE.MeshLambertMaterial({ map: posterTexture() }));
    poster.position.set(-2.98, 1.75, 0.6);
    poster.rotation.y = Math.PI / 2;
    s.add(poster);

    // Alfombra y pelota
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.1, 24), lambert('#d9534f'));
    rug.rotation.x = -Math.PI / 2; rug.position.set(0.2, 0.01, 0.4);
    s.add(rug);
    const ball = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 8), lambert('#ffcf4a'));
    ball.position.set(0.9, 0.14, 0.9);
    s.add(ball); this.floaters.push(ball);

    // Niño sentado en el borde de la cama, mirando el celular
    this.kid.sitting = true;
    this.kid.root.position.set(-1.62, 0.12, -0.7);
    this.kid.root.rotation.y = Math.PI / 2;
    s.add(this.kid.root);
    this.phonePos.set(-1.25, 0.95, -0.7);

    // Luces: ambiente, luna y lámpara
    s.add(new THREE.HemisphereLight('#8fa6d6', '#3a2a20', 0.9));
    const moon = new THREE.DirectionalLight('#9fb8ff', 0.8);
    moon.position.set(1, 3, -5);
    s.add(moon);
    const lamp = new THREE.PointLight('#ffc070', 6, 6, 1.5);
    lamp.position.set(2.35, 1.2, -2.5);
    s.add(lamp);
    this.phoneLight = new THREE.PointLight('#5fe0ff', 0.5, 3, 1.5);
    this.phoneLight.position.copy(this.phonePos).add(new THREE.Vector3(0.15, 0.1, 0));
    s.add(this.phoneLight);

    // Portal temporal (anillos brillantes que crecen desde el celular)
    this.portal = new THREE.Group();
    this.portal.position.copy(this.phonePos).add(new THREE.Vector3(0.6, 0.3, 0));
    this.portal.rotation.y = Math.PI / 2;
    for (let i = 0; i < 3; i++) {
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(0.5 + i * 0.18, 0.04 + i * 0.01, 8, 48),
        new THREE.MeshBasicMaterial({ color: ['#7df9ff', '#b07dff', '#ffffff'][i], transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false }),
      );
      this.portal.add(ring);
    }
    this.portal.scale.setScalar(0.001);
    s.add(this.portal);
  }

  dispose() {
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        (Array.isArray(m.material) ? m.material : [m.material]).forEach((mm) => {
          const map = (mm as THREE.MeshBasicMaterial).map;
          map?.dispose();
          mm.dispose();
        });
      }
    });
  }
}

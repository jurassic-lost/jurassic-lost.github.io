import * as THREE from 'three';
import { rng } from './math';

/**
 * Texturas procedurales generadas en canvas al arrancar: no hay archivos de imagen
 * externos, todo es original y libre de licencias.
 */
function canvas(size: number) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  return [c, c.getContext('2d')!] as const;
}

function toTexture(c: HTMLCanvasElement, srgb = true, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  t.needsUpdate = true;
  return t;
}

/** Detalle del suelo en escala de grises (multiplica el color por vértice): hierba, tierra y piedrecitas. */
export function groundDetail(): THREE.CanvasTexture {
  const S = 512, [c, g] = canvas(S), r = rng(11);
  g.fillStyle = '#c8c8c8'; g.fillRect(0, 0, S, S);
  // Manchas suaves
  for (let i = 0; i < 260; i++) {
    const v = 150 + r() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.18)`;
    g.beginPath(); g.arc(r() * S, r() * S, 10 + r() * 40, 0, Math.PI * 2); g.fill();
  }
  // Briznas de hierba
  for (let i = 0; i < 9000; i++) {
    const x = r() * S, y = r() * S, l = 4 + r() * 9, a = -Math.PI / 2 + (r() - 0.5) * 0.9;
    const v = 120 + r() * 135;
    g.strokeStyle = `rgba(${v},${v},${v},0.55)`;
    g.lineWidth = 1 + r();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  // Piedrecitas
  for (let i = 0; i < 160; i++) {
    const v = 90 + r() * 80;
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.beginPath(); g.ellipse(r() * S, r() * S, 1 + r() * 3, 1 + r() * 2, r() * 3, 0, Math.PI * 2); g.fill();
  }
  // Repite los bordes para que la textura encaje sin costuras
  const t = toTexture(seamless(c), true);
  return t;
}

/** Mezcla los bordes de un canvas con su versión desplazada para que se repita sin costuras. */
function seamless(src: HTMLCanvasElement): HTMLCanvasElement {
  const S = src.width, [c, g] = canvas(S);
  g.drawImage(src, 0, 0);
  const [m, mg] = canvas(S);
  mg.drawImage(src, -S / 2, -S / 2); mg.drawImage(src, S / 2, -S / 2); mg.drawImage(src, -S / 2, S / 2); mg.drawImage(src, S / 2, S / 2);
  // Máscara radial: centro = original desplazado, bordes = original
  const grad = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S * 0.7);
  grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(0.55, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,1)');
  const [mask, mk] = canvas(S);
  mk.drawImage(m, 0, 0);
  mk.globalCompositeOperation = 'destination-in';
  mk.fillStyle = grad; mk.fillRect(0, 0, S, S);
  g.drawImage(mask, 0, 0);
  return c;
}

/** Racimo de hojas con transparencia para las copas de los árboles. */
export function leafCluster(base: [number, number, number]): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S), r = rng(base[0] * 7 + 3);
  for (let i = 0; i < 70; i++) {
    const x = 30 + r() * (S - 60), y = 30 + r() * (S - 60);
    const d = Math.hypot(x - S / 2, y - S / 2);
    if (d > S * 0.46) continue;
    const l = 0.75 + r() * 0.5;
    g.fillStyle = `rgb(${base[0] * l | 0},${base[1] * l | 0},${base[2] * l | 0})`;
    g.save(); g.translate(x, y); g.rotate(r() * Math.PI * 2);
    g.beginPath(); g.ellipse(0, 0, 7 + r() * 6, 17 + r() * 10, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(30,50,20,0.5)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, -18); g.lineTo(0, 18); g.stroke();
    g.restore();
  }
  return toTexture(c, true, false);
}

/** Fronda de helecho/palmera: tallo central con foliolos. */
export function frond(): THREE.CanvasTexture {
  const W = 128, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, r = rng(5);
  g.strokeStyle = '#4d6a26'; g.lineWidth = 4;
  g.beginPath(); g.moveTo(W / 2, H); g.lineTo(W / 2, 6); g.stroke();
  for (let y = H - 20; y > 10; y -= 9) {
    const t = y / H, len = (W / 2 - 4) * Math.sin(Math.min(1, (1 - t) * 1.2 + 0.1) * Math.PI) * 0.95;
    for (const s of [-1, 1]) {
      const v = 0.8 + r() * 0.3;
      g.fillStyle = `rgb(${70 * v | 0},${130 * v | 0},${45 * v | 0})`;
      g.beginPath();
      g.moveTo(W / 2, y);
      g.quadraticCurveTo(W / 2 + s * len * 0.6, y - 10, W / 2 + s * len, y - 16);
      g.quadraticCurveTo(W / 2 + s * len * 0.5, y + 2, W / 2, y + 5);
      g.fill();
    }
  }
  return toTexture(c, true, false);
}

/** Hoja ancha de planta de sotobosque (tipo "oreja de elefante") con nervios. */
export function broadLeaf(): THREE.CanvasTexture {
  const W = 256, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, H, 0, 0);
  grad.addColorStop(0, '#3d6e26'); grad.addColorStop(0.6, '#5c9236'); grad.addColorStop(1, '#79a845');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(W / 2, H - 4);
  g.bezierCurveTo(W * 1.05, H * 0.75, W * 0.95, H * 0.12, W / 2, 6);
  g.bezierCurveTo(W * 0.05, H * 0.12, -W * 0.05, H * 0.75, W / 2, H - 4);
  g.fill();
  g.strokeStyle = 'rgba(210,230,150,0.55)'; g.lineWidth = 5;
  g.beginPath(); g.moveTo(W / 2, H - 4); g.lineTo(W / 2, 14); g.stroke();
  g.lineWidth = 2; g.strokeStyle = 'rgba(200,225,140,0.35)';
  for (let y = H - 50; y > 40; y -= 34) for (const sd of [-1, 1]) {
    g.beginPath(); g.moveTo(W / 2, y); g.quadraticCurveTo(W / 2 + sd * W * 0.22, y - 20, W / 2 + sd * W * 0.4, y - 60); g.stroke();
  }
  return toTexture(c, true, false);
}

/** Matojo de hierba con transparencia. */
export function grassBlades(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S), r = rng(9);
  for (let i = 0; i < 70; i++) {
    const x = 10 + r() * (S - 20), h = S * (0.45 + r() * 0.55), bend = (r() - 0.5) * 60, w = 3 + r() * 4;
    const grad = g.createLinearGradient(0, S, 0, S - h);
    const v = 0.8 + r() * 0.35;
    grad.addColorStop(0, `rgb(${40 * v | 0},${75 * v | 0},${25 * v | 0})`);
    grad.addColorStop(1, `rgb(${130 * v | 0},${180 * v | 0},${70 * v | 0})`);
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x - w, S); g.quadraticCurveTo(x + bend * 0.3, S - h * 0.6, x + bend, S - h); g.quadraticCurveTo(x + bend * 0.3 + w * 0.3, S - h * 0.6, x + w, S); g.fill();
  }
  return toTexture(c, true, false);
}

/** Corteza con vetas verticales. */
export function bark(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S), r = rng(21);
  g.fillStyle = '#6a4a2e'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 260; i++) {
    const x = r() * S, v = r();
    g.strokeStyle = v > 0.5 ? `rgba(40,25,12,${0.3 + r() * 0.4})` : `rgba(150,115,80,${0.2 + r() * 0.3})`;
    g.lineWidth = 1 + r() * 3;
    g.beginPath(); g.moveTo(x, 0);
    let xx = x;
    for (let y = 0; y <= S; y += 16) { xx += (r() - 0.5) * 4; g.lineTo(xx, y); }
    g.stroke();
  }
  return toTexture(c, true);
}

/** Piel con escamas (celdas) en escala de grises; se tiñe con el color del material. */
export function scales(): THREE.CanvasTexture {
  const S = 512, [c, g] = canvas(S), r = rng(33);
  g.fillStyle = '#9a9a9a'; g.fillRect(0, 0, S, S);
  const pts: [number, number][] = [];
  for (let i = 0; i < 900; i++) pts.push([r() * S, r() * S]);
  for (const [x, y] of pts) {
    const v = 150 + r() * 90, rad = 5 + r() * 7;
    const grad = g.createRadialGradient(x - 2, y - 2, 1, x, y, rad);
    grad.addColorStop(0, `rgb(${v},${v},${v})`); grad.addColorStop(1, 'rgba(80,80,80,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  // Rayas oscuras suaves
  for (let i = 0; i < 14; i++) {
    g.fillStyle = 'rgba(40,40,40,0.25)';
    const x = (i / 14) * S + r() * 10;
    g.beginPath(); g.ellipse(x, S / 2, 6 + r() * 8, S * 0.28, 0, 0, Math.PI * 2); g.fill();
  }
  return toTexture(seamless(c), true);
}

/** Mapa de normales de ondas para el agua (a partir de ruido suave). */
export function waterNormals(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S), r = rng(77);
  const h = new Float32Array(S * S);
  const waves = Array.from({ length: 10 }, () => [r() * 6 + 2 | 0, r() * 6 + 2 | 0, r() * 6.28, 0.5 + r()]);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    let v = 0;
    for (const [kx, ky, ph, a] of waves) v += Math.sin(((x * kx + y * ky) / S) * Math.PI * 2 + ph) * a;
    h[y * S + x] = v;
  }
  const img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const dx = h[y * S + ((x + 1) % S)] - h[y * S + ((x - 1 + S) % S)];
    const dy = h[((y + 1) % S) * S + x] - h[((y - 1 + S) % S) * S + x];
    const n = new THREE.Vector3(-dx * 0.6, -dy * 0.6, 1).normalize();
    const k = (y * S + x) * 4;
    img.data[k] = (n.x * 0.5 + 0.5) * 255; img.data[k + 1] = (n.y * 0.5 + 0.5) * 255; img.data[k + 2] = (n.z * 0.5 + 0.5) * 255; img.data[k + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return toTexture(c, false);
}

/** Uniforme de tiempo compartido para el viento en hojas e hierba. */
export const windTime = { value: 0 };

/** Añade balanceo por viento a un material instanciado (más fuerte arriba). */
export function addWind(mat: THREE.Material, strength: number, heightScale: number) {
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = windTime;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        {
          vec4 wp = vec4(transformed, 1.0);
          #ifdef USE_INSTANCING
            wp = instanceMatrix * wp;
          #endif
          float k = clamp(position.y / ${heightScale.toFixed(2)}, 0.0, 1.0);
          k *= k;
          float w = sin(uTime * 1.7 + wp.x * 0.35 + wp.z * 0.27) + 0.5 * sin(uTime * 3.1 + wp.x * 0.9);
          transformed.x += w * ${strength.toFixed(3)} * k;
          transformed.z += w * ${(strength * 0.6).toFixed(3)} * k;
        }`);
    // Follaje: ambas caras se iluminan igual (sin invertir la normal en la cara trasera).
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <normal_fragment_begin>',
      THREE.ShaderChunk.normal_fragment_begin.replace('normal *= faceDirection;', ''),
    );
  };
}

/** Agujas de conífera con transparencia (ramas en abanico). */
export function needles(): THREE.CanvasTexture {
  const S = 256, [c, g] = canvas(S), r = rng(55);
  for (let i = 0; i < 26; i++) {
    const x0 = S / 2 + (r() - 0.5) * 40, y0 = S * 0.95, ang = -Math.PI / 2 + (r() - 0.5) * 1.6, len = S * (0.5 + r() * 0.4);
    const x1 = x0 + Math.cos(ang) * len, y1 = y0 + Math.sin(ang) * len;
    g.strokeStyle = '#3b2a1a'; g.lineWidth = 2;
    g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    for (let k = 0; k < 40; k++) {
      const t = k / 40, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, v = 0.7 + r() * 0.4;
      g.strokeStyle = `rgb(${38 * v | 0},${78 * v | 0},${42 * v | 0})`;
      g.lineWidth = 1.5;
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(ang + s * 1.1) * 9, y + Math.sin(ang + s * 1.1) * 9); g.stroke(); }
    }
  }
  return toTexture(c, true, false);
}

/** Nube suave con transparencia. */
export function cloud(seed: number): THREE.CanvasTexture {
  const W = 512, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!, r = rng(seed);
  for (let i = 0; i < 60; i++) {
    const x = W * (0.15 + r() * 0.7), y = H * (0.35 + r() * 0.35) - Math.sin(((x / W) - 0.15) / 0.7 * Math.PI) * H * 0.2, rad = 30 + r() * 60;
    const shade = y > H * 0.6 ? 215 : 255;
    const grad = g.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, `rgba(${shade},${shade},${shade + 5 > 255 ? 255 : shade + 5},0.55)`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill();
  }
  return toTexture(c, true, false);
}

/** Haz de luz vertical suave (rayos de sol entre los árboles). */
export function lightShaft(): THREE.CanvasTexture {
  const W = 64, H = 256;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const gx = g.createLinearGradient(0, 0, W, 0);
  gx.addColorStop(0, 'rgba(255,240,200,0)'); gx.addColorStop(0.5, 'rgba(255,240,200,1)'); gx.addColorStop(1, 'rgba(255,240,200,0)');
  g.fillStyle = gx; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = 'destination-in';
  const gy = g.createLinearGradient(0, 0, 0, H);
  gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.2, 'rgba(0,0,0,0.9)'); gy.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = gy; g.fillRect(0, 0, W, H);
  return toTexture(c, true, false);
}

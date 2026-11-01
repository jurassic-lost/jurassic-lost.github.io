import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { applyReptileSkin } from './skin';
import type { DinoRig } from './dinoModels';

/**
 * Dinosaurios con esqueleto y animaciones reales: paquete "Animated LowPoly
 * Dinosaurs" de Quaternius (CC0, ver public/models/quaternius/CREDITOS.txt).
 * Se recolorean con tonos naturales, se suavizan y llevan la piel de escamas PBR.
 * Miran a +Z, como el juego. Si no se cargan, el juego usa los modelos procedurales.
 */
// El velocirraptor es Kiro, el compañero de la historia. El parasaurolofo aún no se usa.
export const QUAT_NAMES = ['t-rex', 'triceratops', 'stegosaurus', 'apatosaurus', 'trex-real', 'velociraptor'] as const;
/** Modelos con texturas propias (no se recolorean): el T-rex realista que trajo Ivan. */
const TEXTURED: readonly QuatName[] = ['trex-real'];
const FILE: Partial<Record<QuatName, string>> = { 'trex-real': './models/trex/trex.glb' };
export type QuatName = (typeof QUAT_NAMES)[number];

interface QuatSource { scene: THREE.Object3D; clips: THREE.AnimationClip[] }
const sources = new Map<QuatName, QuatSource>();

export async function preloadQuatModels() {
  // Los archivos están descomprimidos (sin meshopt): así no hace falta WebAssembly,
  // que algunos visores bloquean por seguridad.
  const loader = new GLTFLoader();
  const inline = (window as unknown as { __GLB?: Record<string, string> }).__GLB;
  await Promise.all(QUAT_NAMES.map(async (name) => {
    try {
      const data = inline?.['q_' + name];
      // Incrustado: se decodifica aquí y se analiza sin descargar nada (algunos visores no permiten fetch de data:).
      const gltf = data
        ? await loader.parseAsync(dataUrlToBuffer(data), '')
        : await loader.loadAsync(FILE[name] ?? `./models/quaternius/${name}.glb`);
      sources.set(name, { scene: gltf.scene, clips: gltf.animations });
    } catch (e) {
      console.warn('No se pudo cargar el modelo', name, e);
      quatErrors.push(`${name}: ${(e as Error)?.message ?? e}`);
    }
  }));
}

/** Errores de carga (se muestran en pantalla para poder diagnosticarlos). */
export const quatErrors: string[] = [];

/** Pasa un data URL base64 a ArrayBuffer sin usar fetch. */
export function dataUrlToBuffer(url: string) {
  const b64 = url.slice(url.indexOf(',') + 1);
  const bin = atob(b64), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

export const hasQuat = (name: QuatName) => sources.has(name);

type ClipKey = 'idle' | 'walk' | 'run' | 'attack';

/** Animación por clips (sustituye a la animación procedural de patas y cola). */
export class ClipAnimator {
  readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipKey, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private oneShot = false;

  constructor(root: THREE.Object3D, clips: THREE.AnimationClip[]) {
    this.mixer = new THREE.AnimationMixer(root);
    for (const c of clips) {
      const key = (['idle', 'walk', 'run', 'attack'] as ClipKey[]).find((k) => new RegExp(k, 'i').test(c.name));
      if (key && !this.actions.has(key)) this.actions.set(key, this.mixer.clipAction(c));
    }
    const atk = this.actions.get('attack');
    if (atk) { atk.setLoop(THREE.LoopOnce, 1); atk.clampWhenFinished = false; }
    this.mixer.addEventListener('finished', () => { this.oneShot = false; this.current = null; });
    // Cada dinosaurio empieza en un punto distinto del ciclo.
    this.play('idle', 0);
    this.mixer.update(Math.random() * 3);
  }

  private play(key: ClipKey, fade = 0.3) {
    const a = this.actions.get(key) ?? this.actions.get('idle');
    if (!a || a === this.current) return;
    a.reset().fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = a;
  }

  /** Rugido o mordisco (clip de ataque, una vez). */
  roar() {
    if (!this.actions.has('attack') || this.oneShot) return;
    this.oneShot = true;
    this.current = null;
    this.play('attack', 0.15);
  }

  /** speed en m/s; walk/run: velocidades a las que el clip queda natural. */
  update(dt: number, speed: number, walk: number, run: number) {
    if (!this.oneShot) {
      const key: ClipKey = speed > (walk + run) / 2 ? 'run' : speed > 0.25 ? 'walk' : 'idle';
      this.play(key);
      if (this.current && key !== 'idle') this.current.timeScale = THREE.MathUtils.clamp(speed / (key === 'run' ? run : walk), 0.5, 1.8);
    }
    this.mixer.update(dt);
  }
}

export interface QuatOptions {
  /** Altura final en el mundo (m), ya contando la escala de la especie. */
  height: number;
  /** Escala que aplicará Dinosaur a la raíz. */
  speciesScale: number;
  /** Color por nombre de material del archivo. */
  colors: Record<string, string>;
  biped: boolean;
}

const smoothCache = new WeakMap<THREE.BufferGeometry, THREE.BufferGeometry>();

/** Los archivos vienen cuantizados y entrelazados: se pasan a Float32 para poder unir vértices. */
function smoothGeometry(src: THREE.BufferGeometry) {
  let g = new THREE.BufferGeometry();
  for (const [name, attr] of Object.entries(src.attributes)) {
    if (name === 'normal') continue;
    const n = attr.count, sz = attr.itemSize;
    const isIndex = name === 'skinIndex';
    const arr = isIndex ? new Uint16Array(n * sz) : new Float32Array(n * sz);
    for (let i = 0; i < n; i++) for (let k = 0; k < sz; k++) arr[i * sz + k] = attr.getComponent(i, k);
    g.setAttribute(name, new THREE.BufferAttribute(arr, sz));
  }
  if (src.index) g.setIndex(src.index.clone());
  for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
  g = mergeVertices(g, 1e-3);
  g.computeVertexNormals();
  g.computeBoundingBox();
  g.computeBoundingSphere();
  return g;
}

export function buildQuatDino(name: QuatName, o: QuatOptions): DinoRig {
  const src = sources.get(name)!;
  const model = cloneSkinned(src.scene);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model, true);
  const s = o.height / o.speciesScale / Math.max(0.01, box.max.y - box.min.y);
  model.scale.multiplyScalar(s);
  model.position.y = -box.min.y * s;
  const mats = new Map<string, THREE.MeshStandardMaterial>();
  let headBone: THREE.Bone | null = null, neck: THREE.Bone | null = null;
  const tail: THREE.Bone[] = [];
  model.traverse((obj) => {
    const b = obj as THREE.Bone;
    if (b.isBone) {
      if (/^(DEF-)?head$/i.test(b.name)) headBone = b;
      if (/^(DEF-)?neck(\.0?1)?$/i.test(b.name)) neck = b;
      if (/^(DEF-)?tail\.?\d/i.test(b.name)) tail.push(b);
    }
    const m = obj as THREE.SkinnedMesh;
    if (!m.isMesh) return;
    m.castShadow = true;
    m.frustumCulled = false;
    if (TEXTURED.includes(name)) return; // texturas y normales del propio modelo
    // Sombreado suave: se unen los vértices duplicados y se recalculan las normales.
    let smooth = smoothCache.get(m.geometry);
    if (!smooth) {
      smooth = smoothGeometry(m.geometry);
      smoothCache.set(m.geometry, smooth);
    }
    m.geometry = smooth;
    const gb = m.geometry.boundingBox!;
    // Densidad de escamas en unidades del archivo (≈ una escama de 6-8 cm).
    const unitsToWorld = o.height / Math.max(0.01, (gb.max.y - gb.min.y) * 1.2);
    const list = Array.isArray(m.material) ? m.material : [m.material];
    const out = list.map((mm) => {
      const key = mm.name;
      let nm = mats.get(key);
      if (!nm) {
        const eye = /black/i.test(key);
        nm = new THREE.MeshStandardMaterial({
          name: key, color: o.colors[key] ?? (mm as THREE.MeshStandardMaterial).color ?? '#777', roughness: eye ? 0.2 : 0.78, metalness: 0,
        });
        if (!eye) applyReptileSkin(nm, { density: 0.85 * unitsToWorld, bump: 0.9 });
        mats.set(key, nm);
      }
      return nm;
    });
    m.material = Array.isArray(m.material) ? out : out[0];
  });
  // Los huesos de la cola se ordenan de la base a la punta (Tail1 → Tail5).
  tail.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const root = new THREE.Group(), body = new THREE.Group();
  root.add(body);
  body.add(model);
  const head = (headBone ?? neck ?? new THREE.Bone()) as THREE.Bone;
  return {
    root, body, legs: [], neckBones: neck ? [neck] : [], tailBones: tail, headBone: head, biped: o.biped,
    clips: new ClipAnimator(model, src.clips),
  };
}

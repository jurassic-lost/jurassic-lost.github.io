import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import type { Appearance, Gender } from '../profile/types';

/**
 * Personajes con esqueleto (p. ej. exportados desde Mixamo) para sustituir al
 * personaje procedural. Se cargan desde `models/characters/rigged/manifest.json`:
 *
 * {
 *   "boy":  { "model": "nino.glb", "animations": ["idle.glb", "walk.glb", "run.glb", "jump.glb", "crouch.glb", "pickup.glb", "build.glb"] },
 *   "girl": { "model": "nina.glb", "animations": [...] },
 *   "height": 1.5
 * }
 *
 * Los clips se reconocen por su nombre (idle, walk, run, jump, crouch, pick, build…).
 * Si no hay manifiesto o falla la carga, el juego usa el personaje procedural.
 */
type ClipKey = 'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'crouchWalk' | 'pickup' | 'build' | 'hurt' | 'attack';
const CLIP_PATTERNS: [ClipKey, RegExp][] = [
  ['crouchWalk', /crouch.?walk|sneak.?walk/i],
  ['crouch', /crouch|sneak|squat/i],
  ['pickup', /pick|gather|collect/i],
  ['build', /build|hammer|craft/i],
  ['hurt', /hit|hurt|react|impact/i],
  ['attack', /attack|punch|swing|stab|throw/i],
  ['jump', /jump/i],
  ['run', /run|sprint/i],
  ['walk', /walk/i],
  ['idle', /idle|breath|stand/i],
];

interface RigSource { scene: THREE.Object3D; clips: THREE.AnimationClip[] }
const sources = new Map<Gender, RigSource>();
let targetHeight = 1.5;

export async function preloadRiggedCharacters(base = './models/characters/rigged/') {
  const url = (window as unknown as { __RIG_MANIFEST?: string }).__RIG_MANIFEST ?? base + 'manifest.json';
  let manifest: Record<string, unknown>;
  try {
    const r = await fetch(url);
    if (!r.ok) return;
    manifest = await r.json();
  } catch { return; }
  const root = url.slice(0, url.lastIndexOf('/') + 1);
  if (typeof manifest.height === 'number') targetHeight = manifest.height;
  const loader = new GLTFLoader();
  for (const g of ['boy', 'girl'] as Gender[]) {
    const entry = manifest[g] as { model: string; animations?: string[] } | undefined;
    if (!entry?.model) continue;
    try {
      const gltf = await loader.loadAsync(root + entry.model);
      const clips = [...gltf.animations];
      for (const a of entry.animations ?? []) {
        const extra = await loader.loadAsync(root + a);
        // Si el archivo trae un solo clip sin nombre útil, usa el nombre del archivo.
        extra.animations.forEach((c) => { if (extra.animations.length === 1) c.name = a.replace(/\.(glb|gltf)$/i, ''); clips.push(c); });
      }
      sources.set(g, { scene: gltf.scene, clips });
    } catch (e) {
      console.warn('No se pudo cargar el personaje con esqueleto', g, e);
    }
  }
}

export const hasRig = (g: Gender) => sources.has(g);

export class RiggedModel {
  readonly root = new THREE.Group();
  readonly rightHand: THREE.Object3D | null;
  private readonly mixer: THREE.AnimationMixer;
  private readonly actions = new Map<ClipKey, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private oneShot: ClipKey | null = null;
  private readonly materials: THREE.MeshStandardMaterial[] = [];

  constructor(readonly gender: Gender) {
    const src = sources.get(gender)!;
    const model = cloneSkinned(src.scene);
    // Escala a la altura de un niño y apoya los pies en el suelo.
    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model, true);
    const h = box.max.y - box.min.y || 1;
    model.scale.setScalar(targetHeight / h);
    model.position.y = -box.min.y * (targetHeight / h);
    this.root.add(model);
    model.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.frustumCulled = false;
        // Material propio para poder teñirlo sin afectar a otros personajes.
        const mats = (Array.isArray(m.material) ? m.material : [m.material]).map((x) => x.clone() as THREE.MeshStandardMaterial);
        m.material = Array.isArray(m.material) ? mats : mats[0];
        this.materials.push(...mats);
      }
    });
    let hand: THREE.Object3D | null = null;
    model.traverse((o) => { if (!hand && /right.?hand$/i.test(o.name)) hand = o; });
    this.rightHand = hand;

    this.mixer = new THREE.AnimationMixer(model);
    for (const clip of src.clips) {
      const key = CLIP_PATTERNS.find(([, re]) => re.test(clip.name))?.[0];
      if (key && !this.actions.has(key)) this.actions.set(key, this.mixer.clipAction(clip));
    }
    for (const k of ['jump', 'pickup', 'build', 'hurt', 'attack'] as ClipKey[]) {
      const a = this.actions.get(k);
      if (a) { a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; }
    }
    this.mixer.addEventListener('finished', () => { this.oneShot = null; });
    this.play('idle', 0);
  }

  /** Clips encontrados (para diagnóstico y pruebas). */
  get clipNames() { return [...this.actions.keys()]; }

  /** Tiñe los materiales cuyo nombre indica piel, pelo, camiseta o pantalón. */
  tint(a: Appearance) {
    for (const m of this.materials) {
      const n = m.name.toLowerCase();
      if (!m.color) continue;
      if (/skin|piel|body_skin/.test(n)) m.color.set(a.skin);
      else if (/hair|pelo|cabello/.test(n)) m.color.set(a.hairColor);
      else if (/shirt|camiseta|top/.test(n)) m.color.set(a.shirt);
      else if (/pant|trouser|pantal/.test(n)) m.color.set(a.pants);
    }
  }

  private play(key: ClipKey, fade = 0.2) {
    const a = this.actions.get(key) ?? (key === 'crouchWalk' ? this.actions.get('crouch') : undefined) ?? this.actions.get('idle');
    if (!a || a === this.current) return;
    a.reset().fadeIn(fade).play();
    this.current?.fadeOut(fade);
    this.current = a;
  }

  /** Lanza una animación de una sola vez (recoger, construir, golpe, ataque, salto). */
  trigger(key: ClipKey) {
    if (!this.actions.has(key)) return;
    this.oneShot = key;
    this.current = null;
    this.play(key, 0.12);
  }

  update(dt: number, s: { speed: number; grounded: boolean; crouch: boolean }) {
    if (!this.oneShot) {
      let key: ClipKey = 'idle';
      if (!s.grounded && this.actions.has('jump')) key = 'jump';
      else if (s.crouch) key = s.speed > 0.3 ? 'crouchWalk' : 'crouch';
      else if (s.speed > 5.5) key = 'run';
      else if (s.speed > 0.3) key = 'walk';
      this.play(key);
      // Ajusta la velocidad del ciclo de pasos al desplazamiento real.
      if (this.current && (key === 'walk' || key === 'run')) this.current.timeScale = THREE.MathUtils.clamp(s.speed / (key === 'run' ? 6 : 2.2), 0.6, 1.6);
    }
    this.mixer.update(dt);
  }
}

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

/**
 * Etalonaje "de película": contraste suave, tonos cálidos en las luces y
 * fríos en las sombras, algo más de saturación en los verdes y viñeta.
 * Se aplica en espacio lineal, antes del mapeo de tonos de OutputPass.
 */
const GradeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uWarm: { value: 1 },
    uNight: { value: 0 },
    uVignette: { value: 0.32 },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uWarm, uNight, uVignette, uAspect;
    varying vec2 vUv;
    void main() {
      vec4 tex = texture2D(tDiffuse, vUv);
      vec3 c = tex.rgb;
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      // Saturación ligeramente mayor (selva más viva), menos de noche.
      c = mix(vec3(l), c, mix(1.12, 0.85, uNight));
      // Split-toning: sombras azuladas, luces doradas.
      float t = l / (l + 0.6);
      vec3 shadowTint = mix(vec3(0.94, 1.0, 1.08), vec3(0.85, 0.95, 1.2), uNight);
      vec3 lightTint = mix(vec3(1.0), vec3(1.07, 1.0, 0.9), uWarm);
      c *= mix(shadowTint, lightTint, t);
      // Viñeta suave.
      vec2 p = (vUv - 0.5) * vec2(uAspect, 1.0);
      c *= 1.0 - uVignette * smoothstep(0.35, 1.05, length(p));
      gl_FragColor = vec4(c, tex.a);
    }`,
};

export type PostLevel = 'off' | 'grade' | 'full';

/** Posprocesado según la calidad: nada (baja), etalonaje (media) o etalonaje + resplandor (alta). */
export class PostFX {
  private composer: EffectComposer | null = null;
  private grade: ShaderPass | null = null;
  private bloom: UnrealBloomPass | null = null;
  level: PostLevel = 'off';

  constructor(private readonly renderer: THREE.WebGLRenderer, private readonly scene: THREE.Scene, private readonly camera: THREE.Camera) {}

  setLevel(level: PostLevel) {
    if (level === this.level && (level === 'off' || this.composer)) return;
    this.level = level;
    this.composer?.dispose();
    this.composer = null; this.grade = null; this.bloom = null;
    if (level === 'off') return;
    const size = this.renderer.getSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: level === 'full' ? 4 : 0 });
    const c = new EffectComposer(this.renderer, rt);
    c.addPass(new RenderPass(this.scene, this.camera));
    if (level === 'full') {
      // Resplandor sutil del cielo, el agua brillante y las fogatas (a media resolución).
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.32, 0.6, 0.86);
      c.addPass(this.bloom);
    }
    this.grade = new ShaderPass(GradeShader);
    c.addPass(this.grade);
    c.addPass(new OutputPass());
    this.composer = c;
    this.setSize(size.x, size.y);
  }

  setSize(w: number, h: number) {
    if (!this.composer) return;
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(w, h);
    if (this.grade) this.grade.uniforms.uAspect.value = w / Math.max(1, h);
  }

  /** daylight: 1 de día, 0 de noche; dusk: 0..1 cerca del amanecer o atardecer. */
  setMood(daylight: number, dusk: number) {
    if (!this.grade) return;
    this.grade.uniforms.uNight.value = 1 - daylight;
    this.grade.uniforms.uWarm.value = 0.6 + dusk * 0.8;
    if (this.bloom) this.bloom.strength = 0.28 + (1 - daylight) * 0.25;
  }

  render(dt: number) {
    if (this.composer) this.composer.render(dt);
    else this.renderer.render(this.scene, this.camera);
  }
}

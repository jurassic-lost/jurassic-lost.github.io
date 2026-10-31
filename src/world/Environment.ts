import * as THREE from 'three';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { cloud } from '../core/textures';
import { fbm, rng } from '../core/math';
import type { Clock } from './DayNight';

/**
 * Cielo con dispersión atmosférica, niebla, iluminación. La luz del sol sigue al jugador para concentrar las sombras.
 */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly sky: Sky;
  /** Fondo lejano (montañas y nubes) que acompaña a la cámara. */
  readonly backdrop = new THREE.Group();
  private readonly sunOffset: THREE.Vector3;
  readonly sunDir: THREE.Vector3;
  /** Estrellas y luna (solo se ven de noche). */
  private readonly stars: THREE.Points;
  private readonly moon: THREE.Mesh;
  private readonly moonDir = new THREE.Vector3(0, 1, 0);
  private readonly smoke: THREE.Sprite[] = [];
  private smokeT = 0;
  private readonly backdropMats: (THREE.MeshBasicMaterial | THREE.SpriteMaterial)[] = [];
  /** 0 = noche cerrada, 1 = pleno día (lo usan otros sistemas, p. ej. los rayos de sol). */
  daylight = 1;
  /** 0..1 cerca del amanecer y del atardecer (luz dorada). */
  dusk = 0;

  constructor(private readonly scene: THREE.Scene) {
    const fogColor = new THREE.Color('#a8c2cc');
    scene.fog = new THREE.Fog(fogColor, 40, 240);
    scene.background = fogColor;

    const elevation = THREE.MathUtils.degToRad(38), azimuth = THREE.MathUtils.degToRad(140);
    const sunDir = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);
    this.sunOffset = sunDir.clone().multiplyScalar(120);
    this.sunDir = sunDir;

    this.sky = new Sky();
    this.sky.scale.setScalar(440);
    const u = this.sky.material.uniforms;
    u.turbidity.value = 2.5;
    u.rayleigh.value = 2.4;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.85;
    u.sunPosition.value.copy(sunDir);
    this.sky.frustumCulled = false;
    scene.add(this.sky);

    this.buildBackdrop();
    scene.add(this.backdrop);

    this.hemi = new THREE.HemisphereLight('#cfe6ff', '#4d5a2c', 1.6);
    scene.add(this.hemi);

    this.sun = new THREE.DirectionalLight('#fff0d0', 3.2);
    const sc = this.sun.shadow.camera;
    sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 10; sc.far = 260;
    this.sun.shadow.bias = -0.0006;
    this.sun.shadow.normalBias = 0.05;
    scene.add(this.sun, this.sun.target);

    // Cielo nocturno: estrellas en una cúpula y una luna grande y amable.
    const r = rng(31), pos: number[] = [], col: number[] = [];
    for (let i = 0; i < 900; i++) {
      const u = r() * 2 - 1, a = r() * Math.PI * 2, y = Math.abs(u) * 0.95 + 0.05;
      const k = Math.sqrt(1 - y * y);
      pos.push(Math.cos(a) * k * 420, y * 420, Math.sin(a) * k * 420);
      const b = 0.6 + r() * 0.4, warm = r() < 0.2;
      col.push(b, b * (warm ? 0.9 : 0.97), b * (warm ? 0.75 : 1));
    }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    sg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    this.stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 2.2, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    this.stars.frustumCulled = false;
    this.stars.renderOrder = -2;
    this.moon = new THREE.Mesh(new THREE.CircleGeometry(14, 32), new THREE.MeshBasicMaterial({ color: '#f4f1e2', fog: false, transparent: true, opacity: 0, depthWrite: false }));
    this.moon.frustumCulled = false;
    this.moon.renderOrder = -1;
    scene.add(this.stars, this.moon);
  }

  /** Cordilleras lejanas con nieve y nubes (no les afecta la niebla; ya llevan su bruma). */
  private buildBackdrop() {
    const layers: [number, number, number, string, string][] = [
      [430, 150, 1, '#9db4c6', '#f1f5f8'],
      [395, 85, 2, '#7f9a9a', '#dfe8ea'],
    ];
    for (const [radius, peak, seed, haze, snow] of layers) {
      const seg = 256, pos: number[] = [], col: number[] = [];
      const ch = new THREE.Color(haze), cs = new THREE.Color(snow), base = new THREE.Color(haze).multiplyScalar(0.85), c = new THREE.Color();
      const hAt = (i: number) => {
        const a = (i / seg) * Math.PI * 2;
        const n = fbm(Math.cos(a) * 3 + seed * 10, Math.sin(a) * 3, 5) * 0.5 + 0.5;
        return 15 + Math.pow(n, 1.6) * peak * 1.6;
      };
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * Math.PI * 2, a1 = ((i + 1) / seg) * Math.PI * 2;
        const h0 = hAt(i), h1 = hAt(i + 1);
        const p = [
          [Math.cos(a0) * radius, -30, Math.sin(a0) * radius], [Math.cos(a1) * radius, -30, Math.sin(a1) * radius],
          [Math.cos(a0) * radius, h0, Math.sin(a0) * radius], [Math.cos(a1) * radius, h1, Math.sin(a1) * radius],
        ];
        for (const k of [0, 2, 1, 1, 2, 3]) {
          pos.push(...p[k]);
          const y = p[k][1];
          c.copy(base).lerp(ch, Math.min(1, (y + 30) / 60));
          if (y > peak * 0.75) c.lerp(cs, Math.min(1, (y - peak * 0.75) / (peak * 0.3)));
          col.push(c.r, c.g, c.b);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide });
      this.backdropMats.push(mm);
      const m = new THREE.Mesh(g, mm);
      m.renderOrder = -1;
      this.backdrop.add(m);
    }
    // Volcán lejano con su penacho de humo (sensación de mundo prehistórico).
    {
      const seg = 48, rings = 10, pos: number[] = [], col: number[] = [];
      const R = 150, Hv = 150, crater = 0.12, cx = 70, cz = -385;
      const rock = new THREE.Color('#6f6a68'), haze = new THREE.Color('#9fb2c1'), dark = new THREE.Color('#4a4442'), c = new THREE.Color();
      const P = (i: number, j: number) => {
        const t = j / rings, a = (i / seg) * Math.PI * 2;
        const n = fbm(Math.cos(a) * 2 + 7, Math.sin(a) * 2 + t * 3, 3);
        const rad = R * (1 - t * (1 - crater)) * (1 + n * 0.12) * (1 - Math.pow(t, 3) * 0.1);
        const y = -30 + (Hv + 30) * Math.pow(t, 0.85) + n * 6;
        return [cx + Math.cos(a) * rad, y, cz + Math.sin(a) * rad, t, n] as const;
      };
      for (let j = 0; j < rings; j++) for (let i = 0; i < seg; i++) {
        const q = [P(i, j), P(i + 1, j), P(i, j + 1), P(i + 1, j + 1)];
        for (const k of [0, 2, 1, 1, 2, 3]) {
          const [x, y, z, t, n] = q[k];
          pos.push(x, y, z);
          // Barrancos oscuros, más bruma abajo, roca oscura arriba.
          c.copy(rock).lerp(dark, Math.max(0, n) * 1.5 + t * 0.3).lerp(haze, (1 - t) * 0.55);
          col.push(c.r, c.g, c.b);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      const mm = new THREE.MeshBasicMaterial({ vertexColors: true, fog: false });
      this.backdropMats.push(mm);
      const v = new THREE.Mesh(g, mm);
      v.renderOrder = -1;
      this.backdrop.add(v);
      const smokeTex = cloud(7);
      for (let i = 0; i < 9; i++) {
        const sm = new THREE.SpriteMaterial({ map: smokeTex, color: '#6e6a68', fog: false, depthWrite: false, transparent: true, opacity: 0.85 - i * 0.06 });
        this.backdropMats.push(sm);
        const sp = new THREE.Sprite(sm);
        sp.position.set(cx + i * 9, Hv + 8 + i * 16, cz + i * 3);
        const w = 60 + i * 22;
        sp.scale.set(w, w * 0.7, 1);
        sp.userData.smoke = { base: sp.position.clone(), i };
        this.smoke.push(sp);
        this.backdrop.add(sp);
      }
    }
    const r = rng(9);
    const tex = [cloud(1), cloud(2), cloud(3)];
    for (let i = 0; i < 26; i++) {
      const mat = new THREE.SpriteMaterial({ map: tex[i % 3], fog: false, depthWrite: false, transparent: true, opacity: 0.85 + r() * 0.15 });
      this.backdropMats.push(mat);
      const s = new THREE.Sprite(mat);
      const a = r() * Math.PI * 2, d = 250 + r() * 130;
      s.position.set(Math.cos(a) * d, 110 + r() * 90, Math.sin(a) * d);
      const w = 140 + r() * 140;
      s.scale.set(w, w * 0.45, 1);
      this.backdrop.add(s);
    }
  }

  setShadows(enabled: boolean, mapSize: number) {
    this.sun.castShadow = enabled;
    if (this.sun.shadow.mapSize.x !== mapSize) {
      this.sun.shadow.mapSize.set(mapSize, mapSize);
      this.sun.shadow.map?.dispose();
      this.sun.shadow.map = null as unknown as THREE.WebGLRenderTarget;
    }
  }

  private viewDist = 240;
  setViewDistance(d: number) {
    this.viewDist = d;
    const fog = this.scene.fog as THREE.Fog;
    fog.near = d * 0.15;
    fog.far = d;
  }

  /**
   * Ajusta sol, luna, cielo, niebla y luces a la hora del día. La noche es azulada
   * y oscura (con niebla que se acerca), pero siempre se distingue el suelo cercano.
   */
  setTime(c: Clock) {
    const D = THREE.MathUtils.degToRad;
    const day = c.daylight, dusk = Math.max(0, 1 - Math.abs(c.sun) / 0.3) * (c.night ? 0.5 : 1);
    this.daylight = day;
    this.dusk = dusk;
    // El sol cruza de este a oeste; de noche la luz principal es la luna.
    const az = D(70 + c.arc * 140);
    const elev = c.night ? D(25 + Math.sin(c.arc * Math.PI) * 30) : D(4 + Math.max(0, c.sun) * 56);
    const light = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elev, c.night ? az + Math.PI : az);
    this.sunDir.copy(light);
    this.sunOffset.copy(light).multiplyScalar(120);
    const skySun = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - Math.asin(THREE.MathUtils.clamp(c.sun, -1, 1)) * 0.9, az);
    this.sky.material.uniforms.sunPosition.value.copy(skySun);
    this.sky.material.uniforms.rayleigh.value = 2.4 + dusk * 1.5;
    this.sky.visible = day > 0.02;

    const sunCol = new THREE.Color('#fff0d0').lerp(new THREE.Color('#ff9a52'), dusk * 0.8);
    const moonCol = new THREE.Color('#a9bcff');
    this.sun.color.copy(moonCol).lerp(sunCol, day);
    this.sun.intensity = THREE.MathUtils.lerp(0.6, 3.2, day) * (1 - dusk * 0.35);
    this.hemi.color.set('#5a6f9e').lerp(new THREE.Color('#cfe6ff'), day);
    this.hemi.groundColor.set('#1f2a22').lerp(new THREE.Color('#4d5a2c'), day);
    this.hemi.intensity = THREE.MathUtils.lerp(0.62, 1.6, day);

    const fog = this.scene.fog as THREE.Fog;
    // De noche la niebla se acerca: lo que hay a lo lejos se pierde en la oscuridad.
    fog.near = this.viewDist * THREE.MathUtils.lerp(0.06, 0.15, day);
    fog.far = this.viewDist * THREE.MathUtils.lerp(0.5, 1, day);
    fog.color.set('#141d2e').lerp(new THREE.Color('#a8c2cc'), day).lerp(new THREE.Color('#d8a986'), dusk * 0.45 * day);
    (this.scene.background as THREE.Color).copy(fog.color);
    const bd = 0.25 + day * 0.75;
    for (const m of this.backdropMats) m.color.setRGB(bd * (1 - dusk * 0.05), bd * (1 - dusk * 0.15), bd * (1 - dusk * 0.25) + (1 - day) * 0.08);

    const night = 1 - day;
    (this.stars.material as THREE.PointsMaterial).opacity = night * 0.95;
    this.stars.visible = night > 0.02;
    (this.moon.material as THREE.MeshBasicMaterial).opacity = night;
    this.moon.visible = c.night || night > 0.02;
    this.moonDir.copy(c.night ? light : light.clone().negate().setY(0.4).normalize());
  }

  update(focus: THREE.Vector3, camera: THREE.Camera) {
    const snap = 2;
    const fx = Math.round(focus.x / snap) * snap, fz = Math.round(focus.z / snap) * snap;
    this.sun.target.position.set(fx, focus.y, fz);
    this.sun.position.set(fx + this.sunOffset.x, focus.y + this.sunOffset.y, fz + this.sunOffset.z);
    this.sky.position.copy(camera.position);
    this.backdrop.position.set(camera.position.x, 0, camera.position.z);
    this.stars.position.copy(camera.position);
    this.smokeT += 0.016;
    for (const sp of this.smoke) {
      const { base, i } = sp.userData.smoke as { base: THREE.Vector3; i: number };
      sp.position.set(base.x + Math.sin(this.smokeT * 0.05 + i) * 4, base.y + Math.sin(this.smokeT * 0.03 + i * 2) * 3, base.z);
      sp.material.rotation = Math.sin(this.smokeT * 0.02 + i) * 0.3;
    }
    if (this.moon.visible) {
      this.moon.position.copy(camera.position).addScaledVector(this.moonDir, 380);
      this.moon.lookAt(camera.position);
    }
  }
}

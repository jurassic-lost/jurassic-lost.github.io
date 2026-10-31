import * as THREE from 'three';
import { damp } from '../core/math';
import type { Appearance } from '../profile/types';
import { defaultAppearance } from '../profile/appearance';
import { RiggedModel, hasRig } from './RiggedModel';

/**
 * Personaje infantil original hecho con primitivas, con animación procedural:
 * reposo, caminar, correr, saltar, agacharse y recoger.
 */
export type { Appearance };
export type Pose = 'idle' | 'walk' | 'run' | 'jump' | 'crouch' | 'crouchWalk';

const mat = (c: THREE.ColorRepresentation, roughness = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness, metalness: 0, envMapIntensity: 0.25 });
const SHOE = mat('#6b4a2e', 0.85), SOLE = mat('#2e2219', 0.9), PACK = mat('#7a5634', 0.85), PACK_DARK = mat('#5e4128', 0.85), STRAP = mat('#4a3420');
const LACE = mat('#d9c9a3'), METAL = new THREE.MeshStandardMaterial({ color: '#b8bcc0', roughness: 0.35, metalness: 0.8 });
const IRIS = mat('#6b4423', 0.3), BLUSH = new THREE.MeshStandardMaterial({ color: '#f08a7e', transparent: true, opacity: 0.35, roughness: 1 });
const MOUTH = mat('#8a3b2a'), EMBLEM = mat('#3b3127', 0.9);
/** Altura de la cadera: proporciones de un niño de 10-12 años. */
const HIP_Y = 0.68;
const EYE = mat('#1d1d1d', 0.15), WHITE = mat('#ffffff'), PHONE = mat('#222831', 0.3);

function mesh(geo: THREE.BufferGeometry, m: THREE.Material, x = 0, y = 0, z = 0) {
  const o = new THREE.Mesh(geo, m);
  o.position.set(x, y, z);
  o.castShadow = true;
  return o;
}

export class CharacterModel {
  readonly root = new THREE.Group();
  /** Personaje con esqueleto (Mixamo) si hay modelos cargados; si no, null y se usa el procedural. */
  private rig: RiggedModel | null = null;
  // Materiales propios de cada personaje (se cambian al personalizar).
  private readonly mSkin = mat('#e0a77e');
  private readonly mHair = mat('#5a3519', 0.6);
  private readonly mBrow = mat('#3a2210', 0.8);
  private readonly mShirt = mat('#d8c8a8', 0.85);
  private readonly mShirtDark = mat('#b9a987', 0.85);
  private readonly mPants = mat('#5b5d43', 0.9);
  private readonly mPantsDark = mat('#4a4c36', 0.9);
  private readonly hairGroup = new THREE.Group();
  private appearance: Appearance = defaultAppearance('boy');
  private hurtT = -1;
  private buildT = -1;
  /** 0..1: postura de alerta ante un peligro cercano. */
  danger = 0;
  private dangerAmt = 0;
  private readonly hips = new THREE.Group();
  private readonly torso = new THREE.Group();
  private readonly head = new THREE.Group();
  private readonly legL = new THREE.Group();
  private readonly legR = new THREE.Group();
  private readonly kneeL = new THREE.Group();
  private readonly kneeR = new THREE.Group();
  private readonly armL = new THREE.Group();
  private readonly armR = new THREE.Group();
  private readonly elbowL = new THREE.Group();
  private readonly elbowR = new THREE.Group();
  private phase = 0;
  private time = 0;
  private crouchAmt = 0;
  private airAmt = 0;
  private runAmt = 0;
  private moveAmt = 0;
  /** 0..1 progreso de la animación de recoger / interactuar. */
  private pickT = -1;
  /** Punto de agarre de la mano derecha (objeto equipado). */
  readonly hand = new THREE.Group();
  private phone!: THREE.Mesh;
  /** Animación de ataque: 0..1, o -1 si no ataca. */
  private attackT = -1;
  private attackKind: 'swing' | 'thrust' | 'throw' | 'bow' = 'swing';
  /** Mantener el arco apuntando. */
  aiming = false;

  /** Pone un objeto en la mano (o el celular si es null). */
  hold(obj: THREE.Object3D | null) {
    this.hand.clear();
    if (obj) this.hand.add(obj);
    this.phone.visible = !obj;
  }

  playAttack(kind: 'swing' | 'thrust' | 'throw' | 'bow') { this.attackT = 0; this.attackKind = kind; this.rig?.trigger('attack'); }
  get attacking() { return this.attackT >= 0; }

  /** Pose sentada con el celular en las manos (introducción). */
  sitting = false;
  /** Sentado: inclinación de la cabeza (0.45 mira hacia abajo, 0 al frente). */
  sitHead = 0.45;
  /** Sentado: 0..1, estira el brazo izquierdo hacia delante (introducción). */
  reach = 0;
  /** Se llama en cada paso (para sonidos). */
  onStep?: () => void;

  constructor(appearance?: Appearance) {
    const r = this.root;
    r.add(this.hips);
    this.hips.position.y = HIP_Y;
    const cap = (rad: number, len: number) => new THREE.CapsuleGeometry(rad, len, 6, 14);

    // Piernas: pantalón cargo holgado, rodilleras y botas de exploración.
    for (const [leg, knee, side] of [[this.legL, this.kneeL, 1], [this.legR, this.kneeR, -1]] as const) {
      leg.position.set(0.09 * side, 0, 0);
      leg.add(mesh(cap(0.078, 0.2), this.mPants, 0, -0.16, 0));
      // Bolsillo lateral con solapa
      const pocket = mesh(new THREE.BoxGeometry(0.035, 0.11, 0.1), this.mPantsDark, 0.075 * side, -0.2, 0);
      pocket.add(mesh(new THREE.BoxGeometry(0.04, 0.025, 0.105), this.mPantsDark, 0, 0.055, 0));
      leg.add(pocket);
      leg.add(knee);
      knee.position.y = -0.33;
      // Rodillera (más oscura, como la ropa gastada de la hoja de diseño)
      const pad = mesh(new THREE.SphereGeometry(0.06, 14, 10), this.mPantsDark, 0, 0.0, 0.035);
      pad.scale.set(1, 1.1, 0.6);
      knee.add(pad);
      knee.add(mesh(cap(0.074, 0.17), this.mPants, 0, -0.12, 0));
      // Dobladillo arremangado
      const cuff = mesh(new THREE.TorusGeometry(0.072, 0.02, 8, 18), this.mPantsDark, 0, -0.235, 0);
      cuff.rotation.x = Math.PI / 2;
      knee.add(cuff);
      // Bota: caña, empeine redondeado, suela gruesa y cordones
      knee.add(mesh(new THREE.CylinderGeometry(0.068, 0.072, 0.1, 16), SHOE, 0, -0.27, 0));
      const toe = mesh(new THREE.SphereGeometry(0.075, 16, 12), SHOE, 0, -0.31, 0.055);
      toe.scale.set(1, 0.72, 1.45);
      knee.add(toe);
      const sole = mesh(new THREE.BoxGeometry(0.15, 0.04, 0.26), SOLE, 0, -0.355, 0.035);
      knee.add(sole);
      for (let i = 0; i < 3; i++) knee.add(mesh(new THREE.BoxGeometry(0.07, 0.008, 0.012), LACE, 0, -0.24 - i * 0.025, 0.07 + i * 0.008));
      this.hips.add(leg);
    }
    const pelvis = mesh(new THREE.SphereGeometry(0.16, 18, 12), this.mPants, 0, 0.0, 0);
    pelvis.scale.set(1.12, 0.62, 0.8);
    this.hips.add(pelvis);

    // Torso: camiseta con forma (pecho, cintura) y emblema original de huella.
    this.hips.add(this.torso);
    this.torso.position.y = 0.06;
    const profile = [[0.0, -0.02], [0.155, -0.02], [0.16, 0.06], [0.165, 0.18], [0.175, 0.3], [0.15, 0.37], [0.07, 0.41], [0.0, 0.415]]
      .map(([x, y]) => new THREE.Vector2(x, y));
    const shirt = mesh(new THREE.LatheGeometry(profile, 22), this.mShirt);
    shirt.scale.set(1, 1, 0.72);
    this.torso.add(shirt);
    // Emblema propio: silueta de un dinosaurio de cuello largo dentro de un círculo
    const print = new THREE.Group();
    print.position.set(0, 0.22, 0.123);
    print.add(mesh(new THREE.RingGeometry(0.052, 0.062, 28), EMBLEM));
    const dino = new THREE.Shape();
    dino.moveTo(-0.045, -0.02);
    dino.bezierCurveTo(-0.03, 0.0, 0.0, 0.005, 0.015, -0.002);
    dino.bezierCurveTo(0.022, 0.02, 0.022, 0.04, 0.03, 0.045);
    dino.lineTo(0.042, 0.042);
    dino.lineTo(0.04, 0.036);
    dino.bezierCurveTo(0.032, 0.032, 0.032, 0.015, 0.03, -0.005);
    dino.bezierCurveTo(0.03, -0.02, 0.02, -0.03, 0.01, -0.03);
    dino.lineTo(0.008, -0.045); dino.lineTo(0.0, -0.045); dino.lineTo(0.0, -0.03);
    dino.lineTo(-0.015, -0.03); dino.lineTo(-0.017, -0.045); dino.lineTo(-0.025, -0.045); dino.lineTo(-0.024, -0.027);
    dino.bezierCurveTo(-0.035, -0.025, -0.05, -0.03, -0.06, -0.04);
    dino.closePath();
    print.add(mesh(new THREE.ShapeGeometry(dino, 8), EMBLEM, 0, 0, 0.001));
    this.torso.add(print);
    // Cinturón con hebilla y bolsita
    const belt = mesh(new THREE.CylinderGeometry(0.162, 0.162, 0.04, 22), STRAP, 0, 0.0, 0);
    belt.scale.set(1, 1, 0.74);
    this.torso.add(belt);
    this.torso.add(mesh(new THREE.BoxGeometry(0.05, 0.04, 0.02), METAL, 0, 0.0, 0.12));
    this.torso.add(mesh(new THREE.BoxGeometry(0.07, 0.07, 0.05), PACK_DARK, 0.12, -0.03, 0.07));

    // Mochila redondeada con bolsillo, solapa, correas y cantimplora
    const pack = new THREE.Group();
    pack.position.set(0, 0.22, -0.17);
    const body = mesh(cap(0.12, 0.12), PACK, 0, 0, 0);
    body.scale.set(1.15, 1, 0.6);
    pack.add(body);
    const flap = mesh(new THREE.SphereGeometry(0.13, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), PACK_DARK, 0, 0.06, 0);
    flap.scale.set(1.08, 0.7, 0.62);
    pack.add(flap);
    const front = mesh(cap(0.06, 0.04), PACK_DARK, 0, -0.06, -0.075);
    front.scale.set(1.3, 1, 0.55);
    pack.add(front);
    pack.add(mesh(new THREE.BoxGeometry(0.03, 0.03, 0.01), METAL, 0, 0.0, -0.11));
    const bottle = mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.15, 14), METAL, 0.16, -0.04, 0);
    bottle.add(mesh(new THREE.CylinderGeometry(0.018, 0.022, 0.03, 10), STRAP, 0, 0.09, 0));
    pack.add(bottle);
    this.torso.add(pack);
    for (const sx of [-0.085, 0.085]) {
      const strap = mesh(new THREE.BoxGeometry(0.035, 0.36, 0.015), STRAP, sx, 0.2, 0.118);
      strap.rotation.x = -0.12;
      this.torso.add(strap);
      const over = mesh(new THREE.BoxGeometry(0.035, 0.015, 0.25), STRAP, sx, 0.385, -0.01);
      this.torso.add(over);
    }

    // Brazos: manga corta, piel y manos
    for (const [arm, elbow, side] of [[this.armL, this.elbowL, 1], [this.armR, this.elbowR, -1]] as const) {
      arm.position.set(0.2 * side, 0.34, 0);
      const sleeve = mesh(cap(0.062, 0.07), this.mShirt, 0, -0.04, 0);
      arm.add(sleeve);
      arm.add(mesh(cap(0.044, 0.15), this.mSkin, 0, -0.13, 0));
      arm.add(elbow);
      elbow.position.y = -0.23;
      elbow.add(mesh(cap(0.04, 0.14), this.mSkin, 0, -0.09, 0));
      const hand = mesh(new THREE.SphereGeometry(0.048, 16, 12), this.mSkin, 0, -0.205, 0.005);
      hand.scale.set(0.85, 1.1, 1);
      elbow.add(hand);
      // Reloj de explorador en la muñeca izquierda
      if (side === 1) {
        const watch = mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 14), STRAP, 0, -0.16, 0);
        watch.add(mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.012, 14), METAL, 0, 0, 0.04).rotateX(Math.PI / 2));
        elbow.add(watch);
      }
      arm.rotation.z = 0.12 * side;
      this.torso.add(arm);
    }
    // Celular en la mano derecha
    this.phone = mesh(new THREE.BoxGeometry(0.035, 0.12, 0.07), PHONE, -0.02, -0.21, 0.03);
    this.elbowR.add(this.phone);
    this.hand.position.set(0, -0.215, 0.02);
    this.elbowR.add(this.hand);

    // Cabeza: proporciones infantiles, ojos grandes con iris y brillo, cejas y nariz.
    this.torso.add(this.head);
    this.head.position.y = 0.4;
    this.head.add(mesh(cap(0.048, 0.05), this.mSkin, 0, 0.0, 0));
    const skull = mesh(new THREE.SphereGeometry(0.175, 32, 24), this.mSkin, 0, 0.17, 0);
    skull.scale.set(1, 1.06, 0.98);
    this.head.add(skull);
    this.head.add(this.hairGroup);
    for (const sx of [-1, 1]) {
      const eye = new THREE.Group();
      eye.position.set(0.06 * sx, 0.175, 0.138);
      const white = mesh(new THREE.SphereGeometry(0.036, 20, 14), WHITE);
      white.scale.set(1, 1.15, 0.7);
      eye.add(white);
      const iris = mesh(new THREE.SphereGeometry(0.023, 18, 12), IRIS, 0, -0.002, 0.017);
      iris.scale.set(1, 1.1, 0.5);
      eye.add(iris);
      const pupil = mesh(new THREE.SphereGeometry(0.012, 12, 8), EYE, 0, -0.002, 0.024);
      pupil.scale.z = 0.5;
      eye.add(pupil);
      eye.add(mesh(new THREE.SphereGeometry(0.006, 8, 6), WHITE, 0.008, 0.01, 0.029));
      this.head.add(eye);
      const brow = mesh(cap(0.008, 0.04), this.mBrow, 0.062 * sx, 0.232, 0.155);
      brow.rotation.z = Math.PI / 2 + 0.12 * sx;
      this.head.add(brow);
      const ear = mesh(new THREE.SphereGeometry(0.034, 14, 10), this.mSkin, 0.172 * sx, 0.16, 0);
      ear.scale.set(0.5, 1, 0.8);
      this.head.add(ear);
      const blush = mesh(new THREE.CircleGeometry(0.022, 14), BLUSH, 0.1 * sx, 0.12, 0.148);
      blush.rotation.y = 0.55 * sx;
      this.head.add(blush);
    }
    const nose = mesh(new THREE.SphereGeometry(0.02, 12, 10), this.mSkin, 0, 0.135, 0.17);
    nose.scale.set(1, 0.85, 0.9);
    this.head.add(nose);
    const mouth = mesh(new THREE.TorusGeometry(0.03, 0.007, 6, 14, Math.PI), MOUTH, 0, 0.098, 0.152);
    mouth.rotation.z = Math.PI;
    this.head.add(mouth);
    this.setAppearance(appearance ?? this.appearance);
  }

  /** Aplica colores y peinado. Niño y niña tienen las mismas medidas y capacidades. */
  setAppearance(a: Appearance) {
    this.appearance = { ...a };
    this.mSkin.color.set(a.skin);
    this.mHair.color.set(a.hairColor);
    this.mBrow.color.set(a.hairColor).multiplyScalar(0.7);
    this.mShirt.color.set(a.shirt);
    this.mShirtDark.color.set(a.shirt).multiplyScalar(0.82);
    this.mPants.color.set(a.pants);
    this.mPantsDark.color.set(a.pants).multiplyScalar(0.78);
    this.buildHair();
    this.useRig(a);
  }

  /** Cambia al personaje con esqueleto si existe para este género (y vuelve al procedural si no). */
  private useRig(a: Appearance) {
    if (!hasRig(a.character)) {
      if (this.rig) { this.root.remove(this.rig.root); this.rig = null; }
      this.hips.visible = true;
      this.elbowR.add(this.hand);
      this.hand.position.set(0, -0.215, 0.02);
      this.hand.scale.setScalar(1);
      return;
    }
    if (!this.rig || this.rig.gender !== a.character) {
      if (this.rig) this.root.remove(this.rig.root);
      this.rig = new RiggedModel(a.character);
      this.root.add(this.rig.root);
      this.hips.visible = false;
      const bone = this.rig.rightHand;
      if (bone) {
        // Los objetos de la mano miden en metros: compensa la escala del hueso.
        this.rig.root.updateMatrixWorld(true);
        const ws = new THREE.Vector3();
        bone.getWorldScale(ws);
        const rs = new THREE.Vector3();
        this.root.getWorldScale(rs);
        bone.add(this.hand);
        this.hand.position.set(0, 0, 0);
        this.hand.scale.setScalar(rs.x / (ws.x || 1));
      }
    }
    this.rig.tint(a);
  }

  /** Nombres de los clips del personaje con esqueleto (vacío si es procedural). */
  get rigClips() { return this.rig?.clipNames ?? []; }

  /** Mechón: cápsula alargada y orientada (los peinados se hacen con muchos mechones). */
  private lock(g: THREE.Group, x: number, y: number, z: number, r: number, len: number, rx: number, rz: number, ry = 0) {
    const m = mesh(new THREE.CapsuleGeometry(r, len, 4, 10), this.mHair, x, y, z);
    m.rotation.set(rx, ry, rz);
    g.add(m);
    return m;
  }

  /** Flequillo: mechones anchos y aplastados que caen sobre la frente. */
  private bangs(g: THREE.Group, side = 0) {
    const parts: [number, number, number][] = [[-0.085, 0.285, -0.35], [-0.01, 0.295, 0.0], [0.07, 0.285, 0.35]];
    for (const [x, y, rz] of parts) {
      const b = mesh(new THREE.SphereGeometry(0.075, 18, 12), this.mHair, x + side * 0.02, y, 0.115);
      b.scale.set(1.0, 0.5, 0.62);
      b.rotation.set(-0.5, 0, rz + side * 0.3);
      g.add(b);
    }
  }

  private buildHair() {
    const g = this.hairGroup, H = this.mHair, style = this.appearance.hairStyle, girl = this.appearance.character === 'girl';
    g.clear();
    // Casquete con volumen
    const base = mesh(new THREE.SphereGeometry(0.188, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), H, 0, 0.185, -0.012);
    base.rotation.x = -0.32;
    g.add(base);
    // Patillas
    for (const sx of [-1, 1]) this.lock(g, 0.158 * sx, 0.19, 0.04, 0.025, 0.05, 0, 0.15 * sx);
    if (girl) {
      // Pestañas
      for (const sx of [-1, 1]) {
        for (let i = 0; i < 3; i++) {
          const l = mesh(new THREE.BoxGeometry(0.012, 0.022, 0.006), EYE, 0.06 * sx + (0.022 + i * 0.012) * sx, 0.205 - i * 0.004, 0.158);
          l.rotation.z = (-0.6 - i * 0.25) * sx;
          g.add(l);
        }
      }
    }
    if (style === 'despeinado') {
      // Pelo revuelto: mechones que salen hacia arriba y hacia delante
      const pts: [number, number, number, number, number][] = [
        [-0.1, 0.34, 0.1, -0.7, 0.5], [-0.03, 0.36, 0.12, -0.9, 0.15], [0.05, 0.355, 0.12, -0.85, -0.25], [0.11, 0.33, 0.09, -0.7, -0.6],
        [-0.13, 0.31, -0.02, -0.2, 0.9], [0.13, 0.31, -0.02, -0.2, -0.9], [-0.05, 0.37, 0.0, -0.3, 0.4], [0.05, 0.37, -0.02, -0.25, -0.4],
        [0, 0.33, -0.12, 0.6, 0], [-0.1, 0.3, -0.11, 0.5, 0.6], [0.1, 0.3, -0.11, 0.5, -0.6],
      ];
      for (const [x, y, z, rx, rz] of pts) this.lock(g, x, y, z, 0.042, 0.07, rx, rz);
      this.bangs(g);
    } else if (style === 'corto') {
      const top = mesh(new THREE.SphereGeometry(0.182, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), H, 0, 0.215, -0.005);
      top.scale.set(1.04, 0.95, 1.04);
      g.add(top);
      this.bangs(g);
    } else if (style === 'coleta') {
      // Flequillo de lado, coleta alta y goma
      this.bangs(g, 1);
      const top = mesh(new THREE.SphereGeometry(0.183, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), H, 0, 0.212, -0.01);
      g.add(top);
      const tie = mesh(new THREE.TorusGeometry(0.03, 0.012, 8, 14), mat(girl ? '#b83a4b' : '#3a6ea5'), 0, 0.31, -0.15);
      tie.rotation.x = 0.9;
      g.add(tie);
      const tail = new THREE.Group(); tail.position.set(0, 0.31, -0.16); tail.rotation.x = 0.45;
      for (let i = 0; i < 5; i++) {
        const seg = mesh(new THREE.SphereGeometry(0.05 - i * 0.006, 14, 10), H, 0, -0.035 - i * 0.05, -0.03 - i * 0.012);
        seg.scale.set(1, 1.5, 0.95);
        tail.add(seg);
      }
      g.add(tail);
    } else if (style === 'melena') {
      const top = mesh(new THREE.SphereGeometry(0.186, 22, 12, 0, Math.PI * 2, 0, Math.PI * 0.45), H, 0, 0.212, -0.01);
      g.add(top);
      this.bangs(g, -1);
      // Melena hasta los hombros: volumen liso detrás y mechones por los lados
      const back = mesh(new THREE.SphereGeometry(0.19, 22, 16), H, 0, 0.13, -0.045);
      back.scale.set(1.02, 1.22, 0.86);
      g.add(back);
      for (let i = 0; i < 6; i++) {
        const a = (i < 3 ? -1 : 1) * Math.PI * (0.42 + (i % 3) * 0.1);
        const r = 0.165;
        this.lock(g, Math.sin(a) * r, 0.1, -Math.cos(a) * r * 0.95 - 0.03, 0.04, 0.17, Math.cos(a) * 0.12, -Math.sin(a) * 0.1);
      }
    }
  }

  get currentAppearance() { return { ...this.appearance }; }

  /** Reacción breve al recibir un golpe. */
  playHurt() { this.hurtT = 0; this.rig?.trigger('hurt'); }
  /** Animación de construir / martillear (refugios). */
  playBuild() { this.buildT = 0; this.rig?.trigger('build'); }
  get building() { return this.buildT >= 0; }

  playPickup() { this.pickT = 0; this.rig?.trigger('pickup'); }
  get busy() { return this.pickT >= 0; }

  /** speed en m/s horizontal; grounded indica si toca el suelo. */
  update(dt: number, speed: number, grounded: boolean, crouch: boolean, vy: number) {
    this.rig?.update(dt, { speed, grounded, crouch });
    this.time += dt;
    const moving = speed > 0.3;
    this.moveAmt = damp(this.moveAmt, moving ? 1 : 0, 10, dt);
    this.runAmt = damp(this.runAmt, speed > 5.5 ? 1 : 0, 6, dt);
    this.crouchAmt = damp(this.crouchAmt, crouch ? 1 : 0, 10, dt);
    this.airAmt = damp(this.airAmt, grounded ? 0 : 1, 12, dt);

    const prev = this.phase;
    this.phase += dt * (speed * (crouch ? 2.4 : 1.75) + (moving ? 0.5 : 0));
    if (moving && grounded && Math.floor(prev / Math.PI) !== Math.floor(this.phase / Math.PI)) this.onStep?.();

    const s = Math.sin(this.phase), c = Math.cos(this.phase);
    const amp = (0.55 + this.runAmt * 0.4) * this.moveAmt * (1 - this.airAmt);
    const breathe = Math.sin(this.time * 2.2) * 0.012 * (1 - this.moveAmt);

    // Piernas
    this.legL.rotation.x = s * amp - this.crouchAmt * 1.0 - this.airAmt * 0.7;
    this.legR.rotation.x = -s * amp - this.crouchAmt * 1.0 - this.airAmt * 0.2;
    this.kneeL.rotation.x = Math.max(0, -c) * amp * 1.2 + this.crouchAmt * 1.6 + this.airAmt * 1.1;
    this.kneeR.rotation.x = Math.max(0, c) * amp * 1.2 + this.crouchAmt * 1.6 + this.airAmt * 0.5;

    // Brazos
    const armAmp = (0.5 + this.runAmt * 0.5) * this.moveAmt * (1 - this.airAmt);
    this.armL.rotation.x = -s * armAmp - this.airAmt * 2.2;
    this.armR.rotation.x = s * armAmp - this.airAmt * 2.2;
    this.elbowL.rotation.x = -0.25 - this.runAmt * 0.9 * this.moveAmt;
    this.elbowR.rotation.x = -0.25 - this.runAmt * 0.9 * this.moveAmt;

    // Cuerpo
    const bob = Math.abs(s) * 0.05 * this.moveAmt * (1 + this.runAmt) * (1 - this.airAmt);
    this.hips.position.y = HIP_Y + bob + breathe - this.crouchAmt * 0.24;
    this.torso.rotation.x = this.runAmt * 0.25 * this.moveAmt + this.crouchAmt * 0.35 + (vy > 0 ? -0.1 : 0.1) * this.airAmt;
    this.head.rotation.x = -this.torso.rotation.x * 0.6;
    this.head.rotation.y = Math.sin(this.time * 0.6) * 0.15 * (1 - this.moveAmt);

    if (this.sitting) {
      this.hips.position.y = 0.52 + breathe;
      this.legL.rotation.x = this.legR.rotation.x = -1.45;
      this.kneeL.rotation.x = this.kneeR.rotation.x = 1.45;
      this.torso.rotation.x = 0.15;
      this.armL.rotation.x = this.armR.rotation.x = -0.75;
      this.elbowL.rotation.x = this.elbowR.rotation.x = -0.9;
      this.armL.rotation.z = -0.35; this.armR.rotation.z = 0.35;
      this.head.rotation.x = this.sitHead;
      this.head.rotation.y = 0;
      if (this.reach > 0) {
        const r = this.reach;
        this.armL.rotation.x = -0.75 - r * 1.15;
        this.elbowL.rotation.x = -0.9 * (1 - r);
        this.armL.rotation.z = -0.35 + r * 0.2;
      }
      return;
    }
    this.armL.rotation.z = 0.12; this.armR.rotation.z = -0.12;

    if (this.aiming) {
      this.armR.rotation.x = -1.5; this.armL.rotation.x = -1.5;
      this.elbowR.rotation.x = -0.6; this.elbowL.rotation.x = 0;
      this.armL.rotation.z = -0.25;
    }
    if (this.attackT >= 0) {
      this.attackT += dt / (this.attackKind === 'bow' ? 0.35 : 0.42);
      const t = Math.min(1, this.attackT);
      if (this.attackKind === 'swing') {
        // Levanta y descarga en arco
        const up = t < 0.35 ? t / 0.35 : 1 - (t - 0.35) / 0.65;
        this.armR.rotation.x = -2.6 * up + (t > 0.35 ? 0.6 * (1 - up) : 0);
        this.armR.rotation.z = -0.4 * up;
        this.torso.rotation.y = 0.4 * up - 0.3 * (t > 0.35 ? 1 - up : 0);
      } else if (this.attackKind === 'thrust') {
        const k = Math.sin(t * Math.PI);
        this.armR.rotation.x = -1.4 - k * 0.2;
        this.elbowR.rotation.x = -1.2 + k * 1.2;
        this.torso.rotation.y = -0.3 * k;
      } else if (this.attackKind === 'throw') {
        const up = t < 0.4 ? t / 0.4 : 1 - (t - 0.4) / 0.6;
        this.armR.rotation.x = -2.8 * up - (t > 0.4 ? 0.8 * (1 - up) : 0);
        this.elbowR.rotation.x = -1.0 * up;
      } else {
        this.armR.rotation.x = -1.5; this.armL.rotation.x = -1.5;
        this.elbowR.rotation.x = -0.6 * (1 - t);
      }
      if (this.attackT >= 1) { this.attackT = -1; this.torso.rotation.y = 0; }
    }

    // Alerta ante peligro: hombros tensos y mirada al frente.
    this.dangerAmt = damp(this.dangerAmt, this.danger, 4, dt);
    if (this.dangerAmt > 0.01 && this.attackT < 0) {
      this.armL.rotation.x -= this.dangerAmt * 0.5;
      this.elbowL.rotation.x -= this.dangerAmt * 0.6;
      this.head.rotation.y *= 1 - this.dangerAmt;
      this.torso.rotation.x += this.dangerAmt * 0.12;
    }
    if (this.hurtT >= 0) {
      this.hurtT += dt / 0.45;
      const k = Math.sin(Math.min(1, this.hurtT) * Math.PI);
      this.torso.rotation.x -= k * 0.45;
      this.armL.rotation.x -= k * 1.6; this.armR.rotation.x -= k * 1.6;
      this.armL.rotation.z = 0.12 + k * 0.6; this.armR.rotation.z = -0.12 - k * 0.6;
      if (this.hurtT >= 1) this.hurtT = -1;
    }
    if (this.buildT >= 0) {
      this.buildT += dt / 1.2;
      const k = Math.abs(Math.sin(this.buildT * Math.PI * 4));
      this.torso.rotation.x += 0.35;
      this.armR.rotation.x = -1.6 - k * 0.9;
      this.elbowR.rotation.x = -0.4 * k;
      if (this.buildT >= 1) this.buildT = -1;
    }

    // Recoger: se agacha y estira el brazo derecho.
    if (this.pickT >= 0) {
      this.pickT += dt / 0.55;
      const k = Math.sin(Math.min(1, this.pickT) * Math.PI);
      this.torso.rotation.x += k * 0.8;
      this.hips.position.y -= k * 0.18;
      this.legL.rotation.x -= k * 0.6; this.legR.rotation.x -= k * 0.6;
      this.kneeL.rotation.x += k * 1.0; this.kneeR.rotation.x += k * 1.0;
      this.armR.rotation.x -= k * 1.3;
      this.armL.rotation.x -= k * 0.6;
      if (this.pickT >= 1) this.pickT = -1;
    }
  }
}

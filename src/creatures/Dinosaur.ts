import * as THREE from 'three';
import { damp, lerpAngle, rng } from '../core/math';
import { CollisionWorld } from '../core/Collision';
import { Terrain, sampleSlope } from '../world/Terrain';
import { PLAY_LIMIT } from '../world/config';
import { DinoRig } from './dinoModels';

export interface SpeciesConfig {
  name: string;
  build: () => DinoRig;
  scale: number;
  radius: number;      // radio de colisión
  walkSpeed: number;
  fleeSpeed: number;
  turnRate: number;    // rad/s
  perception: number;  // distancia a la que percibe al jugador
  personal: number;    // distancia a la que se aparta
  homeRadius: number;
  stride: number;      // longitud de paso (para la animación)
  /** calm: se aparta; curious: se acerca un poco; apex: ruge y vigila (no se puede vencer). */
  behavior?: 'calm' | 'curious' | 'apex';
  /** Cuánto baja la cabeza al pastar (0 = no pasta). */
  graze?: number;
  /** Puntos de vida (Infinity = no se le puede vencer). */
  hp: number;
  /** Qué hace al ser golpeado o al ver al jugador. */
  reaction: 'flee' | 'defend' | 'hunt';
  /** Daño que hace al jugador al embestir o morder. */
  attack: number;
  /** Altura del centro del cuerpo (para impactos), en metros sin escalar. */
  bodyHeight: number;
}

type State = 'idle' | 'walk' | 'alert' | 'avoid' | 'approach' | 'charge' | 'hunt' | 'stunned';

/**
 * Dinosaurio con IA básica de estados: reposo/pastar, patrulla entre puntos,
 * alerta cuando percibe al jugador y alejamiento si se acerca demasiado.
 * Evita árboles, rocas, agua profunda y pendientes fuertes.
 */
export class Dinosaur {
  readonly rig: DinoRig;
  readonly position = new THREE.Vector3();
  heading = 0;
  state: State = 'idle';
  private timer = 2;
  private readonly goal = new THREE.Vector2();
  private readonly home = new THREE.Vector2();
  private speed = 0;
  private phase = 0;
  private time = 0;
  private headLook = 0;
  private readonly rand: () => number;
  /** Se llama cuando el dinosaurio se alerta (para sonidos). */
  onAlert?: (d: Dinosaur) => void;
  /** Se llama cuando golpea o muerde al jugador. */
  onAttackPlayer?: (d: Dinosaur, damage: number) => void;
  /** Se llama cuando se rinde y huye. */
  onDefeated?: (d: Dinosaur) => void;
  /** Cada pisada (para el polvo, el sonido y el temblor); `run` si va corriendo. */
  onStep?: (d: Dinosaur, run: boolean) => void;
  /** Llamada espontánea (bramido, gruñido) cuando está tranquilo. */
  onCall?: (d: Dinosaur) => void;
  /** Lejos de la cámara se anima con menos detalle (LOD de animación). */
  lodFar = false;
  private nextCall = 20;
  private breath = 0;
  private lookT = 0;
  private lookYaw = 0;
  private lookPitch = 0;
  private roarDur = 1.6;
  hp: number;
  private attackCooldown = 0;
  private flash = 0;
  private afterStun: State = 'idle';

  constructor(readonly cfg: SpeciesConfig, x: number, z: number, private readonly terrain: Terrain, private readonly collisions: CollisionWorld, seed: number) {
    this.rig = cfg.build();
    this.rig.root.scale.setScalar(cfg.scale);
    this.rand = rng(seed);
    // Busca un punto de aparición válido (seco, llano y libre) cerca del pedido.
    for (let i = 0; i < 200 && !this.walkable(x, z); i++) {
      const a = this.rand() * Math.PI * 2, d = 2 + i * 0.5;
      const nx = x + Math.sin(a) * d, nz = z + Math.cos(a) * d;
      if (this.walkable(nx, nz)) { x = nx; z = nz; break; }
    }
    this.home.set(x, z);
    this.position.set(x, terrain.heightAt(x, z), z);
    this.heading = this.rand() * Math.PI * 2;
    this.rig.root.name = cfg.name;
    this.hp = cfg.hp;
  }

  hitCenter(out: THREE.Vector3) {
    return out.set(this.position.x, this.position.y + this.cfg.bodyHeight * this.cfg.scale, this.position.z);
  }
  get hitRadius() { return this.cfg.radius * this.cfg.scale * 1.15 + 0.2; }

  /** Recibe un golpe del jugador. Devuelve true si se rinde. */
  takeHit(damage: number, player: THREE.Vector3): boolean {
    this.flash = 0.25;
    if (this.cfg.hp !== Infinity) this.hp -= damage;
    if (this.hp <= 0) {
      this.hp = this.cfg.hp;
      this.pickGoal(player, 45);
      this.state = 'avoid';
      this.timer = 14;
      this.onDefeated?.(this);
      return true;
    }
    this.state = 'stunned';
    this.timer = 0.35;
    switch (this.cfg.reaction) {
      case 'flee': this.afterStun = 'avoid'; this.pickGoal(player, 30); break;
      case 'defend': this.afterStun = 'charge'; this.chargeTime = 6; break;
      case 'hunt': this.afterStun = 'hunt'; this.chargeTime = 12; break;
    }
    return false;
  }
  private chargeTime = 0;

  private walkable(x: number, z: number): boolean {
    if (Math.abs(x) > PLAY_LIMIT - 5 || Math.abs(z) > PLAY_LIMIT - 5) return false;
    if (this.terrain.waterDepthAt(x, z) > 0.5) return false;
    if (sampleSlope(x, z) > 0.55) return false;
    return !this.collisions.blocked(x, z, this.cfg.radius * 0.8);
  }

  private pickGoal(awayFrom?: THREE.Vector3, far = 0): boolean {
    for (let i = 0; i < 20; i++) {
      let x: number, z: number;
      if (awayFrom) {
        const a = Math.atan2(this.position.x - awayFrom.x, this.position.z - awayFrom.z) + (this.rand() - 0.5) * 1.2;
        const d = (far || 14) + this.rand() * 10;
        x = this.position.x + Math.sin(a) * d; z = this.position.z + Math.cos(a) * d;
      } else {
        const a = this.rand() * Math.PI * 2, d = this.rand() * this.cfg.homeRadius;
        x = this.home.x + Math.sin(a) * d; z = this.home.y + Math.cos(a) * d;
      }
      if (this.walkable(x, z)) { this.goal.set(x, z); return true; }
    }
    return false;
  }

  update(dt: number, player: THREE.Vector3, playerStealth: number) {
    this.time += dt;
    this.timer -= dt;
    const dx = player.x - this.position.x, dz = player.z - this.position.z;
    const distPlayer = Math.hypot(dx, dz);
    const perceives = distPlayer < this.cfg.perception * playerStealth;

    this.attackCooldown -= dt;
    this.flash -= dt;
    const homeDist = Math.hypot(this.position.x - this.home.x, this.position.z - this.home.y);
    // Transiciones de estado según distancia y estado interno.
    if (this.state === 'stunned' || this.state === 'charge' || this.state === 'hunt') {
      // Estados de combate: se gestionan abajo.
    } else if (this.cfg.reaction === 'hunt' && perceives && playerStealth > 0 && this.cfg.behavior === 'apex' && homeDist < 110) {
      if (this.state !== 'alert') { this.state = 'alert'; this.timer = 1.6; this.afterStun = 'hunt'; this.chargeTime = 14; this.onAlert?.(this); }
    } else if (distPlayer < this.cfg.personal && this.state !== 'avoid') {
      if (this.pickGoal(player)) { this.state = 'avoid'; this.timer = 8; }
    } else if (perceives && this.cfg.behavior === 'curious' && (this.state === 'idle' || this.state === 'walk') && distPlayer > this.cfg.personal + 2) {
      this.state = 'approach';
      this.timer = 6;
      this.goal.set(player.x - (dx / distPlayer) * (this.cfg.personal + 1), player.z - (dz / distPlayer) * (this.cfg.personal + 1));
    } else if (perceives && (this.state === 'idle' || this.state === 'walk') && this.timer < 6) {
      this.state = 'alert';
      this.timer = 2.5 + this.rand() * 2;
      this.onAlert?.(this);
    }

    let desiredSpeed = 0;
    let desiredHeading = this.heading;
    switch (this.state) {
      case 'idle':
        if (this.timer <= 0) {
          if (this.pickGoal()) { this.state = 'walk'; this.timer = 25; } else this.timer = 2;
        }
        break;
      case 'alert':
        desiredHeading = Math.atan2(dx, dz);
        if (this.timer <= 0) {
          if (this.afterStun === 'hunt') this.state = 'hunt';
          else { this.state = 'idle'; this.timer = 8 + this.rand() * 4; }
        }
        break;
      case 'stunned':
        if (this.timer <= 0) {
          this.state = this.afterStun;
          this.timer = this.state === 'avoid' ? 10 : this.chargeTime;
          if (this.state !== 'avoid') this.onAlert?.(this);
        }
        break;
      case 'charge':
      case 'hunt': {
        // Persigue al jugador; si lo alcanza, embiste o muerde y retrocede un momento.
        const lost = this.state === 'hunt' && (distPlayer > this.cfg.perception * 1.5 || homeDist > 120 || playerStealth === 0);
        if (this.timer <= 0 || lost) {
          this.state = 'walk'; this.timer = 25; this.afterStun = 'idle';
          this.goal.copy(this.home);
          break;
        }
        const reach = this.cfg.radius * this.cfg.scale + 1.4;
        desiredHeading = Math.atan2(dx, dz);
        desiredSpeed = distPlayer > reach * 0.9 ? this.cfg.fleeSpeed : 0;
        if (distPlayer < reach && this.attackCooldown <= 0) {
          this.attackCooldown = 1.6;
          this.roar(0.6);
          this.onAttackPlayer?.(this, this.cfg.attack);
        }
        break;
      }
      case 'walk':
      case 'approach':
      case 'avoid': {
        const gx = this.goal.x - this.position.x, gz = this.goal.y - this.position.z;
        const gd = Math.hypot(gx, gz);
        if (gd < 2.5 || this.timer <= 0) {
          this.state = 'idle';
          this.timer = 3 + this.rand() * 6;
          break;
        }
        desiredSpeed = this.state === 'walk' ? this.cfg.walkSpeed : this.cfg.fleeSpeed;
        desiredHeading = this.steer(Math.atan2(gx, gz));
        if (Number.isNaN(desiredHeading)) {
          this.state = 'idle'; this.timer = 1; desiredSpeed = 0; desiredHeading = this.heading;
        }
        break;
      }
    }

    this.heading = lerpAngle(this.heading, desiredHeading, Math.min(1, this.cfg.turnRate * dt));
    // Frena mientras gira bruscamente.
    let diff = Math.abs(((desiredHeading - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    diff = Math.min(diff, Math.PI);
    this.speed = damp(this.speed, desiredSpeed * Math.max(0.2, 1 - diff), 3, dt);

    const nx = this.position.x + Math.sin(this.heading) * this.speed * dt;
    const nz = this.position.z + Math.cos(this.heading) * this.speed * dt;
    if (this.walkable(nx, nz)) { this.position.x = nx; this.position.z = nz; }
    else if (this.state === 'charge' || this.state === 'hunt') {
      // Rodea el obstáculo deslizándose.
      const a = this.steer(this.heading);
      if (!Number.isNaN(a)) this.heading = lerpAngle(this.heading, a, 0.3);
    } else { this.speed = 0; if (this.state !== 'idle' && this.state !== 'alert' && this.state !== 'stunned') { this.state = 'idle'; this.timer = 1; } }

    const gy = this.terrain.heightAt(this.position.x, this.position.z);
    this.position.y = damp(this.position.y, gy, 10, dt);
    // Llamadas espontáneas cuando está tranquilo.
    this.nextCall -= dt;
    if (this.nextCall <= 0) {
      this.nextCall = 35 + this.rand() * 60;
      if ((this.state === 'idle' || this.state === 'walk') && this.cfg.scale * this.cfg.bodyHeight > 1) { this.roar(1.2 + this.rand() * 0.8); this.onCall?.(this); }
    }
    const prevStep = Math.floor(this.phase / Math.PI);
    this.animate(dt, perceives ? Math.atan2(dx, dz) : null);
    if (Math.floor(this.phase / Math.PI) !== prevStep && this.speed > 0.4) this.onStep?.(this, this.speed > this.cfg.walkSpeed * 1.3);
  }

  /** Busca una dirección libre cerca de la deseada (evitación de obstáculos). */
  private steer(want: number): number {
    const look = this.cfg.radius * 2 + 2;
    for (const off of [0, 0.4, -0.4, 0.8, -0.8, 1.3, -1.3]) {
      const a = want + off;
      if (this.walkable(this.position.x + Math.sin(a) * look, this.position.z + Math.cos(a) * look)) return a;
    }
    return NaN;
  }

  /** Abre la boca durante un tiempo (rugido). */
  roar(seconds = 1.6) { this.roarT = seconds; this.roarDur = seconds; this.roarPending = true; }
  private roarPending = false;
  private clipAcc = 0;
  private lodFrame = 0;
  get moveSpeed() { return this.speed; }
  private roarT = 0;

  private animate(dt: number, lookAt: number | null) {
    const r = this.rig;
    this.roarT -= dt;
    if (r.clips) { this.animateClips(dt, lookAt); return; }
    r.root.position.copy(this.position);
    r.root.rotation.y = this.heading;
    // Inclinación según el terreno.
    const f = 2 * this.cfg.scale;
    const ahead = this.terrain.heightAt(this.position.x + Math.sin(this.heading) * f, this.position.z + Math.cos(this.heading) * f);
    const behind = this.terrain.heightAt(this.position.x - Math.sin(this.heading) * f, this.position.z - Math.cos(this.heading) * f);
    this.phase += (this.speed / (this.cfg.stride * this.cfg.scale)) * Math.PI * 2 * dt;
    const amp = Math.min(1, this.speed / this.cfg.walkSpeed) * (r.biped ? 0.55 : 0.4);
    // Carrera: el cuerpo se inclina hacia delante y la cola se estira.
    const run = THREE.MathUtils.clamp((this.speed - this.cfg.walkSpeed) / Math.max(0.1, this.cfg.fleeSpeed - this.cfg.walkSpeed), 0, 1);
    // Respiración: más rápida y profunda después de correr.
    this.breath = damp(this.breath, run, run > this.breath ? 2 : 0.25, dt);
    const roaring = this.roarT > 0 ? Math.sin(Math.min(1, 1 - this.roarT / this.roarDur) * Math.PI) : 0;
    r.body.rotation.x = damp(r.body.rotation.x, -Math.atan2(ahead - behind, f * 2) * 0.6 + run * (r.biped ? 0.12 : 0.04) - roaring * (r.biped ? 0.1 : 0.05), 5, dt);
    // Balanceo lateral al pisar y sacudida al recibir un golpe.
    r.body.rotation.z = (this.flash > 0 ? Math.sin(this.flash * 60) * 0.06 : 0) + Math.sin(this.phase) * amp * (r.biped ? 0.05 : 0.025);
    if (this.lodFar) {
      // Lejos: solo patas y posición (ahorra trabajo con muchos dinosaurios).
      r.legs.forEach((leg, i) => { const ph = r.biped ? (i === 0 ? 0 : Math.PI) : (i === 0 || i === 3 ? 0 : Math.PI); leg.rotation.x = Math.sin(this.phase + ph) * amp; });
      return;
    }
    r.legs.forEach((leg, i) => {
      // Cuadrúpedos: paso diagonal. Bípedos: alternan.
      const ph = r.biped ? (i === 0 ? 0 : Math.PI) : (i === 0 || i === 3 ? 0 : Math.PI);
      const sw = Math.sin(this.phase + ph);
      const rest = leg.userData.kneeRest as number;
      leg.rotation.x = sw * amp - (r.biped ? rest * 0.5 : 0);
      (leg.userData.knee as THREE.Object3D).rotation.x = rest + Math.max(0, Math.cos(this.phase + ph)) * amp * 1.3;
    });
    const baseY = (r.body.userData.baseY ??= r.body.position.y) as number;
    const breathRate = 1.3 + this.breath * 2.5;
    const breathe = Math.sin(this.time * breathRate) * (0.018 + this.breath * 0.03);
    r.body.position.y = baseY + (Math.abs(Math.cos(this.phase)) * amp * 0.1 + breathe) * (r.biped ? 1.5 : 1);

    // Cola: onda que recorre los huesos.
    // Al andar la cola acompaña el paso; corriendo se estira y sube.
    r.tailBones.forEach((b, i) => {
      const idle = Math.sin(this.time * 1.1 - i * 0.55) * (0.05 + i * 0.012);
      const stepSway = Math.sin(this.phase - i * 0.45) * amp * (0.07 + i * 0.02);
      b.rotation.y = idle * (1 - run * 0.7) + stepSway;
      b.rotation.x = (r.biped ? -0.01 : 0.015) - run * 0.03 + roaring * 0.04 + Math.sin(this.time * breathRate - i * 0.4) * 0.006;
    });

    // Cuello: pasta en reposo y gira hacia el jugador en alerta.
    const grazing = this.state === 'idle' && (this.cfg.graze ?? 0) > 0 && Math.sin(this.time * 0.35 + this.heading) > -0.1;
    this.neckDown = damp(this.neckDown, grazing ? this.cfg.graze! : 0, 1.5, dt);
    let want = 0;
    if (lookAt !== null && this.state !== 'avoid') {
      want = ((lookAt - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      want = Math.max(-1.0, Math.min(1.0, want));
    }
    // En reposo mira a su alrededor de vez en cuando.
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 2.5 + this.rand() * 5;
      const calm = this.state === 'idle' && !grazing;
      this.lookYaw = calm ? (this.rand() - 0.5) * 1.1 : 0;
      this.lookPitch = calm ? (this.rand() - 0.6) * 0.25 : 0;
    }
    if (lookAt === null) want = this.lookYaw;
    this.headLook = damp(this.headLook, want, 3, dt);
    const n = Math.max(1, r.neckBones.length);
    // Al andar, la cabeza compensa el paso (más estable); al rugir se alza y se estira.
    const bob = -Math.cos(this.phase * 2) * amp * 0.03;
    r.neckBones.forEach((b, i) => {
      b.rotation.x = (this.neckDown / n) * (0.5 + i / n) + (grazing ? Math.sin(this.time * 2 + i) * 0.01 : 0)
        + (this.lookPitch + bob + run * 0.06 - roaring * 0.5) / n + Math.sin(this.time * breathRate + 0.8) * 0.004;
      b.rotation.y = this.headLook / n + Math.sin(this.time * 0.5 + i * 0.3) * 0.01;
    });

    if (r.jaw) {
      const open = this.roarT > 0 ? 0.2 + roaring * 0.32 + Math.sin(this.time * 30) * 0.04 : 0.04 + Math.max(0, Math.sin(this.time * breathRate)) * (0.03 + this.breath * 0.12);
      r.jaw.rotation.x = damp(r.jaw.rotation.x, open, 10, dt);
    }
  }
  private neckDown = 0;

  /** Modelos con esqueleto: los clips mueven patas, cola y cabeza; aquí se añade la mirada y la inclinación. */
  private animateClips(dt: number, lookAt: number | null) {
    const r = this.rig, c = r.clips!;
    r.root.position.copy(this.position);
    r.root.rotation.y = this.heading;
    const f = 2 * this.cfg.scale;
    const ahead = this.terrain.heightAt(this.position.x + Math.sin(this.heading) * f, this.position.z + Math.cos(this.heading) * f);
    const behind = this.terrain.heightAt(this.position.x - Math.sin(this.heading) * f, this.position.z - Math.cos(this.heading) * f);
    r.body.rotation.x = damp(r.body.rotation.x, -Math.atan2(ahead - behind, f * 2) * 0.6, 5, dt);
    r.body.rotation.z = this.flash > 0 ? Math.sin(this.flash * 60) * 0.06 : 0;
    this.phase += (this.speed / (this.cfg.stride * this.cfg.scale)) * Math.PI * 2 * dt;
    if (this.roarPending) { this.roarPending = false; c.roar(); }
    // Lejos se actualiza la animación a la mitad de frecuencia (LOD).
    this.clipAcc += dt;
    if (this.lodFar && (this.lodFrame++ & 1)) return;
    c.update(this.clipAcc, this.speed, this.cfg.walkSpeed, this.cfg.fleeSpeed);
    this.clipAcc = 0;
    let want = 0;
    if (lookAt !== null && this.state !== 'avoid') want = Math.max(-0.9, Math.min(0.9, ((lookAt - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI));
    this.headLook = damp(this.headLook, want, 3, dt);
    if (r.neckBones[0]) r.neckBones[0].rotation.y += this.headLook * 0.35;
    r.headBone.rotation.y += this.headLook * 0.35;
  }
}

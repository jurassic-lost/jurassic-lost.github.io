import * as THREE from 'three';
import { damp, lerpAngle } from '../core/math';
import { CollisionWorld } from '../core/Collision';
import { Input } from '../core/Input';
import { Terrain, sampleSlope } from '../world/Terrain';
import { PLAY_LIMIT } from '../world/config';
import { CharacterModel } from './CharacterModel';
import { ThirdPersonCamera } from './ThirdPersonCamera';
import { Survival } from '../survival/Survival';

const GRAVITY = -24;
const JUMP_SPEED = 8.2;
const WALK = 4.2, RUN = 7.6, CROUCH = 2.0;
const RADIUS = 0.35;

/** Controlador del personaje: movimiento relativo a la cámara, gravedad, salto y colisiones. */
export class Player {
  readonly model = new CharacterModel();
  readonly position = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  facing = 0;
  grounded = true;
  crouching = false;
  running = false;
  inWater = false;
  /** Velocidad horizontal actual (m/s). */
  speed = 0;
  /** Límites para caminar (la ciudad del Proyecto Génesis); sin ellos, los de la isla. */
  bounds: { x0: number; x1: number; z0: number; z1: number } | null = null;
  /** Multiplicador de velocidad del terreno (la brea frena). */
  slow = 1;
  /** Se llama al aterrizar con la velocidad vertical de impacto. */
  onLand?: (impact: number) => void;
  onJump?: () => void;
  private readonly fwd = new THREE.Vector3();
  private readonly move = new THREE.Vector3();

  constructor(private readonly terrain: Terrain, private readonly collisions: CollisionWorld) {}

  spawn(x: number, z: number) {
    this.position.set(x, this.terrain.heightAt(x, z), z);
    this.velocity.set(0, 0, 0);
    this.grounded = true;
  }

  update(dt: number, input: Input, cam: ThirdPersonCamera, survival: Survival) {
    const st = input.state;
    this.crouching = st.crouch && this.grounded;

    cam.forward(this.fwd);
    const fx = this.fwd.x, fz = this.fwd.z;
    this.move.set(fx * st.moveY - fz * st.moveX, 0, fz * st.moveY + fx * st.moveX);
    const mag = Math.min(1, this.move.length());
    if (mag > 0.01) this.move.divideScalar(this.move.length());

    const depth = this.terrain.waterDepthAt(this.position.x, this.position.z);
    this.inWater = depth > 0.25 && this.position.y < this.terrain.heightAt(this.position.x, this.position.z) + 0.3;
    this.running = st.run && mag > 0.1 && !this.crouching && survival.energy > 2 && !this.model.busy;
    let target = (this.crouching ? CROUCH : this.running ? RUN : WALK) * mag;
    if (this.inWater) target *= 0.55;
    target *= this.slow;
    if (this.model.busy) target = 0;

    // Aceleración suave (menos control en el aire).
    const accel = this.grounded ? 12 : 3;
    this.velocity.x = damp(this.velocity.x, this.move.x * target, accel, dt);
    this.velocity.z = damp(this.velocity.z, this.move.z * target, accel, dt);

    if (input.consume('jump') && this.grounded && !this.model.busy) {
      if (this.crouching) input.setCrouch(false);
      this.velocity.y = JUMP_SPEED * (survival.energy > 5 ? 1 : 0.7);
      survival.add('energy', -3);
      this.grounded = false;
      this.onJump?.();
    }
    this.velocity.y += GRAVITY * dt;

    const prevX = this.position.x, prevZ = this.position.z;
    const prevGround = this.terrain.heightAt(prevX, prevZ);
    this.position.x += this.velocity.x * dt;
    this.position.z += this.velocity.z * dt;
    this.position.y += this.velocity.y * dt;

    // Pendientes demasiado empinadas: no se pueden escalar caminando.
    const ng = this.terrain.heightAt(this.position.x, this.position.z);
    if (ng > prevGround + 0.02 && sampleSlope(this.position.x, this.position.z) > 1.15 && this.position.y < ng + 0.2) {
      this.position.x = prevX;
      this.position.z = prevZ;
    }

    const support = this.collisions.resolve(this.position, RADIUS);
    const b = this.bounds;
    if (b) {
      this.position.x = Math.max(b.x0, Math.min(b.x1, this.position.x));
      this.position.z = Math.max(b.z0, Math.min(b.z1, this.position.z));
    } else {
      this.position.x = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, this.position.x));
      this.position.z = Math.max(-PLAY_LIMIT, Math.min(PLAY_LIMIT, this.position.z));
    }

    const ground = Math.max(this.terrain.heightAt(this.position.x, this.position.z), support);
    const wasGrounded = this.grounded;
    if (this.position.y <= ground) {
      if (!wasGrounded) this.onLand?.(-this.velocity.y);
      this.position.y = ground;
      this.velocity.y = 0;
      this.grounded = true;
    } else if (wasGrounded && this.velocity.y <= 0 && this.position.y - ground < 0.45) {
      // Pegado al suelo al bajar cuestas.
      this.position.y = ground;
      this.velocity.y = 0;
    } else {
      this.grounded = false;
    }

    this.speed = Math.hypot(this.velocity.x, this.velocity.z);
    if (mag > 0.05 && target > 0) this.facing = lerpAngle(this.facing, Math.atan2(this.move.x, this.move.z), 1 - Math.exp(-12 * dt));

    this.model.root.position.copy(this.position);
    this.model.root.rotation.y = this.facing;
    this.model.update(dt, this.speed, this.grounded, this.crouching, this.velocity.y);
  }
}

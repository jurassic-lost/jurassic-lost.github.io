import * as THREE from 'three';
import { skinMaterial } from './organic';

/** Pterosaurio que planea en círculos sobre la selva y aletea de vez en cuando. */
export class Pterosaur {
  readonly root = new THREE.Group();
  private readonly wingL = new THREE.Group();
  private readonly wingR = new THREE.Group();
  private t: number;
  private flap = 0;

  constructor(private readonly center: THREE.Vector3, private readonly radius: number, private readonly speed: number, seed: number) {
    this.t = seed * 3.7;
    const skin = skinMaterial(false, '#8a7350', [2, 2]);
    const membrane = new THREE.MeshStandardMaterial({ color: '#a8865c', roughness: 0.8, side: THREE.DoubleSide });
    const body = new THREE.Mesh(new THREE.SphereGeometry(1, 14, 10), skin);
    body.scale.set(0.28, 0.25, 1.0);
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.16, 1.5, 10), skin);
    head.rotation.x = Math.PI / 2;
    head.position.set(0, 0.15, 1.5);
    const crest = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.9, 8), skin);
    crest.rotation.x = -Math.PI / 2.4;
    crest.position.set(0, 0.35, 0.65);
    this.root.add(body, head, crest);
    // Ala: membrana triangular con borde curvo
    const shape = new THREE.Shape();
    shape.moveTo(0, 0.5); shape.lineTo(4.2, 0.2); shape.quadraticCurveTo(3.0, -0.4, 0.2, -0.9); shape.lineTo(0, -0.6);
    const wingGeo = new THREE.ShapeGeometry(shape);
    wingGeo.rotateX(-Math.PI / 2);
    for (const [w, s] of [[this.wingL, 1], [this.wingR, -1]] as const) {
      const m = new THREE.Mesh(wingGeo, membrane);
      m.scale.x = s;
      m.castShadow = true;
      w.add(m);
      w.position.set(0.15 * s, 0.05, 0.3);
      this.root.add(w);
    }
    this.root.traverse((o) => { if ((o as THREE.Mesh).isMesh) o.castShadow = true; });
  }

  update(dt: number) {
    this.t += dt * this.speed / this.radius;
    const a = this.t;
    const y = this.center.y + Math.sin(a * 2.3) * 6;
    this.root.position.set(this.center.x + Math.cos(a) * this.radius, y, this.center.z + Math.sin(a) * this.radius);
    // Tangente del círculo: mira hacia donde vuela y se inclina en la curva.
    this.root.rotation.set(0, -a, 0);
    this.root.rotateY(Math.PI);
    this.root.rotateZ(-0.35);
    // Aleteo a ratos, planeo el resto.
    const flapping = Math.sin(a * 3.1) > 0.55;
    this.flap += dt * (flapping ? 9 : 0);
    const w = flapping ? Math.sin(this.flap) * 0.7 : 0.08 + Math.sin(this.t * 4) * 0.03;
    this.wingL.rotation.z = w;
    this.wingR.rotation.z = -w;
  }
}

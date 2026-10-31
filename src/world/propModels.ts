import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { dataUrlToBuffer } from '../creatures/quatModels';
import type { ModelPart } from './vegetationModels';

/**
 * Modelos realistas de escenario (Poly Haven, CC0): se cargan antes de crear el mundo
 * y, si fallan, se usan los modelos procedurales de siempre.
 */
const PROPS = ['boulder', 'islandTree', 'smallTree'] as const;
const FILES: Record<(typeof PROPS)[number], string> = { boulder: 'boulder', islandTree: 'island_tree', smallTree: 'small_tree' };
type PropName = (typeof PROPS)[number];
const loaded = new Map<PropName, ModelPart[]>();
export const propErrors: string[] = [];

export async function preloadProps() {
  const loader = new GLTFLoader();
  const inline = (window as unknown as { __GLB?: Record<string, string> }).__GLB;
  await Promise.all(PROPS.map(async (name) => {
    try {
      const data = inline?.['p_' + FILES[name]];
      const gltf = data ? await loader.parseAsync(dataUrlToBuffer(data), '') : await loader.loadAsync(`./models/props/${FILES[name]}.glb`);
      const parts: ModelPart[] = [];
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        const geo = m.geometry.clone().applyMatrix4(m.matrixWorld);
        const src = m.material as THREE.MeshStandardMaterial;
        // Hojas: recorte por transparencia (más barato y sin problemas de orden que la mezcla).
        const leaves = /leaves/.test(src.name);
        const mat = new THREE.MeshStandardMaterial({ map: src.map, normalMap: src.normalMap, roughnessMap: src.roughnessMap, roughness: leaves ? 0.8 : 1, metalness: 0,
          alphaTest: leaves ? 0.5 : 0, side: leaves ? THREE.DoubleSide : THREE.FrontSide,
          // Las hojas escaneadas son muy oscuras: se aclaran para que no se vean negras a la sombra.
          color: leaves ? new THREE.Color(1.9, 2.1, 1.6) : new THREE.Color(1.15, 1.15, 1.15) });
        parts.push({ geo, mat, shadow: true });
      });
      // Apoyada en el suelo y centrada.
      const box = new THREE.Box3();
      for (const p of parts) { p.geo.computeBoundingBox(); box.union(p.geo.boundingBox!); }
      const c = box.getCenter(new THREE.Vector3());
      for (const p of parts) p.geo.translate(-c.x, -box.min.y - (name === 'boulder' ? 0.25 : 0.05), -c.z);
      loaded.set(name, parts);
    } catch (e) {
      propErrors.push(`${name}: ${(e as Error).message}`);
    }
  }));
}

/** Partes del modelo realista, o null si no se cargó. */
export function prop(name: PropName): ModelPart[] | null { return loaded.get(name) ?? null; }

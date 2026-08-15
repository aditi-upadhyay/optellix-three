import {
  Box3,
  BufferGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  Vector3,
} from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js';
import { CAD_TARGET_SIZE } from './assets.config';

const stlMaterial = () =>
  new MeshStandardMaterial({
    color: 0xb8c0c8,
    metalness: 0.6,
    roughness: 0.35,
    side: DoubleSide,
  });

export async function loadCadObject(url: string): Promise<Object3D> {
  const lower = url.split('?')[0].toLowerCase();
  if (lower.endsWith('.stl')) {
    const geometry = await loadStl(url);
    geometry.computeVertexNormals();
    const mesh = new Mesh(geometry, stlMaterial());
    mesh.name = 'cadStl';
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    return mesh;
  }

  const gltf = await new GLTFLoader().loadAsync(url);
  gltf.scene.name = 'cadGltf';
  gltf.scene.traverse((child: Object3D) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });
  return gltf.scene;
}

function loadStl(url: string): Promise<BufferGeometry> {
  return new Promise((resolve, reject) => {
    new STLLoader().load(url, resolve, undefined, reject);
  });
}

/**
 * Wrap a loaded CAD object so its bounding-box center sits at the origin
 * and its longest axis equals `targetSize` world units.
 */
export function centerAndNormalize(
  object: Object3D,
  targetSize = CAD_TARGET_SIZE
): Group {
  const offset = new Group();
  offset.add(object);
  offset.updateMatrixWorld(true);

  const box = new Box3().setFromObject(offset);
  const center = box.getCenter(new Vector3());
  const size = box.getSize(new Vector3());
  const maxDim = Math.max(size.x, size.y, size.z) || 1;

  offset.position.set(-center.x, -center.y, -center.z);

  const normalized = new Group();
  normalized.name = 'cadNormalized';
  normalized.add(offset);
  normalized.scale.setScalar(targetSize / maxDim);

  const root = new Group();
  root.name = 'cadRoot';
  root.add(normalized);
  return root;
}

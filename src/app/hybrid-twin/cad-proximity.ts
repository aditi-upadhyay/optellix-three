import {
  Box3,
  Material,
  Mesh,
  MeshStandardMaterial,
  Object3D,
  WebGLProgramParametersWithUniforms,
} from 'three';

/** World units over which the CAD glow ramps from full to none. CAD longest axis is 2. */
export const PROXIMITY_RANGE = 1.25;

/** HUD teal — albedo mix + emissive glow. */
export const PROXIMITY_GLOW = { r: 0.494, g: 0.878, b: 0.78 };

export interface ProximityUniforms {
  uProximity: { value: number };
}

export function createProximityUniforms(): ProximityUniforms {
  return { uProximity: { value: 0 } };
}

/**
 * Distance from `inner` to the nearest interior face of `outer`.
 * Returns 0 when `inner` intersects or exits the outer box (through a wall/floor).
 */
export function interiorDistanceToAabb(inner: Box3, outer: Box3): number {
  const dx = Math.min(inner.min.x - outer.min.x, outer.max.x - inner.max.x);
  const dy = Math.min(inner.min.y - outer.min.y, outer.max.y - inner.max.y);
  const dz = Math.min(inner.min.z - outer.min.z, outer.max.z - inner.max.z);
  if (dx < 0 || dy < 0 || dz < 0) {
    return 0;
  }
  return Math.min(dx, dy, dz);
}

export function proximityFromDistance(
  distance: number,
  range = PROXIMITY_RANGE
): number {
  return 1 - Math.min(Math.max(distance / range, 0), 1);
}

function isMeshStandardMaterial(
  material: Material
): material is MeshStandardMaterial {
  return (material as MeshStandardMaterial).isMeshStandardMaterial === true;
}

/**
 * Inject `uProximity` into a MeshStandardMaterial via onBeforeCompile.
 * Skips ShadowMaterial and other non-standard materials so the floor stays untouched.
 */
export function applyCadProximityMaterial(
  material: Material | Material[],
  uniforms: ProximityUniforms
): void {
  if (Array.isArray(material)) {
    material.forEach((item) => applyCadProximityMaterial(item, uniforms));
    return;
  }
  if (!isMeshStandardMaterial(material)) {
    return;
  }

  material.customProgramCacheKey = () => 'cad-proximity';
  material.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    shader.uniforms['uProximity'] = uniforms.uProximity;
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <common>',
      '#include <common>\nuniform float uProximity;'
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <color_fragment>',
      `#include <color_fragment>
     diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${PROXIMITY_GLOW.r}, ${PROXIMITY_GLOW.g}, ${PROXIMITY_GLOW.b}), uProximity * 0.65);`
    );
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <emissivemap_fragment>',
      `#include <emissivemap_fragment>
     totalEmissiveRadiance += vec3(${PROXIMITY_GLOW.r}, ${PROXIMITY_GLOW.g}, ${PROXIMITY_GLOW.b}) * uProximity;`
    );
  };
  material.needsUpdate = true;
}

export function applyCadProximityToObject(
  object: Object3D,
  uniforms: ProximityUniforms
): void {
  object.traverse((child) => {
    const mesh = child as Mesh;
    if (mesh.isMesh) {
      applyCadProximityMaterial(mesh.material, uniforms);
    }
  });
}

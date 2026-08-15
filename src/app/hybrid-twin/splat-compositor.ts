import { Box3, OrthographicCamera, Vector3 } from 'three';

/** Occupancy pass: only solid Gaussian cores write depth. */
export const OCCUPANCY_ALPHA = 0.4;

/** Spark default — keep soft splat edges on the color pass. */
export const COLOR_MIN_ALPHA = 0.5 / 255;

/** Room-scale footprint (world units) required before adding a floor. */
export const FLOOR_MIN_EXTENT = 1.5;

export const FLOOR_PADDING = 1.15;
export const FLOOR_Y_OFFSET = 0.01;

export interface SplatPassMaterial {
  depthWrite: boolean;
  depthTest: boolean;
  colorWrite: boolean;
}

export interface SplatPassTarget {
  minAlpha: number;
  material: SplatPassMaterial;
}

export interface FloorPlaneSpec {
  y: number;
  width: number;
  depth: number;
}

/**
 * Depth-only splat pass. Does not flip `transparent` (that recompiles the shader).
 */
export function applySplatOccupancyPass(target: SplatPassTarget): void {
  target.minAlpha = OCCUPANCY_ALPHA;
  target.material.depthWrite = true;
  target.material.depthTest = true;
  target.material.colorWrite = false;
}

/**
 * Alpha-blended splat color. Depth is already in the buffer from occupancy + CAD.
 */
export function applySplatColorPass(target: SplatPassTarget): void {
  target.minAlpha = COLOR_MIN_ALPHA;
  target.material.depthWrite = false;
  target.material.depthTest = true;
  target.material.colorWrite = true;
}

/**
 * Shadow-only floor from a splat AABB. Returns null for small object captures.
 */
export function floorPlaneFromSplatBox(box: Box3): FloorPlaneSpec | null {
  const size = box.getSize(new Vector3());
  if (size.x < FLOOR_MIN_EXTENT || size.z < FLOOR_MIN_EXTENT) {
    return null;
  }
  return {
    y: box.min.y + FLOOR_Y_OFFSET,
    width: size.x * FLOOR_PADDING,
    depth: size.z * FLOOR_PADDING,
  };
}

/**
 * Fit a directional light's orthographic shadow camera to a world AABB.
 */
export function fitShadowCameraToBox(
  camera: OrthographicCamera,
  box: Box3,
  lightPosition: Vector3
): void {
  const size = box.getSize(new Vector3());
  const radius = Math.max(size.x, size.y, size.z) * 0.5;
  const extent = Math.max(radius * 1.2, 1);
  camera.left = -extent;
  camera.right = extent;
  camera.top = extent;
  camera.bottom = -extent;
  camera.near = 0.2;
  camera.far = lightPosition.length() + extent * 2;
  camera.updateProjectionMatrix();
}

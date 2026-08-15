import { Box3, OrthographicCamera, Vector3 } from 'three';
import {
  applySplatColorPass,
  applySplatOccupancyPass,
  COLOR_MIN_ALPHA,
  fitShadowCameraToBox,
  floorPlaneFromSplatBox,
  OCCUPANCY_ALPHA,
} from './splat-compositor';

function mockPassTarget() {
  return {
    minAlpha: COLOR_MIN_ALPHA,
    material: {
      depthWrite: false,
      depthTest: true,
      colorWrite: true,
    },
  };
}

describe('splat compositor', () => {
  describe('applySplatOccupancyPass', () => {
    it('writes depth from solid cores and disables color', () => {
      const target = mockPassTarget();
      applySplatOccupancyPass(target);

      expect(target.minAlpha).toBe(OCCUPANCY_ALPHA);
      expect(target.material.depthWrite).toBe(true);
      expect(target.material.depthTest).toBe(true);
      expect(target.material.colorWrite).toBe(false);
    });
  });

  describe('applySplatColorPass', () => {
    it('restores soft alpha and stops writing depth', () => {
      const target = mockPassTarget();
      applySplatOccupancyPass(target);
      applySplatColorPass(target);

      expect(target.minAlpha).toBe(COLOR_MIN_ALPHA);
      expect(target.material.depthWrite).toBe(false);
      expect(target.material.depthTest).toBe(true);
      expect(target.material.colorWrite).toBe(true);
    });
  });

  describe('floorPlaneFromSplatBox', () => {
    it('returns a padded plane for a room-sized box', () => {
      const box = new Box3(new Vector3(-3, -1.5, -4), new Vector3(3, 2, 4));
      const floor = floorPlaneFromSplatBox(box);

      expect(floor).not.toBeNull();
      expect(floor?.y).toBeCloseTo(-1.49, 5);
      expect(floor?.width).toBeCloseTo(6 * 1.15, 5);
      expect(floor?.depth).toBeCloseTo(8 * 1.15, 5);
    });

    it('returns null for a small object capture', () => {
      const box = new Box3(new Vector3(-0.2, 0, -0.2), new Vector3(0.2, 0.4, 0.2));
      expect(floorPlaneFromSplatBox(box)).toBeNull();
    });
  });

  describe('fitShadowCameraToBox', () => {
    it('expands the ortho frustum to cover the box', () => {
      const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
      const box = new Box3(new Vector3(-4, -1, -4), new Vector3(4, 3, 4));
      fitShadowCameraToBox(camera, box, new Vector3(5, 9, 4));

      expect(camera.right).toBeGreaterThan(4);
      expect(camera.left).toBe(-camera.right);
      expect(camera.far).toBeGreaterThan(camera.near);
    });
  });
});

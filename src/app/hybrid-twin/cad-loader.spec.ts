import { Box3, BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { centerAndNormalize } from './cad-loader';

describe('centerAndNormalize', () => {
  it('moves the bounding-box center to the origin', () => {
    const mesh = new Mesh(new BoxGeometry(4, 2, 1), new MeshBasicMaterial());
    mesh.position.set(10, 5, -3);

    const root = centerAndNormalize(mesh, 2);
    root.updateMatrixWorld(true);

    const box = new Box3().setFromObject(root);
    const center = box.getCenter(new Vector3());

    expect(center.x).toBeCloseTo(0, 5);
    expect(center.y).toBeCloseTo(0, 5);
    expect(center.z).toBeCloseTo(0, 5);
  });

  it('scales the longest axis to the target size', () => {
    const mesh = new Mesh(new BoxGeometry(4, 2, 1), new MeshBasicMaterial());
    const root = centerAndNormalize(mesh, 2);
    root.updateMatrixWorld(true);

    const size = new Box3().setFromObject(root).getSize(new Vector3());
    expect(Math.max(size.x, size.y, size.z)).toBeCloseTo(2, 5);
  });
});

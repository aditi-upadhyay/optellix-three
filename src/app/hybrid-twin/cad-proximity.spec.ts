import {
  Box3,
  BoxGeometry,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  ShadowMaterial,
  Vector3,
  WebGLProgramParametersWithUniforms,
} from 'three';
import {
  applyCadProximityMaterial,
  applyCadProximityToObject,
  createProximityUniforms,
  interiorDistanceToAabb,
  PROXIMITY_RANGE,
  proximityFromDistance,
} from './cad-proximity';

function roomBox(): Box3 {
  return new Box3(new Vector3(-4, -2, -4), new Vector3(4, 2, 4));
}

function mockShader(): WebGLProgramParametersWithUniforms {
  return {
    uniforms: {},
    vertexShader: '',
    fragmentShader: [
      '#include <common>',
      '#include <color_fragment>',
      '#include <emissivemap_fragment>',
    ].join('\n'),
  } as unknown as WebGLProgramParametersWithUniforms;
}

describe('interiorDistanceToAabb', () => {
  it('returns the nearest interior-face distance for a centered inner box', () => {
    const inner = new Box3(new Vector3(-0.5, -0.5, -0.5), new Vector3(0.5, 0.5, 0.5));
    expect(interiorDistanceToAabb(inner, roomBox())).toBeCloseTo(1.5, 5);
  });

  it('returns 0 when the inner box sits on the floor', () => {
    const inner = new Box3(new Vector3(-0.5, -2, -0.5), new Vector3(0.5, -1, 0.5));
    expect(interiorDistanceToAabb(inner, roomBox())).toBe(0);
  });

  it('returns 0 when the inner box is outside the outer box', () => {
    const inner = new Box3(new Vector3(5, -0.5, -0.5), new Vector3(6, 0.5, 0.5));
    expect(interiorDistanceToAabb(inner, roomBox())).toBe(0);
  });
});

describe('proximityFromDistance', () => {
  it('maps contact to full proximity', () => {
    expect(proximityFromDistance(0)).toBe(1);
  });

  it('maps the range distance to zero', () => {
    expect(proximityFromDistance(PROXIMITY_RANGE)).toBe(0);
  });

  it('clamps distances beyond the range', () => {
    expect(proximityFromDistance(PROXIMITY_RANGE * 4)).toBe(0);
  });

  it('maps the midpoint linearly', () => {
    expect(proximityFromDistance(PROXIMITY_RANGE / 2)).toBeCloseTo(0.5, 5);
  });
});

describe('applyCadProximityMaterial', () => {
  it('injects uProximity and glow GLSL into MeshStandardMaterial', () => {
    const uniforms = createProximityUniforms();
    const material = new MeshStandardMaterial();
    applyCadProximityMaterial(material, uniforms);

    expect(material.customProgramCacheKey()).toBe('cad-proximity');

    const shader = mockShader();
    material.onBeforeCompile(shader, null as never);

    expect(shader.uniforms['uProximity']).toBe(uniforms.uProximity);
    expect(shader.fragmentShader).toContain('uniform float uProximity');
    expect(shader.fragmentShader).toContain('diffuseColor.rgb');
    expect(shader.fragmentShader).toContain('totalEmissiveRadiance');
  });

  it('skips ShadowMaterial so the occupancy floor is unchanged', () => {
    const uniforms = createProximityUniforms();
    const material = new ShadowMaterial();
    const before = material.onBeforeCompile;
    applyCadProximityMaterial(material, uniforms);

    expect(material.onBeforeCompile).toBe(before);
    expect(material.customProgramCacheKey()).not.toBe('cad-proximity');
  });

  it('patches every MeshStandardMaterial under a CAD root', () => {
    const uniforms = createProximityUniforms();
    const cad = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const skipped = new Mesh(new BoxGeometry(), new MeshBasicMaterial());
    cad.add(skipped);

    applyCadProximityToObject(cad, uniforms);

    expect((cad.material as MeshStandardMaterial).customProgramCacheKey()).toBe(
      'cad-proximity'
    );
    expect(
      (skipped.material as MeshBasicMaterial).customProgramCacheKey()
    ).not.toBe('cad-proximity');
  });
});

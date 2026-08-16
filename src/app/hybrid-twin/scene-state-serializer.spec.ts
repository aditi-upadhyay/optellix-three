import {
  SCENE_STATE_KEY,
  SceneCadState,
  SceneStateSerializer,
} from './scene-state-serializer';

class MemoryStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.has(key) ? this.data.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

function sampleState(): SceneCadState {
  return {
    version: 1,
    position: { x: 1.25, y: -0.4, z: 0.8 },
    rotation: { x: 0, y: 0.5, z: 0 },
    scale: { x: 1.5, y: 1.5, z: 1.5 },
  };
}

describe('SceneStateSerializer', () => {
  it('round-trips pose through JSON storage', () => {
    const storage = new MemoryStorage();
    const serializer = new SceneStateSerializer(storage);
    const state = sampleState();

    serializer.save(state);

    expect(storage.getItem(SCENE_STATE_KEY)).toBe(JSON.stringify(state));
    expect(serializer.load()).toEqual(state);
  });

  it('returns null for corrupt JSON', () => {
    const storage = new MemoryStorage();
    storage.setItem(SCENE_STATE_KEY, '{not-json');
    const serializer = new SceneStateSerializer(storage);

    expect(serializer.load()).toBeNull();
  });

  it('returns null for a wrong version', () => {
    const storage = new MemoryStorage();
    storage.setItem(
      SCENE_STATE_KEY,
      JSON.stringify({ ...sampleState(), version: 2 })
    );
    const serializer = new SceneStateSerializer(storage);

    expect(serializer.load()).toBeNull();
  });

  it('clears the stored key', () => {
    const storage = new MemoryStorage();
    const serializer = new SceneStateSerializer(storage);
    serializer.save(sampleState());
    serializer.clear();

    expect(storage.getItem(SCENE_STATE_KEY)).toBeNull();
    expect(serializer.load()).toBeNull();
  });
});

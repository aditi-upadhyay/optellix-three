export const SCENE_STATE_KEY = 'optellix.hybridTwin.cad';

export interface SceneCadState {
  version: 1;
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
  scale: { x: number; y: number; z: number };
}

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isVec3(value: unknown): value is { x: number; y: number; z: number } {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const vec = value as { x: unknown; y: unknown; z: unknown };
  return (
    isFiniteNumber(vec.x) && isFiniteNumber(vec.y) && isFiniteNumber(vec.z)
  );
}

function isSceneCadState(value: unknown): value is SceneCadState {
  if (!value || typeof value !== 'object') {
    return false;
  }
  const state = value as Partial<SceneCadState>;
  return (
    state.version === 1 &&
    isVec3(state.position) &&
    isVec3(state.rotation) &&
    isVec3(state.scale)
  );
}

/**
 * Save/load CAD pose as a JSON string in localStorage (or any Storage-like).
 */
export class SceneStateSerializer {
  constructor(private readonly storage: StorageLike = localStorage) {}

  serialize(state: SceneCadState): string {
    return JSON.stringify(state);
  }

  deserialize(json: string): SceneCadState | null {
    try {
      const parsed: unknown = JSON.parse(json);
      return isSceneCadState(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  save(state: SceneCadState): void {
    this.storage.setItem(SCENE_STATE_KEY, this.serialize(state));
  }

  load(): SceneCadState | null {
    const json = this.storage.getItem(SCENE_STATE_KEY);
    if (json == null) {
      return null;
    }
    return this.deserialize(json);
  }

  clear(): void {
    this.storage.removeItem(SCENE_STATE_KEY);
  }
}

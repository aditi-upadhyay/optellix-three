export const LOCAL_SPLAT_CANDIDATES = [
  'assets/environment.splat',
  'assets/environment.spz',
];

export const LOCAL_CAD_CANDIDATES = ['assets/cad.glb', 'assets/cad.stl'];

/** INRIA room capture — a real splat environment the CAD can sit inside. */
export const DEFAULT_SPLAT_URL =
  'https://huggingface.co/datasets/dylanebert/3dgs/resolve/main/room/room-7k.splat';

/** Khronos 2CylinderEngine — high-poly mechanical stand-in (archived sample models). */
export const DEFAULT_CAD_URL =
  'https://cdn.jsdelivr.net/gh/KhronosGroup/glTF-Sample-Models@master/2.0/2CylinderEngine/glTF-Binary/2CylinderEngine.glb';

export const CAD_TARGET_SIZE = 2;

/**
 * Return the first URL that responds, otherwise the fallback.
 * Local asset HEAD/Range probes 404 when the file is absent.
 */
export async function resolveAssetUrl(
  localCandidates: string[],
  fallback: string
): Promise<string> {
  for (const url of localCandidates) {
    if (await assetExists(url)) {
      return url;
    }
  }
  return fallback;
}

async function assetExists(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: { Range: 'bytes=0-0' },
    });
    return response.ok || response.status === 206;
  } catch {
    return false;
  }
}

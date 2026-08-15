import { Injectable, NgZone } from '@angular/core';
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark';
import {
  ACESFilmicToneMapping,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  PerspectiveCamera,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { centerAndNormalize, loadCadObject } from './cad-loader';

export interface CadTransform {
  x: number;
  y: number;
  z: number;
  rotY: number;
  scale: number;
}

@Injectable()
export class HybridSceneService {
  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;
  private controls: OrbitControls | null = null;
  private spark: SparkRenderer | null = null;
  private splat: SplatMesh | null = null;
  private cadRoot: Group | null = null;
  private frameId = 0;
  private resizeObserver: ResizeObserver | null = null;

  constructor(private readonly zone: NgZone) {}

  init(canvas: HTMLCanvasElement): void {
    const scene = new Scene();
    scene.background = new Color(0x07080b);

    const camera = new PerspectiveCamera(50, 1, 0.02, 250);
    camera.position.set(3.4, 1.7, 4.6);

    // Spark: WebGL antialiasing does not help Gaussians and tanks fill-rate.
    const renderer = new WebGLRenderer({
      canvas,
      antialias: false,
      alpha: false,
      powerPreference: 'high-performance',
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;

    const spark = new SparkRenderer({ renderer });
    scene.add(spark);

    scene.add(new HemisphereLight(0xd7e4f2, 0x1c1814, 0.9));
    const key = new DirectionalLight(0xfff3e4, 1.45);
    key.position.set(5, 9, 4);
    scene.add(key);

    const controls = new OrbitControls(camera, canvas);
    controls.enableDamping = true;
    controls.dampingFactor = 0.055;
    controls.target.set(0, 0.15, 0);
    controls.minDistance = 0.35;
    controls.maxDistance = 60;
    controls.update();

    this.scene = scene;
    this.camera = camera;
    this.renderer = renderer;
    this.spark = spark;
    this.controls = controls;

    this.resize(canvas);
    const host = canvas.parentElement ?? canvas;
    this.resizeObserver = new ResizeObserver(() => this.resize(canvas));
    this.resizeObserver.observe(host);

    this.zone.runOutsideAngular(() => {
      const tick = () => {
        this.frameId = requestAnimationFrame(tick);
        this.controls?.update();
        if (this.renderer && this.scene && this.camera) {
          this.renderer.render(this.scene, this.camera);
        }
      };
      tick();
    });
  }

  async loadSplat(
    url: string,
    onProgress?: (ratio: number) => void
  ): Promise<void> {
    this.clearSplat();
    const lower = url.split('?')[0].toLowerCase();
    const splat = new SplatMesh({
      url,
      fileType: lower.endsWith('.splat') ? SplatFileType.SPLAT : undefined,
      onProgress: (event) => {
        if (event.lengthComputable && event.total > 0) {
          onProgress?.(event.loaded / event.total);
        }
      },
    });

    // INRIA / .splat convention is Y-down; Three.js is Y-up.
    if (lower.endsWith('.splat') || lower.endsWith('.ksplat')) {
      splat.quaternion.set(1, 0, 0, 0);
    }

    this.scene?.add(splat);
    await splat.initialized;
    this.centerObjectAtOrigin(splat);
    this.splat = splat;
  }

  async loadCad(url: string): Promise<Group> {
    this.clearCad();
    const object = await loadCadObject(url);
    const root = centerAndNormalize(object);
    this.scene?.add(root);
    this.cadRoot = root;
    return root;
  }

  setSplatVisible(visible: boolean): void {
    if (this.splat) {
      this.splat.visible = visible;
    }
  }

  setCadVisible(visible: boolean): void {
    if (this.cadRoot) {
      this.cadRoot.visible = visible;
    }
  }

  setCadTransform(transform: CadTransform): void {
    if (!this.cadRoot) {
      return;
    }
    this.cadRoot.position.set(transform.x, transform.y, transform.z);
    this.cadRoot.rotation.set(0, transform.rotY, 0);
    this.cadRoot.scale.setScalar(transform.scale);
  }

  dispose(): void {
    cancelAnimationFrame(this.frameId);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.controls?.dispose();
    this.controls = null;
    this.clearSplat();
    this.clearCad();
    this.spark?.dispose();
    this.spark = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  private centerObjectAtOrigin(object: SplatMesh): void {
    object.updateMatrixWorld(true);
    const box = object.getBoundingBox(true).applyMatrix4(object.matrixWorld);
    const center = box.getCenter(new Vector3());
    object.position.sub(center);
  }

  private resize(canvas: HTMLCanvasElement): void {
    if (!this.renderer || !this.camera) {
      return;
    }
    const host = canvas.parentElement ?? canvas;
    const width = Math.max(host.clientWidth, 1);
    const height = Math.max(host.clientHeight, 1);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
  }

  private clearSplat(): void {
    if (!this.splat) {
      return;
    }
    this.splat.removeFromParent();
    this.splat.dispose();
    this.splat = null;
  }

  private clearCad(): void {
    if (!this.cadRoot) {
      return;
    }
    this.cadRoot.removeFromParent();
    this.cadRoot = null;
  }
}

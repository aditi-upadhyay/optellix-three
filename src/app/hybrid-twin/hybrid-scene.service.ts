import { Injectable, NgZone } from '@angular/core';
import { SparkRenderer, SplatFileType, SplatMesh } from '@sparkjsdev/spark';
import {
  ACESFilmicToneMapping,
  Box3,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  PCFSoftShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { centerAndNormalize, loadCadObject } from './cad-loader';
import {
  applyCadProximityToObject,
  createProximityUniforms,
  interiorDistanceToAabb,
  proximityFromDistance,
} from './cad-proximity';
import {
  applySplatColorPass,
  applySplatOccupancyPass,
  fitShadowCameraToBox,
  floorPlaneFromSplatBox,
} from './splat-compositor';

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
  private floor: Mesh | null = null;
  private keyLight: DirectionalLight | null = null;
  private frameId = 0;
  private resizeObserver: ResizeObserver | null = null;
  private splatWanted = true;
  private cadWanted = true;
  private splatBox: Box3 | null = null;
  private readonly cadWorldBox = new Box3();
  private readonly proximityUniforms = createProximityUniforms();

  compositingMode: 'occupancy+color' | 'mesh' = 'occupancy+color';
  floorShadowsEnabled = false;
  proximity = 0;

  constructor(private readonly zone: NgZone) {}

  init(canvas: HTMLCanvasElement): void {
    const scene = new Scene();
    // Color backgrounds force-clear depth on every render(); keep it null so
    // occupancy depth survives the CAD and splat-color sub-passes.

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
    renderer.setClearColor(0x07080b, 1);
    renderer.outputColorSpace = SRGBColorSpace;
    renderer.toneMapping = ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = PCFSoftShadowMap;
    renderer.autoClear = false;

    const spark = new SparkRenderer({
      renderer,
      depthTest: true,
      depthWrite: false,
      transparent: true,
    });
    scene.add(spark);

    scene.add(new HemisphereLight(0xd7e4f2, 0x1c1814, 0.9));
    const key = new DirectionalLight(0xfff3e4, 1.45);
    key.position.set(5, 9, 4);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.bias = -0.0005;
    key.shadow.normalBias = 0.02;
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
    this.keyLight = key;
    this.controls = controls;

    this.resize(canvas);
    const host = canvas.parentElement ?? canvas;
    this.resizeObserver = new ResizeObserver(() => this.resize(canvas));
    this.resizeObserver.observe(host);

    this.zone.runOutsideAngular(() => {
      const tick = () => {
        this.frameId = requestAnimationFrame(tick);
        this.controls?.update();
        this.renderFrame();
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
    this.installFloorFromSplat(splat);
    this.updateCadProximity();
    this.syncLayerVisibility();
  }

  async loadCad(url: string): Promise<Group> {
    this.clearCad();
    const object = await loadCadObject(url);
    const root = centerAndNormalize(object);
    applyCadProximityToObject(root, this.proximityUniforms);
    this.scene?.add(root);
    this.cadRoot = root;
    this.updateCadProximity();
    this.syncLayerVisibility();
    return root;
  }

  setSplatVisible(visible: boolean): void {
    this.splatWanted = visible;
    this.compositingMode = visible ? 'occupancy+color' : 'mesh';
    this.syncLayerVisibility();
  }

  setCadVisible(visible: boolean): void {
    this.cadWanted = visible;
    this.syncLayerVisibility();
  }

  setCadTransform(transform: CadTransform): void {
    if (!this.cadRoot) {
      return;
    }
    this.cadRoot.position.set(transform.x, transform.y, transform.z);
    this.cadRoot.rotation.set(0, transform.rotY, 0);
    this.cadRoot.scale.setScalar(transform.scale);
    this.updateCadProximity();
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
    this.keyLight = null;
    this.renderer?.dispose();
    this.renderer = null;
    this.scene = null;
    this.camera = null;
  }

  private renderFrame(): void {
    const renderer = this.renderer;
    const scene = this.scene;
    const camera = this.camera;
    const spark = this.spark;
    if (!renderer || !scene || !camera) {
      return;
    }

    const showSplat = this.splatWanted && !!this.splat && !!spark;
    const showCad = this.cadWanted && (!!this.cadRoot || !!this.floor);

    renderer.clear();

    if (showSplat && spark) {
      this.setMeshObjectsVisible(false);
      spark.visible = true;
      applySplatOccupancyPass(spark);
      renderer.render(scene, camera);
    }

    if (showCad) {
      if (spark) {
        spark.visible = false;
      }
      this.setMeshObjectsVisible(true);
      renderer.render(scene, camera);
    }

    if (showSplat && spark) {
      this.setMeshObjectsVisible(false);
      spark.visible = true;
      applySplatColorPass(spark);
      renderer.render(scene, camera);
    }

    this.syncLayerVisibility();
  }

  private setMeshObjectsVisible(visible: boolean): void {
    if (this.cadRoot) {
      this.cadRoot.visible = visible;
    }
    if (this.floor) {
      this.floor.visible = visible;
    }
  }

  private syncLayerVisibility(): void {
    if (this.spark) {
      this.spark.visible = this.splatWanted;
    }
    if (this.splat) {
      this.splat.visible = this.splatWanted;
    }
    if (this.cadRoot) {
      this.cadRoot.visible = this.cadWanted;
    }
    if (this.floor) {
      this.floor.visible = this.cadWanted;
    }
  }

  private installFloorFromSplat(splat: SplatMesh): void {
    this.clearFloor();
    splat.updateMatrixWorld(true);
    const box = splat.getBoundingBox(true).applyMatrix4(splat.matrixWorld);
    this.splatBox = box.clone();
    const spec = floorPlaneFromSplatBox(box);
    this.floorShadowsEnabled = spec !== null;
    if (spec && this.scene) {
      const mesh = new Mesh(
        new PlaneGeometry(spec.width, spec.depth),
        new ShadowMaterial({ opacity: 0.35, color: 0x000000 })
      );
      mesh.name = 'splatFloor';
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = spec.y;
      mesh.receiveShadow = true;
      this.scene.add(mesh);
      this.floor = mesh;
    }
    this.fitKeyLightShadow(box);
  }

  private fitKeyLightShadow(box: Box3): void {
    if (!this.keyLight) {
      return;
    }
    fitShadowCameraToBox(
      this.keyLight.shadow.camera,
      box,
      this.keyLight.position
    );
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

  private updateCadProximity(): void {
    if (!this.cadRoot || !this.splatBox) {
      this.proximity = 0;
      this.proximityUniforms.uProximity.value = 0;
      return;
    }
    this.cadRoot.updateMatrixWorld(true);
    this.cadWorldBox.setFromObject(this.cadRoot);
    const distance = interiorDistanceToAabb(this.cadWorldBox, this.splatBox);
    this.proximity = proximityFromDistance(distance);
    this.proximityUniforms.uProximity.value = this.proximity;
  }

  private clearSplat(): void {
    this.clearFloor();
    this.splatBox = null;
    if (this.splat) {
      this.splat.removeFromParent();
      this.splat.dispose();
      this.splat = null;
    }
    this.updateCadProximity();
  }

  private clearFloor(): void {
    if (!this.floor) {
      this.floorShadowsEnabled = false;
      return;
    }
    this.floor.geometry.dispose();
    const material = this.floor.material;
    if (!Array.isArray(material)) {
      material.dispose();
    }
    this.floor.removeFromParent();
    this.floor = null;
    this.floorShadowsEnabled = false;
  }

  private clearCad(): void {
    if (!this.cadRoot) {
      return;
    }
    this.cadRoot.removeFromParent();
    this.cadRoot = null;
    this.updateCadProximity();
  }
}

import {
  AfterViewInit,
  Component,
  ElementRef,
  NgZone,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import {
  DEFAULT_CAD_URL,
  DEFAULT_SPLAT_URL,
  LOCAL_CAD_CANDIDATES,
  LOCAL_SPLAT_CANDIDATES,
  resolveAssetUrl,
} from './assets.config';
import { HybridSceneService } from './hybrid-scene.service';

export type LayerMode = 'both' | 'splat' | 'cad';

@Component({
  selector: 'app-hybrid-twin',
  templateUrl: './hybrid-twin.component.html',
  styleUrls: ['./hybrid-twin.component.css'],
  providers: [HybridSceneService],
})
export class HybridTwinComponent implements AfterViewInit, OnDestroy {
  @ViewChild('viewport', { static: true })
  private viewportRef!: ElementRef<HTMLCanvasElement>;

  status = 'Initializing renderer';
  progress: number | null = null;
  error: string | null = null;
  ready = false;
  layerMode: LayerMode = 'both';

  cadX = 0;
  cadY = 0;
  cadZ = 0;
  cadRotY = 0;
  cadScale = 1;

  constructor(
    private readonly scene: HybridSceneService,
    private readonly zone: NgZone
  ) {}

  ngAfterViewInit(): void {
    this.scene.init(this.viewportRef.nativeElement);
    void this.boot();
  }

  ngOnDestroy(): void {
    this.scene.dispose();
  }

  setLayer(mode: LayerMode): void {
    this.layerMode = mode;
    this.scene.setSplatVisible(mode !== 'cad');
    this.scene.setCadVisible(mode !== 'splat');
  }

  onCadTransform(): void {
    this.scene.setCadTransform({
      x: this.cadX,
      y: this.cadY,
      z: this.cadZ,
      rotY: this.degToRad(this.cadRotY),
      scale: this.cadScale,
    });
  }

  get progressLabel(): string {
    if (this.progress == null) {
      return '';
    }
    return `${Math.round(this.progress * 100)}%`;
  }

  get compositingMode(): string {
    return this.scene.compositingMode;
  }

  get floorShadowsLabel(): string {
    return this.scene.floorShadowsEnabled ? 'on' : 'off';
  }

  private async boot(): Promise<void> {
    const errors: string[] = [];

    this.setStatus('Resolving assets');
    const splatUrl = await resolveAssetUrl(
      LOCAL_SPLAT_CANDIDATES,
      DEFAULT_SPLAT_URL
    );
    const cadUrl = await resolveAssetUrl(
      LOCAL_CAD_CANDIDATES,
      DEFAULT_CAD_URL
    );

    try {
      this.setStatus('Loading Gaussian environment');
      this.progress = 0;
      await this.scene.loadSplat(splatUrl, (ratio) => {
        this.zone.run(() => {
          this.progress = ratio;
        });
      });
    } catch (err) {
      errors.push(`Splat: ${this.toMessage(err)}`);
    }

    this.progress = null;

    try {
      this.setStatus('Loading mechanical CAD');
      await this.scene.loadCad(cadUrl);
      this.onCadTransform();
    } catch (err) {
      errors.push(`CAD: ${this.toMessage(err)}`);
    }

    this.setLayer(this.layerMode);
    this.error = errors.length ? errors.join(' · ') : null;
    this.ready = errors.length < 2;
    this.setStatus(this.ready ? 'Hybrid scene live' : 'Load failed');
  }

  private toMessage(err: unknown): string {
    return err instanceof Error ? err.message : String(err);
  }

  private setStatus(status: string): void {
    this.zone.run(() => {
      this.status = status;
    });
  }

  private degToRad(degrees: number): number {
    return (degrees * Math.PI) / 180;
  }
}

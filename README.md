# Hybrid Twin

Angular 16 + Three.js viewer that composites a mechanical CAD mesh into a Gaussian splat environment (Spark).

Live: [https://optellix.netlify.app/](https://optellix.netlify.app/)

## Run

Requires Node 16+.

```bash
npm install && npm run dev
```

`npm run dev` and `npm start` both run `ng serve`. Open [http://localhost:4200](http://localhost:4200).

```bash
npm test          # Karma / Jasmine unit tests
npm run build     # production bundle → dist/front-end
```

On first load the app probes `src/assets/` (`environment.splat` / `environment.spz`, `cad.glb` / `cad.stl`). If those files are missing it falls back to a public INRIA room splat and the Khronos 2CylinderEngine glb.

## Architectural Decisions

**Depth-sync, not a spatial index.**

A custom octree or BVH over Gaussians would help if this viewer needed its own LOD or per-splat frustum culling. It does not. Spark already sorts and rasterizes the cloud. The actual failure mode is compositing: splat renderers alpha-sort billboards and typically do not write a WebGL depth buffer the CAD can test against. Opaque triangles then either punch through walls that are in front of them, or vanish behind the entire cloud.

Each frame is three `renderer.render` calls on one framebuffer (`HybridSceneService.renderFrame`):

1. **Occupancy** — splat only, color off, `minAlpha = 0.4`. Dense cores (floor, walls) write depth; soft halos do not.
2. **CAD** — mesh + shadow floor, Spark hidden. Triangles fail the depth test where the room is occupied, and write their own depth everywhere else.
3. **Color** — splat again with Spark’s normal soft alpha, depth test on, depth write off.

Those two splat states live in `splat-compositor.ts` (`applySplatOccupancyPass` / `applySplatColorPass`). Related constraints that fell out of that choice:

- `scene.background` stays null and `autoClear` is false. A scene clear color wipes occupancy depth between sub-passes.
- `material.transparent` is never toggled between passes (Spark recompiles). Only `minAlpha`, `depthWrite`, and `colorWrite` change.
- A `ShadowMaterial` floor is added only when the splat AABB is room-scale (X and Z > 1.5). The shadow camera is fitted to that same box.

CAD is centered and scaled so its longest axis is 2 world units. Alignment is a parent-group transform from the HUD sliders.

Proximity glow reuses the splat AABB rather than indexing individual Gaussians: distance from the CAD box to the nearest interior face (floor / walls) is `uProximity`, injected into `MeshStandardMaterial` with `onBeforeCompile` so lighting and shadows stay. Pose (position, rotation, scale) is JSON in `localStorage` via `SceneStateSerializer`.

## Bottlenecks Handled

**Memory.** Splat decode and a dense glTF in the same tab will OOM if both allocate at once. Assets load sequentially (splat `initialized`, then CAD). Local-file probes are `Range: bytes=0-0`, not a full GET of a missing capture. Reloading a layer disposes the previous splat / floor / CAD GPU objects before the next allocate; `ngOnDestroy` also tears down the rAF loop, ResizeObserver, Spark, and the renderer. CAD is normalized to 2 world units so a millimetre-unit mesh cannot explode the shadow frustum or vertex work.

**UI performance.** The hot path is the three GPU passes, not Angular. The rAF tick runs in `NgZone.runOutsideAngular`; HUD status re-enters the zone only when a load event changes it. WebGL antialiasing is off (no benefit on Gaussians, high fill-rate cost) and `pixelRatio` is capped at 2. Layer buttons skip whole compositing passes. The HUD is DOM over the canvas, so sliders write a transform only — they do not rebuild geometry. `uProximity` updates on mesh move, not every frame.

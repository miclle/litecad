# Three.js Viewer Rules

These rules apply to Three.js code under `website/src/views/project/`.

## Scope

- Keep the project workbench a browser-native preview/viewer shell until persisted CAD geometry exists.
- Do not render hard-coded demo geometry as project model data. Viewer scenes may show neutral grid, axis, empty-state context, or one or more project-owned backend preview artifacts such as OBJ, self-contained GLTF, or GLB meshes.
- Do not add raw CAD source loaders directly to the Three.js viewer. STEP import, tessellation, constrained box-union execution, STEP export, and LiteCAD feature DSL preview/export live behind the browser CAD kernel worker described in `docs/browser-cad-kernel-roadmap.md`. The viewer consumes worker-produced STEP/DSL mesh buffers plus backend-provided GLB/GLTF/STL preview artifacts, keys repeated scene instances by occurrence ID, and applies persisted occurrence placement at the scene-object layer.
- Keep `website/src/cad/opencascade-step.ts` focused on the OpenCascade loader, STEP virtual-file I/O, document-operation replay, tessellation, and STEP serialization. LiteCAD Feature DSL sequencing and shape construction live in `website/src/cad/feature-dsl/compile-runtime.ts`; feature-family capability and dispatch ownership live beside it in `compile-primitives.ts`, `compile-sketch-features.ts`, `compile-booleans.ts`, `compile-modifiers.ts`, and `compile-feature.ts`. Shared OCCT types stay in `compiler-context.ts`; do not move these responsibilities back into the STEP adapter or Three.js scene hooks.
- Treat saved `.scad` / OpenSCAD-style generated models as parameterized source assets until LiteCAD ships a compatible OpenSCAD browser compile runtime. Saved `.lcad.json` / LiteCAD feature DSL models may preview only through the browser CAD kernel worker `feature-dsl-preview` path and export only through `feature-dsl-export`. Do not render placeholder meshes for generated source models, and do not route generated source through Three.js directly.
- Keep product data fetching, route state, and backend DTOs out of low-level Three.js scene construction.
- For multi-source preview, load assets into a scene group and frame the combined bounds. The CAD document schema v3 assembly owns occurrence identity, name, order, parent group, suppression, revision binding, and placement used by preview and selected STEP compound download. Multiple occurrences may reference one source model; direct suppression or suppression by any ancestor group keeps an occurrence durable but excludes it from the scene and export. Organizational groups and unresolved mate records do not imply a solver, reusable subassembly documents, source STEP product-structure preservation, or cross-model merge semantics.
- Prefer small viewer helpers for geometry, orientation math, event contracts, texture creation, and resource cleanup before adding broad renderer abstractions.

## Lifecycle

- Keep `model-preview.tsx` as a thin render surface. `useModelPreviewScene(...)` owns renderer/camera/controls/listener lifecycle, `useModelPreviewResources()` owns object maps and stale async-loader rejection, `useModelPreviewSelection(...)` owns live callback, selection, visibility, and transform refs, and `model-preview-grid.ts` owns pure CAD grid/axis geometry helpers.
- Every `WebGLRenderer` created by a React effect must be disposed in that effect cleanup and its canvas removed from the container.
- Start a new resource generation whenever preview assets rebuild the scene. Objects returned by an older OBJ/GLTF loader generation must be disposed instead of attached to the current scene.
- Dispose scene resources through `disposeObject3DResources()` or extend that helper when adding new disposable Three.js resource types.
- Cancel every `requestAnimationFrame`, timeout, `ResizeObserver`, pointer listener, window listener, and Three.js control listener registered by the effect.
- Keep renderer sizing derived from the container, not `window.innerWidth`, for embedded viewer surfaces.

## Interaction

- Convert pointer coordinates from the renderer canvas bounds before raycasting.
- Keep view orientation changes flowing through the existing view event helpers in `view-events.ts`.
- Do not auto-load or follow `threejs-interaction` skill guidance unless the user explicitly requests it; its install audit reported Critical Risk.
- Disable competing camera controls while dragging scene objects, and restore controls and pointer capture on pointer up or cancel.
- Do not add scene-object dragging unless real project geometry exists and the interaction is covered by tests or browser verification.

## Tests

- Put pure math, event contract, resource disposal, texture, and geometry-helper tests next to the viewer code with Vitest.
- For interaction changes that cannot be covered well in jsdom, run a rendered browser verification with `webapp-testing` and report any remaining manual risk.

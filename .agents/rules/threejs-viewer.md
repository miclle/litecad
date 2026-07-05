# Three.js Viewer Rules

These rules apply to Three.js code under `website/src/views/project/`.

## Scope

- Keep the project workbench a browser-native preview/viewer shell until persisted CAD geometry exists.
- Do not render hard-coded demo geometry as project model data. Viewer scenes may show neutral grid, axis, empty-state context, or project-owned backend preview artifacts such as OBJ, GLTF, or GLB meshes.
- Do not add raw CAD source loaders to the frontend viewer. STEP, STL, and other CAD source parsing belongs in the backend import/normalization pipeline.
- Keep product data fetching, route state, and backend DTOs out of low-level Three.js scene construction.
- Prefer small viewer helpers for geometry, orientation math, event contracts, texture creation, and resource cleanup before adding broad renderer abstractions.

## Lifecycle

- Every `WebGLRenderer` created by a React effect must be disposed in that effect cleanup and its canvas removed from the container.
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

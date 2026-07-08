# TODO

Active roadmap and cleanup for LiteCAD. Keep this file limited to unfinished work, deferred decisions, and known risks; move completed facts into README or focused docs.

## Product Capability

- Extend the persisted CAD document model beyond the current root model nodes, transform matrices, transform operations, constrained box-union operations, schema version, revision, and unit. Current projects still do not store durable kernel shape state, rich feature/version semantics, or a complete design-history graph.
- Continue the CAD import and geometry pipeline beyond completed STEP/STP/self-contained GLTF/GLB/STL source upload, lightweight metadata extraction, browser-kernel STEP preview tessellation, GLB/self-contained GLTF preview publishing, STL-to-OBJ preview conversion, preview artifact metadata, and read-only geometry document API:
  - Treat OBJ/GLB preview meshes as derived display artifacts, not editable CAD source of truth.
  - Define editable B-rep geometry records and CAD feature/version semantics beyond uploaded sources, persisted transform/box-union operations, preview artifacts, and generated read-only version snapshots.
- Define durable assembly semantics for multi-source projects beyond completed per-model transform persistence, per-model box-union edits, per-model direct STEP export, and selected multi-model STEP compound download, including explicit cross-model merge/boolean behavior and editable assembly records. Current multi-model support is browser preview composition, persisted placement, and selected STEP compound export; it does not combine multiple STEP files into one editable CAD part.
- Add measurement, sectioning, edge display, backend export artifact history, and richer export workflows after real editable geometry is available.
- Define AI orchestration APIs for prompt-to-design iterations, including provider boundaries, request history, failure states, and cost controls.

## Backend And Data

- Add update/delete APIs for projects if the product needs project renaming, archival, or cleanup.
- Decide whether product-facing URLs should keep exposing prefixed entity IDs such as `project_...`, or introduce project slugs / slug-plus-short-id routes while preserving prefixed IDs as internal canonical identifiers.
- Add session lifecycle hardening such as explicit expiry tests around stale cookies and optional session pruning.
- Decide whether `internal/errors` should remain as a legacy package or be replaced entirely by `pkg/httperr`.

## Frontend

- Continue shrinking the project workbench hotspot by extracting focused pieces from `website/src/views/project/view-controller.tsx` and `website/src/views/project/model-preview.tsx`, while keeping renderer lifecycle, view events, and resource disposal aligned with `.agents/rules/threejs-viewer.md`.
- Replace model-tree transform editing with a selected-model workflow: click a model in the tree or canvas, show its properties in the DOCUMENT inspector, and expose axis-based canvas translate controls that persist through the existing CAD document transform API.
- Add route protection UX for `/projects` and `/projects/:projectId` so signed-out users get a deliberate sign-in flow instead of only relying on the Axios 401 redirect.
- Add focused tests for project creation UI behavior and project detail loading/error states.
- Introduce Playwright-based browser verification for the CAD workbench after the first stable viewer flows exist. Start with an optional task for installing Chromium and local screenshot/interaction smoke checks; only fold Playwright browser installation into `task install` or CI once real Playwright tests are part of the supported test suite.

## Documentation And Operations

- Keep [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md) current as browser-kernel feasibility results, package choices, limitations, and phase completions become known.
- Document production deployment once database provisioning, config injection, and binary release flow are settled.
- Keep README, AGENTS.md, and `.agents/rules/` aligned whenever shipped capabilities move out of this TODO.

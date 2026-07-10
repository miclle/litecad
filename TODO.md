# TODO

Active roadmap and cleanup for LiteCAD. Keep this file limited to unfinished work, deferred decisions, and known risks; move completed facts into README or focused docs.

## Product Capability

- Extend the persisted CAD document model beyond the current uploaded-source nodes, independently selectable lightweight STEP component child nodes, transform/delete-node/box-union operations, database-backed reversible operation History, schema version, revision, and unit. Current projects still do not store durable kernel shape state, rich parametric feature/version semantics, true geometric STEP decomposition, or a general B-rep feature graph.
- Continue the CAD import and geometry pipeline beyond completed STEP/STP/self-contained GLTF/GLB/STL source upload, lightweight metadata extraction, browser-kernel STEP preview tessellation, GLB/self-contained GLTF preview publishing, STL-to-OBJ preview conversion, preview artifact metadata, and read-only geometry document API:
  - Treat OBJ/GLB preview meshes as derived display artifacts, not editable CAD source of truth.
  - Define editable B-rep geometry records and CAD feature/version semantics beyond uploaded sources, persisted transform/box-union operations, preview artifacts, and generated read-only version snapshots.
- Define durable assembly semantics for multi-source projects beyond completed per-model transform persistence, per-model box-union edits, per-model direct STEP export, and selected multi-model STEP compound download, including explicit cross-model merge/boolean behavior and editable assembly records. Current multi-model support is browser preview composition, persisted placement, and selected STEP compound export; it does not combine multiple STEP files into one editable CAD part.
- Add measurement, sectioning, edge display, backend export artifact history, and richer export workflows after real editable geometry is available.
- Extend the current CAD Agent beyond project-scoped OpenAI-compatible chat and persisted messages: define tool-call boundaries, prompt-to-design iteration records, geometry mutation permissions, richer failure states, cost controls, and tests for cross-project context isolation.

## Backend And Data

- Add update/delete APIs for projects if the product needs project renaming, archival, or cleanup.
- Decide whether product-facing URLs should keep exposing prefixed entity IDs such as `project_...`, or introduce project slugs / slug-plus-short-id routes while preserving prefixed IDs as internal canonical identifiers.
- Add session lifecycle hardening such as explicit expiry tests around stale cookies and optional session pruning.
- Decide whether `internal/errors` should remain as a legacy package or be replaced entirely by `pkg/httperr`.

## Frontend

- Continue shrinking the project workbench hotspots after moving serialized CAD command coordination, revision conflicts, transform autosave, STEP export feedback, History controls, Assistant, model tree, and Inspector out of `website/src/views/project/index.tsx`. Next split scene/resource/selection lifecycles in `website/src/views/project/model-preview.tsx` while keeping renderer lifecycle, view events, and resource disposal aligned with the project rules.
- Add route protection UX for `/projects` and `/projects/:projectId` so signed-out users get a deliberate sign-in flow instead of only relying on the Axios 401 redirect.
- Add focused tests for project creation UI behavior and project detail loading/error states.
- Introduce Playwright-based browser verification for the existing CAD workbench flows. Start with an optional task for installing Chromium and local screenshot/interaction smoke checks; only fold Playwright browser installation into `task install` or CI once real Playwright tests are part of the supported test suite.

## Documentation And Operations

- Keep [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md) current as browser-kernel feasibility results, package choices, limitations, and phase completions become known.
- Document production deployment once database provisioning, config injection, and binary release flow are settled.
- Keep README, AGENTS.md, and `.agents/rules/` aligned whenever shipped capabilities move out of this TODO.

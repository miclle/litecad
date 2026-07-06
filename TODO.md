# TODO

Active roadmap and cleanup for LiteCAD. Keep this file limited to unfinished work, deferred decisions, and known risks; move completed facts into README or focused docs.

## Product Capability

- Define the persisted CAD document model beyond uploaded source-file records, lightweight metadata, generated preview artifacts, and read-only geometry snapshots. Current projects do not store editable CAD features, B-rep semantics, or versioned editable geometry documents.
- Continue the CAD import and geometry pipeline beyond completed STEP/STP/self-contained GLTF/GLB/STL source upload, lightweight metadata extraction, STEP-to-OBJ preview conversion, GLB/self-contained GLTF preview publishing, STL-to-OBJ preview conversion, preview artifact metadata, and read-only geometry document API:
  - Promote backend preview generation to a canonical Three.js-friendly artifact format, preferably GLB, so STEP and STL previews do not remain OBJ fallback artifacts. FreeCAD's headless `Mesh.export` path currently supports the OBJ fallback but did not export GLB directly in local verification, so GLB likely needs a dedicated converter step or packaged geometry service.
  - Define editable geometry records and CAD feature/version semantics beyond uploaded sources, preview artifacts, and generated read-only version snapshots.
- Define assembly semantics for multi-source projects, including per-model transforms, selection, visibility, persisted placement, and explicit merge/boolean/export behavior. Current multi-model support is browser preview composition only; it does not combine multiple STEP files into one editable CAD part.
- Decide whether STEP preview conversion should remain FreeCAD-backed server-side conversion or move toward a packaged/headless geometry service for production.
- Add measurement, sectioning, edge display, and export workflows after real geometry is available.
- Define AI orchestration APIs for prompt-to-design iterations, including provider boundaries, request history, failure states, and cost controls.

## Backend And Data

- Add update/delete APIs for projects if the product needs project renaming, archival, or cleanup.
- Decide whether product-facing URLs should keep exposing prefixed entity IDs such as `project_...`, or introduce project slugs / slug-plus-short-id routes while preserving prefixed IDs as internal canonical identifiers.
- Add session lifecycle hardening such as explicit expiry tests around stale cookies and optional session pruning.
- Decide whether `internal/errors` should remain as a legacy package or be replaced entirely by `pkg/httperr`.

## Frontend

- Continue shrinking the project workbench hotspot by extracting focused pieces from `website/src/views/project/view-controller.tsx` and `website/src/views/project/model-preview.tsx`, while keeping renderer lifecycle, view events, and resource disposal aligned with `.agents/rules/threejs-viewer.md`.
- Add route protection UX for `/projects` and `/projects/:projectId` so signed-out users get a deliberate sign-in flow instead of only relying on the Axios 401 redirect.
- Add focused tests for project creation UI behavior and project detail loading/error states.
- Introduce Playwright-based browser verification for the CAD workbench after the first stable viewer flows exist. Start with an optional task for installing Chromium and local screenshot/interaction smoke checks; only fold Playwright browser installation into `task install` or CI once real Playwright tests are part of the supported test suite.

## Documentation And Operations

- Add a focused architecture document when the CAD document, upload, and conversion boundaries are chosen.
- Document production deployment once database provisioning, config injection, and binary release flow are settled.
- Keep README, AGENTS.md, and `.agents/rules/` aligned whenever shipped capabilities move out of this TODO.

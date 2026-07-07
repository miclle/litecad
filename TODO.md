# TODO

Active roadmap and cleanup for LiteCAD. Keep this file limited to unfinished work, deferred decisions, and known risks; move completed facts into README or focused docs.

## Product Capability

- Execute the browser CAD kernel migration defined in [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md). Each phase must finish with tests/verification, docs updates, and a scoped commit before starting the next phase:
  - Phase 2 cleanup: remove or quarantine the old backend FreeCAD-backed STEP preview endpoint now that the visible workbench STEP preview uses browser-kernel mesh buffers. The project is not launched, so no long-lived compatibility path is required.
  - Phase 3: introduce an editable LiteCAD CAD document MVP with persisted operation/document state, starting from transforms and one proven kernel-backed CAD edit.
  - Phase 4: export the current browser-edited B-rep document to STEP and verify import -> edit -> export -> re-import.
  - Phase 5: remove FreeCAD/Python from the normal runtime conversion path, delete or quarantine `freecad_step_to_obj.py`, and update runtime docs and setup.
- Define the persisted CAD document model beyond uploaded source-file records, lightweight metadata, generated preview artifacts, and read-only geometry snapshots. Current projects do not store editable CAD features, B-rep semantics, or versioned editable geometry documents.
- Continue the CAD import and geometry pipeline beyond completed STEP/STP/self-contained GLTF/GLB/STL source upload, lightweight metadata extraction, browser-kernel STEP preview tessellation, GLB/self-contained GLTF preview publishing, STL-to-OBJ preview conversion, preview artifact metadata, and read-only geometry document API:
  - Treat OBJ/GLB preview meshes as derived display artifacts, not editable CAD source of truth.
  - Define editable geometry records and CAD feature/version semantics beyond uploaded sources, preview artifacts, and generated read-only version snapshots.
- Define assembly semantics for multi-source projects, including per-model transforms, selection, visibility, persisted placement, and explicit merge/boolean/export behavior. Current multi-model support is browser preview composition only; it does not combine multiple STEP files into one editable CAD part.
- Do not deepen the FreeCAD-backed STEP preview path except for short-term bug fixes. The target architecture is an embedded browser CAD kernel, not a third-party desktop CAD application runtime dependency.
- Add measurement, sectioning, edge display, and export workflows after real editable geometry is available.
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

- Keep [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md) current as browser-kernel feasibility results, package choices, limitations, and phase completions become known.
- Document production deployment once database provisioning, config injection, and binary release flow are settled.
- Keep README, AGENTS.md, and `.agents/rules/` aligned whenever shipped capabilities move out of this TODO.

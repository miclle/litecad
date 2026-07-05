# TODO

Active roadmap and cleanup for LiteCAD. Keep this file limited to unfinished work, deferred decisions, and known risks; move completed facts into README or focused docs.

## Product Capability

- Define the persisted CAD document model for a project. Current projects store metadata only: owner, name, description, and timestamps.
- Add CAD asset upload and metadata extraction for STEP, STL, and GLB files.
- Decide the STEP preview conversion boundary: server-side conversion to web-friendly mesh/GLB, client-side parsing, or a hybrid pipeline.
- Replace demo geometry in the project workbench with project-owned geometry or uploaded/generated preview data.
- Add measurement, sectioning, edge display, and export workflows after real geometry is available.
- Define AI orchestration APIs for prompt-to-design iterations, including provider boundaries, request history, failure states, and cost controls.

## Backend And Data

- Remove or repurpose the template `entity.Example` model and its migration once no code path needs it.
- Add update/delete APIs for projects if the product needs project renaming, archival, or cleanup.
- Add session lifecycle hardening such as explicit expiry tests around stale cookies and optional session pruning.
- Decide whether `internal/errors` should remain as a legacy package or be replaced entirely by `pkg/httperr`.

## Frontend

- Continue shrinking the project workbench hotspot by keeping demo-scene setup and page shell in focused modules with targeted tests.
- Add route protection UX for `/projects` and `/projects/:projectId` so signed-out users get a deliberate sign-in flow instead of only relying on the Axios 401 redirect.
- Add focused tests for project creation UI behavior, project detail loading/error states, and viewer shell event boundaries.
- Verify the CAD viewer shell across desktop and mobile viewports once project geometry is connected.

## Documentation And Operations

- Add a focused architecture document when the CAD document, upload, and conversion boundaries are chosen.
- Document production deployment once database provisioning, config injection, and binary release flow are settled.
- Keep README, AGENTS.md, and `.agents/rules/` aligned whenever shipped capabilities move out of this TODO.

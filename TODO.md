# TODO

Active roadmap and cleanup for LiteCAD. Keep this file limited to unfinished work, deferred decisions, and known risks; move completed facts into README or focused docs.

## Product Capability

- Extend the persisted CAD document model beyond the current uploaded-source nodes, independently selectable lightweight STEP component child nodes, transform/delete-node/box-union operations, database-backed reversible operation History, schema version, revision, and unit. Current projects still do not store durable kernel shape state, rich parametric feature/version semantics, true geometric STEP decomposition, or a general B-rep feature graph.
- Continue the CAD import and geometry pipeline beyond completed STEP/STP/self-contained GLTF/GLB/STL source upload, lightweight metadata extraction, browser-kernel STEP preview tessellation, GLB/self-contained GLTF preview publishing, STL-to-OBJ preview conversion, preview artifact metadata, and read-only geometry document API:
  - Treat OBJ/GLB preview meshes as derived display artifacts, not editable CAD source of truth.
  - Define editable B-rep geometry records and CAD feature/version semantics beyond uploaded sources, persisted transform/box-union operations, preview artifacts, and generated read-only version snapshots.
- Define durable assembly semantics for multi-source projects beyond completed per-model transform persistence, per-model box-union edits, per-model direct STEP export, and selected multi-model STEP compound download, including explicit cross-model merge/boolean behavior and editable assembly records. Current multi-model support is browser preview composition, persisted placement, and selected STEP compound export; it does not combine multiple STEP files into one editable CAD part.
- Add measurement, sectioning, edge display, backend export artifact history, and richer export workflows after real editable geometry is available.
- Continue the AI Parametric Assistant described in [docs/ai-parametric-assistant.md](docs/ai-parametric-assistant.md) and [docs/superpowers/plans/2026-07-11-ai-parametric-assistant.md](docs/superpowers/plans/2026-07-11-ai-parametric-assistant.md): richer LiteCAD-native OCCT feature DSL support beyond the current rectangular/circular extrude, rectangular/circular extrude cut with positive/negative/symmetric direction, box, box-cut, cylinder, sphere, cylinder-cut, and repeat foundation with numeric parameters and structured `add`/`sub`/`mul`/`div` numeric expressions. Multi-session Assistant conversations, native OpenAI-compatible `build_parametric_model` tool calls with strict JSON fallback after native tool-call failures, provider `timeout_seconds` and `max_output_tokens` controls, safe persisted Assistant failure messages for invalid provider tool output, basic parametric generation status, retry guidance, response run telemetry, persisted artifact-level generation telemetry for list/detail reads, LiteCAD DSL schema validation for generated tool output, pending artifact draft creation, an Inspector-side draft editor with parsed parameter controls including boolean/string UI metadata, browser-kernel preview for pending LiteCAD DSL drafts before save, save-as-`.scad` and save-as-`.lcad.json` project model persistence for successful artifacts, saved `.scad`/`.lcad.json` locally immediate preview updates with automatically debounced parameter revision persistence and reversible History entries, saved `.lcad.json` browser-kernel mesh preview updates inside the existing viewer scene through `feature-dsl-preview`, and saved `.lcad.json` STEP export through `feature-dsl-export` are implemented.
  - Add a license-compatible OpenSCAD browser runtime only if the license decision deliberately permits it; otherwise keep generated models on the LiteCAD-native OCCT feature DSL path. The first feature DSL worker foundation can already compile numeric-parameter and structured-expression rectangular/circular extrude, rectangular/circular extrude cut with positive/negative/symmetric direction, box, box-cut, cylinder, sphere, and cylinder-cut features with optional non-zero cylinder axes and bounded linear repeat patterns to OCCT mesh/STEP, and the Assistant/project persistence path now stores `litecad-feature-dsl` artifacts as `.lcad.json` models with preview and STEP export.
  - Add other curved primitive support only after the LiteCAD feature DSL schema, backend validation, browser preview worker, and STEP export path implement it end to end; unsupported primitive requests should fail explicitly rather than create substitute geometry.
  - Add full provider analytics, richer long-run progress details, and provider-specific tuning before exposing longer generation workflows.
  - Add source-code editing and diff review for generated parametric artifacts only if product usage demands direct code control.

## Backend And Data

- Add update/delete APIs for projects if the product needs project renaming, archival, or cleanup.
- Decide whether product-facing URLs should keep exposing prefixed entity IDs such as `project_...`, or introduce project slugs / slug-plus-short-id routes while preserving prefixed IDs as internal canonical identifiers.
- Add session lifecycle hardening such as explicit expiry tests around stale cookies and optional session pruning.
- Keep new project HTTP behavior inside the established `project.go`, `project_models.go`, `project_cad.go`, `project_agent.go`, and `project_errors.go` domain boundaries instead of rebuilding a single project handler hotspot.

## Frontend

- Continue shrinking the remaining project workbench composition hotspot in `website/src/views/project/index.tsx` after moving route commands and controlled surfaces out of that file and splitting `ModelPreview` into a thin component plus scene, resource-generation, and live selection/transform hooks. Preserve the new renderer cleanup, stale-loader disposal, view-event, and resource ownership boundaries during later viewer work.
- Add route protection UX for `/projects` and `/projects/:projectId` so signed-out users get a deliberate sign-in flow instead of only relying on the Axios 401 redirect.
- Add focused tests for project creation UI behavior and project detail loading/error states.
- Expand the supported deterministic Playwright workbench smoke beyond route/History/Assistant coverage to real import, selection, transform, conflict, Undo/Redo, and export fixtures before making browser installation part of `task install` or CI.

## Documentation And Operations

- Keep [docs/browser-cad-kernel-roadmap.md](docs/browser-cad-kernel-roadmap.md) current as browser-kernel feasibility results, package choices, limitations, and phase completions become known.
- Document production deployment once database provisioning, config injection, and binary release flow are settled.
- Keep README, AGENTS.md, and `.agents/rules/` aligned whenever shipped capabilities move out of this TODO.

# TODO

Active roadmap and cleanup for LiteCAD. Keep this file limited to unfinished work, deferred decisions, and known risks; move completed facts into README or focused docs.

## Product Capability

- Extend the persisted CAD document model beyond the current uploaded-source nodes, independently selectable lightweight STEP component child nodes, transform/delete-node/box-union operations, database-backed reversible operation History, schema version, revision, and unit.
  - Add durable kernel shape state or an explicit LiteCAD operation graph that can be reloaded without treating preview meshes as source of truth.
  - Extend the implemented immutable source/metadata model revisions into durable kernel feature graph versions without treating preview meshes as source of truth.
  - Decide how generated Feature DSL graph nodes become, or deliberately do not become, CAD document History operations.
  - Do not claim true geometric STEP decomposition, preserved source-application history, or a general B-rep feature graph until those flows exist end to end.
- Continue the CAD import and geometry pipeline beyond completed STEP/STP/self-contained GLTF/GLB/STL source upload, lightweight metadata extraction, browser-kernel STEP preview tessellation, GLB/self-contained GLTF preview publishing, STL-to-OBJ preview conversion, preview artifact metadata, and read-only geometry document API.
  - Treat OBJ/GLB/STL preview meshes as derived display artifacts, not editable CAD source of truth.
  - Define editable B-rep geometry records and feature-node version semantics beyond immutable source-model snapshots, persisted transform/box-union operations, preview artifacts, and generated read-only geometry snapshots.
  - Decide what maximum file size and operation complexity the browser worker should support before LiteCAD needs a queued/server-side conversion or export path.
  - Keep STEP/STP backend preview artifact generation intentionally unavailable unless a new architecture decision replaces the browser-kernel source-download path.
- Define durable assembly semantics for multi-source projects beyond completed per-model transform persistence, per-model box-union edits, per-model direct STEP export, and selected multi-model STEP compound download.
  - Specify editable assembly records, cross-model placement semantics, and whether cross-model merge/boolean operations create one editable CAD part or remain export-only compounds.
  - Decide how assemblies preserve or normalize colors, names, units, and STEP product structure.
  - Keep current multi-model support described as browser preview composition, persisted per-model placement, and selected STEP compound export until assembly records exist.
- Continue beyond the first preview-layer edge display, center-plane visual sectioning, and visible-model bounds measurement controls.
  - Add durable CAD measurement entities instead of only transient bounding-box dimensions derived from visible preview meshes.
  - Add saved section definitions and durable B-rep section geometry instead of only a viewer clipping plane.
  - Decide how measurement and section records interact with document revisions, Undo/Redo, export, and shared project state.
- Expand export beyond the current direct browser download path.
  - Decide whether later STEP export milestones need backend-stored export artifact history in addition to direct browser downloads.
  - Add richer export workflows only after the editable geometry/assembly model defines what should be exported.
  - Keep current selected multi-model STEP output described as an OCCT compound download, not a durable editable assembly.
- Continue the AI Parametric Assistant described in [docs/ai-parametric-assistant.md](docs/ai-parametric-assistant.md) beyond the current executable LiteCAD-native OCCT feature DSL and first feature-graph pass. The implemented DSL includes primitives and cuts, rectangular/circular/elliptical sketch extrudes, reusable sketches, `revolve`, straight-path `sweep`, multi-section `loft`, recursive boolean trees, `fillet`, conservative `chamfer`, repeat, feature-local transforms, and structured numeric expressions. Multi-session Assistant conversations, native OpenAI-compatible `build_parametric_model` tool calls with strict JSON fallback after native tool-call failures, provider `timeout_seconds` and `max_output_tokens` controls, safe persisted Assistant failure messages for invalid provider tool output, localized parametric generation progress and failure-retry guidance, response run telemetry, persisted artifact-level generation telemetry for list/detail reads, LiteCAD DSL schema validation for generated tool output, pending artifact draft creation, an Inspector-side draft editor with parsed parameter controls including boolean/string UI metadata, browser-kernel preview for pending LiteCAD DSL drafts before save, automatic save-as-`.lcad.json` project model persistence for successful LiteCAD DSL artifacts, saved `.lcad.json` locally immediate preview updates inside the existing viewer scene through `feature-dsl-preview`, saved `.scad`/`.lcad.json` parameter edits with immutable source/metadata revisions, Inspector restore, reversible History, and saved `.lcad.json` STEP export through `feature-dsl-export` are implemented.
  - Decide whether to ship a license-compatible OpenSCAD browser runtime. Until that decision is deliberately accepted, keep the normal generated-model path on LiteCAD-native OCCT Feature DSL; OpenSCAD source drafts may expose parameters but do not compile to browser meshes in normal use.
  - If OpenSCAD runtime bundling is accepted, document the chosen upstream package, license, WASM size, production-serving path, and browser compile/save/export behavior before shipping it.
  - Expand the LiteCAD Feature DSL only when schema validation, backend prompting, browser preview, STEP export, tests, and Assistant UX can ship together.
  - Remaining DSL geometry gaps include full sketch constraints, freeform profiles, arbitrary sweep paths, arbitrary/freeform revolve profiles beyond the completed full-turn XZ rectangular solid/hollow path, robust true chamfer edge-face selection, mirrored/negative transforms, tapers, infix formulas, functions, unit math, comparisons, and conditionals.
  - Remaining DSL data-model gaps include durable kernel feature graph state and CAD document History integration for generated feature graph nodes.
  - Decide whether Assistant revision requests should eventually overwrite a selected saved source model in place with History semantics, or keep the current safer corrected-draft/new-source-model workflow.
  - Unsupported primitive requests should fail explicitly rather than create substitute geometry.
  - Add provider-stage telemetry, full provider analytics, richer long-run progress details, and provider-specific tuning before exposing longer generation workflows.
  - Add source-code editing and diff review for generated parametric artifacts only if product usage demands direct code control.

## Backend And Data

- Decide whether product-facing URLs should keep exposing prefixed entity IDs such as `project_...`, or introduce project slugs / slug-plus-short-id routes while preserving prefixed IDs as internal canonical identifiers.
- Decide whether project deletion remains soft-delete only in user-facing workflows or needs restore/purge operations, retention docs, and admin tooling before launch.
- Define storage lifecycle policy for uploaded source bytes, derived preview artifacts, generated geometry snapshots, thumbnails, and any future backend export artifacts.

## Documentation And Operations

- Keep README, AGENTS.md, and `.agents/rules/` aligned whenever shipped capabilities move out of this TODO.
- Keep `docs/browser-cad-kernel-roadmap.md` as the phase-history source of truth and this file as the active follow-up list; avoid duplicating completed phase status back into TODO.
- Before launch, add an operator-facing checklist for database backups, source/artifact storage retention, AI provider timeout/token tuning, and browser-worker asset deployment.

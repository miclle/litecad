# Browser CAD Kernel Roadmap

This document records both the target architecture and dated implementation status for LiteCAD's CAD import, browser editing, preview, and export pipeline. Target sections remain roadmap work unless a phase status explicitly marks them complete.

## Goal

LiteCAD should let users work with real CAD models in the browser without installing or running a third-party CAD application at runtime.

The target product loop is:

```text
Import STEP or another CAD source
  -> keep an editable B-rep CAD shape as the authoritative model
  -> tessellate that shape into a Three.js preview mesh
  -> edit the shape through CAD operations in the browser
  -> export the current shape back to STEP or another CAD exchange format
```

The current implementation covers the first browser-kernel loop for STEP models: STEP workbench preview replays constrained box-union geometry during worker tessellation and applies the latest persisted absolute transform in the Three.js scene. STEP export replays geometry operations followed by that latest transform in the worker, and the workbench can download selected STEP models either as separate files or as one browser-kernel compound STEP file. GLTF/GLB/STL preview artifacts remain viewer outputs rather than editable CAD documents.

## Architectural Decision

Use an embedded CAD geometry kernel rather than shelling out to a desktop CAD application.

Preferred direction:

- Run an OCCT/OpenCascade-based kernel through WebAssembly in a browser Web Worker.
- Keep Three.js as the rendering layer, not as the authoritative CAD model.
- Treat preview meshes as derived artifacts from B-rep shapes.
- Keep the Go backend responsible for accounts, projects, storage, collaboration, and artifact persistence.
- Keep FreeCAD and Python out of the normal runtime conversion path; STEP preview now flows through the browser kernel worker.

OpenCascade.js is the first candidate to evaluate because it provides JavaScript/WebAssembly bindings to Open CASCADE Technology, and OCCT includes STEP read/write support. Relevant upstream references:

- OpenCascade.js project page: https://dev.opencascade.org/project/opencascadejs
- OCCT STEP translator documentation: https://dev.opencascade.org/doc/overview/html/occt_user_guides__step.html
- OpenCascade.js examples: https://github.com/donalffons/opencascade.js-examples

## Non-Goals

- Do not reimplement a production CAD kernel in pure Go.
- Do not treat OBJ, STL, or GLTF mesh edits as equivalent to editable STEP/B-rep CAD.
- Do not require users to install FreeCAD or another desktop CAD application for normal LiteCAD runtime behavior.
- Do not promise preservation of source CAD application feature history. Imported STEP should become an editable B-rep shape plus LiteCAD operations, not the original parametric timeline from another CAD tool.
- Do not reintroduce the removed FreeCAD/OBJ preview path for compatibility. LiteCAD is not launched yet, so current browser-kernel work does not need a legacy desktop-CAD conversion mode.

## Target Runtime Shape

```text
Browser
  React workbench UI
  Three.js viewer
  CAD kernel Web Worker
    OCCT/OpenCascade.js WASM
    STEP import/export
    B-rep shape storage in worker memory
    tessellation to preview mesh buffers
    CAD operation execution

Go backend
  authentication and sessions
  project metadata
  uploaded source storage
  LiteCAD document and operation graph persistence
  exported artifact storage or direct download
  embedded frontend and WASM assets
```

The browser worker should own CPU-heavy CAD kernel calls so the React UI remains responsive. The worker should expose a small message protocol rather than leaking kernel object handles into React components.

## Data Model Direction

The authoritative project geometry should move from preview artifacts to an editable LiteCAD document.

Recommended concepts:

- `source`: original uploaded file bytes and parse metadata.
- `cadDocument`: LiteCAD-owned document metadata, units, root shapes, assembly nodes, and operation graph.
- `shapeRef`: stable reference to a kernel shape or serialized shape payload.
- `operation`: user-visible CAD edit such as transform, boolean, fillet, chamfer, hole, sketch, extrude, pattern, or suppress.
- `previewMesh`: derived render data produced from the current shape state.
- `exportArtifact`: generated STEP/GLB/STL/etc. output from the current document state.

The first browser-kernel proof of concept has proven import, tessellation, constrained per-model edit replay, direct per-model STEP export, and selected multi-model compound STEP export. LiteCAD now persists reversible command History for its supported edits, but a durable database schema for kernel shape state, rich parametric B-rep feature semantics, and backend export artifact history is still future design work.

## Generated Parametric Source Status

LiteCAD now stores AI-generated OpenSCAD-style and LiteCAD feature DSL source artifacts separately from uploaded STEP/GLTF/GLB/STL assets. Generated artifacts can expose parameters in the Inspector, successful OpenSCAD artifacts can be saved as durable `.scad` project model sources, successful LiteCAD DSL artifacts can be saved as durable `.lcad.json` project model sources, saved `.lcad.json` models preview through the browser `feature-dsl-preview` worker path, and saved `.scad`/`.lcad.json` parameter changes are recorded as separate revision records. These generated-source records are source assets, not browser-kernel B-rep shape state.

OpenSCAD mesh preview is still unavailable in normal use because no compatible OpenSCAD WASM runtime has been selected or bundled. The browser CAD kernel roadmap therefore remains OCCT-first for editable STEP/B-rep work. If OpenSCAD runtime licensing remains blocked, generated parametric CAD should move toward the LiteCAD-native feature DSL described in the AI Parametric Assistant plan, compiled through the existing OCCT worker path instead of through Three.js or ad hoc source loaders.

The first feature DSL worker foundation is complete on 2026-07-11. The CAD kernel worker now accepts `feature-dsl-preview` and `feature-dsl-export` requests for a minimal JSON document with numeric parameters and Z-axis `box`, `box_cut`, `cylinder`, `cylinder_cut`, rectangular/circular `extrude`, rectangular/circular `extrude_cut`, bounded repeat patterns, and structured `add`/`sub`/`mul`/`div` numeric expressions. Browser verification through real Vite/Chromium worker runs compiled a parameterized 96 x 42 x 6 box into a mesh with 24 vertices, 12 triangles, normals present, and 15403 bytes of exported STEP text, then compiled a box plate with a parameterized cylinder through-hole into a mesh with 130 vertices, 120 triangles, normals present, and 19014 bytes of exported STEP text. The Assistant route now accepts `litecad-feature-dsl` tool output, successful DSL artifacts can persist as `.lcad.json` project models, the project preview pipeline routes saved `.lcad.json` models through `feature-dsl-preview`, the project export UI routes saved `.lcad.json` models through `feature-dsl-export` for separate or merged STEP downloads, and the Inspector can edit saved DSL parameter values. The remaining browser-kernel gaps are full sketch constraints, freeform profiles, fillets/chamfers, durable kernel shape state, CAD document History integration for generated DSL features, and backend export artifact history.

## Phased Implementation Plan

Every phase must end with:

- automated tests appropriate to the changed layer,
- rendered browser verification when user-visible viewer behavior changes,
- documentation updates that move completed facts out of `TODO.md`,
- a scoped commit before starting the next phase.

### Phase 0: Decision Record And Guardrails

Document the target architecture, update TODOs, and prevent future work from deepening the FreeCAD runtime dependency.

Phase 0 acceptance status: complete on 2026-07-07.

Acceptance criteria:

- This roadmap exists and is linked from README and TODO.
- Agent rules explain that FreeCAD/Python STEP conversion must not be part of normal runtime architecture.
- TODO phases are explicit enough for future implementation work.
- Verification includes at least `git diff --check` for the docs-only change.

### Phase 1: Kernel Feasibility Spike

Add an isolated browser worker proof of concept under `website/src/cad/` without changing production import behavior.

Phase 1 acceptance status: complete on 2026-07-07. The active browser-kernel candidate can import STEP, tessellate preview mesh arrays, and export STEP through the Web Worker message boundary.

Current Phase 1 status:

- `opencascade.js@1.1.1` was evaluated first. Its package includes a 63 MB WASM binary, and a temporary browser smoke page against a real local STEP source timed out while initializing/running it. Treat this full package as too heavy for LiteCAD's target browser UX unless a custom build is produced.
- `replicad-opencascadejs@0.23.0` is now the active Phase 1 OCCT WASM candidate. It is a Replicad custom OpenCascade.js build with an approximately 10.8 MB WASM binary and includes the STEP reader/writer plus tessellation bindings needed for the current spike.
- `website/src/cad/kernel-protocol.ts` defines the worker request/response contract.
- `website/src/cad/kernel-worker-handler.ts` keeps message validation and error handling testable without loading WASM.
- `website/src/cad/kernel.worker.ts` wires the handler to the OpenCascade adapter.
- `website/src/cad/opencascade-step.ts` contains the STEP import, tessellation, and STEP export adapter. It explicitly passes Vite's emitted WASM URL into the kernel loader instead of relying on package-relative runtime discovery.
- `website/cad-kernel-smoke.html` and `website/src/cad/kernel-smoke.ts` provide an isolated browser smoke page for Phase 1 verification without changing production import behavior. The page can either generate a simple box STEP in the browser kernel or load an external STEP fixture via `?stepUrl=/path/to/file.step`.
- Unit tests cover the protocol, worker handler, WASM loader contract, and smoke input parsing.
- `npm --prefix website run build` accepts the dependency and TypeScript code, but the app build does not bundle the isolated worker or smoke page into the product route until a later phase references them.
- Browser smoke result on 2026-07-07 using a clean Vite server on `127.0.0.1:46282`: kernel-created box -> STEP text -> adapter import -> tessellation -> STEP export returned `ok: true`, `sourceStepBytes: 15416`, `exportedStepBytes: 15416`, `vertexCount: 24`, `triangleCount: 12`, `hasNormals: true`, and observed local `elapsedMs` values from 104 to 178 after warm/cold runs.
- Direct browser smoke result on 2026-07-07 against real current-project STEP sources exported temporarily from local Postgres and then deleted:
  - `转向轴承连接器.step`: source 128005 bytes on disk, browser text length 127975, exported STEP 448940 bytes, 2262 vertices, 2256 triangles, normals present, `elapsedMs: 283`.
  - `同步轮.step`: source 498873 bytes on disk, browser text length 498597, exported STEP 1334063 bytes, 7529 vertices, 9220 triangles, normals present, `elapsedMs: 559`.
- Worker browser smoke result on 2026-07-07 against the same real current-project STEP sources through `kernel.worker.ts`:
  - `转向轴承连接器.step`: browser text length 127975, exported STEP 448940 bytes, 2262 vertices, 2256 triangles, normals present, `elapsedMs: 297`.
  - `同步轮.step`: browser text length 498597, exported STEP 1334063 bytes, 7529 vertices, 9220 triangles, normals present, `elapsedMs: 601`.
- Existing Vite dev servers may return `504 Outdated Optimize Dep` after switching OCCT packages; restart Vite or use a fresh dev port before trusting a browser smoke result.
- Vite SSR/Node execution was not a valid smoke path for `opencascade.js@1.1.1` because Node could not resolve that package's raw `.wasm` import. The current evidence for `replicad-opencascadejs@0.23.0` is browser-based.
- Remaining Phase 1 gap: none for the spike. Phase 2 should now wire worker-produced mesh buffers into the actual project workbench preview path.

Scope:

- Install/evaluate OpenCascade.js or another OCCT WASM candidate.
- Load the kernel in a Web Worker.
- Import a small STEP fixture from an in-memory file.
- Tessellate the resulting shape into arrays suitable for Three.js.
- Export the unchanged shape back to STEP.
- Capture performance and bundle-size notes.

Tests and verification:

- Unit tests for worker message contracts where feasible.
- A small browser smoke or script that exercises import -> tessellate -> export.
- Documentation update recording the chosen package, limitations, and any unsupported file classes.
- Commit the spike separately.

### Phase 2: Preview Through Browser Kernel

Route STEP preview generation through the browser kernel and replace the current backend FreeCAD/OBJ preview path. The project is not launched, so this phase does not need a long-lived compatibility mode for old FreeCAD artifacts.

Phase 2 acceptance status: complete on 2026-07-07. STEP workbench preview now uses browser-kernel mesh buffers, and the old FreeCAD/Python STEP backend preview converter has been removed from normal runtime code.

Current Phase 2 status:

- First Phase 2 increment complete on 2026-07-07: the backend now exposes an authenticated project-model source download endpoint at `/api/v1/projects/:projectID/models/:modelID/source`, scoped by the current session owner and returning the original uploaded bytes. The frontend API client exposes this as `fetchProjectModelSource(...)` with Blob response handling.
- Second Phase 2 increment complete on 2026-07-07: parsed STEP/STP models in the project workbench fetch the authenticated source bytes, send them to `kernel.worker.ts` with a `step-preview` request, and render worker-produced mesh buffers directly as Three.js `BufferGeometry`.
- The current active workbench preview path no longer needs FreeCAD for STEP/STP display. GLB/self-contained GLTF preview artifacts are still served directly, and STL preview artifacts are still generated in Go.
- Third Phase 2 increment complete on 2026-07-07: STEP models now return `ErrModelPreviewUnavailable` on the backend preview artifact path, legacy STEP OBJ preview artifacts are filtered out of the read-only geometry document, `internal/service/freecad_preview_converter.go` was deleted, and `scripts/freecad_step_to_obj.py` was deleted.
- Browser verification on 2026-07-07 against the current project `prj_01kwrpevmc29sg9n487jfh44sv` showed two STEP models rendered as `2 KERNEL meshes`, no console errors, and a present Three.js canvas. Desktop screenshot sampling found 4,775 non-background samples and 990 unique non-background colors in the viewer crop; a 390 x 844 mobile viewport found `previewAssetCount: "2"`, canvas size 390 x 788, no unexpected app error, and screenshot sampling found 13,947 non-background samples and 1,708 unique non-background colors.
- Cleanup verification for the backend preview quarantine covered service and handler tests proving STEP preview/artifact endpoints are unavailable for STEP, source download still works, and legacy STEP OBJ artifacts are not exposed through the geometry document.

Scope:

- Add a temporary development verification path only if it makes browser smoke testing easier; do not design a permanent dual pipeline.
- Convert imported STEP to preview mesh buffers in the worker.
- Render worker-produced mesh data in the existing Three.js workbench.
- Avoid rendering OBJ edge `l` primitives as model data.
- Keep GLB/GLTF/STL on direct/backend preview formats until the editable document model decides whether to normalize them into browser-kernel document state.
- Remove or quarantine the FreeCAD preview route once browser-kernel STEP preview passes the current project smoke.

Tests and verification:

- Worker tests for tessellation output shape and error handling.
- Viewer tests for rendering worker-produced mesh assets.
- Browser verification on a project with at least one STEP model.
- Docs update clarifying which preview path is active and what remains fallback.
- Commit the preview migration step separately.

### Phase 3: Editable CAD Document MVP

Introduce a LiteCAD document model for browser-side CAD edits.

Phase 3 baseline acceptance status: complete on 2026-07-08. The first Phase 3 increment is complete on 2026-07-07: LiteCAD now stores a project-owned editable CAD document record with schema version, revision, unit, root model nodes, per-model transform matrices, and replayable transform operations. The workbench exposes X/Y/Z per-model transform controls, saves them through the CAD document API, and reloads them.

The second Phase 3 increment proved on 2026-07-08 that model-scoped transform operations could be replayed on an imported OCCT shape through `BRepBuilderAPI_Transform` for worker preview and round-trip export. The production workbench later moved preview placement to the Three.js scene so repeated absolute transforms are not compounded; STEP export still applies the latest absolute transform in the worker. Backend GLB/GLTF/STL preview artifacts also use viewer-level transforms.

The third Phase 3 increment is complete on 2026-07-08: STEP models now support a constrained per-model `box-union` feature operation. LiteCAD persists the operation in the project CAD document, the workbench exposes origin and size controls for STEP models, and the browser CAD worker creates an OCCT box with `BRepPrimAPI_MakeBox`, fuses it into the imported shape with `BRepAlgoAPI_Fuse`, then tessellates or exports the fused shape.

The fourth Phase 3 increment is complete on 2026-07-10: LiteCAD stores each supported user edit as a reversible database history entry and persists the active history head on the CAD document. The workbench exposes Undo, Redo, keyboard shortcuts, and a paginated History panel. Transform, box-union, and model/source or STEP component deletion commands survive reloads and switching signed-in browsers; revision conflicts reject stale writes instead of overwriting another session.

Current Phase 3 status:

- `ProjectCADDocument` persists editable document JSON separately from uploaded source bytes, read-only geometry snapshots, and derived preview artifacts.
- `GET /api/v1/projects/:projectID/cad-document` returns the current owner-scoped editable document, creating identity model nodes for existing project models when needed.
- `PATCH /api/v1/projects/:projectID/cad-document/models/:modelID/transform` records a transform operation for one project-owned model and increments the document revision.
- `POST /api/v1/projects/:projectID/cad-document/models/:modelID/box-union` records a constrained axis-aligned box union operation for one project-owned STEP model and increments the document revision.
- `GET /api/v1/projects/:projectID/cad-document/history` returns newest-first persisted edit summaries; `POST .../history/undo` and `POST .../history/redo` move the database-backed history head and materialize the resulting document state.
- Every edit, Undo, and Redo requires the caller's expected document revision. A stale revision returns `409 Conflict`, and every successful state transition increments the document revision monotonically.
- A new edit after Undo marks the old redo path as discarded while retaining its records for History inspection.
- `useCADDocumentCommands(...)` owns the workbench's serialized edit queue, latest cached revision lookup, transform autosave timers, shared mutation pending gate, and `409 Conflict` document/history refresh. Focused mounted-hook tests cover conflict refresh without accepting stale state and the shared History/delete action gate.
- The project workbench keys STEP preview queries by geometry-operation signature, sends box-union operations to the worker for tessellation, and applies the latest persisted absolute transform at the Three.js object/node layer.
- The CAD kernel worker protocol accepts replayable transform and box-union operations. Production STEP export sends geometry operations first and only the latest absolute transform last. `opencascade-step.ts` converts row-major 4x4 transform matrices into OCCT `gp_Trsf.SetValues(...)`, applies transforms with `BRepBuilderAPI_Transform`, creates box features with `BRepPrimAPI_MakeBox`, and fuses them with `BRepAlgoAPI_Fuse`.
- Browser verification on 2026-07-08 against a temporary current-code server on `127.0.0.1:46283` created a new signed-in project, uploaded `verify.stl`, rendered one preview mesh, changed the first model's X transform from `0` to `2.5`, reloaded the project route, and confirmed the persisted value remained `2.5` with a present 1280 x 844 preview canvas and no console errors.
- Browser worker verification on 2026-07-08 against a temporary Vite server on `127.0.0.1:46285` generated a box STEP in the browser, ran base preview and transform-replayed worker preview with translation matrix `[+25, -3, +7]`, and confirmed mesh bounds moved from min `(0, 0, 0)` to min `(25, -3, 7)` while retaining 24 vertices, 12 triangles, normals, and a transformed STEP round-trip export of 15436 bytes.
- Workbench browser verification on 2026-07-08 against temporary Go/Vite dev servers on `127.0.0.1:46286` and `127.0.0.1:46287` registered a new user, generated and uploaded `worker-replay-box.step`, rendered one STEP kernel preview canvas at 1280 x 844, changed X translation to `25` through the real workbench controls, observed the authenticated STEP source request count increase from 1 to 2 after document revision changed, and saw no unexpected browser errors.
- Browser worker verification on 2026-07-08 against a temporary Vite server on `127.0.0.1:46288` generated a box STEP in the browser, ran base preview and `box-union` worker preview with an added box at origin `[10, 0, 0]` and size `[5, 5, 5]`, and confirmed triangle count grew from 12 to 26, vertex count grew from 24 to 48, max X grew from 10 to 15, normals were present, and transformed STEP round-trip export produced 28911 bytes.
- Workbench browser verification on 2026-07-08 against temporary Go/Vite dev servers on `127.0.0.1:46289` and `127.0.0.1:46290` registered a new user, generated and uploaded `box-union-base.step`, rendered one STEP kernel preview canvas at 1280 x 844, used the real workbench controls to add a box union with origin `[10, 0, 0]` and size `[5, 5, 5]`, observed the `box-union` API return 200 and the authenticated STEP source request count increase from 1 to 2 after document revision changed, and saw no unexpected browser errors.
- Workbench browser verification on 2026-07-10 against a temporary current-code server on `127.0.0.1:47280` registered a new user, created a project, imported a STEP source, changed model X from `0` to `12.5`, confirmed one Applied History entry, undid back to `0`, reloaded the project with Redo still available, redid back to `12.5`, and observed no browser console warnings or errors.
- This phase still does not claim durable kernel shape serialization, preserved source-application history, rich parametric B-rep feature semantics, general cross-model boolean/merge workflows, backend STEP export artifact storage, or durable cross-model assembly semantics.

Scope:

- Define a minimal operation graph and document serialization.
- Support stable per-model transforms first.
- Add one true CAD operation after transforms, such as boolean union or simple extrusion, only if the kernel spike proved it reliable.
- Persist document state in the backend separately from uploaded source bytes and derived preview meshes.
- Make preview meshes derived from the current document state.

Tests and verification:

- Backend tests for document persistence and ownership scoping.
- Worker tests for operation replay.
- Frontend tests for edit state and preview refresh.
- Browser verification of editing and reload persistence.
- Docs update moving implemented document facts from TODO to README/architecture docs.
- Commit the editable document MVP separately.

### Phase 4: STEP Export From Current Document

Export the browser-edited B-rep document to STEP.

Phase 4 acceptance status: complete on 2026-07-08. LiteCAD now supports direct per-model STEP downloads and selected multi-model compound STEP downloads from the current browser-kernel document state. The first milestone intentionally uses client-side download rather than backend export artifact storage because the project is not launched and the current product need is to export the edited model without adding another runtime component.

Current Phase 4 status:

- `website/src/views/project/project-step-export.ts` selects parsed STEP models as export targets, defaults to all parsed STEP models selected, generates revision-stamped `.step` filenames, creates browser-downloadable STEP blobs, and publishes downloads through a temporary object URL.
- `website/src/views/project/project-step-export-action.ts` fetches authenticated source text for selected STEP models, sends per-model downloads to `runStepRoundTripInWorker(...)`, sends merged downloads to `runStepAssemblyExportInWorker(...)`, and downloads the worker's `exportedStepText`.
- The project workbench shows an export control that lets users choose selected STEP files, then download them as separate files or one merged compound STEP file. Per-model filenames follow `<source-base>-litecad-r<document-revision>.step`, so a model edited to CAD document revision 2 downloads as `phase4-base-litecad-r2.step`; merged filenames follow `<project-name>-litecad-assembly-r<document-revision>.step`.
- The export picker is a controlled `ProjectStepExportPopover`; rejected browser-kernel exports keep the picker mounted and render durable `STEP export failed` feedback instead of closing the only error surface.
- Export currently covers selected STEP source models plus their replayable LiteCAD operations. The merged output is an OCCT compound STEP download, not a durable editable assembly record, backend export artifact, preserved source CAD feature history, or serialized durable kernel shape state.
- Browser verification on 2026-07-08 against temporary Go/Vite dev servers on `127.0.0.1:46291` and `127.0.0.1:46292` generated a box STEP in the browser, registered a user, uploaded `phase4-base.step`, used the real workbench controls to add a box union, clicked the real STEP export control, downloaded `phase4-base-litecad-r2.step`, re-imported that exported STEP through the workbench upload input, and confirmed two parsed models rendered as kernel previews. The downloaded STEP was 28911 bytes, the re-imported project model count was 2, the main preview canvas measured 1280 x 788, and the Workbench phase reported no console, page, or HTTP errors.

Scope:

- Add export command in the workbench UI.
- Generate STEP from the current kernel shape/document state.
- Send export artifacts to backend storage or download directly, depending on product decision. The first shipped milestone chooses direct download.
- Preserve units, basic names, and assembly structure where the kernel path supports them.

Tests and verification:

- Worker tests for export success and failure states.
- Backend tests for artifact persistence if server storage is used.
- Browser verification: import STEP -> edit -> export STEP -> re-import exported STEP into LiteCAD preview.
- Docs update documenting supported export semantics and known limits.
- Commit the export milestone separately.

### Phase 5: Post-Export Runtime Sweep

Audit runtime dependencies and docs after editable import/preview/export flows are complete.

Phase 5 acceptance status: complete on 2026-07-08. The normal import, preview, edit, and direct STEP export flow no longer depends on FreeCAD, `freecadcmd`, or Python-based STEP conversion. Remaining FreeCAD mentions are limited to historical docs, roadmap context, and STEP metadata/test fixture strings.

Current Phase 5 status:

- Production/runtime search across `internal`, `cmd`, `pkg`, non-test `website/src`, `website/*.go`, `scripts`, `go.mod`, and `Taskfile.yaml` found no `freecad`, `freecadcmd`, `python`, or `step_to_obj` runtime references.
- Repository-wide references to FreeCAD/Python are documentation guardrails, a historical superseded plan under `docs/superpowers/plans/`, STEP metadata fixture text, package-license metadata, or old test fixture labels. The superseded plan now carries an explicit historical note pointing readers to this browser-kernel roadmap.
- Browser verification for the post-export state used the current Workbench flow on 2026-07-08: generated a real STEP in the browser kernel, imported it, applied a box-union edit, exported `phase4-base-litecad-r2.step`, re-imported that exported STEP, confirmed 2 project models and two kernel preview meshes, measured the main preview canvas at 1280 x 788, and observed no Workbench-phase console, page, or HTTP errors.
- Verification for this sweep includes `git diff --check`, `task check`, and `task test`.

Scope:

- Confirm no reintroduced third-party desktop CAD runtime dependency exists in normal import, preview, edit, or export flows.
- Update API and preview docs to describe browser-kernel direct download behavior after export ships.
- Add migration handling for existing preview artifacts if product data created before launch requires it.

Tests and verification:

- `task check`
- `task test`
- Browser verification of existing project previews and new imports.
- Documentation sweep across README, TODO, AGENTS.md, and `.agents/rules/`.
- Commit the dependency removal separately.

## Open Questions

- Which OCCT WASM package has the right long-term size, licensing, maintenance, and binding coverage for richer edit operations beyond the current `replicad-opencascadejs` spike?
- Should kernel-generated document state persist as OCCT-native serialized shapes, a LiteCAD operation graph, or both?
- Should later STEP export milestones add backend-stored export artifact history in addition to the current direct browser download?
- What maximum file size should the browser worker support before the UI asks the user to use a server-side or queued conversion path?
- How should assemblies, colors, names, units, and product structure be represented in LiteCAD documents?

## Current Implementation Notes

As of this roadmap, the current shipped path is:

- STEP/STP source metadata and source file download are backend-owned.
- STEP/STP workbench preview uses the browser CAD kernel worker and renders worker-produced mesh buffers in Three.js.
- STEP/STP backend preview artifact generation is unavailable by design; the workbench uses `/source` plus the browser kernel instead.
- GLB and self-contained GLTF uploads can be published as preview artifacts after backend validation.
- STL is converted to OBJ preview data in Go.
- The project workbench renders browser-kernel STEP meshes and backend-provided GLB/GLTF/STL preview artifacts in Three.js.
- The project workbench stores and reloads a LiteCAD editable document for root model nodes plus transform, node-delete, and constrained box-union operations.
- Database-backed History stores reversible transform, node-delete, and box-union commands, the active Undo/Redo head, and discarded alternate paths; every mutation uses an expected document revision.
- STEP preview derives mesh data by replaying box-union geometry in the browser CAD worker before tessellation, then applies the latest persisted absolute transform in the Three.js scene.
- Direct per-model STEP export and selected multi-model compound STEP export replay geometry operations followed by the latest absolute transform in the browser CAD worker and download the worker-produced STEP text.
- No durable kernel shape serialization, rich parametric B-rep feature model, backend export artifact history, or durable cross-model CAD merge/assembly semantics exist yet.

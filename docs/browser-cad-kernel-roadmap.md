# Browser CAD Kernel Roadmap

This document records the target architecture for LiteCAD's long-term CAD import, browser editing, preview, and export pipeline. It is a roadmap, not the current shipped implementation.

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

The current implementation does not do this yet. Today, STEP preview conversion is server-side and FreeCAD-backed, and OBJ/GLTF/GLB/STL preview artifacts are viewer outputs rather than editable CAD documents.

## Architectural Decision

Use an embedded CAD geometry kernel rather than shelling out to a desktop CAD application.

Preferred direction:

- Run an OCCT/OpenCascade-based kernel through WebAssembly in a browser Web Worker.
- Keep Three.js as the rendering layer, not as the authoritative CAD model.
- Treat preview meshes as derived artifacts from B-rep shapes.
- Keep the Go backend responsible for accounts, projects, storage, collaboration, and artifact persistence.
- Remove FreeCAD and Python from the runtime conversion path once the browser kernel can import, tessellate, edit, and export the supported CAD formats.

OpenCascade.js is the first candidate to evaluate because it provides JavaScript/WebAssembly bindings to Open CASCADE Technology, and OCCT includes STEP read/write support. Relevant upstream references:

- OpenCascade.js project page: https://dev.opencascade.org/project/opencascadejs
- OCCT STEP translator documentation: https://dev.opencascade.org/doc/overview/html/occt_user_guides__step.html
- OpenCascade.js examples: https://github.com/donalffons/opencascade.js-examples

## Non-Goals

- Do not reimplement a production CAD kernel in pure Go.
- Do not treat OBJ, STL, or GLTF mesh edits as equivalent to editable STEP/B-rep CAD.
- Do not require users to install FreeCAD or another desktop CAD application for normal LiteCAD runtime behavior.
- Do not promise preservation of source CAD application feature history. Imported STEP should become an editable B-rep shape plus LiteCAD operations, not the original parametric timeline from another CAD tool.
- Do not preserve the current FreeCAD/OBJ preview path for deployed-user compatibility. LiteCAD is not launched yet, so migration work can replace the old path once the browser kernel is strong enough.

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
  exported artifact storage
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

The exact database schema should be designed only after the browser kernel proof of concept proves import, tessellation, edit, and export viability.

## Phased Implementation Plan

Every phase must end with:

- automated tests appropriate to the changed layer,
- rendered browser verification when user-visible viewer behavior changes,
- documentation updates that move completed facts out of `TODO.md`,
- a scoped commit before starting the next phase.

### Phase 0: Decision Record And Guardrails

Document the target architecture, update TODOs, and prevent future work from deepening the FreeCAD runtime dependency.

Acceptance criteria:

- This roadmap exists and is linked from README and TODO.
- Agent rules explain that FreeCAD is current implementation only, not the target architecture.
- TODO phases are explicit enough for future implementation work.
- Verification includes at least `git diff --check` for the docs-only change.

### Phase 1: Kernel Feasibility Spike

Add an isolated browser worker proof of concept under `website/src/cad/` without changing production import behavior.

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
- Browser smoke result on 2026-07-07 against real current-project STEP sources exported temporarily from local Postgres and then deleted:
  - `转向轴承连接器.step`: source 128005 bytes on disk, browser text length 127975, exported STEP 448940 bytes, 2262 vertices, 2256 triangles, normals present, `elapsedMs: 283`.
  - `同步轮.step`: source 498873 bytes on disk, browser text length 498597, exported STEP 1334063 bytes, 7529 vertices, 9220 triangles, normals present, `elapsedMs: 559`.
- Existing Vite dev servers may return `504 Outdated Optimize Dep` after switching OCCT packages; restart Vite or use a fresh dev port before trusting a browser smoke result.
- Vite SSR/Node execution was not a valid smoke path for `opencascade.js@1.1.1` because Node could not resolve that package's raw `.wasm` import. The current evidence for `replicad-opencascadejs@0.23.0` is browser-based.
- Remaining Phase 1 gap: run the same STEP round-trip through the actual `kernel.worker.ts` message boundary, not only the direct browser smoke adapter.

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

Scope:

- Add a temporary development verification path only if it makes browser smoke testing easier; do not design a permanent dual pipeline.
- Convert imported STEP to preview mesh buffers in the worker.
- Render worker-produced mesh data in the existing Three.js workbench.
- Avoid rendering OBJ edge `l` primitives as model data.
- Decide whether GLB/GLTF/STL remain as direct preview formats or are normalized into the same browser-kernel document model.
- Remove or quarantine the FreeCAD preview route once browser-kernel STEP preview passes the current project smoke.

Tests and verification:

- Worker tests for tessellation output shape and error handling.
- Viewer tests for rendering worker-produced mesh assets.
- Browser verification on a project with at least one STEP model.
- Docs update clarifying which preview path is active and what remains fallback.
- Commit the preview migration step separately.

### Phase 3: Editable CAD Document MVP

Introduce a LiteCAD document model for browser-side CAD edits.

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

Scope:

- Add export command in the workbench UI.
- Generate STEP from the current kernel shape/document state.
- Send export artifacts to backend storage or download directly, depending on product decision.
- Preserve units, basic names, and assembly structure where the kernel path supports them.

Tests and verification:

- Worker tests for export success and failure states.
- Backend tests for artifact persistence if server storage is used.
- Browser verification: import STEP -> edit -> export STEP -> re-import exported STEP into LiteCAD preview.
- Docs update documenting supported export semantics and known limits.
- Commit the export milestone separately.

### Phase 5: Remove FreeCAD Runtime Conversion

Delete the FreeCAD/Python runtime dependency after the browser kernel path covers the supported import/preview/export flows.

Scope:

- Remove `freecad_step_to_obj.py` and the FreeCAD converter from normal runtime code.
- Remove `LITECAD_FREECAD_CMD` from runtime setup docs unless it remains only as an optional migration/debug tool.
- Update API and preview docs to describe browser-kernel or backend-stored artifact behavior.
- Keep migration handling for existing OBJ preview artifacts if needed.

Tests and verification:

- `task check`
- `task test`
- Browser verification of existing project previews and new imports.
- Documentation sweep across README, TODO, AGENTS.md, and `.agents/rules/`.
- Commit the dependency removal separately.

## Open Questions

- Which OCCT WASM package has the right size, licensing, maintenance, and binding coverage for STEP import/export, tessellation, and the first edit operations?
- Should kernel-generated document state persist as OCCT-native serialized shapes, a LiteCAD operation graph, or both?
- Should STEP export happen fully client-side with direct download, or should the backend store export artifacts for project history?
- What maximum file size should the browser worker support before the UI asks the user to use a server-side or queued conversion path?
- How should assemblies, colors, names, units, and product structure be represented in LiteCAD documents?

## Current Implementation Notes

As of this roadmap, the current shipped path remains:

- STEP/STP source metadata and preview generation are backend-owned.
- STEP preview uses FreeCAD through `freecadcmd` and emits OBJ.
- GLB and self-contained GLTF uploads can be published as preview artifacts after backend validation.
- STL is converted to OBJ preview data in Go.
- The project workbench renders backend-provided preview artifacts in Three.js.
- No editable B-rep document or STEP export flow exists yet.

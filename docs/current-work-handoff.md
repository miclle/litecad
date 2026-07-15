# Current Work Handoff

Updated: 2026-07-15

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- The stable topology inspection and associative section-lineage phase started from synchronized `main`, `origin/main`, and `origin/HEAD` at `e619e07 feat(cad): persist recursive feature graph history` on 2026-07-15.
- Work continues directly on `main` as requested. Each roadmap phase must pass automated E2E, in-app browser verification for UI-visible behavior, code review, documentation refresh, commit, and push before the next phase begins.
- The old assembly and tapered-extrude feature branches have already been merged and cleaned up.
- After the topology inspection and section-lineage phase is committed and pushed, the next active phase is solver-backed assembly constraints and a reusable subassembly contract.

## Completed Phases

### True Feature DSL Chamfer

- `chamfer` now builds real OCCT bevel geometry in both `feature-dsl-preview` and `feature-dsl-export` instead of preserving the source shape.
- Version 1 applies one symmetric distance to every eligible edge of the accumulated shape. A model with no edges or an OCCT build failure is rejected explicitly.
- Assistant prompting and tool-schema guidance describe the shipped behavior, and the deterministic browser workflow covers prompt-to-draft compilation, automatic `.lcad.json` save, canvas preview, and STEP export selection.
- Stable user-selectable topology references, per-edge distances, and edge/face remapping across revisions remain future work.

### Versioned Recursive Feature DSL Source Graph

- Every top-level feature and recursive boolean operand now shares one globally unique, already-trimmed stable node-ID namespace in both Go validation and browser protocol validation.
- The Inspector exposes an indented graph rail and edits one selected node's local JSON while preserving its stable ID. An advanced complete-source editor remains available for structural additions, removals, and reordering.
- Apply remains disabled until the browser `feature-dsl-preview` worker compiles the candidate source. Reset remains available even when node or complete-source JSON is invalid.
- The existing owner-scoped graph-update transaction preserves the parameter schema/value envelope, creates one immutable model revision, updates occurrence revision bindings, and appends one graph-versioned `feature-graph-change` History command under `expected_revision`.
- History transitions are recursive and deterministic: they record added, updated, moved, or removed stable nodes with JSON-Pointer-safe before/after paths and explicit sibling indexes. Undo/Redo restores the exact source revisions across reloads and devices.
- This is durable source-graph versioning. It is not serialized OCCT shape state, cross-revision B-rep topology naming/remapping, sketch constraints, imported source history, or full B-rep feature history.

### Stable Topology Inspection And Associative Section Lineage

- The browser CAD kernel worker can rebuild revision-pinned occurrence shapes and compute exact OCCT aggregate volume, surface area, edge length, center of mass, and solid/face/edge counts.
- Each deterministic face/edge reference is scoped to `(occurrence_id, model_revision_id, sha256_operations_signature, kind, one_based_index)`. The backend reconstructs that ID, validates aggregate/reference consistency and visible document provenance, and persists the result as `occt-brep-properties` in the existing inspection-record boundary.
- Preview-visible AABB dimensions and diagonal remain a separately labeled viewer aid. The new exact properties do not add cross-revision topology remapping, user-selectable point/edge/face measurements, radius/diameter/angle semantics, or per-edge DSL authoring.
- Section artifacts now belong to a stable association with an immutable plane and monotonic generations. A dedicated association row is locked transactionally during regeneration, and an expected-generation comparison prevents two concurrent callers from creating duplicate current generations.
- The workbench renders current, stale, superseded, and legacy states. A document revision or visible occurrence/revision change marks the latest saved result stale; Regenerate reuses the stored plane against current targets, appends the next immutable generation, and retains the prior result.
- This is explicit user-triggered lineage, not automatic background regeneration, a CAD-document section feature with Undo/Redo, a section solid, or durable serialized OCCT shape state.

### Export Artifact History

- Successful browser-kernel STEP exports are stored through owner-scoped project export artifact APIs.
- The workbench export popover lists stored exports and can download a stored STEP artifact again after reload.
- Focused Go/Vitest/Playwright coverage, full `task check`, `task test`, `task test-browser`, and in-app browser verification passed before commit `f7e4995`.

### Saved Inspection Records

- Owner-scoped project inspection record APIs create/list/delete viewer-derived visible-bounds measurement snapshots and center-plane section definitions.
- The workbench can save, restore after reload, and delete records. Stored records include the CAD document revision, unit, visible model IDs, and the measurement snapshot or section-plane definition.
- These records are not durable B-rep section bodies or serialized kernel shape state.
- Focused Go/Vitest/Playwright coverage, full `task check`, `task test`, `task test-browser`, and in-app browser verification passed before commit `bacb659`.

### OpenSCAD Browser Runtime Decision

- `docs/openscad-browser-runtime-decision.md` records an explicit rejection of the current OpenSCAD browser runtime candidates for bundled production use.
- The official OpenSCAD and OpenSCAD WASM distributions are GPL-2.0; LiteCAD is retaining its MIT single-binary distribution policy.
- The inspected 2026-07-13 official browser snapshot contains 10,861,236 raw bytes across JavaScript and WASM, while the current embedded production server has no precompressed asset path.
- The official runtime can produce STL through a headless browser call, but it does not provide LiteCAD's OCCT mesh-buffer or STEP-export contracts. OpenSCAD therefore remains a parameter-editable source-draft format without browser preview, normal Save as model, or project export.
- The docs-only decision phase passed full `task check`, `task test`, and `task test-browser`; it did not change UI, so no in-app browser verification was required.

### Nested Assembly Grouping

- CAD document schema v3 adds nested organizational groups, occurrence `parent_group_id` bindings, and hierarchical suppression. Direct or ancestor suppression keeps occurrences durable but excludes them from preview and STEP export.
- Owner-scoped expected-revision APIs validate group trees, reject cycles and dangling parents, require groups to be empty before deletion, and persist group create/update/delete plus occurrence regrouping in reversible History.
- Validated `mate` records connect two distinct existing occurrences only with status `unresolved`. They are reversible referential records and do not solve placement, move geometry, or imply reusable subassembly documents.
- The workbench tree creates, renames, suppresses, and deletes groups, creates subgroups, and moves occurrences between groups. Preview/export filtering, Undo/Redo, and reload persistence share the same ancestor-suppression semantics.
- The exact boundary is documented in `docs/nested-assembly-semantics.md`.

### Kernel Section Geometry Artifacts

- The browser CAD kernel worker accepts `section-geometry` requests, rebuilds the selected immutable model revisions with replayable operations and occurrence placement, and runs an OCCT B-rep section against the requested plane.
- Owner-scoped project section artifact APIs store either generated STEP edge geometry or an explicit typed empty result together with the CAD document revision, unit, immutable association plane, generation, source revision IDs, occurrence IDs, edge count, and byte size.
- The workbench can generate, explicitly regenerate stale associations, list after reload, restore the saved section plane, download ready STEP artifacts, and delete section artifacts. Visual center-plane clipping remains a preview aid; each stored STEP generation is the kernel-derived intersection result for its recorded inputs.
- Visible-bounds measurement includes a diagonal and identifies its derivation as `preview-visible-aabb`; exact aggregate OCCT properties are stored and displayed separately.
- Focused and full Go/Vitest/Playwright coverage plus real-backend in-app browser verification passed before commit `df0647e`.

## Last Verification

The topology inspection and section-lineage phase was verified in the Codex in-app browser against the real local backend. A saved 60 x 24 x 8 LiteCAD model analyzed as exact volume 11,520, surface area 4,224, and edge length 368, with one stable occurrence/revision scope and 18 face/edge references. Section generation 1 produced four kernel edges. Editing width from 60 to 70 created model revision 2 and marked generation 1 stale; Regenerate created current generation 2 while retaining generation 1 as superseded. Reload preserved the exact inspection record and generation states, and the browser reported no warnings or errors.

Full phase gates passed:

```bash
task check
task test
task test-browser
```

- `task check` passed backend formatting/vet/lint, frontend TypeScript, and module-tidy checks.
- `task test` passed Go race/coverage tests and 80 Vitest files / 405 tests. Vitest still prints the existing `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed all 16 deterministic Playwright workbench tests, including exact B-rep analysis, model-revision stale detection, generation-2 regeneration, reload persistence, download, and no browser errors.
- Focused Go service/handler, real-kernel worker, controller/component, TypeScript, and isolated Playwright tests also passed during TDD and after code-review fixes.

## Active Roadmap

The original handoff follow-up list remains closed. True chamfer, the versioned recursive LiteCAD Feature DSL source graph, exact aggregate topology inspection, and explicit section association generations are complete. The active roadmap now continues with solver-backed assembly constraints and a reusable subassembly contract.

These phases must preserve the existing source-of-truth boundary: replayable versioned graph data is durable, while OCCT shapes and Three.js buffers remain derived runtime state.

## Resume Checklist

On another machine with an existing checkout:

```bash
git fetch origin
git switch main
git pull --ff-only
git status --short
task install
task check
```

For a fresh machine, clone the repository, switch to `main`, and then run the same `task install` and `task check` steps. Confirm `git rev-parse HEAD` is at least `e619e07` before relying on the completed recursive-graph descriptions above, then pull the latest topology phase commit from `origin/main`.

No database contents, browser-local panel preferences, AI provider secrets, or `cmd/litecad/config.local.yaml` settings are transferred through Git. Recreate machine-local configuration from `cmd/litecad/config.example.yaml`; do not copy credentials into this handoff or commit them.

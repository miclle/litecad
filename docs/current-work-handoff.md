# Current Work Handoff

Updated: 2026-07-15

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- The versioned recursive Feature DSL graph phase started from synchronized `main`, `origin/main`, and `origin/HEAD` at `bc64923 feat(cad): implement true feature dsl chamfer` on 2026-07-15.
- Work continues directly on `main` as requested. Each roadmap phase must pass automated E2E, in-app browser verification for UI-visible behavior, code review, documentation refresh, commit, and push before the next phase begins.
- The old assembly and tapered-extrude feature branches have already been merged and cleaned up.
- After the recursive source-graph phase is committed and pushed, the next active phase is stable geometric references with topology-aware measurement and associative section regeneration.

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
- This is durable source-graph versioning. It is not serialized OCCT shape state, stable B-rep topology naming, sketch constraints, imported source history, or full B-rep feature history.

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
- Owner-scoped project section artifact APIs store either generated STEP edge geometry or an explicit typed empty result together with the CAD document revision, unit, plane, source revision IDs, occurrence IDs, edge count, and byte size.
- The workbench can generate, list after reload, restore the saved section plane, download ready STEP artifacts, and delete section artifacts. Visual center-plane clipping remains a preview aid; the stored STEP is the kernel-derived intersection result at generation time.
- Visible-bounds measurement now includes a diagonal value and identifies its derivation as `preview-visible-aabb`. It is not a topology-aware distance, radius, angle, tolerance, or exact B-rep metrology result.
- Focused and full Go/Vitest/Playwright coverage plus real-backend in-app browser verification passed before commit `df0647e`.

## Last Verification

The recursive source-graph phase was verified in the Codex in-app browser against the real local backend and configured Provider. A prompt created and saved `rectangular-block-with-hole-litecad` as a recursive boolean subtract graph with stable `boolean_1`, `blank`, and `bore` nodes. The graph rail changed `bore.radius` from `3` to `4`, browser-kernel preview remained ready, Apply created revision 2, History showed graph version 1 and `features/boolean_1/operands/bore` as updated, Undo restored radius 3/revision 1, Redo restored radius 4/revision 2, reload preserved the edit, STEP export listed the model, and the browser reported no warnings or errors.

Full phase gates passed:

```bash
task check
task test
task test-browser
```

- `task check` passed backend formatting/vet/lint, frontend TypeScript, and module-tidy checks.
- `task test` passed Go race/coverage tests and 78 Vitest files / 396 tests. Vitest still prints the existing `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed all 16 deterministic Playwright workbench tests, including stable nested-node editing, path-aware History, Undo/Redo, reload persistence, and export availability.
- Focused Go graph validation/transition tests, 5 focused frontend files / 59 tests, TypeScript validation, and the isolated nested-graph Playwright workflow also passed during implementation and review.

## Active Roadmap

The original handoff follow-up list remains closed, and the versioned recursive LiteCAD Feature DSL source graph is complete. The active roadmap continues with stable geometric references, topology-aware measurement, and associative section regeneration, followed by solver-backed assembly constraints and a reusable subassembly contract.

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

For a fresh machine, clone the repository, switch to `main`, and then run the same `task install` and `task check` steps. Confirm `git rev-parse HEAD` is at least `bc64923` before relying on the completed-phase descriptions above, then pull the latest phase commit from `origin/main`.

No database contents, browser-local panel preferences, AI provider secrets, or `cmd/litecad/config.local.yaml` settings are transferred through Git. Recreate machine-local configuration from `cmd/litecad/config.example.yaml`; do not copy credentials into this handoff or commit them.

# Current Work Handoff

Updated: 2026-07-15

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- The assembly-semantics stream started from synchronized `main`, `origin/main`, and `origin/HEAD` at `f5db780 feat(cad): add stable topology inspection semantics` on 2026-07-15.
- Work continues directly on `main` as requested. Each roadmap phase must pass automated E2E, in-app browser verification for UI-visible behavior, code review, documentation refresh, commit, and push before the next phase begins.
- The old assembly and tapered-extrude feature branches have already been merged and cleaned up.
- The topology inspection/section-lineage phase, schema v4 point-mate solver, and project-local reusable subassembly snapshot contract are complete on `main`. The latest implementation commit is `feat(cad): add reusable subassembly snapshots`.

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

### Deterministic Point-Mate Solver

- CAD document schema v4 stores `point-coincident-v1` mates with two occurrence-local anchors, one world-space offset, solved status, and residual. The first occurrence drives the second occurrence's translation while preserving its 3 x 3 transform.
- Solver constraints form an acyclic graph with at most one inbound driver per occurrence. A driver may feed multiple downstream mates; one driver edit resolves the complete downstream graph inside the same `expected_revision` transaction.
- Creating a mate and moving a driver record every affected occurrence in database-backed History. Undo/Redo restores all placements atomically. The legacy model/node transform route follows the same rules and cannot bypass the solver.
- The owner-scoped API still creates and deletes point mates. The default workbench does not expose raw coordinate authoring; it hides the section when no links exist and keeps existing links in a collapsed advanced position-link manager where users can see which model follows which and remove the link. Driven occurrence placement remains read-only in both Inspector inputs and the Three.js transform control.
- Schema v3 unresolved mate records upgrade without a solver and without moving geometry. The shipped solver does not handle rotation, planes, axes, concentricity, tangency, tolerances, over-constraint optimization, or topology-selected references.

### Immutable Reusable Subassembly Snapshots

- CAD document schema v4 stores project-local immutable revision-1 subassembly definitions captured from the direct ordinary occurrences of one ordinary leaf group. Captured members pin node/model/revision identity, name, suppression, and transforms normalized to the first member's translation.
- Instantiation creates a tagged group plus expanded ordinary occurrences at an explicit XYZ translation. Preview, inspection, ancestor suppression, and separate/compound STEP export continue through the existing occurrence pipeline.
- Linked member occurrences are read-only: they cannot be renamed, reordered, regrouped, independently suppressed, duplicated, deleted, transformed, used in mates, deleted through their source, or advanced to a newer current model revision. The tagged group supports whole-instance suppression only.
- Capture and instantiation are owner-scoped `expected_revision` mutations. Each creates one reversible database-backed History command; Undo/Redo restores the complete definition or instance across reloads.
- Definitions do not live-update instances. Definition revision evolution/deletion, editable members, nested definitions/instances, live propagation, cross-project libraries, source STEP hierarchy preservation, serialized kernel state, and nested STEP serialization remain future work.

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
- At the schema v3 milestone, validated `mate` records connected two distinct existing occurrences only with status `unresolved`. Those legacy records remain reversible and migration-safe; schema v4 adds the point-translation solver described above without silently moving them.
- The workbench tree creates, renames, suppresses, and deletes groups, creates subgroups, and moves occurrences between groups. Preview/export filtering, Undo/Redo, and reload persistence share the same ancestor-suppression semantics.
- The exact boundary is documented in `docs/nested-assembly-semantics.md`.

### Kernel Section Geometry Artifacts

- The browser CAD kernel worker accepts `section-geometry` requests, rebuilds the selected immutable model revisions with replayable operations and occurrence placement, and runs an OCCT B-rep section against the requested plane.
- Owner-scoped project section artifact APIs store either generated STEP edge geometry or an explicit typed empty result together with the CAD document revision, unit, immutable association plane, generation, source revision IDs, occurrence IDs, edge count, and byte size.
- The workbench can generate, explicitly regenerate stale associations, list after reload, restore the saved section plane, download ready STEP artifacts, and delete section artifacts. Visual center-plane clipping remains a preview aid; each stored STEP generation is the kernel-derived intersection result for its recorded inputs.
- Visible-bounds measurement includes a diagonal and identifies its derivation as `preview-visible-aabb`; exact aggregate OCCT properties are stored and displayed separately.
- Focused and full Go/Vitest/Playwright coverage plus real-backend in-app browser verification passed before commit `df0647e`.

## Last Verification

The reusable-subassembly phase was verified in the Codex in-app browser against the real local PostgreSQL backend. An ordinary two-member leaf group was captured as `驱动模块 QA` revision 1, then instantiated as `驱动模块 A` at X=100 and `驱动模块 B` at X=200. Preview composition increased from two source occurrences to six total occurrences. Selecting a linked member showed the reusable-member lock in the tree and Inspector with disabled placement input. Suppressing A reduced preview composition to four; Undo restored six, Redo returned to four, and reload preserved the definition, both instances, and suppression state. The current-flow console had no new warnings or errors; the deterministic E2E error collector was also empty.

Full phase gates passed:

```bash
task check
task test
task test-browser
```

- `task check` passed backend formatting/vet/lint, frontend TypeScript, and module-tidy checks.
- `task test` passed Go race/coverage tests and 82 Vitest files / 421 tests. Vitest still prints the existing `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed all 18 deterministic Playwright workbench tests, including reusable definition capture, two translated instances, preview/export composition, whole-instance suppression, reload, Undo/Redo, and the existing CAD workflows.
- Focused reusable-subassembly service/handler, API/controller/component, Inspector/Three.js lock, mate-filter, and model-revision-pinning tests also passed during TDD and after code-review fixes.

## Active Roadmap

The original handoff follow-up list remains closed. True chamfer, the versioned recursive LiteCAD Feature DSL source graph, exact aggregate topology inspection, explicit section association generations, the deterministic point-translation mate solver, and the project-local immutable reusable subassembly snapshot contract are complete. The next assembly design decision is definition revision evolution/deletion; only after that boundary is explicit should LiteCAD consider nested definitions, live propagation, cross-project libraries, or nested STEP serialization.

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

For a fresh machine, clone the repository, switch to `main`, and then run the same `task install` and `task check` steps. Confirm the latest `origin/main` includes `feat(cad): add reusable subassembly snapshots` before relying on the completed schema v4 snapshot descriptions above.

No database contents, browser-local panel preferences, AI provider secrets, or `cmd/litecad/config.local.yaml` settings are transferred through Git. Recreate machine-local configuration from `cmd/litecad/config.example.yaml`; do not copy credentials into this handoff or commit them.

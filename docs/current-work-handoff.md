# Current Work Handoff

Updated: 2026-07-14

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- `origin/main` was at `526ce24 docs: refresh current work handoff` when this phase began; refresh the remote reference before relying on that value.
- Local `main` is intentionally ahead of `origin/main` with the phased handoff follow-ups. Use `git log --oneline origin/main..main` for the exact local phase commits.
- The old assembly and tapered-extrude feature branches have already been merged and cleaned up.
- Continue in the current checkout unless the user explicitly asks to publish; do not push these local phase commits implicitly.

## Completed Phases

### Export Artifact History

- Successful browser-kernel STEP exports are stored through owner-scoped project export artifact APIs.
- The workbench export popover lists stored exports and can download a stored STEP artifact again after reload.
- Focused Go/Vitest/Playwright coverage, full `task check`, `task test`, `task test-browser`, and in-app browser verification passed before commit `f7e4995`.

### Saved Inspection Records

- Owner-scoped project inspection record APIs create/list/delete viewer-derived visible-bounds measurement snapshots and center-plane section definitions.
- The workbench can save, restore after reload, and delete records. Stored records include the CAD document revision, unit, visible model IDs, and the measurement snapshot or section-plane definition.
- These records are not durable B-rep section bodies or serialized kernel shape state.
- Focused Go/Vitest/Playwright coverage, full `task check`, `task test`, `task test-browser`, and in-app browser verification passed before commit `bacb659`.

### Saved Feature DSL Graph History

- Saved `.lcad.json` models expose a compact complete-source graph editor in the Inspector.
- Apply remains disabled until the browser `feature-dsl-preview` worker compiles the edited graph successfully.
- `PATCH /api/v1/projects/:projectID/models/:modelID/feature-dsl-graph` requires `expected_revision`, preserves the parameter schema/value envelope, rejects duplicate top-level feature IDs, creates an immutable model revision, updates occurrence revision bindings, and appends one `feature-graph-change` History command atomically.
- History reports stable top-level node IDs as added, updated, or removed; Undo/Redo replays the before/after model revisions across reloads and devices.
- This is complete-source graph versioning. It is not nested boolean-operand editing, sketch constraints, durable serialized OCCT shape state, imported STEP feature history, or full B-rep feature history.

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

The section artifact phase added real worker-side OCCT intersection geometry, durable project storage, and the workbench lifecycle. In-app browser verification against the real local backend loaded a 60 x 24 x 8 mm LiteCAD box, displayed a 65.12 mm visible-AABB diagonal, generated a four-edge STEP section, confirmed the record survived reload, restored its plane, deleted it, and found no console warnings or errors.

Full phase gates passed:

```bash
task check
task test
task test-browser
```

- `task check` passed backend formatting/vet/lint, frontend TypeScript, and module-tidy checks.
- `task test` passed Go race/coverage tests and 77 Vitest files / 385 tests. Vitest still prints the existing localStorage and `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed all 14 deterministic Playwright workbench tests, including derived measurement and browser-kernel section artifact persistence.
- Focused Go service/handler tests, 116 targeted Vitest tests, and the section workbench Playwright workflow also passed before the full phase gates.

## Handoff Closure

Every unfinished item carried by the original handoff follow-up list is implemented or closed by an explicit architecture decision. There is no remaining implementation task in this handoff.

Broader durable kernel shape state, topology-aware measurement types, associative section features, nested Feature DSL node editing, solver-backed assembly constraints, and reusable subassembly documents remain active product roadmap work in `TODO.md`; they are not incomplete work from these closed phases.

## Resume Checklist

On a new machine:

```bash
git fetch origin
git switch main
git status --short
task install
task check
```

Do not run `git pull --ff-only` while local `main` intentionally contains unpublished phase commits. Rebase only when the user asks to integrate a newer upstream mainline.

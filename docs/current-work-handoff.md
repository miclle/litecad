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

## Last Verification

The nested assembly phase upgraded documents to schema v3, added validated group/constraint-record APIs and History commands, rendered nested group authoring in the workbench, and applied ancestor suppression to preview and export. In-app browser verification against a current-code server created a parent and child group, moved one of ten occurrences into the child, suppressed the parent, observed preview assets fall from 10 to 9, undid back to 10, redid to 9, reloaded with the state intact, and found no console warnings or errors.

Full phase gates passed:

```bash
task check
task test
task test-browser
```

- `task check` passed backend format/vet/lint, frontend TypeScript, and module-tidy checks.
- `task test` passed Go race/coverage tests and 76 Vitest files / 379 tests. Vitest still prints the existing localStorage and `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed all 14 deterministic Playwright workbench tests.

## Recommended Next Work

Implement the richer inspection phase: persist actual browser-kernel section geometry artifacts with document revision and occurrence/revision inputs, add at least one explicit measurement type beyond whole-visible-bounds size, expose download/restore lifecycle in the workbench, and preserve the distinction between kernel-derived results and exact B-rep metrology claims.

## Larger Follow-Ups

Complete each as a separate verified phase with a narrow boundary:

- Richer CAD measurement types and durable B-rep section geometry beyond saved viewer-derived inspection records.
- Broader durable kernel shape state and nested feature-node editing remain in `TODO.md`; the handoff's source-graph History phase is complete at the documented complete-source/top-level-transition boundary.

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

# Current Work Handoff

Updated: 2026-07-14

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- `origin/main` is at `526ce24 docs: refresh current work handoff`.
- Local `main` is intentionally ahead of `origin/main` with the phased handoff follow-ups. The committed phases begin with `f7e4995 feat(cad): persist export artifact history`, `bacb659 feat(cad): persist inspection records`, and `2691219 feat(cad): record feature dsl graph history`.
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

## Last Verification

The OpenSCAD runtime decision phase inspected the current worker and single-binary serving path, official OpenSCAD source/snapshots, the official WASM port, and `openscad-wasm@0.0.4`. The resulting repository decision rejects bundling the current GPL-2.0 candidates and records concrete reconsideration gates. No source dependency, generated runtime, or UI behavior changed.

Full phase gates passed:

```bash
task check
task test
task test-browser
```

- `task check` passed backend format/vet/lint, frontend TypeScript, and module-tidy checks.
- `task test` passed Go race/coverage tests and 76 Vitest files / 376 tests. Vitest still prints the existing localStorage and `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed all 14 deterministic Playwright workbench tests.

## Recommended Next Work

Implement the smallest real nested-assembly slice: nested occurrence grouping, hierarchical suppression propagation, API validation, tree display, preview/export filtering, History, Undo/Redo, reload persistence, and a documented mate/constraint record boundary without pretending to solve geometry.

## Larger Follow-Ups

Complete each as a separate verified phase with a narrow boundary:

- Nested assembly, mate, constraint, and hierarchical suppression semantics beyond the current flat occurrence model.
- Richer CAD measurement types and durable B-rep section geometry beyond saved viewer-derived inspection records.
- Durable serialized kernel shape/feature state and nested feature-node editing beyond complete-source Feature DSL revisions with top-level node transitions.

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

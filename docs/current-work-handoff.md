# Current Work Handoff

Updated: 2026-07-14

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- `origin/main` is at `526ce24 docs: refresh current work handoff`.
- Local `main` is intentionally ahead of `origin/main` with the phased handoff follow-ups. The committed phases begin with `f7e4995 feat(cad): persist export artifact history` and `bacb659 feat(cad): persist inspection records`.
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

## Last Verification

The saved Feature DSL graph phase passed focused Go service/handler tests, focused Vitest component/controller/protocol tests, TypeScript build, and the deterministic Playwright workflow covering compile, save, History node details, Undo/Redo, and reload persistence.

In-app browser verification passed against a local mock API/Vite stack in the Chinese UI: the graph editor compiled a valid feature-node edit and enabled Apply, rejected a parameter-envelope edit with a localized inline error, kept the 244px Inspector content width free of horizontal overflow, rendered `base · 已更新` and `slot · 已新增` in History, and showed no unrelated error state.

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

Take the OpenSCAD browser runtime question as a decision phase before adding another runtime path. Produce a repository decision record that evaluates license compatibility, upstream maintenance, compressed/uncompressed WASM size, worker loading and single-binary serving, browser support, compile/export behavior, and whether LiteCAD should explicitly reject OpenSCAD browser compilation for now. Do not bundle a runtime without an accepted result.

## Larger Follow-Ups

Complete each as a separate verified phase with a narrow boundary:

- License-compatible OpenSCAD browser runtime selection and implementation or an explicit documented rejection.
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

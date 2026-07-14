# Current Work Handoff

Updated: 2026-07-14

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- `main` and `origin/main` are at `74cf462 feat(cad): add tapered feature dsl extrude (#3)`.
- `feat/assembly-occurrence-authoring` has been fast-forward merged into `main` and pushed.
- The old feature branch has already been cleaned up locally in this checkout.
- `feat/feature-dsl-tapered-extrude` was squash-merged through PR #3 and the branch has been cleaned up.

## Recently Completed

Restricted LiteCAD Feature DSL tapered extrusion is now merged into `main`:

- Backend DSL validation and capability registry accept `tapered_extrude` for rectangular, circular, and elliptical XY sketches.
- Assistant prompt/tool schema guidance includes `tapered_extrude` and positive `top_scale`.
- Browser worker preview and STEP export compile `tapered_extrude` through an OCCT thru-sections loft between the base sketch and a centered positive-scale top profile.
- Focused Go and frontend tests cover valid/invalid schema, capability/dispatch parity, protocol acceptance, and worker export.
- README, TODO, AGENTS, `.agents/rules/`, and `docs/browser-cad-kernel-roadmap.md` are synchronized to the restricted shipped behavior.

The durable flat assembly path now includes authoring, not only passive persistence:

- Backend occurrence APIs support duplicate, rename/update, reorder, suppress/unsuppress, placement, and delete under the CAD document expected-revision envelope.
- Database-backed History records reversible occurrence-create/update/move/delete commands alongside transform, box-union, node-delete, and model revision transitions.
- The workbench tree renders repeated occurrences with occurrence-native selection and controls.
- Three.js scene instances, visibility, saved placement, preview composition, and selected STEP export are keyed by occurrence identity.
- Suppressed occurrences stay persisted and reversible but do not enter preview or export.
- Selected multi-occurrence STEP export uses durable occurrence order, pinned immutable model revisions, names, and placement.

This remains a flat assembly model. It does not implement nested subassemblies, mates, constraints, preserved source STEP product structure, backend export artifact history, or editable B-rep feature history.

## Last Verification

The merged tapered-extrude work was verified with:

```bash
task check
task test
task test-browser
```

Results:

- `task check` passed.
- `task test` passed: Go tests passed and Vitest reported 75 test files / 361 tests passing. Vitest still prints the existing localStorage and `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed: 14/14 Playwright workbench tests.

## Recommended Next Work

Choose the next Feature DSL slice only after defining an equally narrow backend-validation, prompt-schema, worker-preview/export, tests, and docs boundary.

## Larger Follow-Ups

Do not start these before deciding a narrower design boundary:

- Durable kernel feature graph state and CAD document History integration for generated Feature DSL graph nodes.
- Nested assembly, mate, constraint, and hierarchical suppression semantics.
- Durable CAD measurement and saved section records.
- Backend-stored export artifact history.
- License-compatible OpenSCAD browser runtime selection.

## Resume Checklist

On a new machine:

```bash
git fetch origin
git switch main
git pull --ff-only
task install
task check
```

Run `task test` or `task test-browser` before making behavioral CAD changes.

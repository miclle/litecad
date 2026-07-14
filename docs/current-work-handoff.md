# Current Work Handoff

Updated: 2026-07-14

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- `main` and `origin/main` are at `526ce24 docs: refresh current work handoff`.
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

This remains a flat assembly model. It does not implement nested subassemblies, mates, constraints, preserved source STEP product structure, durable kernel shape state, durable B-rep section geometry, or editable B-rep feature history.

Backend-stored export artifact history is implemented in this checkout:

- Successful browser-kernel STEP exports are stored through owner-scoped project export artifact APIs.
- The workbench export popover lists stored exports and can download a stored STEP artifact again after reload.
- Focused Go, Vitest, Playwright export-spec, full `task check`, full `task test`, full `task test-browser`, and in-app browser verification have passed locally; commit is pending.

Project-saved measurement and section inspection records are implemented in this checkout:

- Owner-scoped project inspection record APIs can create/list/delete viewer-derived measurement snapshots and center-plane section definitions.
- The workbench inspection panel can save a visible-bounds measurement, save the current section definition, restore records after reload, and delete saved records.
- Records store the CAD document revision, unit, visible model IDs, and either a measurement snapshot or a section-plane definition. They are not durable B-rep section bodies or kernel shape state.
- Focused Go, Vitest, Playwright shell E2E, full `task check`, full `task test`, full `task test-browser`, and in-app browser verification have passed locally; commit is pending.

## Last Verification

The latest inspection-record phase was verified with:

```bash
task check
task test
task test-browser
```

Results:

- `task check` passed.
- `task test` passed: Go race/coverage tests passed and Vitest reported 75 test files / 367 tests passing. Vitest still prints the existing localStorage and `MaxListenersExceededWarning` warnings during the full run.
- `task test-browser` passed: 14/14 Playwright workbench tests.
- In-app browser verification passed against a local mock API/Vite stack: measurement and section records were saved, persisted through reload, section restore re-enabled the section control, the measurement record could be deleted, and the browser console had no error logs.

## Recommended Next Work

Continue with the next larger follow-up as its own verified phase. The smallest next slice is durable Feature DSL graph history because export artifacts and project-saved inspection records now have persisted project APIs and workbench coverage.

## Larger Follow-Ups

Do not start these before deciding a narrower design boundary:

- Durable kernel feature graph state and CAD document History integration for generated Feature DSL graph nodes.
- Nested assembly, mate, constraint, and hierarchical suppression semantics.
- Richer CAD measurement semantics and durable B-rep section geometry beyond saved viewer inspection records.
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

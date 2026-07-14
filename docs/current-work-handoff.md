# Current Work Handoff

Updated: 2026-07-14

This note is the short cross-machine handoff for the current LiteCAD development state. It is intentionally operational, not a product spec.

## Current Mainline

- `main` and `origin/main` are at `6da1c34 docs: record occurrence authoring semantics`.
- `feat/assembly-occurrence-authoring` has been fast-forward merged into `main` and pushed.
- The feature branch still exists locally and on `origin`; it is safe to delete after confirming no external PR or review flow still needs the branch name.

## Recently Completed

The durable flat assembly path now includes authoring, not only passive persistence:

- Backend occurrence APIs support duplicate, rename/update, reorder, suppress/unsuppress, placement, and delete under the CAD document expected-revision envelope.
- Database-backed History records reversible occurrence-create/update/move/delete commands alongside transform, box-union, node-delete, and model revision transitions.
- The workbench tree renders repeated occurrences with occurrence-native selection and controls.
- Three.js scene instances, visibility, saved placement, preview composition, and selected STEP export are keyed by occurrence identity.
- Suppressed occurrences stay persisted and reversible but do not enter preview or export.
- Selected multi-occurrence STEP export uses durable occurrence order, pinned immutable model revisions, names, and placement.

This remains a flat assembly model. It does not implement nested subassemblies, mates, constraints, preserved source STEP product structure, backend export artifact history, or editable B-rep feature history.

## Last Verification

The merged `main` was verified after the fast-forward merge with:

```bash
task check
task test
task test-browser
```

Results:

- `task check` passed.
- `task test` passed: Go tests passed and Vitest reported 75 test files / 359 tests passing. Vitest still prints the existing `MaxListenersExceededWarning` warning during the full run.
- `task test-browser` passed: 14/14 Playwright workbench tests.

## Recommended Next Branch

Start from latest `main`:

```bash
git switch main
git pull --ff-only
git switch -c feat/feature-dsl-tapered-extrude
```

Recommended next implementation slice: add a restricted LiteCAD Feature DSL taper capability end to end.

Suggested boundary:

- Support only rectangular, circular, and elliptical sketch taper/extrude paths.
- Require positive height and positive taper scale.
- Keep axis/direction semantics narrow and explicit.
- Do not support arbitrary freeform profiles, negative or mirrored scale, arbitrary B-rep draft-face selection, or source STEP feature-history edits.

Required surfaces for that slice:

- Backend LiteCAD DSL validation and capability registry.
- Assistant prompt/tool schema guidance.
- Browser worker preview.
- Browser worker STEP export.
- Focused Go and frontend worker tests.
- One deterministic browser workflow if the Assistant or saved model UX changes.
- README, TODO, AGENTS, `.agents/rules/`, and `docs/browser-cad-kernel-roadmap.md` updates in the same branch.

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

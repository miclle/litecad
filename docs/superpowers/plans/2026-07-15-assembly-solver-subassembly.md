# Assembly Solver And Reusable Subassembly Plan

**Goal:** Replace referential-only mate records with one deterministic solver-backed point-coincident constraint, then add an honest reusable project-local subassembly snapshot contract without claiming a general mechanical solver or live nested assembly documents.

**Architecture:** CAD document schema v4 keeps the existing project-owned assembly as source of truth. A `point-coincident-v1` mate treats the first occurrence as the driver and the second as the driven occurrence. Each side supplies one occurrence-local anchor point plus a world-space offset. The server preserves the driven occurrence's 3 x 3 transform and solves only its translation so `world(driver_anchor) + offset == world(driven_anchor)`. Constraints form a directed acyclic graph; one occurrence may have at most one inbound driver, while one driver may feed multiple downstream constraints. Driver placement edits resolve the full downstream graph inside the same expected-revision transaction and History command.

Reusable subassemblies are immutable project-local definition revisions captured from the direct occurrence children of one organizational group with no child groups. The definition stores revision-pinned model members and transforms normalized to the first member's translation. Instantiation creates a tagged organizational group plus ordinary expanded occurrences at an explicit instance translation. Preview/export continue to consume normal occurrences. A definition revision does not live-update instances, cross projects, preserve source STEP assembly structure, or create serialized OCCT document state.

**Non-goals:** No plane/axis/concentric/tangent mates, rotational solving, tolerance stack, over-constraint optimization, topology remapping, automatic face picking, physics, cross-project component library, editable linked instance members, nested subassembly definitions, live definition propagation, or nested STEP assembly serialization.

## Milestone 4A: Solver-Backed Point Mate

- [x] Add failing service tests for point-anchor solving, non-zero rotated/local anchors, downstream DAG propagation, multiple inbound rejection, cycle rejection, direct driven-placement rejection, stale revision, and Undo/Redo of every affected placement.
- [x] Upgrade the CAD document contract to schema v4 with `solver`, local anchors, offset, solved status, and residual; migrate legacy `unresolved` mate records without moving geometry.
- [x] Extend occurrence-update History to carry all solver-affected before/after occurrences while preserving legacy single-occurrence commands.
- [x] Add handler/API tests and a solve-backed create request contract.
- [x] Add frontend API/types/controller support plus an Assembly mates card using existing shadcn inputs/selects/buttons.
- [x] Add deterministic Playwright coverage for duplicate occurrence, create solved mate, driver move propagation, reload, Undo/Redo, and delete.
- [x] Run `task check`, `task test`, `task test-browser`, verify the real UI in the Codex in-app browser, run code review, fix findings, synchronize docs, commit, and push `main`.

## Milestone 4B: Reusable Subassembly Snapshot Contract

- [ ] Add failing schema/service tests for immutable revision-1 capture, relative member transforms, multiple instances, revision pinning, invalid child groups, empty groups, stale revisions, and History Undo/Redo.
- [ ] Persist project-local subassembly definitions in schema v4 and tag instantiated groups with definition ID/revision.
- [ ] Add owner-scoped create-definition and create-instance routes with strict validation and ordinary occurrence expansion.
- [ ] Keep linked instance member occurrences immutable in v1; allow instance suppression through the tagged group.
- [ ] Add frontend API/types/controller support and a compact Subassemblies card for capture and repeated instantiation with explicit XYZ translation.
- [ ] Add deterministic Playwright coverage for capture, two instances, preview/export visibility, reload, suppression, and Undo/Redo.
- [ ] Run `task check`, `task test`, `task test-browser`, verify the real UI in the Codex in-app browser, run code review, fix findings, synchronize docs, commit, and push `main`.

## Final Audit

- [ ] Run repository-wide `git diff --check`, `task check`, `task test`, and `task test-browser` from synchronized `main`.
- [ ] Confirm docs distinguish point-translation solving and expanded immutable snapshots from a general solver or live subassembly document system.
- [ ] Confirm `main == origin/main`, update the handoff, and close the active goal.

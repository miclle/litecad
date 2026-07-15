# Stable Topology Inspection And Associative Sections Plan

**Goal:** Ship an honest first stable geometric-reference contract, exact OCCT B-rep aggregate measurement, and explicitly regenerated section-definition lineage without claiming cross-revision topology remapping.

**Architecture:** The browser kernel receives one or more STEP sources annotated with an occurrence ID and immutable model revision ID. It rebuilds the exact source plus operations and reports OCCT linear/surface/volume properties. A geometric reference is stable only inside the tuple `(occurrence_id, model_revision_id, operations_signature, kind, one-based_index)`; it is deterministic for the same immutable inputs and invalid after any tuple member changes. Persisted topology measurement records store these provenance scopes and exact aggregate results. Section artifacts gain one stable association ID and monotonic generation number; the frontend marks an artifact stale when its document revision or target revision/occurrence set differs, regenerates its saved plane against current targets in the worker, and appends the next server-validated generation.

**Non-goals:** No cross-revision edge/face remapping, topology naming heuristic, arbitrary point picking, face highlighting, section solids, automatic background regeneration, durable OCCT shapes, or general B-rep feature history.

## Task 1: Define And Test The Worker Topology Contract

- [x] Add `shape-inspection` request/response types with annotated source scope, exact aggregate volume/surface area/edge length/center of mass, solid/face/edge counts, and deterministic face/edge references.
- [x] Reject missing/blank occurrence IDs, revision IDs, operation signatures, empty sources, and malformed source payloads in protocol tests.
- [x] Add worker-client and worker-handler tests before implementation.
- [x] Implement protocol, client, handler, and worker dispatch.

## Task 2: Compute Exact OCCT Properties And Stable References

- [x] Add failing real-kernel tests for a `10 x 20 x 30` box: volume `6000`, area `2200`, edge length `240`, center `(5,10,15)`, 1 solid, 6 faces, 12 edges.
- [x] Assert the same immutable scope produces byte-for-byte identical references on repeat inspection and a changed revision/scope changes every reference prefix.
- [x] Implement `BRepGProp` linear/surface/volume aggregation and deterministic one-based face/edge enumeration.
- [x] Keep reference stability explicitly scoped to immutable revision plus operation signature.

## Task 3: Persist Topology-Aware Measurement Records

- [x] Extend inspection-record service/handler tests with an `occt-brep-properties` measurement carrying target scopes, totals, and representative stable references.
- [x] Validate finite non-negative measurements, non-empty unique target scopes, provenance IDs/signatures, count/reference consistency, and reject preview-AABB fields masquerading as exact B-rep output.
- [x] Reuse the existing measurement JSON persistence boundary; do not introduce a second measurement entity.
- [x] Extend frontend contracts and API fixtures.

## Task 4: Generate And Display Exact Inspection In The Workbench

- [x] Add a pure action that builds revision-pinned STEP sources, annotates them with target scopes, runs `shape-inspection`, and returns the exact result.
- [x] Extend the inspection-record controller with an injected/testable topology generation mutation.
- [x] Add an “Analyze B-rep” action to the existing inspection card, show pending/error state, and render exact volume/area/edge length plus stable-reference scope copy.
- [x] Keep the current preview-visible AABB measurement as a separately labeled viewer aid.
- [x] Add component/controller tests and deterministic Playwright coverage.

## Task 5: Add Section Association And Generation Semantics

- [x] Add failing service/entity/handler tests for initial generation 1, same-association generation 2, stale expected-generation conflict, plane immutability, ownership, and newest-first list metadata.
- [x] Persist `association_id`, `generation`, and `supersedes_artifact_id`; initial create allocates the association, regeneration validates the latest generation transactionally and preserves the original plane.
- [x] Return `is_latest` metadata without deleting immutable prior generations.
- [x] Extend frontend types and API fixtures.

## Task 6: Regenerate Stale Sections In The Browser

- [x] Mark section artifacts stale when CAD document revision or current visible occurrence/revision provenance differs.
- [x] Add a Regenerate action that reuses the stored plane, rebuilds current targets through the browser kernel, and submits the same association with the latest expected generation.
- [x] Render generation number and current/stale/superseded state; keep restore/download/delete behavior.
- [x] Add controller/component tests and deterministic E2E covering model revision change, stale state, regeneration, generation 2, reload, download, and no browser errors.

## Task 7: Review, Verify, Document, Commit, And Push

- [x] Run focused Go/Vitest/Playwright tests throughout TDD.
- [x] Run `task check`, `task test`, and `task test-browser`.
- [x] Verify exact topology analysis plus stale-section regeneration in the Codex in-app browser against the real backend.
- [x] Use `code-reviewer`; fix all actionable findings and rerun affected tests.
- [x] Synchronize `README.md`, `TODO.md`, `AGENTS.md`, `.agents/rules/`, `docs/browser-cad-kernel-roadmap.md`, and `docs/current-work-handoff.md` with the exact stability boundary.
- [x] Run final `git diff --check`, `task check`, `task test`, and `task test-browser`.
- [x] Commit as `feat(cad): add stable topology inspection semantics` and push `main`; confirm `main == origin/main` before Phase 4.

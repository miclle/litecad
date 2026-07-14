# Feature DSL Tapered Extrude Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a restricted LiteCAD Feature DSL tapered extrude capability end to end.

**Architecture:** Implement `tapered_extrude` as a sketch-family Feature DSL node beside `extrude`, with the same rectangle/circle/ellipse sketch boundary and a positive `top_scale` value. Backend validation and Assistant prompts define the contract; the browser OCCT worker compiles the shape for preview and STEP export.

**Tech Stack:** Go service validation/tests, React/Vite TypeScript worker code, OpenCascade.js worker adapter, Vitest, project docs.

## Global Constraints

- Start from latest `main` on branch `feat/feature-dsl-tapered-extrude`.
- Use TDD: write failing tests before production changes.
- Support only rectangular, circular, and elliptical sketch taper/extrude paths.
- Require positive height and positive taper scale.
- Keep direction semantics to existing `positive`, `negative`, and `symmetric` Z extrusion behavior.
- Do not support arbitrary freeform profiles, negative or mirrored scale, arbitrary B-rep draft-face selection, source STEP feature-history edits, or durable feature graph History.
- Sync README, TODO, AGENTS, `.agents/rules/`, and `docs/browser-cad-kernel-roadmap.md`.

---

### Task 1: Backend DSL Contract

**Files:**
- Modify: `internal/service/parametric_artifact_test.go`
- Modify: `internal/service/feature_dsl_capabilities_test.go`
- Modify: `internal/service/ai_tools_test.go`
- Modify: `internal/service/parametric_artifact.go`
- Modify: `internal/service/ai_tools.go`

**Interfaces:**
- Produces: backend acceptance for `{"type":"tapered_extrude","sketch":...,"height":...,"top_scale":...}`.
- Produces: backend rejection for missing/zero/negative `top_scale`, non-XY referenced sketches, invalid sketch forms, and unsupported feature registry gaps.

- [ ] Write failing Go tests for valid rectangular, circular, and elliptical `tapered_extrude` source.
- [ ] Write failing Go tests for invalid `top_scale`, invalid direction, non-XY referenced sketches, and missing sketch.
- [ ] Run focused Go tests and confirm red.
- [ ] Add `tapered_extrude` to backend capability registry, solid-feature classification, validator dispatch, and Assistant prompt/tool schema wording.
- [ ] Run focused Go tests and confirm green.

### Task 2: Browser Worker Preview And Export

**Files:**
- Modify: `website/src/cad/kernel-protocol.ts`
- Modify: `website/src/cad/feature-dsl-capabilities.ts`
- Modify: `website/src/cad/feature-dsl-capabilities.test.ts`
- Modify: `website/src/cad/feature-dsl/compile-feature.test.ts`
- Modify: `website/src/cad/feature-dsl/compile-feature.ts`
- Modify: `website/src/cad/feature-dsl/compile-sketch-features.ts`
- Modify: `website/src/cad/feature-dsl/compile-runtime.ts`
- Modify: `website/src/cad/opencascade-step.test.ts`

**Interfaces:**
- Consumes: backend contract from Task 1.
- Produces: worker support for preview/export of `tapered_extrude` through the existing `feature-dsl-preview` and `feature-dsl-export` paths.

- [ ] Write failing Vitest dispatch/capability tests for `tapered_extrude`.
- [ ] Write failing worker export tests for rectangular tapered extrude and one curved profile tapered extrude.
- [ ] Run focused frontend tests and confirm red.
- [ ] Add TypeScript protocol type and compiler dispatch.
- [ ] Build rectangular tapered extrude with an OCCT loft between bottom/top rectangle wires.
- [ ] Build circular/elliptical tapered extrude with lofted bottom/top wires or faces.
- [ ] Preserve existing origin, direction, expression, repeat, and feature-local transform behavior.
- [ ] Run focused frontend tests and confirm green.

### Task 3: Docs Sync

**Files:**
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`
- Modify: `docs/current-work-handoff.md`

**Interfaces:**
- Consumes: implemented capability and verified test behavior.
- Produces: docs that describe tapered extrude as shipped and remove it from the immediate recommended-next slice.

- [ ] Update current capability lists to include restricted `tapered_extrude`.
- [ ] Keep boundaries explicit: no arbitrary freeform taper, draft-face selection, mirrored scale, or B-rep feature history.
- [ ] Move TODO wording from "recommended next slice" to remaining future gaps.
- [ ] Update handoff with the next narrower follow-up after this branch.

### Task 4: Verification

**Files:**
- No production file ownership.

**Interfaces:**
- Consumes: all tasks above.
- Produces: confidence for branch closeout.

- [ ] Run focused Go tests for parametric artifact, AI tools, and capabilities.
- [ ] Run focused frontend worker/capability tests.
- [ ] Run `cd website && npx tsc -b`.
- [ ] Run `task check`.
- [ ] Run `task test`.
- [ ] Run `task test-browser` if Assistant or saved model UX changed; otherwise explain why focused worker coverage is sufficient.

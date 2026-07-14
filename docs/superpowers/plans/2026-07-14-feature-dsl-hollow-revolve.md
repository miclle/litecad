# Hollow Rectangular Revolve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Compile a full-turn XZ rectangular revolve into the correct solid or hollow OCCT body through Assistant validation, preview, and STEP export.

**Architecture:** Keep the existing Feature DSL shape and specialize only the stable full-turn XZ rectangle/default-Z-axis path. The worker constructs an outer cylinder and subtracts the coaxial inner cylinder when the profile is offset from the axis; the generic OCCT revolve path remains unchanged.

**Tech Stack:** Go 1.26, React 19, TypeScript 6, OpenCascade.js/replicad WASM, Vitest, Playwright.

## Global Constraints

- Keep backend validation and provider prompting server-owned.
- Preview and STEP export must use the same worker shape builder.
- Do not add FreeCAD, Python, or a server CAD runtime.
- Reject a rectangular profile that crosses the selected axis instead of emitting substitute geometry.
- Run `task check`, `task test`, `task test-browser`, and `task build`; run `task smoke-ai-provider` when a configured provider is available.

---

### Task 1: Lock the worker geometry contract

**Files:**
- Modify: `website/src/cad/opencascade-step.test.ts`
- Modify: `website/src/cad/feature-dsl/compile-runtime.ts`

**Interfaces:**
- Consumes: `CadKernelFeatureDSLRevolveFeature` with an XZ rectangle, default Z axis, and 360 degree angle.
- Produces: a solid cylinder when `innerRadius == 0`, a cut hollow cylinder when `innerRadius > 0`, and a descriptive error when the profile crosses the axis.

- [x] Add a worker test using a rectangle at X=8 with size `[4, 10]`; assert the mesh contains vertices near radii 8 and 12 and exports non-empty STEP text.
- [x] Run `npm --prefix website test -- src/cad/opencascade-step.test.ts` and confirm the inner-radius assertion fails because the current implementation emits only the outer envelope.
- [x] Update `buildFeatureDSLRectangularRevolveShape(...)` to resolve the radial interval, reject axis-crossing profiles, build the outer cylinder, and subtract a same-height inner cylinder with `BRepAlgoAPI_Cut` when required.
- [x] Add a second test for a rectangle starting on the axis and assert it remains a solid cylinder.
- [x] Add a third test for an axis-crossing profile and assert the worker rejects it.
- [x] Re-run the focused Vitest file and confirm all revolve cases pass.

### Task 2: Strengthen backend validation and provider guidance

**Files:**
- Modify: `internal/service/parametric_artifact.go`
- Modify: `internal/service/parametric_artifact_test.go`
- Modify: `internal/service/ai_tools.go`
- Modify: `internal/service/ai_tools_test.go`

**Interfaces:**
- Consumes: generated `litecad-feature-dsl` JSON.
- Produces: structural validation for supported revolve profiles and provider instructions that describe the hollow rectangular contract.

- [x] Add failing Go tests for a valid full-turn XZ rectangular revolve, an angle outside `(0, 360]`, and a zero axis vector.
- [x] Run the focused service tests and confirm the new invalid cases fail for the intended reason.
- [x] Extend revolve validation without narrowing existing generic revolve support; validate referenced sketches, axis, angle, and rectangular dimensions through existing expression helpers.
- [x] Add a prompt/tool-schema assertion requiring the provider text to describe an offset XZ rectangle as a hollow full-turn revolve.
- [x] Update the system prompt and tool description with that exact capability and its axis-crossing restriction.
- [x] Re-run focused service tests and confirm they pass.

### Task 3: Prove the Assistant browser path and document the capability

**Files:**
- Modify: `website/e2e/project-workbench-parametric.spec.ts`
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/litecad-architecture.md`
- Modify: `docs/ai-parametric-assistant.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`

**Interfaces:**
- Consumes: the validated worker capability from Tasks 1 and 2.
- Produces: a user-visible draft/save/export regression and aligned shipped-versus-future documentation.

- [x] Add a deterministic mock-provider E2E fixture returning the hollow revolve DSL and assert draft generation, successful preview, automatic `.lcad.json` save, and STEP export availability.
- [x] Run the focused Playwright spec and confirm it fails before fixture/workflow support is complete.
- [x] Add only the fixture and UI assertions needed for the existing Assistant flow to exercise the capability.
- [x] Update current-capability docs to say full-turn XZ rectangular profiles can produce hollow revolves; retain arbitrary/freeform revolve profiles as future work.
- [x] Run `task check`, `task test`, `task test-browser`, and `task build`.
- [x] Run `task smoke-ai-provider` against a configured server and record pass, configuration skip, or provider failure.
- [x] Review the complete diff for unsupported capability claims and commit as `feat(cad): support hollow rectangular revolves`.

# Code Decay Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the identified LiteCAD workbench and Feature DSL decay risks without changing shipped behavior, with every phase independently tested, browser-verified where applicable, documented, and committed.

**Architecture:** Keep `ProjectView` as the route composition root while moving cohesive Assistant and parametric-preview orchestration into focused hooks. Make the Feature DSL capability set mechanically comparable across backend validation and browser compilation, then split the OCCT compiler by feature family behind its existing worker API. Finish by replacing the monolithic browser smoke with independently diagnosable end-to-end workflows.

**Tech Stack:** Go 1.26, React 19, TypeScript 6, React Query 5, Vitest, Playwright, Three.js, OpenCascade.js, Task.

## Global Constraints

- Preserve the existing Handler -> Service -> Entity backend layering and browser CAD kernel worker boundary.
- Do not change the public HTTP API, persisted schemas, Feature DSL JSON format, generated geometry semantics, or visible workbench behavior during structural extraction.
- Use test-driven development: add a focused failing characterization or contract test before each production-code extraction, observe the intended failure, then implement the minimum change.
- Run `task check` and `task test` before every phase commit.
- Run `task test-browser` and complete an in-app Browser interaction pass for every phase that changes `website/src/views/project/`, `website/e2e/`, or browser-visible CAD behavior.
- Update `TODO.md`, `.agents/rules/litecad-architecture.md`, `.agents/rules/threejs-viewer.md`, and focused design docs only when their stated ownership or remaining work changes.
- Create one scoped commit per completed phase; do not combine phases.
- Do not add a global React state library, code-generation framework, or new runtime dependency.

---

### Task 0: Record the governance baseline

**Files:**
- Create: `docs/superpowers/plans/2026-07-13-code-decay-governance.md`

**Interfaces:**
- Consumes: existing architecture rules and the 2026-07-13 code-decay review.
- Produces: the phase boundaries and verification contract used by Tasks 1-4.

- [x] **Step 1: Verify the synchronized baseline**

Run:

```bash
git status --short --branch
git pull --ff-only origin main
```

Expected: clean `main`, up to date with `origin/main`.

- [x] **Step 2: Add this implementation plan**

The plan must contain exact files, interfaces, focused RED/GREEN commands, full phase gates, browser checks, documentation changes, and commit messages for Tasks 1-4.

- [x] **Step 3: Run the documentation phase gate**

Run:

```bash
task check
git diff --check
```

Expected: both commands exit 0.

- [x] **Step 4: Commit the baseline**

```bash
git add docs/superpowers/plans/2026-07-13-code-decay-governance.md
git commit -m "docs: plan code decay governance"
```

---

### Task 1: Extract workbench Assistant and parametric controllers

**Files:**
- Create: `website/src/views/project/use-project-assistant-controller.ts`
- Create: `website/src/views/project/use-project-assistant-controller.test.tsx`
- Create: `website/src/views/project/use-project-parametric-models.ts`
- Create: `website/src/views/project/use-project-parametric-models.test.tsx`
- Modify: `website/src/views/project/index.tsx`
- Modify: `website/e2e/project-workbench.spec.ts`
- Modify: `TODO.md`
- Modify: `.agents/rules/litecad-architecture.md`

**Interfaces:**
- `useProjectAssistantController({ projectId, enabled, queryClient })` owns conversation selection, persisted/local message composition, send/generate/create-conversation mutations, retry state, and artifact selection callbacks.
- `useProjectParametricModels({ projectId, projectModels, selectedSourceModel, selectedArtifact, queryClient })` owns saved-source loading, parameter overrides, preview query inputs, debounced persistence coordination, and selected saved-artifact derivation.
- `ProjectView` consumes the returned state and callbacks and remains responsible only for composing controlled workbench surfaces.

- [x] **Step 1: Write failing Assistant controller tests**

Add tests that render the wished-for hook with a `QueryClientProvider` and assert that it:

```tsx
expect(result.current.activeConversationID).toBe('agc_first')
expect(result.current.messages.map((message) => message.body)).toEqual(['Persisted reply'])
await act(() => result.current.sendMessage('Inspect this model'))
expect(sendProjectAgentConversationMessage).toHaveBeenCalledWith('project_1', 'agc_first', {
  messages: [{ role: 'user', body: 'Inspect this model' }],
})
```

Run:

```bash
npm --prefix website test -- use-project-assistant-controller
```

Expected: FAIL because the hook does not exist.

- [x] **Step 2: Implement and verify the Assistant controller**

Move the existing conversation queries, local message overlay, mutation callbacks, retry state, and selected artifact coordination without changing API payloads or query keys.

Run:

```bash
npm --prefix website test -- use-project-assistant-controller project-assistant-panel project-agent-tool-message project-parametric-run-telemetry
```

Expected: PASS.

- [x] **Step 3: Write failing parametric controller tests**

Add tests asserting saved `.lcad.json` source derivation and stable local overrides:

```tsx
expect(result.current.selectedSavedArtifact?.source_kind).toBe('litecad-feature-dsl')
act(() => result.current.updatePreviewParameters('model_1', { width: 24 }))
expect(result.current.parameterOverridesByModelID.model_1).toEqual({ width: 24 })
```

Run:

```bash
npm --prefix website test -- use-project-parametric-models
```

Expected: FAIL because the hook does not exist.

- [x] **Step 4: Implement and integrate the parametric controller**

Move saved-source loading, saved-artifact derivation, local parameter overrides, and Feature DSL preview coordination from `ProjectView`. Keep source query keys and stale-mesh preservation behavior unchanged.

Run:

```bash
npm --prefix website test -- use-project-parametric-models use-parametric-artifact-preview project-feature-dsl-preview parametric-artifact-editor
```

Expected: PASS.

- [x] **Step 5: Add an independent Assistant/parameter browser workflow**

Split the Assistant draft/save/parameter-edit path into its own Playwright test with fresh fixture reset. Assert conversation selection, draft preview status, save, parameter edit, persisted request count, and absence of console/page errors.

Run:

```bash
task test-browser
```

Expected: all Playwright tests pass.

- [x] **Step 6: Complete the in-app Browser pass**

Start the normal development environment, open `/projects/<fixture-id>` in the in-app Browser, and verify:

1. Workbench loads with no console errors.
2. Assistant opens, selects a conversation, and submits a message.
3. A generated DSL draft opens in Inspector.
4. Saving and editing a numeric parameter updates the visible preview status.
5. History opens after the parameter edit.

- [x] **Step 7: Update ownership documentation**

Update `TODO.md` to remove the completed Assistant/parametric portion of the composition hotspot. Update `.agents/rules/litecad-architecture.md` to assign those responsibilities to the new hooks and keep future queries/effects out of `ProjectView`.

- [x] **Step 8: Run the phase gate and commit**

```bash
task check
task test
task test-browser
git diff --check
git status --short
git add website/src/views/project website/e2e/project-workbench.spec.ts TODO.md .agents/rules/litecad-architecture.md
git commit -m "refactor(project): extract workbench controllers"
```

---

### Task 2: Enforce the Feature DSL capability contract

**Files:**
- Create: `internal/service/feature_dsl_capabilities.go`
- Create: `internal/service/feature_dsl_capabilities_test.go`
- Create: `website/src/cad/feature-dsl-capabilities.ts`
- Create: `website/src/cad/feature-dsl-capabilities.test.ts`
- Modify: `internal/service/parametric_artifact.go`
- Modify: `internal/service/ai_tools.go`
- Modify: `website/src/cad/kernel-protocol.ts`
- Modify: `website/src/cad/opencascade-step.ts`
- Modify: `docs/ai-parametric-assistant.md`
- Modify: `.agents/rules/litecad-architecture.md`

**Interfaces:**
- Go exports `LiteCADFeatureDSLCapabilities() LiteCADFeatureDSLCapabilityRegistry` from one immutable backend-owned registry used by validation and AI prompting.
- TypeScript exports `LITECAD_FEATURE_DSL_CAPABILITY_REGISTRY`, `isSupportedFeatureDSLType(type)`, and `assertFeatureDSLCompilerCoverage(types)` from one browser-owned module.
- Tests compare normalized feature, boolean-operation, and sketch-plane sets across validation and compilation dispatch; no production HTTP endpoint or generated file is added.

- [ ] **Step 1: Write failing backend registry tests**

Assert exact stable capability names and prove AI prompting consumes the same registry:

```go
registry := LiteCADFeatureDSLCapabilities()
require.ElementsMatch(t, []string{"sketch", "box", "box_cut", "extrude", "extrude_cut", "cylinder", "cylinder_cut", "sphere", "ellipsoid", "ellipse_extrude", "revolve", "sweep", "loft", "fillet", "chamfer", "boolean"}, registry.Features)
require.Contains(t, buildAIParametricSystemPrompt(), strings.Join(registry.Features, ", "))
```

Run:

```bash
go test ./internal/service -run 'TestLiteCADFeatureDSLCapabilities|TestAIParametricPromptUsesCapabilityRegistry'
```

Expected: FAIL because the registry API does not exist.

- [ ] **Step 2: Implement the backend capability registry**

Move capability constants out of validation/prompt construction, return defensive copies, and preserve all accepted JSON inputs.

Run the focused backend command again; expected: PASS.

- [ ] **Step 3: Write failing browser compiler-coverage tests**

Assert that every registered feature is accepted by protocol validation and declared by the compiler dispatch table, and that an unknown feature is rejected.

Run:

```bash
npm --prefix website test -- feature-dsl-capabilities kernel-protocol opencascade-step
```

Expected: FAIL because compiler coverage is not exposed as a checkable contract.

- [ ] **Step 4: Implement browser capability helpers**

Move the registry from `kernel-protocol.ts`, replace repeated string-set checks with the helper, and expose a compiler-handler map or coverage set from the OCCT compiler without changing worker messages.

Run the focused frontend command again; expected: PASS.

- [ ] **Step 5: Update contract documentation**

Document that backend prompting/validation and browser protocol/compiler each have a local single source of truth protected by exact parity tests. Do not claim cross-language code generation.

- [ ] **Step 6: Run the phase gate and commit**

```bash
task check
task test
git diff --check
git status --short
git add internal/service website/src/cad docs/ai-parametric-assistant.md .agents/rules/litecad-architecture.md
git commit -m "refactor(cad): enforce feature dsl capabilities"
```

No browser pass is required because this phase changes internal validation organization only and preserves browser-visible behavior; `task test` covers worker/kernel behavior.

---

### Task 3: Split the OCCT Feature DSL compiler by feature family

**Files:**
- Create: `website/src/cad/feature-dsl/compiler-context.ts`
- Create: `website/src/cad/feature-dsl/compile-primitives.ts`
- Create: `website/src/cad/feature-dsl/compile-sketch-features.ts`
- Create: `website/src/cad/feature-dsl/compile-booleans.ts`
- Create: `website/src/cad/feature-dsl/compile-modifiers.ts`
- Create: `website/src/cad/feature-dsl/compile-feature.ts`
- Create: `website/src/cad/feature-dsl/compile-feature.test.ts`
- Modify: `website/src/cad/opencascade-step.ts`
- Modify: `website/src/cad/opencascade-step.test.ts`
- Modify: `.agents/rules/threejs-viewer.md`
- Modify: `docs/browser-cad-kernel-roadmap.md`

**Interfaces:**
- `FeatureDSLCompilerContext` contains the OpenCascade module, resolved numeric parameters, and reusable sketch definitions.
- `compileFeatureInstance(context, feature, origin, transform)` returns a new OCCT shape for additive/standalone features.
- `applyFeatureToAccumulatedShape(context, accumulatedShape, feature)` preserves sequential cuts, fillet/chamfer modifiers, repeat expansion, boolean composition, transforms, and feature-scoped error messages.
- `opencascade-step.ts` keeps public loader, STEP import/export, tessellation, and worker-facing functions.

- [ ] **Step 1: Write failing compiler dispatch characterization tests**

Add table-driven tests using the existing fake OpenCascade module for primitive, sketch-based, cut, modifier, boolean, repeat, and transform representatives. Assert resulting shape summaries and error messages through the new `applyFeatureToAccumulatedShape` interface.

Run:

```bash
npm --prefix website test -- compile-feature
```

Expected: FAIL because the compiler-family interface does not exist.

- [ ] **Step 2: Extract compiler context and primitive family**

Move box, cylinder, sphere, ellipsoid, ellipse-extrude, repeat-origin, and primitive scaling helpers. Run the focused compiler test and `opencascade-step`; expected: PASS.

- [ ] **Step 3: Extract sketch feature family**

Move reusable sketch resolution, extrude/extrude-cut, revolve, sweep, loft, wire, face, and directed-origin helpers. Preserve the existing supported planes and current geometry limitations. Run focused tests; expected: PASS.

- [ ] **Step 4: Extract boolean and modifier families**

Move recursive boolean operands, cut/fuse/intersect builders, fillet, and conservative chamfer handling. Preserve feature-scoped error wrapping and OCCT cleanup. Run focused tests; expected: PASS.

- [ ] **Step 5: Reduce `opencascade-step.ts` to orchestration**

Keep public worker-facing functions, STEP file-system operations, transforms shared with STEP operations, tessellation, and STEP serialization in the original module. Replace the long feature-type chain with the extracted dispatch interface.

- [ ] **Step 6: Run browser-kernel end-to-end verification**

```bash
task check
task test
task test-browser
```

Expected: all commands pass, including preview, saved parameter update, and STEP export coverage.

- [ ] **Step 7: Complete the in-app Browser pass**

Open the workbench fixture in the in-app Browser and exercise a generated `.lcad.json` model containing a primitive, sketch extrusion, boolean cut, and modifier. Verify preview rendering, parameter update, camera interaction, and STEP export without console errors.

- [ ] **Step 8: Update Kernel ownership documentation and commit**

Document feature-family file ownership and keep Three.js scene/resource ownership unchanged.

```bash
git diff --check
git status --short
git add website/src/cad .agents/rules/threejs-viewer.md docs/browser-cad-kernel-roadmap.md
git commit -m "refactor(cad): split feature dsl compiler"
```

---

### Task 4: Make workbench end-to-end coverage independently diagnosable

**Files:**
- Create: `website/e2e/fixtures/project-api.ts`
- Create: `website/e2e/project-workbench-shell.spec.ts`
- Create: `website/e2e/project-workbench-history.spec.ts`
- Create: `website/e2e/project-workbench-parametric.spec.ts`
- Create: `website/e2e/project-workbench-export.spec.ts`
- Modify or remove: `website/e2e/project-workbench.spec.ts`
- Modify: `README.md`
- Modify: `TODO.md`
- Modify: `AGENTS.md`
- Modify: `.agents/rules/testing-and-verification.md`
- Modify: `docs/superpowers/plans/2026-07-13-code-decay-governance.md`

**Interfaces:**
- `installProjectAPIFixture(page, scenario)` installs deterministic project, conversation, CAD document, history, source, preview, parameter-update, and export routes with isolated per-test mutable state.
- Each spec owns one workflow and uses fresh fixture state; no test depends on execution order.

- [ ] **Step 1: Write a failing fixture-isolation test**

Add two tests that mutate model parameters/history independently and assert the second test starts from defaults.

Run:

```bash
npm --prefix website exec playwright test website/e2e/project-workbench-parametric.spec.ts
```

Expected: FAIL until the shared mutable globals are replaced by per-test scenario state.

- [ ] **Step 2: Extract the deterministic API fixture**

Move route fulfillment and mutable counters into a scenario object returned to each test. Preserve response payloads and existing assertions.

- [ ] **Step 3: Split browser workflows**

Create separate tests for:

1. shell/panel persistence and absence of browser errors;
2. import, selection, transform, conflict, Undo, and Redo;
3. Assistant draft, save, parameter edit, reload preservation, and History;
4. per-model and compound STEP export.

Run each spec individually, then run `task test-browser`; expected: PASS with no order dependency.

- [ ] **Step 4: Complete the final in-app Browser acceptance**

Use the in-app Browser against the running application and verify the same four workflows at desktop size, then repeat shell/panel and Inspector behavior at a narrow viewport. Capture console errors and screenshots for the execution record; do not commit generated screenshots.

- [ ] **Step 5: Update documentation and close completed risks**

Update testing commands and fixture ownership in README, AGENTS, and testing rules. Remove the completed E2E-expansion and workbench-controller items from `TODO.md`, leaving only genuinely unfinished product work. Check off all completed steps in this plan.

- [ ] **Step 6: Run the final repository gate**

```bash
task check
task test
task test-browser
task build
git diff --check
git status --short
```

Expected: all commands exit 0 and the status contains only Task 4 files.

- [ ] **Step 7: Re-run the code-decay measurements**

```bash
find internal website/src -type f \( -name '*.go' -o -name '*.ts' -o -name '*.tsx' \) -not -path '*/node_modules/*' -print0 | xargs -0 wc -l | sort -nr | head -20
git log --since='2026-07-13' --name-only --pretty=format: -- internal website/src | sed '/^$/d' | sort | uniq -c | sort -nr | head -20
```

Acceptance:

- `ProjectView` no longer owns Assistant conversation or parametric preview effects.
- OCCT Feature DSL compilation is divided by feature family.
- Capability drift fails a focused automated test.
- Workbench E2E failures identify the affected workflow without reading one monolithic test.
- No public behavior or documented product boundary regresses.

- [ ] **Step 8: Commit the final phase**

```bash
git add website/e2e README.md TODO.md AGENTS.md .agents/rules/testing-and-verification.md docs/superpowers/plans/2026-07-13-code-decay-governance.md
git commit -m "test(project): expand workbench browser coverage"
```

---

## Completion Review

- [ ] Every phase has a fresh `task check` and `task test` result.
- [ ] UI/kernel phases have fresh `task test-browser` and in-app Browser evidence.
- [ ] Every phase updates the relevant ownership or testing documentation.
- [ ] Every phase is represented by one scoped commit.
- [ ] `git status --short --branch` is clean after the final commit.
- [ ] The final code-decay review classifies the former hotspots using current evidence rather than line count alone.

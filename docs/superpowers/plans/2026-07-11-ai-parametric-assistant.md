# AI Parametric Assistant Completed Implementation Summary

This file is a completed historical summary for the AI Parametric Assistant implementation. The original phase-by-phase checklist was intentionally collapsed after completion so current readers can understand the shipped boundary without re-reading the execution log. Detailed task history remains available in git history.

## Original Goal

Build LiteCAD's CAD Agent into a project-scoped, multi-session text-to-parameterized-CAD workflow where a user can generate a model from text, preview it in the browser, save it as a project-owned source model, edit exposed parameters later, and keep imported STEP/GLB/GLTF/STL sources as parallel project assets.

## Final Product Path

The initial implementation explored OpenSCAD-style generated artifacts, but browser OpenSCAD runtime bundling was deferred after package review found GPL-licensed candidates and no accepted distribution decision. LiteCAD still stores OpenSCAD-style artifacts and can expose parsed parameters, but normal browser mesh compilation and the save-to-canvas flow for OpenSCAD remain future work.

The shipped generated-model path is LiteCAD's native Feature DSL:

1. A project owns multiple Assistant conversations with persisted messages.
2. The backend asks an OpenAI-compatible provider for a `build_parametric_model` native tool call, or retries with strict JSON fallback when native tool calling fails.
3. Valid tool output creates a project-owned pending generated-source artifact, preferring `litecad-feature-dsl` unless the user explicitly asks for OpenSCAD.
4. The browser compiles LiteCAD DSL drafts through the OCCT-backed `feature-dsl-preview` worker before save.
5. Successful LiteCAD DSL drafts are automatically saved as durable `.lcad.json` project source models and selected in the main canvas.
6. Saved `.lcad.json` models preview through the same browser worker path and export to STEP through `feature-dsl-export`.
7. Saved `.scad` and `.lcad.json` parameter edits persist as parametric revisions; saved `.lcad.json` edits update the viewer locally first, settle-save to the backend, survive reload, and create reversible Operation History entries.

## Completed Capabilities

- Project-scoped Assistant conversations and conversation-scoped persisted messages.
- Server-owned provider prompting, native OpenAI-compatible `build_parametric_model` tool calls, strict JSON fallback, timeout and output-token controls, and safe failure persistence for invalid provider output.
- Parametric artifact draft creation for OpenSCAD-style and LiteCAD Feature DSL source kinds.
- LiteCAD Feature DSL backend validation and browser capability coverage for supported features.
- Browser worker preview/export for LiteCAD DSL generated models through the existing OCCT worker boundary.
- Inspector parameter controls for generated drafts and saved models, including boolean/string UI metadata where appropriate.
- Automatic save-as-`.lcad.json` after successful LiteCAD DSL draft preview.
- Saved `.lcad.json` preview refresh, STEP export, local-first parameter preview, automatic debounced/settled persistence, reload preservation, and Operation History integration.
- Documentation updates in `README.md`, `TODO.md`, `AGENTS.md`, `.agents/rules/litecad-architecture.md`, and `docs/ai-parametric-assistant.md` separating shipped behavior from future CAD semantics.

## Deferred Or Future Work

These items are intentionally not claimed as shipped by this completed plan:

- OpenSCAD browser mesh compilation and normal OpenSCAD save-to-canvas behavior, pending an accepted runtime/license/distribution decision.
- Full prompt-to-geometry mutation of existing CAD documents.
- Durable editable B-rep feature history or durable browser-kernel shape state.
- Full sketch constraints, freeform profiles, arbitrary sweep paths, arbitrary/freeform revolve profiles, robust true chamfer selection, mirrored/negative transforms, tapers, infix formulas, functions, unit math, comparisons, and conditionals.
- Backend export artifact history and broader long-running provider analytics/progress UX.

Current follow-up work lives in `TODO.md`; current product and architecture status lives in `docs/ai-parametric-assistant.md`, `docs/browser-cad-kernel-roadmap.md`, `AGENTS.md`, and `.agents/rules/litecad-architecture.md`.

## Historical Commit Trail

The detailed checklist was completed through scoped commits including:

- `53d8bd8 docs(ai): plan parametric assistant`
- `39b01ed feat(ai): add assistant conversations`
- `926b641 feat(projects): persist parametric artifacts`
- `d7e20c2 feat(cad): add openscad worker foundation`
- `b56d6a5 docs(cad): record openscad wasm license gate`
- `952b349 feat(cad): add feature dsl worker path`
- `2c07aaf feat(agent): persist feature dsl artifacts`
- `614f8c7 feat(projects): export feature dsl models`
- `76aa536 docs(cad): close ai parametric assistant plan`
- `cebb8a7 docs(cad): close deferred openscad checklist`
- `3eb4f95 feat(projects): auto-save generated dsl models`
- `4850734 fix(projects): record parameter edits in history`

Use `git log -- docs/superpowers/plans/2026-07-11-ai-parametric-assistant.md` and the related product commits for the original execution record.

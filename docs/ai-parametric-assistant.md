# AI Parametric Assistant

LiteCAD's AI Assistant target is text-to-parameterized CAD: users can start a project-scoped Assistant session, generate a parameterized model from text, preview it in the browser once a compatible runtime is selected, edit exposed parameters, and save the result as a project-owned model source.

## Current Status

The current CAD Agent supports project-owned Assistant conversations, stores messages per conversation, can include project/source metadata in provider context, and has backend APIs for project-owned parametric artifact drafts. A dedicated parametric-run API asks the configured provider to call `build_parametric_model`, validates the returned tool input server-side, stores the user prompt and Assistant tool message, and creates a pending artifact draft. OpenAI-compatible providers use native function tools when available, with strict JSON message output retained as a fallback for simpler providers. Successful parametric-run responses include telemetry for the tool mode, generated source kind, and elapsed duration, and the generated artifact keeps the tool mode plus duration so artifact list/detail reloads and the Inspector-side editor can inspect the generation path. If a provider response cannot be parsed as a valid tool call, LiteCAD stores the user prompt plus a safe Assistant failure message in that conversation without creating an artifact. The workbench distinguishes parametric model generation from ordinary chat while a run is pending, shows successful run telemetry in the generated-draft summary, and keeps failed generation prompts available for a one-click retry. The accepted generated source kinds are `openscad` and `litecad-feature-dsl`; the provider prompt now prefers LiteCAD feature DSL JSON unless the user explicitly asks for OpenSCAD source, and backend validation rejects LiteCAD DSL JSON that does not match the shipped `extrude` / `extrude_cut` / `box` / `box_cut` / `cylinder` / `cylinder_cut` schema, including invalid rectangular or circular sketch extrudes, sketch cuts, box cuts, cylinder axes, repeat patterns, and malformed structured numeric expressions.

The workbench can open OpenSCAD drafts in an Inspector-side editor, parse top-level OpenSCAD-style parameters, request browser-worker compilation, and keep compile errors visible with Save disabled. Successfully compiled OpenSCAD artifacts can be saved as durable `.scad` project model sources. Saved `.scad` source models can be selected later, edited through the same parameter controls, and persisted with separate parameter revision records. LiteCAD does not yet bundle an OpenSCAD runtime or produce mesh previews from generated OpenSCAD source.

The LiteCAD-native feature DSL path is now connected to Assistant tool validation, generated artifact persistence, browser-kernel draft preview, save-as-project-model persistence, saved parameter revision editing, project preview, and STEP export. Pending `litecad-feature-dsl` drafts are compiled through the existing `feature-dsl-preview` worker before Save is enabled; on save, LiteCAD records the successful compile status and current parameter values before storing the artifact as a durable `.lcad.json` project model with `format = "lcad"` and metadata for schema, unit, parameter values, and feature count. The Inspector can read the DSL parameter defaults, edit saved parameter values, recompile the browser-kernel preview from those values, and reload with the edits preserved. Saved `.lcad.json` models are routed through the same `feature-dsl-preview` worker path for browser-kernel mesh preview, and through `feature-dsl-export` for separate or merged STEP downloads from the project export UI.

## Source Model Direction

Imported STEP, GLB, GLTF, and STL files are source assets. AI-generated parameterized models are also source assets. Supported generated-source kinds are OpenSCAD-style source and LiteCAD feature DSL JSON.

Because the OpenSCAD runtime remains blocked by license or distribution constraints, LiteCAD feature DSL JSON is the preferred generated-source kind. The current DSL foundation supports numeric, boolean, and string parameter metadata at the artifact/model layer, plus rectangular/circular `extrude`, rectangular/circular `extrude_cut`, `box`, `box_cut`, `cylinder`, and `cylinder_cut` features in the OCCT worker compiler. Geometry fields may use finite numbers, numeric parameter references, or nested structured numeric expression objects with `op = add | sub | mul | div` and exactly two `args`; backend validation rejects malformed operators/arity, non-numeric parameter references, and literal zero divisors, while the worker rejects runtime division by zero and non-finite expression results. Boolean and string parameters are editable UI metadata and are preserved through save/update revisions, but they are not valid geometry-expression references. `extrude` currently supports a rectangle sketch extruded into a solid or a circle sketch extruded into a cylinder; `extrude_cut` subtracts a rectangle sketch prism or circle sketch cylinder from prior solid features. Sketch extrudes default to positive Z and can specify `direction = "positive" | "negative" | "symmetric"` to place the generated prism above, below, or centered on the sketch plane. `box_cut` subtracts direct rectangular slots, pockets, and edge notches. Cylinders and cylinder cuts default to the Z axis and can specify an optional non-zero `axis` vector for side holes and horizontal posts. Any supported feature can include a bounded linear `repeat` pattern with literal integer `count` from 1 to 128 and a parameterizable `step` vector. Arbitrary sketch constraints, non-circular freeform profiles, arbitrary-axis sketch extrudes, tapers, infix formulas, functions, unit math, comparisons, conditionals, and boolean expressions remain future work.

## Dependency Decision

Implementation must not copy CADAM code. Before bundling OpenSCAD WASM or library archives, record the chosen upstream package, license, asset size, and production-serving path. If the license review blocks bundling, implement the LiteCAD feature DSL path first instead of shipping copied or incompatible artifacts.

Current dependency status: no OpenSCAD WASM package or asset is bundled yet. The browser code includes a request protocol, conservative parameter parser, worker client, and worker handler that returns a structured unavailable error until a dependency is selected. Initial package review found GPL-licensed OpenSCAD WASM packages (`openscad-wasm` is GPL-2.0; `@bascanada/openscad-compiler` is GPL-3.0-only), so LiteCAD should not bundle them until the distribution/license position is deliberately accepted. License-compatible options, WASM size, and production asset path remain unset.

## Assistant Sessions

Each project can own multiple Assistant conversations. New conversations start with project/model context only, not old chat transcript text. Saved project assets remain available to later conversations through project metadata and source summaries.

## Current Shipped Workflow

1. Create or select an Assistant conversation.
2. Send a text prompt to the parametric-run endpoint.
3. The model calls `build_parametric_model` through native tools when supported, or returns the strict fallback JSON shape.
4. The Assistant panel shows model-generation progress and successful run telemetry; if generation fails, it keeps the failed prompt available for retry.
5. LiteCAD stores a project-owned parametric artifact draft and opens it in the Inspector with durable generation telemetry when available.
6. The Inspector parses OpenSCAD top-level parameters or LiteCAD DSL parameter defaults.
7. A successfully compiled artifact can be saved as a durable `.scad` or `.lcad.json` source model.
8. Saved `.scad` and `.lcad.json` model parameters can be edited later and persisted with revision records.

## Target MVP Workflow

1. Create or select an Assistant conversation.
2. Send a text prompt.
3. The model calls `build_parametric_model`.
4. The browser compiles the returned source in a worker.
5. LiteCAD shows preview, compile status, and parameters.
6. The user saves the artifact as a project model.
7. Parameter edits recompile locally and persist without another model call.

## Implementation Plan

The phase-by-phase implementation plan lives in [docs/superpowers/plans/2026-07-11-ai-parametric-assistant.md](superpowers/plans/2026-07-11-ai-parametric-assistant.md).

## Provider Controls

Server-side OpenAI-compatible configuration supports `max_output_tokens`, which LiteCAD sends as `max_completion_tokens` to cap generated output for chat and parametric tool calls. The default cap is `2048`.

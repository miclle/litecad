# AI Parametric Assistant

LiteCAD's AI Assistant target is text-to-parameterized CAD: users can start a project-scoped Assistant session, generate a parameterized model from text, preview it in the browser once a compatible runtime is selected, edit exposed parameters, and save the result as a project-owned model source.

## Current Status

The current CAD Agent supports project-owned Assistant conversations, stores messages per conversation, can include project/source metadata in provider context, and has backend APIs for project-owned OpenSCAD-style parametric artifact drafts. A dedicated parametric-run API asks the configured provider for strict `build_parametric_model` JSON output, validates it server-side, stores the user prompt and Assistant tool message, and creates a pending artifact draft. The workbench can open that draft in an Inspector-side editor, parse top-level OpenSCAD-style parameters, request browser-worker compilation, and keep compile errors visible with Save disabled. Successfully compiled artifacts can be saved as durable `.scad` project model sources. Saved `.scad` source models can be selected later, edited through the same parameter controls, and persisted with separate parameter revision records. LiteCAD does not yet bundle an OpenSCAD runtime or produce mesh previews from generated source.

## Source Model Direction

Imported STEP, GLB, GLTF, and STL files are source assets. AI-generated parameterized models are also source assets. The first generated-source kind is OpenSCAD-style source because it supports a fast browser compile and parameter extraction loop.

## Dependency Decision

Implementation must not copy CADAM code. Before bundling OpenSCAD WASM or library archives, record the chosen upstream package, license, asset size, and production-serving path. If the license review blocks bundling, implement the LiteCAD feature DSL path first instead of shipping copied or incompatible artifacts.

Current dependency status: no OpenSCAD WASM package or asset is bundled yet. The browser code includes a request protocol, conservative parameter parser, worker client, and worker handler that returns a structured unavailable error until a dependency is selected. Initial package review found GPL-licensed OpenSCAD WASM packages (`openscad-wasm` is GPL-2.0; `@bascanada/openscad-compiler` is GPL-3.0-only), so LiteCAD should not bundle them until the distribution/license position is deliberately accepted. License-compatible options, WASM size, and production asset path remain unset.

## Assistant Sessions

Each project can own multiple Assistant conversations. New conversations start with project/model context only, not old chat transcript text. Saved project assets remain available to later conversations through project metadata and source summaries.

## Current Shipped Workflow

1. Create or select an Assistant conversation.
2. Send a text prompt to the parametric-run endpoint.
3. The model must return strict `build_parametric_model` JSON.
4. LiteCAD stores a project-owned OpenSCAD-style artifact draft and opens it in the Inspector.
5. The Inspector parses top-level parameters and shows compile errors from the unavailable runtime path.
6. A successfully compiled artifact can be saved as a durable `.scad` source model.
7. Saved `.scad` model parameters can be edited later and persisted with revision records.

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

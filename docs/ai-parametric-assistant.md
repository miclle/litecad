# AI Parametric Assistant

LiteCAD's AI Assistant target is text-to-parameterized CAD: users can start a project-scoped Assistant session, generate a parameterized model from text, preview it in the browser, edit exposed parameters, and save the result as a project-owned model source.

## Current Status

The current CAD Agent is advisory. It supports project-owned Assistant conversations, stores messages per conversation, and can include project/source metadata in provider context, but it does not yet create parametric artifacts, execute CAD tools, compile generated source, or save generated models.

## Source Model Direction

Imported STEP, GLB, GLTF, and STL files are source assets. AI-generated parameterized models are also source assets. The first generated-source kind is OpenSCAD-style source because it supports a fast browser compile and parameter extraction loop.

## Dependency Decision

Implementation must not copy CADAM code. Before bundling OpenSCAD WASM or library archives, record the chosen upstream package, license, asset size, and production-serving path. If the license review blocks bundling, implement the LiteCAD feature DSL path first instead of shipping copied or incompatible artifacts.

## Assistant Sessions

Each project can own multiple Assistant conversations. New conversations start with project/model context only, not old chat transcript text. Saved project assets remain available to later conversations through project metadata and source summaries.

## MVP Workflow

1. Create or select an Assistant conversation.
2. Send a text prompt.
3. The model calls `build_parametric_model`.
4. The browser compiles the returned source in a worker.
5. LiteCAD shows preview, compile status, and parameters.
6. The user saves the artifact as a project model.
7. Parameter edits recompile locally and persist without another model call.

## Implementation Plan

The phase-by-phase implementation plan lives in [docs/superpowers/plans/2026-07-11-ai-parametric-assistant.md](superpowers/plans/2026-07-11-ai-parametric-assistant.md).

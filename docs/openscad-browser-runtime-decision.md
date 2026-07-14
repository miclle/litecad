# OpenSCAD Browser Runtime Decision

Status: Rejected for bundled production use

Date: 2026-07-14

## Context

LiteCAD accepts `openscad` generated-source drafts and can parse their parameter annotations, but the normal browser workflow does not compile those drafts into preview geometry or export them. The project is MIT-licensed and ships the frontend inside the Go executable through `//go:embed`, so adding a browser runtime is also a source-distribution, binary-size, worker-loading, and CAD-output decision.

This record evaluates the available OpenSCAD WebAssembly runtime evidence. It is an engineering distribution policy, not legal advice.

## Decision

Do not bundle an OpenSCAD browser runtime in LiteCAD under the current MIT single-binary distribution policy.

- Keep `openscad` as an accepted Assistant source kind so users can inspect generated source and edit parsed parameters.
- Keep the existing OpenSCAD worker protocol as an inactive boundary; do not add a runtime package or generated binary.
- Do not enable OpenSCAD draft preview, normal Save as model, or project export from a successful compile result.
- Keep LiteCAD Feature DSL and the existing OCCT worker as the normal generated-model preview, save, and STEP-export path.

No evaluated candidate is license-compatible with retaining LiteCAD's current MIT-only distribution. The official runtime can compile in a browser, but accepting its GPL-2.0 distribution obligations would be a project licensing decision rather than an implementation detail.

## Evidence

### License and maintenance

The [OpenSCAD source license](https://github.com/openscad/openscad/blob/master/COPYING) is GNU GPL version 2 with a CGAL linking exception. The official [OpenSCAD WASM port](https://github.com/openscad/openscad-wasm) is also [GPL-2.0](https://github.com/openscad/openscad-wasm/blob/main/COPYING). The main OpenSCAD repository and official WASM snapshots are active, so maintenance activity is not the rejection reason.

Bundling the runtime, its JavaScript glue, and LiteCAD's Worker integration into the distributed executable would require satisfying GPL distribution obligations and resolving how that changes the current MIT-only product distribution. LiteCAD does not accept that licensing change in this phase.

The npm package [`openscad-wasm@0.0.4`](https://registry.npmjs.org/openscad-wasm/0.0.4) is also marked GPL-2.0. Its published metadata has no repository or README, it has one maintainer, and its package is not a better provenance or licensing boundary than the official build.

### Size and serving

The official [2026-07-13 WebAssembly snapshot](https://files.openscad.org/snapshots/OpenSCAD-2026.07.13-WebAssembly-web.zip) was inspected with its published [SHA-256](https://files.openscad.org/snapshots/OpenSCAD-2026.07.13-WebAssembly-web.zip.sha256):

| Asset | Raw bytes | gzip bytes |
| --- | ---: | ---: |
| `openscad.js` | 100,027 | 23,813 |
| `openscad.wasm` | 10,761,209 | 3,294,145 |
| Total | 10,861,236 | 3,317,958 |

The official ZIP is 3,298,840 bytes. The current production asset server embeds and serves Vite output without a precompressed content-encoding path, so bundling this snapshot would add roughly 10.9 MB to the embedded frontend and transfer the raw WASM unless production serving changed too.

The npm package tarball is 4,463,184 bytes and expands to 13,934,790 bytes, primarily one 13,932,284-byte `openscad.js` file.

### Browser and worker behavior

OpenSCAD documents a [headless Emscripten browser build](https://github.com/openscad/openscad#building-for-webassembly), and its generated module supports both Window and Worker environments with streaming instantiation plus an ArrayBuffer fallback. It does not require `SharedArrayBuffer`, so the existing LiteCAD Worker boundary is technically suitable.

The official [browser smoke example](https://github.com/openscad/openscad/blob/master/tests/wasm-check.html) writes source and fonts into the Emscripten filesystem, calls the command-line entry point, and reads an STL result. The [official downloads page](https://openscad.org/downloads.html) still describes the browser build as experimental and slower, with no preview, bundled font support, or GUI.

### LiteCAD workflow fit

The runtime produces tessellated STL output; it does not produce the OCCT mesh-buffer contract or STEP output used by LiteCAD's generated-model workflow. The current OpenSCAD compile result bytes are not consumed by the viewer, saved `.scad` models are excluded from project preview assets, and project STEP export is implemented only through the OCCT-backed LiteCAD Feature DSL path.

Shipping a useful runtime would therefore require more than loading WASM: STL validation and preview conversion, source/include/font sandboxing, cancellation and resource limits, saved-model integration, an explicit non-STEP export contract, production compression, license notices, corresponding source distribution, and browser E2E coverage.

## Reconsideration Gate

Reopen this decision only when all of the following are true:

1. A reviewed distribution plan either provides a compatible non-copyleft runtime or explicitly approves the project's GPL obligations and product-license change.
2. A versioned runtime artifact has reproducible provenance, source correspondence, license notices, and a repository-owned update policy.
3. The worker contract includes cancellation, memory/time limits, include/font sandboxing, deterministic STL validation, and user-facing compile errors.
4. The product contract defines preview conversion, saved-model behavior, and export semantics without implying STEP or B-rep output.
5. The single-binary size and transfer budget includes precompressed production serving and is accepted with browser performance measurements.
6. Chromium, Firefox, and Safari smoke coverage plus the normal LiteCAD Playwright workflow pass against the exact pinned artifact.

Until then, OpenSCAD remains a portable source-draft format, not a LiteCAD browser geometry runtime.

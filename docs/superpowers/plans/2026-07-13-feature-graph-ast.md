# LiteCAD Feature Graph / AST

Goal: implement the first executable long-term LiteCAD feature graph / AST path for AI-generated parametric models, including reusable sketch definitions, recursive boolean trees, revolve, sweep, loft, fillet, chamfer, and a backend-owned capability registry.

## Scope

- Add a shared DSL capability surface so Assistant prompting, backend validation, frontend worker protocol, and documentation describe the same executable feature set.
- Extend LiteCAD feature DSL v1 with:
  - `sketch` definition nodes that can be referenced by later feature nodes.
  - `boolean` AST nodes with `union`, `subtract`, and `intersect` operands.
  - `revolve`, `sweep`, and `loft` solid-generation nodes using supported sketch profiles.
  - `fillet` and `chamfer` modifier nodes that operate on the accumulated solid.
- Keep this as a first executable feature-graph layer, not a claim of full constraint solving, durable B-rep feature history, or arbitrary CAD feature replay.

## Verification

- Add failing backend validation and AI tool parser tests before implementation.
- Add failing frontend protocol and OCCT worker tests before implementation.
- Run targeted frontend/backend tests while iterating, then `task check`, `task test`, and `task test-browser`.
- Verify generated models in the built-in browser with cube/sphere/screw-style prior paths plus new feature graph examples.
- Review the final diff in review mode and fix any actionable issues before completion.

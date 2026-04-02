# Current Epic

## Focus: Pre-Implementation Specification

**Status:** Spec complete. Ready for coding agent to begin Task 1.

## Key Decisions Made

1. **Integration: Plugin, not fork.** Uses `mermaid.registerLayoutLoaders()` — same pattern as `@mermaid-js/layout-elk`.

2. **Serialization: Comment block with sentinel.** `%% @layout-constraints v1` blocks — invisible to stock mermaid, human-readable.

3. **Directional constraints (NESW).** Offsets and routing expressed as compass directions: `A south-of B, 120`, `wp1 west-of C, 20`. More natural than axis-based `offsetX`/`offsetY`.

4. **Waypoints as shadow nodes.** Edge routing constraints are expressed by creating waypoints (zero-size shadow nodes) that participate in the full constraint system. No separate edge constraint grammar needed.

5. **Iterative relaxation solver.** Priority-ordered, deterministic, fast enough for interactive use. Not LP or force-directed.

6. **Hybrid re-render.** In-place SVG transforms during drag (60fps), full `mermaid.render()` on constraint commit (correctness).

7. **Showboat + Rodney verification.** Agent builds a demo document at each milestone; human reviews before next task.

## Next Steps

Agent should:
1. Read all `_memory/basicTruths/*` files
2. Read `_memory/knowledgeBase/reference/ConstraintLanguageSpec.md`
3. Begin Task 1 from `theBacklog.md`

## Active Risks

1. **Mermaid internal API instability:** `LayoutData` and SVG structure are semi-public. Pin peer dep version, add integration tests.

2. **SVG node identification:** Varies by diagram type and mermaid version. Build robust node-finder with fallback strategies.

3. **Accessing diagram text from layout callback:** May need module-scoped side-channel. Spike during Task 5.

4. **Solver convergence:** Adversarial constraints could loop. Iteration cap + warning.

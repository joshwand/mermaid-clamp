# Current Epic

## Focus: Phase 1 Implementation

**Status:** Task 1 complete. Ready for Task 2 (Constraint Parser).

## Key Decisions Made

1. **Integration: Plugin, not fork.** Uses `mermaid.registerLayoutLoaders()` — same pattern as `@mermaid-js/layout-elk`.

2. **Serialization: Comment block with sentinel.** `%% @layout-constraints v1` blocks — invisible to stock mermaid, human-readable.

3. **Directional constraints (NESW).** Offsets and routing expressed as compass directions: `A south-of B, 120`, `wp1 west-of C, 20`. More natural than axis-based `offsetX`/`offsetY`.

4. **Waypoints as shadow nodes.** Edge routing constraints are expressed by creating waypoints (zero-size shadow nodes) that participate in the full constraint system. No separate edge constraint grammar needed.

5. **Iterative relaxation solver.** Priority-ordered, deterministic, fast enough for interactive use. Not LP or force-directed.

6. **Hybrid re-render.** In-place SVG transforms during drag (60fps), full `mermaid.render()` on constraint commit (correctness).

7. **Showboat + Rodney verification.** Agent builds a demo document at each milestone; human reviews before next task.

8. **Vite `output.exports: "named"`** in rollupOptions — suppresses "named+default exports together" warning, required because `src/index.ts` uses both `export default` and named re-exports.

## Task Status

| Task | Status |
|------|--------|
| 1 — Project Scaffold + Types | ✅ Complete |
| 2 — Constraint Parser | ⬜ Next |
| 3 — Constraint Serializer | ⬜ |
| 4 — Constraint Solver | ⬜ |
| 5 — Layout Engine Integration | ⬜ |
| 6 — Edge Router | ⬜ |
| 7 — State Manager | ⬜ |
| 8 — Constraint Inference Engine | ⬜ |
| 9 — Editor Overlay Basic Drag | ⬜ |
| 10 — Affordance Rendering | ⬜ |
| 11 — Shift+Drag Constraint Selection | ⬜ |
| 12 — Export + E2E Integration | ⬜ |
| 13 — User Documentation | ⬜ |
| 14 — Final Demo + Polish | ⬜ |

## Next Steps

Agent should:
1. Check `_memory/currentState/currentTaskState.md` for Task 1 completion status
2. Build Showboat demo for Task 1 if not yet done
3. Wait for human review
4. Begin Task 2 (Constraint Parser) from `theBacklog.md`

## Active Risks

1. **Mermaid internal API instability:** `LayoutData` and SVG structure are semi-public. Pin peer dep version, add integration tests.

2. **SVG node identification:** Varies by diagram type and mermaid version. Build robust node-finder with fallback strategies.

3. **Accessing diagram text from layout callback:** May need module-scoped side-channel. Spike during Task 5.

4. **Solver convergence:** Adversarial constraints could loop. Iteration cap + warning.

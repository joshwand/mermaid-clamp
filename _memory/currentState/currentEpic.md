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
| BUG-1 — Restore curved arrows | 🐛 Backlog (fix before continuing) |
| BUG-2 — Default offset for DIR-of | 🐛 Backlog (fix before continuing) |
| BUG-3 — DIR-of cascade to descendants | 🐛 Backlog (fix before continuing) |
| 1 — Project Scaffold + Types | ✅ Complete |
| 2 — Constraint Parser | ✅ Complete |
| 3 — Constraint Serializer | ✅ Complete |
| 4 — Constraint Solver | ✅ Complete |
| 5 — Layout Engine Integration | ✅ Complete |
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

Fix BUG-1, BUG-2, BUG-3 (see theBacklog.md) before continuing to Task 6.

## Active Risks

1. **Mermaid internal API instability:** `LayoutData` and SVG structure are semi-public. Pin peer dep version, add integration tests.

2. **SVG node identification:** Varies by diagram type and mermaid version. Build robust node-finder with fallback strategies.

3. **Accessing diagram text from layout callback:** May need module-scoped side-channel. Spike during Task 5.

4. **Solver convergence:** Adversarial constraints could loop. Iteration cap + warning.

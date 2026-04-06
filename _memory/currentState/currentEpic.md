# Current Epic

## Focus: Phase 1 Implementation

**Status:** Tasks 1–6 + all bugs complete. Ready for Task 7 (State Manager).

## Key Decisions Made

1. **Integration: Plugin, not fork.** Uses `mermaid.registerLayoutLoaders()` — same pattern as `@mermaid-js/layout-elk`.

2. **Serialization: Comment block with sentinel.** `%% @layout-constraints v1` blocks — invisible to stock mermaid, human-readable.

3. **Directional constraints (NESW).** Offsets and routing expressed as compass directions: `A south-of B, 120`, `wp1 west-of C, 20`. More natural than axis-based `offsetX`/`offsetY`.

4. **Waypoints as shadow nodes.** Edge routing constraints are expressed by creating waypoints (zero-size shadow nodes) that participate in the full constraint system. No separate edge constraint grammar needed.

5. **Iterative relaxation solver with topological cascade.** Priority-ordered, deterministic, fast enough for interactive use. Topological sort ensures constraint cascade to descendants in correct order.

6. **Hybrid re-render.** In-place SVG transforms during drag (60fps), full `mermaid.render()` on constraint commit (correctness).

7. **Showboat + Rodney verification.** Agent builds a demo document at each milestone; human reviews before next task.

8. **Vite `output.exports: "named"`** in rollupOptions — suppresses "named+default exports together" warning.

9. **2D similarity transform for edge re-anchoring.** `reanchorPath()` applies scale + rotation + translation to all bezier control points when edge endpoints move, preserving the curve shape exactly.

10. **Catmull-rom splines for waypoint edges.** `buildSplinePath()` converts catmull-rom (tension=1/3) to cubic bezier segments for SVG. Tension=1/3 produces longer handles and smoother curves than the default 1/6.

11. **"First-is-anchor" rule for align constraints.** `align A, B, h` moves B to match A's Y. The first node is the anchor; the second is moved. Waypoint align constraints must list the real node first.

## Task Status

| Task | Status |
|------|--------|
| BUG-1 — Restore curved arrows | ✅ Complete |
| BUG-2 — Default offset for DIR-of | ✅ Complete |
| BUG-3 — DIR-of cascade to descendants | ✅ Complete |
| 1 — Project Scaffold + Types | ✅ Complete |
| 2 — Constraint Parser | ✅ Complete |
| 3 — Constraint Serializer | ✅ Complete |
| 4 — Constraint Solver | ✅ Complete |
| 5 — Layout Engine Integration | ✅ Complete |
| 6 — Edge Router | ✅ Complete |
| 7 — State Manager | ⬜ Next |
| 8 — Constraint Inference Engine | ⬜ |
| 9 — Editor Overlay Basic Drag | ⬜ |
| 10 — Affordance Rendering | ⬜ |
| 11 — Shift+Drag Constraint Selection | ⬜ |
| 12 — Export + E2E Integration | ⬜ |
| 13 — User Documentation | ⬜ |
| 14 — Final Demo + Polish | ⬜ |

## Next Steps

Implement Task 7: State Manager (`src/state/StateManager.ts`).
- `StateManager` class with snapshot-based undo/redo
- `applyConstraint(c)`, `removeConstraint(id)`, `undo()`, `redo()`
- Pub/sub: `subscribe(listener)` → unsubscribe function
- Max undo depth: 50 (configurable)
- Redo stack clears on new mutation

## Active Risks

1. **Mermaid internal API instability:** `LayoutData` and SVG structure are semi-public. Pin peer dep version, add integration tests.

2. **SVG node identification:** Varies by diagram type and mermaid version. Build robust node-finder with fallback strategies.

3. **Solver convergence:** Adversarial constraints could loop. Iteration cap + warning in place.

# Current Epic

## Focus: Phase 1 Implementation

**Status:** Tasks 1–6 + all bugs complete. Ready for Task 7 (State Manager).

## Key Decisions Made


## Task Status

| Task | Status |
|------|--------|
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

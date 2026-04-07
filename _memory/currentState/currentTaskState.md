# Current Task State

## Current Task: Task 7 — State Manager

## Workflow State: READY TO START

## Yak-Shaving Stack: (empty)

## Scratchpad

### Tasks 1–6 + Bugs + debug/bezier features: all complete
142 tests passing. Branch: `claude/debug-bezier-handles-XJ1mm`.

### Completed out-of-backlog features (session 3)

**debug directive + bezier handle length control** — fully implemented, tested, demoed.

Files changed:
- `src/types.ts` — `BezierHandleConstraint`, `ConstraintSet.debug?`
- `src/parser/index.ts` — `debug` directive, `bezier` parser
- `src/serializer/index.ts` — serializes both; round-trip safe
- `src/layout/index.ts` — `HandleOverride`, `buildSplinePath` overrides, `buildHandleOverrides`, `filterBezierConstraintsForEdge`, `renderDebugOverlay`
- Tests: 20 new tests across parser, serializer, layout
- Demo: `demos/task-debug-bezier.md` (8 scenarios), `demos/scripts/capture-debug-bezier.mjs`
- Spec: `_memory/knowledgeBase/reference/ConstraintLanguageSpec.md` updated

### Task 7 spec (from theBacklog.md)

**File:** `src/state/StateManager.ts`

**Goal:** In-memory state management with undo/redo.

**Work:**
- `StateManager` class with snapshot-based undo/redo
- `applyConstraint(c)`, `removeConstraint(id)`, `undo()`, `redo()`
- Pub/sub: `subscribe(listener)` → unsubscribe function
- Max undo depth: 50 (configurable)
- Redo stack clears on new mutation

**Tests:**
- Add → undo → redo round-trip
- Undo depth limit
- Redo clears on mutation
- Subscribe fires on change
- Deep clone: returned state is independent

**Depends on:** Task 1 (types already exist)

### Demo scripts location
All capture scripts are in `demos/scripts/`.
Demo docs are in `demos/task-NN.md` or `demos/task-<name>.md`.
Screenshots are in `demos/task-NN/` or `demos/task-<name>/`.

## Action Log

- Session 1: implemented Tasks 1–5
- Session 2: fixed BUG-1 (2D similarity transform), BUG-2 (default 20px), BUG-3 (topo sort)
- Session 2: implemented Task 6 (waypoint edge router, catmull-rom splines, SPLINE_TENSION=1/3)
- Session 2: reorganized demos/ into subdirectories; moved .mjs scripts to demos/scripts/
- Session 2: expanded Task 6 demo to 8 scenarios; committed and pushed all
- Session 3: implemented debug overlay + bezier handle length; 20 new tests; demo + spec updated

# Current Task State

## Current Task: User-facing demo page + README (complete, awaiting review)

## Workflow State: AWAITING HUMAN REVIEW

## Session 5 (demo + README)

User asked for: (1) a user-facing demo page illustrating all functionality, (2) a
README explaining install/use.

Findings: memory claimed Task 7 next, but Tasks 7–12 (StateManager, inference,
EditorOverlay) are all still stubs. Only the layout engine works (parser,
serializer, solver, layout integration, edge routing, bezier, debug overlays).
README and demo therefore document only the working static/text-driven workflow
and mark the interactive editor as not-yet-implemented (roadmap).

Done:
- Rewrote `demo/main.ts` + `demo/index.html` into a preset gallery (8 presets:
  alignment+offsets, directional, anchor, group, waypoint, multi-waypoint elbow,
  bezier handle tuning, debug overlay) on top of the existing before/after live
  editor. Verified all 8 render via Playwright against `pnpm demo` (no console
  errors); screenshots inspected.
- Wrote `README.md`: status table, install, quick start, constraint block format,
  full constraint reference table, debug directives, demo instructions,
  programmatic API, development commands.
- `pnpm typecheck` clean; `pnpm test` 155 passing.

## Prior task (Session 4): Bezier Clamping + Debug All Edges

## Yak-Shaving Stack: (empty)

## Scratchpad

### All completed work (sessions 1–4)

**Tasks 1–6 + Bugs + debug/bezier features + bezier clamping**: all complete.  
155 tests passing. Branch: `claude/fix-bezier-curves-PBeOu`.

### Session 4 completed features

**Bezier endpoint clamping + `%% debug bezier`**

Problem: edges re-routed by `reanchorPath` (non-waypoint edges in `reRouteEdgesInSVG`) had:
1. Start/end tangents at wrong angles after similarity transform — handles didn't point toward opposite node
2. Unnecessary bulging curves on short/vertically-aligned edges

Fixes:
- `clampEndpointHandles(d, exitPt, adjustedEntry)` — exported, tested
  - Redirects first cp1 to exit along edge direction
  - Redirects last cp2 to arrive along same direction
  - Caps both at `edgeLen × 0.4` (MAX_HANDLE_FRACTION)
  - Applied in `reRouteEdgesInSVG` after every `reanchorPath`

- `%% debug bezier` directive (top-level mermaid comment OR inside constraint block)
  - Sets `ConstraintSet.debugBezier = true`
  - `renderDebugOverlay(…, debugAllEdges=true)` shows handles for ALL edges
  - Blue dashed lines + dots for control handles
  - Green anchor dots on dagre edges; orange on waypoint edges
  - Red squares at waypoints still shown as before

Files changed:
- `src/types.ts` — `ConstraintSet.debugBezier?`
- `src/parser/index.ts` — top-level + in-block `debug bezier` detection
- `src/layout/index.ts` — `clampEndpointHandles`, `appendPathHandles`, `appendAnchorDot`, extended `renderDebugOverlay`
- `src/parser/index.test.ts` — 5 new tests
- `src/layout/index.test.ts` — 8 new tests
- `demos/task-bezier-clamping.md` — demo doc

### Next up: Task 7 — State Manager (from theBacklog.md)

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
- Session 4: bezier endpoint clamping + %% debug bezier overlay for all edges; 13 new tests; 155 total

# The Backlog

Tasks are ordered for sequential implementation. Each task produces a working (if incomplete) system and ends with a **verification gate**: a Showboat demo document reviewed by a human before the next task begins.

---

## Task 1: Project Scaffold + Type Definitions

**Goal:** Buildable, testable project skeleton with all core types defined.

**Work:**
- Initialize npm project with TypeScript, Vite (library mode), Vitest
- Configure dual ESM/CJS output with two entry points (main, editor)
- Define all types in `src/types.ts` (see `reference/ConstraintLanguageSpec.md`)
- Create placeholder modules for all source directories
- Add mermaid as peer dependency
- Install showboat + rodney as dev dependencies
- Write a smoke test that imports the package and calls a no-op layout loader
- Create `CLAUDE.md` with project conventions, build/test/verify commands

**Acceptance:** `pnpm build` succeeds, `pnpm test` passes with smoke test.

**Verification:** `showboat init demos/task-01.md` → note describing scaffold → exec build + test → human review.

**Depends on:** Nothing

---

## Task 2: Constraint Parser

**Goal:** Parse `%% @layout-constraints` blocks into a `ConstraintSet`.

**Work:**
- Implement `parseConstraints(mermaidText: string): ConstraintSet`
- Handle all constraint types from the language spec (directional offsets, alignment, group, anchor, waypoint)
- Graceful degradation: missing block → empty set, malformed line → warn + skip
- Parse edge IDs: `A-->B`, `A---B`, `A-.->B`
- Generate stable constraint IDs (deterministic hash of type + params)

**Tests:**
- Empty input → empty ConstraintSet
- Single constraint of each type (all 9: north/south/east/west-of, align h/v, group, anchor, waypoint)
- Multiple constraints
- Malformed lines (skipped with warning)
- Waypoint creation and subsequent waypoint constraints
- Edge ID parsing for all arrow styles

**Verification:** Showboat doc showing parser output for various inputs (exec with JSON output).

**Depends on:** Task 1

---

## Task 3: Constraint Serializer

**Goal:** Serialize `ConstraintSet` back to comment block format; round-trip with parser.

**Work:**
- `serializeConstraints(cs: ConstraintSet): string`
- `injectConstraints(mermaidText: string, cs: ConstraintSet): string` — replace or append
- `stripConstraints(mermaidText: string): string` — remove block
- Output sorted by type then first node ID (deterministic, diffable)

**Tests:**
- Round-trip: `parse(serialize(cs)) === cs` for all types
- `injectConstraints(text, parse(text))` preserves block
- Deterministic: serialize same set twice → identical strings
- Empty set → no block
- Inject into text with/without existing block

**Verification:** Showboat doc showing round-trip examples and diff output.

**Depends on:** Task 2

---

## Task 4: Constraint Solver

**Goal:** Given initial node positions and a `ConstraintSet`, compute adjusted positions. Waypoints participate as shadow nodes.

**Work:**
- `solveConstraints(nodes: LayoutNode[], constraints: ConstraintSet): LayoutNode[]`
- `LayoutNode = { id, x, y, width, height, isWaypoint?: boolean }`
- Priority ordering: anchor > group > align > directional offset
- Iterative relaxation:
  1. Apply anchors (fixed, no iteration)
  2. Compute group bounding boxes, establish group centroids
  3. Apply alignments (move the node that displaced less from base)
  4. Apply directional offsets: `A south-of B, 120` → `A.y = B.y + 120`
  5. Solve waypoint constraints (same rules — they're just zero-size nodes)
  6. Check convergence (max delta < 0.5px), max 10 iterations
- Conflict resolution: higher priority wins; equal priority → average
- Groups: maintain relative positions within group, but move group as unit for alignment/offset of any member

**Tests:**
- Single `align A, B, h` → same Y
- Single `A south-of B, 120` → A.y = B.y + 120
- Anchor pins node, alignment adjusts the other
- Group of 3 aligns with external node
- Waypoint `wp1 west-of C, 20` → wp1.x = C.x - C.width/2 - 20
- Conflicting constraints: priority resolution
- No constraints → positions unchanged
- Performance: 50 nodes, 10 constraints < 10ms

**Verification:** Showboat doc with solver input/output tables and diagrams of before/after positions.

**Depends on:** Task 1

---

## Task 5: Layout Engine Integration

**Goal:** Register as a mermaid layout engine that wraps dagre with constraint solving.

**Work:**
- Implement layout function matching mermaid's signature
- Call dagre layout first
- Parse constraints from diagram text
- Create zero-size shadow nodes for waypoints at edge midpoints
- Run constraint solver on dagre output + waypoint nodes
- Write adjusted positions back to LayoutData
- Register as `constrained-dagre` via `LayoutLoaderDefinition[]`
- Handle subgraphs: solver operates on flattened node list, adjusts cluster bounds after

**Key challenge — accessing diagram text from within layout callback:**
- Investigate whether LayoutData or config carries raw text
- Fallback: module-scoped `Map<diagramId, ConstraintSet>` populated by a pre-render parse step
- Document whichever approach works in `designs/ConstraintSolver.md`

**Tests:**
- Integration: render flowchart with `layout: constrained-dagre` and one constraint → positions differ from default dagre
- Subgraph: constraint references node inside subgraph
- Waypoints: edge with waypoint routes through waypoint position
- No constraints → output matches default dagre

**Verification:** Showboat doc with Rodney screenshots of the same diagram rendered with dagre vs constrained-dagre. Side-by-side comparison. **Human must visually confirm the constraint was applied correctly.**

**Depends on:** Tasks 2, 3, 4

---

## Task 6: Edge Router

**Goal:** Route edges through resolved waypoint positions.

**Work:**
- After solver resolves waypoint positions, re-interpolate edge paths
- For edges with waypoints: source → wp1 → wp2 → ... → target
- Path segments: orthogonal routing (match mermaid's default style) or spline depending on diagram config
- Edges without waypoints: unchanged from base layout
- Handle edge labels (reposition to new midpoint)

**Tests:**
- Edge with one waypoint: path goes through waypoint position
- Edge with two waypoints: correct ordering
- Waypoint constrained `west-of C` → edge visually passes left of C
- No waypoints → edge unchanged
- Edge label repositioned correctly

**Verification:** Showboat doc with Rodney screenshots showing edge routing before/after waypoints.

**Depends on:** Tasks 4, 5

---

## Task 7: State Manager

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

**Verification:** Showboat doc executing state manager operations and logging state transitions.

**Depends on:** Task 1

---

## Task 8: Constraint Inference Engine

**Goal:** Given a dragged node position, compute ranked NESW constraint proposals.

**Work:**
- `inferConstraints(dragNode, allNodes, threshold): ProposedConstraint[]`
- `ProposedConstraint = { constraint, confidence: 0-1, affordanceHint }`
- Inference rules using NESW geometry:
  - **align h:** dragNode.centerY within threshold of another node's centerY → propose `align drag, other, h`
  - **align v:** same on X axis
  - **directional offset:** compute nearest neighbor in each cardinal direction; if distance is "round" (multiple of 20px) → higher confidence. Propose `drag south-of neighbor, distance`.
  - **group:** bounding box overlap or proximity → propose `group`
- Rank by confidence descending
- Default = highest confidence
- Compatible constraints on different axes can coexist

**Tests:**
- Exact alignment → confidence 1.0
- Near alignment → proportional confidence
- Proximity → group proposed
- Multiple proposals ranked correctly
- Nothing nearby → empty proposals

**Verification:** Showboat doc showing inference output for various drag scenarios (table format).

**Depends on:** Task 1

---

## Task 9: Editor Overlay — Basic Drag

**Goal:** Attach interactive overlay to mermaid SVG; drag nodes, trigger constraint flow.

**Work:**
- `EditorOverlay` class: accepts SVG element + mermaid text
- Identify draggable node `<g>` elements in mermaid's SVG output
- Pointer events: pointerdown/move/up on SVG
- Drag: update node transform live (in-place SVG manipulation)
- On drop: run inference → apply default constraint → trigger re-render
- Re-render: full `mermaid.render()` with updated constraint block → swap SVG
- "Edit Mode" toggle button (positioned over SVG container)
- Handle SVG coordinate transforms (viewBox, zoom)

**Tests:**
- Unit: pointer event → drag state transitions
- Unit: SVG coordinate transform math
- Integration: drag node, verify new constraint in state

**Verification:** Showboat doc with Rodney screenshots: (1) diagram in view mode, (2) edit mode enabled, (3) node being dragged, (4) node dropped with constraint applied. **Human reviews interactive behavior.**

**Depends on:** Tasks 5, 7, 8

---

## Task 10: Affordance Rendering

**Goal:** Display constraint affordances during drag.

**Work:**
- Render into dedicated SVG layer during drag:
  - **Snap lines:** dashed lines between aligned nodes, colored by axis (blue=h, green=v)
  - **Direction labels:** "south-of, 120px" badges on offset affordances
  - **Group halos:** translucent rect around group candidates
- Bold/highlight the default constraint; dim alternatives
- Only show top 5 proposals (avoid clutter)
- Remove all affordances on drop

**Verification:** Showboat doc with Rodney screenshots showing affordances during drag. **Human reviews visual clarity and labeling.**

**Depends on:** Tasks 8, 9

---

## Task 11: Shift+Drag Constraint Selection

**Goal:** Implement shift+drag for selecting non-default constraints.

**Work:**
- Shift held during drag:
  - Freeze non-dragged nodes
  - Show all proposals as distinct selectable targets
  - Each target: the affordance line/badge itself is a drop zone
  - Drag onto target → select that constraint
  - Multiple compatible constraints can be selected (shift-click)
  - Conflicting constraints (same axis): selecting one deselects the other
- Shift release: commit selected constraints, re-render
- Visual: selected constraints glow, unselected ghosted

**Verification:** Showboat doc with Rodney screenshots showing shift-select flow.

**Depends on:** Task 10

---

## Task 12: Export + End-to-End Integration

**Goal:** Export button, full workflow test, edge waypoint editing in editor.

**Work:**
- `EditorInstance.export()` → serialized mermaid text with constraints
- Export button in editor UI (copies to clipboard + returns string)
- Edge waypoint editing:
  - Click edge to select
  - Click+drag edge midpoint → create waypoint (shadow node)
  - Waypoints are draggable with same affordance system as nodes
  - Delete waypoint: drag off-edge or press Delete
- Full E2E test:
  1. Render flowchart with `constrained-dagre`
  2. Enable editor
  3. Drag node A south of node C
  4. Export
  5. Verify text contains `%% A south-of C, ...`
  6. Re-render exported text → positions match
- `destroy()` properly cleans up event listeners + DOM

**Verification:** Showboat doc demonstrating the full export round-trip with screenshots at each step.

**Depends on:** Tasks 3, 9, 10, 11

---

## Task 13: User Documentation

**Goal:** Complete user-facing docs in `docs/`.

**Work:**
- `docs/guide/installation.md` — npm install, CDN, registration
- `docs/guide/getting-started.md` — first diagram with constraints (5-minute tutorial)
- `docs/guide/editor-usage.md` — edit mode, drag, shift-select, export
- `docs/guide/hand-editing.md` — writing constraints by hand
- `docs/reference/constraint-language.md` — full syntax, every constraint type with examples
- `docs/examples/` — flowchart, class diagram, state diagram with constraints
- `README.md` — overview, quick start, links to full docs

**Verification:** Showboat doc linking to rendered docs pages with Rodney screenshots.

**Depends on:** Task 12

---

## Task 14: Final Demo + Polish

**Goal:** Comprehensive Showboat demo showing the whole product; polish rough edges.

**Work:**
- Build a single comprehensive Showboat demo that walks through:
  1. Installing the package
  2. Rendering a complex flowchart (10+ nodes)
  3. Enabling the editor
  4. Making 4-5 constraint edits (alignment, directional offset, group, edge waypoint)
  5. Exporting
  6. Re-rendering the exported text
  7. Verifying the same text works in stock mermaid (without constraints applied)
- Fix any issues found during the demo
- Performance profiling on a 50-node diagram

**Verification:** The demo document IS the deliverable. Human reviews for product quality.

**Depends on:** Tasks 12, 13

---

## Open Questions

### OQ-1: Accessing diagram text from within the layout engine
Layout callback gets `LayoutData` + config but may not have raw text. Need to spike on this during Task 5. Likely solution: module-scoped side-channel.

### OQ-2: Constraint compatibility matrix
Formalize which constraints can coexist. Draft:
- ✅ `align h` + `align v` (different axes)
- ✅ `align h` + `east-of` (different dimensions — one constrains Y, other constrains X)
- ❌ `align h(A,B)` + `A south-of B` (both constrain Y — directional offset wins)
- ✅ `group` + `align` (group moves as unit, then aligns)
- ❌ `anchor` + anything on anchored axis (anchor wins)
- ✅ Multiple groups (node can be in nested groups)
- ✅ Waypoint constraints follow same rules as node constraints

Resolve before Task 4.

### OQ-3: ELK variant
Same solver wrapping ELK. Deferred to Phase 2. ELK is async (WASM) and produces different base positions — need to verify solver convergence.

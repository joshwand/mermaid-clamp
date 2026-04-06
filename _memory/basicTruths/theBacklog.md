# The Backlog

Tasks are ordered for sequential implementation. Each task produces a working (if incomplete) system and ends with a **verification gate**: a Showboat demo document reviewed by a human before the next task begins.

---

## ✅ Completed

- **BUG-1** — Curved arrows restored via 2D similarity transform in `reanchorPath()` (src/layout/index.ts)
- **BUG-2** — Default offset of 20px applied when no distance specified
- **BUG-3** — Topological sort ensures constraint cascade to descendants
- **Task 1** — Project scaffold + types
- **Task 2** — Constraint parser
- **Task 3** — Constraint serializer
- **Task 4** — Constraint solver
- **Task 5** — Layout engine integration (constrained-dagre)
- **Task 6** — Edge router (catmull-rom waypoint splines)

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

### OQ-1: Accessing diagram text ✅ Resolved (Task 5)
Used a module-scoped side-channel: diagram text is passed into `constrainedDagreAlgorithm.render()` via the `LayoutData` extra field.

### OQ-2: Constraint compatibility matrix ✅ Resolved (Task 4)
Implemented priority ordering: `anchor` > directional > align. Same-axis conflicts: last-write wins within each priority tier.

### OQ-3: ELK variant
Deferred to Phase 2. ELK is async (WASM) and produces different base positions — need to verify solver convergence.

# Requirements: Interactive Editor

## User Stories

### US-2.1: Enter edit mode
**As** a user viewing a mermaid diagram,
**I want** to toggle an edit mode on the rendered diagram,
**So that** I can start adjusting the layout interactively.

**Acceptance criteria:**
- "Edit Layout" button appears on the diagram container
- Clicking it enables edit mode (visual indicator: border/badge)
- Clicking again (or pressing Escape) exits edit mode
- Programmatic API: `enableEditor(svgElement, text, opts)` returns `EditorInstance`

### US-2.2: Drag nodes
**As** a user in edit mode,
**I want** to drag nodes to new positions,
**So that** I can adjust the layout visually.

**Acceptance criteria:**
- Pointer down on a node initiates drag
- Node follows cursor at 60fps (in-place SVG transform)
- On drop, layout re-renders with the applied constraint
- Nodes inside subgraphs are draggable

### US-2.3: Constraint affordances
**As** a user dragging a node,
**I want** to see visual indicators of available constraints,
**So that** I understand what layout relationships the system can capture.

**Acceptance criteria:**
- Snap lines appear when near alignment with another node
- Direction badges show offset distance and compass direction
- Group halos appear when near another node
- The highest-confidence constraint is bold; alternatives are dimmed
- Top 5 proposals shown (no visual clutter)

### US-2.4: Shift+drag constraint selection
**As** a user who wants a non-default constraint,
**I want** to hold shift while dragging to see and select alternative constraints,
**So that** I can pick the exact constraint I want.

**Acceptance criteria:**
- Shift held: all proposals shown as selectable targets
- Drag onto a target to select it
- Multiple compatible constraints selectable (different axes)
- Conflicting selections: newer wins, older deselected
- Shift release commits selections

### US-2.5: Undo/redo
**As** a user editing constraints,
**I want** to undo and redo my changes,
**So that** I can experiment without fear of losing a good state.

**Acceptance criteria:**
- Ctrl/Cmd+Z undoes last constraint change
- Ctrl/Cmd+Shift+Z redoes
- Up to 50 undo states
- Redo stack clears on new change

### US-2.6: Edge waypoint creation
**As** a user,
**I want** to create waypoints on edges by dragging,
**So that** I can control edge routing interactively.

**Acceptance criteria:**
- Click an edge to select it
- Waypoint handles appear at segment midpoints
- Drag a handle to create a waypoint (shadow node)
- Waypoint is draggable with same affordance system as nodes
- Delete waypoint: drag off-edge or press Delete

### US-2.7: Export
**As** a user who has finished editing,
**I want** to export the diagram as mermaid text with constraints,
**So that** I can save, version, and share my improved layout.

**Acceptance criteria:**
- "Export" button copies mermaid text to clipboard
- Exported text includes constraint block
- Re-rendering exported text produces the same layout
- Stock mermaid ignores the constraint block gracefully
- `EditorInstance.export()` returns the text programmatically

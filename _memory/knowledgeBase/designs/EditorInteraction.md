# Design: Editor Interaction

## Interaction Model

The editor has two modes: **view** (default, diagram is static) and **edit** (nodes are draggable, constraints are proposed). An "Edit Layout" button toggles between modes.

## Drag Behavior

### Normal Drag (no modifier keys)

1. **Pointerdown** on a node `<g>` element:
   - Enter drag state
   - Record start position
   - Capture pointer

2. **Pointermove** (while dragging):
   - Update node's SVG `transform` in-place (60fps feedback)
   - Run constraint inference against all other nodes
   - Render affordances (snap lines, direction labels, group halos)
   - Highlight the default (highest-confidence) constraint in bold

3. **Pointerup**:
   - Apply the default constraint to the state manager
   - Clear affordances
   - Trigger full re-render via `mermaid.render()` with updated constraints
   - Push undo state

### Shift+Drag (constraint selection)

When Shift is held during any phase of the drag:

1. **Shift+pointerdown** or **Shift pressed during drag**:
   - Freeze all non-dragged nodes visually (disable re-layout during selection)
   - Show ALL proposed constraints as distinct, labeled affordance targets
   - Each affordance target is a selectable zone (the snap line or badge itself)

2. **Shift+pointermove**:
   - As user moves the dragged node, highlight the affordance target nearest to the cursor
   - If the cursor is within the activation zone of a target, show it as "selected" (glow effect)
   - Multiple targets on different axes can be selected simultaneously

3. **Shift+pointerup** or **Shift released**:
   - Commit all selected constraints to state manager
   - Clear affordances
   - Trigger full re-render
   - Push undo state

### Conflict during shift-select

If the user selects two constraints that conflict (both constrain the same axis):
- The most recently selected one wins
- The previously selected one is visually deselected
- A brief tooltip appears: "Replaced: [previous constraint]"

## Affordance Visual Design

### Snap Lines (alignment)
- Dashed line connecting centers of aligned nodes
- Blue for horizontal alignment (`align h` — same Y)
- Green for vertical alignment (`align v` — same X)
- Default constraint: bold (3px), full opacity
- Alternatives: thin (1px), 40% opacity

### Direction Badges (offsets)
- Small rounded-rect label at midpoint between nodes
- Text: `"↓ south-of, 120px"` / `"→ east-of, 80px"` / etc.
- Arrow character indicates direction
- Default: solid background, full opacity
- Alternatives: outlined, 40% opacity

### Group Halos
- Translucent rectangle enclosing candidate group members
- Dashed border, subtle fill (10% opacity)
- Only shown when drag node is within GROUP_PROXIMITY of another node

### Waypoint Handles
- Small circles (8px diameter) on selected edges
- Appear at midpoints when an edge is clicked
- Draggable — same constraint inference and affordance system as nodes
- Delete: drag off-edge (beyond 50px from nearest edge segment) or press Delete key

## Keyboard Shortcuts (Edit Mode)

| Key | Action |
|-----|--------|
| Shift (held) | Enter constraint selection mode during drag |
| Ctrl/Cmd+Z | Undo |
| Ctrl/Cmd+Shift+Z | Redo |
| Delete/Backspace | Remove selected waypoint |
| Escape | Cancel current drag / exit edit mode |
| Ctrl/Cmd+E | Toggle edit mode |

## Edge Interaction

### Selecting an edge
- Click on an edge path → edge becomes "selected" (highlighted, thicker stroke)
- Selected edge shows waypoint handles at midpoints of each segment
- Click elsewhere → deselect

### Creating a waypoint
- With an edge selected, click+drag on a segment midpoint handle
- A new waypoint (shadow node) is created at the drag start position
- As user drags, the waypoint follows the cursor with constraint inference (same as node drag)
- On drop, waypoint constraint is committed and edge is re-routed

### Ordering waypoints
- Multiple waypoints on one edge are ordered by their position along the edge direction
- Visual: numbered badges (1, 2, 3...) appear on each waypoint when the edge is selected

## Re-render Strategy

### During drag: In-place SVG transforms
- Direct `transform` attribute manipulation on the node's `<g>` element
- No mermaid re-render — fast, no flicker
- Edges are not updated during drag (they lag behind — acceptable for drag preview)
- Affordances are rendered as SVG elements in an overlay `<g>` above the diagram

### On constraint commit: Full re-render
- Serialize current constraint state to text
- Call `mermaid.render()` with the updated diagram text
- Replace the SVG element in the DOM
- Re-attach editor overlay to the new SVG
- Maintain scroll position and zoom level

This hybrid approach trades edge accuracy during drag for 60fps node movement, then corrects everything on commit.

## Node Identification in SVG

Mermaid renders nodes as `<g>` elements with class names and IDs. The exact format varies by diagram type and mermaid version:

- Flowchart: `<g class="node" id="flowchart-A-123">`
- Class diagram: `<g class="classGroup" id="classId-ClassName-456">`
- State diagram: `<g class="state-group" id="state-StateName-789">`

The editor maintains a **node finder** that attempts multiple identification strategies:
1. Parse `id` attribute, extract node ID by prefix stripping
2. Look for `data-id` attributes (some mermaid versions add these)
3. Fall back to matching label text content

If identification fails for a node, it's not draggable (graceful degradation).

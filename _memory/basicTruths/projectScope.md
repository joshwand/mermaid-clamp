# Project Scope

## Core Requirements

1. A constraint layout engine that registers with mermaid via `registerLayoutLoaders()` — not a fork
2. An interactive editor overlay that attaches to rendered mermaid SVGs
3. A human-readable constraint serialization format embedded in mermaid text that doesn't break existing renderers
4. User documentation (installation, usage guide, constraint reference, examples)

## In Scope (Phase 1)

### Diagram Types
- Flowchart / graph
- Class diagram
- State diagram

These all use mermaid's unified v3 renderer and consume the standard `LayoutData` interface, making them amenable to a single layout engine replacement.

### Constraint System
- **Directional node constraints:** alignment and offset with NESW directionality
- **Grouping constraints:** logical grouping of nodes (cluster without visual border)
- **Anchor constraints:** pin a node to absolute coordinates
- **Edge constraints:** waypoints and directional routing relative to nodes
- **Waypoints as shadow nodes:** waypoints participate in the constraint system (can be aligned, offset, grouped) but cannot accept connections

### Interactive Editor
- Edit mode toggle (programmatic + UI button)
- Drag nodes with live constraint inference and affordance display
- Shift+drag for constraint selection mode
- Undo/redo stack (in-memory)
- Export to mermaid text with constraint annotations

### Output Modes
- JS interactive (editor + renderer)
- JS static (renderer only, reads constraints from text)
- SVG export (static render, constraints applied)

### Documentation
- Installation and quick-start guide
- Constraint language reference
- Interactive examples
- API reference for programmatic use

### Verification
- Showboat demo documents at each implementation milestone
- Rodney browser screenshots of rendered diagrams with/without constraints
- Human review gate before advancing to next task

## Out of Scope (Phase 1)

- Sequence diagrams (timeline-based layout, not graph-based)
- Gantt, pie, mindmap, etc. (non-graph types)
- Collaborative editing / multiplayer
- Undo persistence across sessions
- Visual theming / CSS customization (use mermaid's existing theme system)
- Mobile touch interaction (desktop pointer events only)
- ELK variant (deferred to Phase 2, same solver wrapping ELK instead of dagre)

## Success Criteria

1. A user can take any flowchart/class/state diagram, enable edit mode, drag 3-4 nodes into better positions, and export text that re-renders identically
2. The exported text renders correctly (with layout improvements) in a constraints-aware renderer
3. The exported text renders correctly (ignoring constraints, using default layout) in stock mermaid
4. The constraint format is readable enough that a user could hand-edit it
5. A Showboat demo document demonstrates the full workflow end-to-end with screenshots

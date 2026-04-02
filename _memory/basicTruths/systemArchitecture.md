# System Architecture

## Integration Strategy

**Not a fork.** The extension uses mermaid's public plugin API:

```js
mermaid.registerLayoutLoaders(constraintLayouts);
```

This registers a new layout algorithm (`layout: constrained-dagre`) that wraps the base algorithm and layers constraint solving on top. We don't replace the layout engine — we post-process its output.

## Component Architecture

```
┌────────────────────────────────────────────────────────┐
│                 Consumer Application                    │
│                                                         │
│  import mermaid from 'mermaid';                         │
│  import constraintLayouts from                          │
│    'mermaid-layout-constraints';                        │
│  mermaid.registerLayoutLoaders(constraintLayouts);      │
│                                                         │
│  // Optional:                                           │
│  import { enableEditor } from                           │
│    'mermaid-layout-constraints/editor';                 │
│  enableEditor(svgElement, opts);                        │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌────────────────────────────────────────────────────────┐
│        mermaid-layout-constraints (npm)                 │
│                                                         │
│  ┌───────────────┐     ┌───────────────┐               │
│  │   Constraint   │     │  Constraint   │               │
│  │   Parser       │◄───►│  Serializer   │               │
│  │  text → model  │     │  model → text │               │
│  └───────┬───────┘     └───────────────┘               │
│          │                                              │
│          ▼                                              │
│  ┌───────────────────────────────┐                      │
│  │  Constraint Layout Engine      │                     │
│  │  (wraps dagre)                 │                     │
│  │                                │                     │
│  │  1. Run base layout (dagre)    │                     │
│  │  2. Inject shadow nodes for    │                     │
│  │     waypoints                  │                     │
│  │  3. Constraint solver pass     │                     │
│  │  4. Edge re-routing through    │                     │
│  │     resolved waypoint positions│                     │
│  └───────┬───────────────────────┘                      │
│          │                                              │
│  ┌───────┴──────┐    ┌───────────────┐                  │
│  │  Editor       │    │  State        │                  │
│  │  Overlay      │◄──►│  Manager      │                  │
│  │  (optional)   │    │               │                  │
│  │               │    │  constraints  │                  │
│  │  drag, snap,  │    │  undo stack   │                  │
│  │  affordances  │    │  selection    │                  │
│  └──────────────┘    └───────────────┘                  │
└────────────────────────────────────────────────────────┘
```

## Core Design Concept: Directional Constraints

All spatial constraints are **directional** using compass bearings (N, S, E, W). This maps naturally to how humans think about layout ("put A below B", "route this edge left of C").

### Node Constraints

| Constraint | Meaning | Axis |
|-----------|---------|------|
| `A south-of B, 120` | A is 120px below B | Y |
| `A north-of B, 80` | A is 80px above B | Y |
| `A east-of B, 100` | A is 100px right of B | X |
| `A west-of B, 100` | A is 100px left of B | X |
| `align A, B, h` | A and B share the same Y (horizontal alignment) | Y |
| `align A, B, v` | A and B share the same X (vertical alignment) | X |
| `group A, B, C as name` | Treat nodes as a layout unit | both |
| `anchor A, 200, 300` | Pin A to absolute coords | both |

Directional offsets are measured center-to-center. `A south-of B, 120` means `A.centerY = B.centerY + 120`.

### Waypoints as Shadow Nodes

This is the key edge constraint insight. A **waypoint** is a zero-size node that:
- Lives on a specific edge
- Participates in the full constraint system (can be aligned, offset, grouped, anchored)
- Cannot accept connections (it's not a real node)
- Causes the parent edge to route through its resolved position

```
waypoint A-->B as wp1
wp1 west-of C           # route passes west of C
wp1 align D, h          # at the same vertical level as D
```

This means we don't need separate edge constraint types for routing — **all routing is expressed as positional constraints on waypoints**. The edge router just connects the edge's source → waypoint(s) → target in order.

Multiple waypoints on one edge are ordered by their sequence in the constraint block:

```
waypoint A-->B as wp1
waypoint A-->B as wp2
wp1 west-of C, 20       # first, route west of C
wp2 south-of D, 10      # then, route south of D
```

### Constraint Priority (descending)

1. `anchor` — absolute position pins, highest priority
2. `group` — membership grouping (affects bounding box calculations)
3. `align` — alignment (adjusts one axis per pair)
4. Directional offsets (`north-of`, `south-of`, `east-of`, `west-of`)
5. Waypoint constraints — applied after all real node positions are final, but waypoints solve using the same algorithm

## Component Detail

### 1. Constraint Parser (`src/parser/`)

Reads mermaid text, finds the `%% @layout-constraints` comment block, parses each constraint line into the model.

**Input:** raw mermaid text string
**Output:** `ConstraintSet` model object

Must handle: missing block → empty set, malformed lines → warn + skip, forward references to node IDs, edge ID parsing for all mermaid arrow styles.

### 2. Constraint Serializer (`src/serializer/`)

Converts `ConstraintSet` back to text. Deterministic output (sorted by type, then alphabetically by first node ID). Provides `injectConstraints()` to replace/append a block in mermaid text, and `stripConstraints()` to remove it.

### 3. Constraint Layout Engine (`src/layout/`)

Implements `LayoutLoaderDefinition` for `mermaid.registerLayoutLoaders()`.

**Algorithm:**
1. Receive `LayoutData` from mermaid's rendering pipeline
2. Run base layout (dagre) for initial positions
3. Parse constraints from diagram text
4. Create shadow nodes for all waypoints (zero-size, positioned at edge midpoint initially)
5. **Constraint solver pass** (iterative relaxation, see `designs/ConstraintSolver.md`):
   - Apply anchors
   - Compute group bounding boxes
   - Apply alignments
   - Apply directional offsets
   - Solve waypoint constraints (same solver, they're just nodes)
   - Check convergence (max delta < 0.5px, max 10 iterations)
6. **Edge re-routing:** For edges with waypoints, re-interpolate path through source → wp1 → wp2 → ... → target
7. Return modified `LayoutData`

### 4. Editor Overlay (`src/editor/`)

Interactive layer on a rendered mermaid SVG.

**Drag interaction:**
- On drag, compute proposed constraints relative to all other nodes using NESW geometry
- Display affordances (snap lines with direction labels, offset badges)
- Bold the highest-confidence proposal; dim alternatives
- On drop, apply the bolded constraint (or shift-selected one)

**Shift+drag mode:**
- Freeze non-dragged nodes
- Show all viable constraints as selectable affordance targets
- User drags onto a target to select it
- Multiple compatible constraints can be selected (different axes or complementary)
- Releasing shift commits selections

**Re-render strategy:**
- In-place SVG transforms during drag (60fps feedback)
- Full `mermaid.render()` on constraint commit (correctness guarantee)

### 5. State Manager (`src/state/`)

Snapshot-based undo/redo on the full `ConstraintSet`. Max depth 50. Pub/sub for UI updates.

## Data Flow

### Static render path:
```
mermaid text
  → mermaid parser → LayoutData
  → constraint parser extracts ConstraintSet
  → base layout (dagre) → initial positions
  → create shadow nodes for waypoints
  → constraint solver → adjusted positions
  → edge re-routing through waypoints
  → SVG render
```

### Interactive edit path:
```
User drags node
  → Editor computes NESW-based proposed constraints
  → User accepts constraint (drop / shift-select)
  → State Manager updates ConstraintSet, pushes undo
  → Layout engine re-runs with new ConstraintSet
  → SVG re-renders
  → User clicks Export
  → Serializer produces mermaid text with constraint block
```

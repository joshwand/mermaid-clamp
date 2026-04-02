# Requirements: Constraint Engine

## User Stories

### US-1.1: Static rendering with constraints
**As** a developer writing mermaid diagrams,
**I want** to add layout constraint annotations to my diagram text,
**So that** the diagram renders with the layout adjustments I specified.

**Acceptance criteria:**
- Diagram with `layout: constrained-dagre` in config renders using the constraint-aware engine
- Constraints in `%% @layout-constraints` block are parsed and applied
- Node positions differ from default dagre layout where constraints dictate
- Diagram without constraints renders identically to default dagre

### US-1.2: Backward compatibility
**As** a developer using stock mermaid (without this extension),
**I want** to render a diagram that contains constraint annotations,
**So that** it renders normally, ignoring the constraints.

**Acceptance criteria:**
- Constraint comment block is invisible to stock mermaid
- No parse errors, no visual artifacts
- Diagram renders using default layout

### US-1.3: Directional constraints
**As** a developer,
**I want** to express spatial relationships using compass directions (north/south/east/west),
**So that** the constraint language matches how I think about layout.

**Acceptance criteria:**
- `A south-of B, 120` places A 120px below B (center-to-center)
- `A east-of B, 80` places A 80px right of B
- Constraints work in all four directions
- Distance is required (no "somewhere south of")

### US-1.4: Alignment constraints
**As** a developer,
**I want** to align two or more nodes horizontally or vertically,
**So that** related nodes appear on the same visual line.

**Acceptance criteria:**
- `align A, B, h` → A and B share the same Y coordinate
- `align A, B, v` → A and B share the same X coordinate
- Multi-node alignment: `align A, B, C, h` → all share same Y
- Which node moves depends on displacement from base layout position

### US-1.5: Grouping
**As** a developer,
**I want** to group nodes so they move together,
**So that** I can treat related nodes as a visual unit.

**Acceptance criteria:**
- `group A, B, C as name` creates a logical group
- When any member is targeted by an external constraint, the whole group moves
- Relative positions within the group are maintained
- No visual border (unlike mermaid subgraphs)

### US-1.6: Waypoints for edge routing
**As** a developer,
**I want** to add waypoints to edges and constrain their positions,
**So that** I can control edge routing (e.g., "this edge passes west of that node").

**Acceptance criteria:**
- `waypoint A-->B as wp1` creates a shadow node on the edge
- `wp1 west-of C, 20` positions the waypoint (and thus the edge) 20px left of C
- Multiple waypoints on one edge are ordered by declaration
- Edge routes through waypoints in order
- Waypoints accept all node constraint types (align, directional, anchor, group)

### US-1.7: Constraint priority and conflicts
**As** a developer,
**I want** the system to resolve conflicting constraints predictably,
**So that** I get sensible output even when my constraints are imperfect.

**Acceptance criteria:**
- Priority order: anchor > group > align > directional offset
- Higher priority wins on conflict
- Equal priority → average
- Non-convergence: capped at 10 iterations, warning logged

/**
 * Core type definitions for mermaid-layout-constraints.
 * All constraint types correspond directly to the Constraint Language Spec v1.
 */

// ── Primitive types ──────────────────────────────────────────────────────────

/** Cardinal direction used in directional offset constraints. */
export type Direction = 'north-of' | 'south-of' | 'east-of' | 'west-of';

/** Axis for alignment constraints. h = horizontal (same Y), v = vertical (same X). */
export type Axis = 'h' | 'v';

/** Mermaid arrow style tokens used in edge IDs. */
export type ArrowStyle = '-->' | '---' | '==>' | '-.->' | '--';

// ── Constraint types ─────────────────────────────────────────────────────────

/**
 * `A south-of B, 120` — places A at a fixed distance in a cardinal direction from B.
 * The first node (nodeA) is the one that moves; nodeB is the reference.
 * Distance is center-to-center in pixels.
 */
export interface DirectionalConstraint {
  type: 'directional';
  /** Stable deterministic ID derived from type + params. */
  id: string;
  /** The node that moves. */
  nodeA: string;
  direction: Direction;
  /** The reference node (does not move). */
  nodeB: string;
  /** Edge-to-edge distance in pixels (0 = touching). */
  distance: number;
}

/**
 * `align A, B, h` — aligns two or more nodes on an axis.
 * h = same Y (horizontal alignment), v = same X (vertical alignment).
 */
export interface AlignConstraint {
  type: 'align';
  id: string;
  /** At least 2 node IDs. */
  nodes: string[];
  axis: Axis;
}

/**
 * `group A, B, C as processing` — treats nodes as a layout unit.
 * Group members maintain relative positions; the whole group moves as a unit
 * when any member is referenced by an external constraint.
 */
export interface GroupConstraint {
  type: 'group';
  id: string;
  nodes: string[];
  /** Human-readable group name. Must be unique within the diagram. */
  name: string;
}

/**
 * `anchor A, 200, 300` — pins a node to absolute coordinates.
 * Highest priority; overrides all other constraints on the anchored axes.
 */
export interface AnchorConstraint {
  type: 'anchor';
  id: string;
  node: string;
  /** Absolute X coordinate of node center. */
  x: number;
  /** Absolute Y coordinate of node center. */
  y: number;
}

/**
 * `waypoint A-->B as wp1` — creates a zero-size shadow node on an edge.
 * The waypoint ID becomes a valid node ID for subsequent constraints.
 * The parent edge re-routes: source → wp1 → ... → target.
 */
export interface WaypointDeclaration {
  type: 'waypoint';
  id: string;
  /** Edge this waypoint lives on, e.g. "A-->B". */
  edgeId: string;
  /** The ID to use when referencing this waypoint in other constraints. */
  waypointId: string;
}

/**
 * `bezier wp1, 60` or `bezier wp1, 60, 80` — overrides the bezier handle lengths
 * at a waypoint or at the real-node end of a boundary edge segment.
 *
 * Two forms:
 *
 *   bezier <waypointId>, <incomingLength> [, <outgoingLength>]
 *     Controls the handles on both sides of a waypoint.
 *     incomingLength = cp2 length for the segment ending at the waypoint.
 *     outgoingLength = cp1 length for the segment starting at the waypoint.
 *
 *   bezier <edgeSegId>, <length>
 *     edgeSegId is a segment like "A-->wp1" (source is a real node) or
 *     "wp1-->B" (target is a real node).
 *     For "A-->wp1": sets the outgoing handle length at A (cp1 of that segment).
 *     For "wp1-->B": sets the incoming handle length at B (cp2 of that segment).
 *
 * Handle direction is always derived from the catmull-rom tangent of surrounding
 * points; only the length is overridden.
 */
export interface BezierHandleConstraint {
  type: 'bezier';
  id: string;
  /**
   * Waypoint ID (node form) or edge segment like "A-->wp1" or "wp1-->B"
   * (segment form, distinguished by the presence of an arrow token).
   */
  targetId: string;
  /**
   * Waypoint form: incoming handle length (handle arriving at the waypoint).
   * Segment form: the single handle length (applied to the real-node end).
   */
  incomingLength: number;
  /** Waypoint form only: outgoing handle length (handle leaving the waypoint). */
  outgoingLength?: number;
}

/** Union of all constraint variants. */
export type Constraint =
  | DirectionalConstraint
  | AlignConstraint
  | GroupConstraint
  | AnchorConstraint
  | WaypointDeclaration
  | BezierHandleConstraint;

// ── Aggregate model ───────────────────────────────────────────────────────────

/** The full set of constraints parsed from (or to be serialized into) a diagram. */
export interface ConstraintSet {
  version: 1;
  constraints: Constraint[];
  /** Human-readable warning messages for malformed or skipped lines. */
  warnings?: string[];
  /**
   * When true, the layout engine renders a debug overlay on top of the diagram:
   * - Each waypoint is marked with a small red square.
   * - The bezier control handles for each waypoint edge are drawn in blue.
   * Activated by a `%% debug` line inside the constraint block.
   */
  debug?: boolean;
  /**
   * When true, the layout engine renders bezier control handles for ALL edges
   * (both constraint-routed and dagre-generated), and marks all anchor points.
   * Activated by a `%% debug bezier` line anywhere in the mermaid source.
   */
  debugBezier?: boolean;
}

// ── Layout types ─────────────────────────────────────────────────────────────

/**
 * A node as seen by the constraint solver.
 * Positions are the center of the node bounding box.
 */
export interface LayoutNode {
  id: string;
  /** Center X. */
  x: number;
  /** Center Y. */
  y: number;
  width: number;
  height: number;
  /** True for waypoint shadow nodes (zero size, cannot be connection endpoints). */
  isWaypoint?: boolean;
}

// ── Layout loader types (mermaid plugin API) ──────────────────────────────────

/**
 * Matches mermaid's LayoutAlgorithm interface.
 * All parameters are typed as unknown at this boundary; the implementation
 * casts to mermaid-internal types as needed.
 * (Comment: mermaid internal)
 */
export interface LayoutAlgorithm {
  render(
    layoutData: unknown,
    svg: unknown,
    helpers: unknown,
    options?: unknown,
  ): Promise<void>;
}

/**
 * Convenience alias kept for backward compatibility with the stub.
 * @deprecated Use LayoutAlgorithm instead.
 */
export type LayoutFunction = LayoutAlgorithm;

/** Registration entry for mermaid.registerLayoutLoaders(). */
export interface LayoutLoaderDefinition {
  name: string;
  loader: () => Promise<LayoutAlgorithm>;
  algorithm?: string;
}

// ── Editor / inference types ──────────────────────────────────────────────────

/**
 * A constraint candidate proposed by the inference engine during a drag operation.
 */
export interface ProposedConstraint {
  constraint: Constraint;
  /** Confidence score 0–1. Higher = better match. */
  confidence: number;
  /** Short human-readable label for the affordance UI, e.g. "south-of B, 120px". */
  affordanceHint: string;
}

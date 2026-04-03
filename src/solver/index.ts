import type { ConstraintSet, LayoutNode } from '../types.js';

/**
 * Apply constraints to an initial set of node positions using iterative relaxation.
 * Returns a new array of nodes with adjusted positions; input is not mutated.
 *
 * Priority order: anchor > group > align > directional offset.
 * Waypoints participate as zero-size nodes.
 *
 * Implemented in Task 4.
 */
export function solveConstraints(nodes: LayoutNode[], _constraints: ConstraintSet): LayoutNode[] {
  return nodes.map((n) => ({ ...n }));
}

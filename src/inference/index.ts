import type { LayoutNode, ProposedConstraint } from '../types.js';

const DEFAULT_THRESHOLD = 10;

/**
 * Given a dragged node's new position and all sibling nodes,
 * compute ranked NESW-based constraint proposals.
 *
 * Returns proposals sorted by confidence descending.
 * Returns an empty array when no viable proposals exist.
 *
 * Implemented in Task 8.
 */
export function inferConstraints(
  _dragNode: LayoutNode,
  _allNodes: LayoutNode[],
  _threshold = DEFAULT_THRESHOLD,
): ProposedConstraint[] {
  return [];
}

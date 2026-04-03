import type { ConstraintSet } from '../types.js';

/**
 * Parse the `%% @layout-constraints v1` block from mermaid diagram text.
 * Returns an empty ConstraintSet if no block is present.
 *
 * Implemented in Task 2.
 */
export function parseConstraints(_mermaidText: string): ConstraintSet {
  return { version: 1, constraints: [] };
}

import type { ConstraintSet } from '../types.js';

/**
 * Serialize a ConstraintSet to a `%% @layout-constraints v1` block string.
 * Output is deterministic: sorted by type, then first node ID.
 *
 * Implemented in Task 3.
 */
export function serializeConstraints(_cs: ConstraintSet): string {
  return '';
}

/**
 * Replace or append a constraint block in mermaid diagram text.
 *
 * Implemented in Task 3.
 */
export function injectConstraints(mermaidText: string, _cs: ConstraintSet): string {
  return mermaidText;
}

/**
 * Remove the constraint block from mermaid diagram text.
 *
 * Implemented in Task 3.
 */
export function stripConstraints(mermaidText: string): string {
  return mermaidText;
}

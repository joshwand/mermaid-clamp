import type { Constraint, ConstraintSet } from '../types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCK_START = '%% @layout-constraints v1';
const BLOCK_END = '%% @end-layout-constraints';
const LINE_PREFIX = '%% ';

// ── Constraint → line string ──────────────────────────────────────────────────

function serializeOne(c: Constraint): string {
  switch (c.type) {
    case 'directional':
      return `${c.nodeA} ${c.direction} ${c.nodeB}, ${c.distance}`;
    case 'align':
      return `align ${c.nodes.join(', ')}, ${c.axis}`;
    case 'group':
      return `group ${c.nodes.join(', ')} as ${c.name}`;
    case 'anchor':
      return `anchor ${c.node}, ${c.x}, ${c.y}`;
    case 'waypoint':
      return `waypoint ${c.edgeId} as ${c.waypointId}`;
    case 'bezier':
      if (c.outgoingLength !== undefined) {
        return `bezier ${c.targetId}, ${c.incomingLength}, ${c.outgoingLength}`;
      }
      return `bezier ${c.targetId}, ${c.incomingLength}`;
  }
}

// ── Sort key for deterministic output ────────────────────────────────────────

/**
 * Sort order: waypoint < anchor < group < align < directional
 * (matches constraint priority order, lowest first so block reads
 *  declarations before references).
 * Within a type, sort lexicographically by the first node/ID field.
 */
const TYPE_ORDER: Record<Constraint['type'], number> = {
  waypoint: 0,
  bezier: 1,
  anchor: 2,
  group: 3,
  align: 4,
  directional: 5,
};

function firstNodeKey(c: Constraint): string {
  switch (c.type) {
    case 'directional': return c.nodeA;
    case 'align':       return c.nodes[0] ?? '';
    case 'group':       return c.nodes[0] ?? '';
    case 'anchor':      return c.node;
    case 'waypoint':    return c.edgeId;
    case 'bezier':      return c.targetId;
  }
}

function sortKey(c: Constraint): string {
  return `${TYPE_ORDER[c.type]}:${firstNodeKey(c)}`;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Serialize a ConstraintSet to a `%% @layout-constraints v1` comment block.
 * Returns an empty string when the set has no constraints.
 * Output is deterministic: sorted by type order, then first node ID.
 */
export function serializeConstraints(cs: ConstraintSet): string {
  if (cs.constraints.length === 0 && !cs.debug) return '';

  const sorted = cs.constraints.slice().sort((a, b) =>
    sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0,
  );

  const innerLines: string[] = [];
  if (cs.debug) {
    innerLines.push(`${LINE_PREFIX}debug`);
  }
  for (const c of sorted) {
    innerLines.push(`${LINE_PREFIX}${serializeOne(c)}`);
  }

  const lines = [BLOCK_START, ...innerLines, BLOCK_END];

  return lines.join('\n');
}

/**
 * Replace the existing constraint block in `mermaidText` with the serialized
 * form of `cs`, or append it if no block is present.
 * If `cs` is empty, the block is removed (equivalent to `stripConstraints`).
 */
export function injectConstraints(mermaidText: string, cs: ConstraintSet): string {
  const stripped = stripConstraints(mermaidText);
  const block = serializeConstraints(cs);

  if (block === '') return stripped;

  const trimmed = stripped.trimEnd();
  return trimmed === '' ? block : `${trimmed}\n\n${block}`;
}

/**
 * Remove the `%% @layout-constraints v1` block from mermaid text.
 * Returns the text unchanged if no block is present.
 */
export function stripConstraints(mermaidText: string): string {
  const lines = mermaidText.split('\n');
  const result: string[] = [];
  let inBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === BLOCK_START) {
      inBlock = true;
      // Remove blank line immediately before the block if present
      if (result.length > 0 && result[result.length - 1].trim() === '') {
        result.pop();
      }
      continue;
    }
    if (inBlock) {
      if (trimmed === BLOCK_END) {
        inBlock = false;
      }
      continue;
    }
    result.push(line);
  }

  return result.join('\n');
}

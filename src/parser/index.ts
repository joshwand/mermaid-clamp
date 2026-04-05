import type {
  Constraint,
  ConstraintSet,
  DirectionalConstraint,
  AlignConstraint,
  GroupConstraint,
  AnchorConstraint,
  WaypointDeclaration,
  Direction,
  Axis,
} from '../types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const BLOCK_START = '%% @layout-constraints v1';
const BLOCK_END = '%% @end-layout-constraints';
const LINE_PREFIX = '%% ';

const DIRECTIONS = new Set<string>(['north-of', 'south-of', 'east-of', 'west-of']);

/** Default edge-to-edge gap when no distance is specified in a directional constraint. */
const DEFAULT_DIRECTIONAL_DISTANCE = 20;
const ARROWS = ['-->',  '-.->',  '===>', '==>', '---', '--'];
// Sorted longest-first so greedy match works correctly.
const ARROWS_SORTED = ARROWS.slice().sort((a, b) => b.length - a.length);

const NODE_ID_RE = /^[a-zA-Z0-9_]+$/;
const NUMBER_RE = /^[0-9]+$/;

// ── ID generation ─────────────────────────────────────────────────────────────

/**
 * Deterministic hash (djb2) of a string, returned as an 8-char hex string.
 * Stable across runs; used to generate constraint IDs from type + params.
 */
function hashString(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function makeId(key: string): string {
  return hashString(key);
}

// ── Block extraction ──────────────────────────────────────────────────────────

/**
 * Find the first `%% @layout-constraints v1` ... `%% @end-layout-constraints`
 * block in mermaid text and return its inner constraint lines (without prefix).
 * Returns null if no block is present or the version is not 1.
 */
function extractBlock(mermaidText: string): string[] | null {
  const lines = mermaidText.split('\n');
  let startIdx = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === BLOCK_START) {
      startIdx = i;
      break;
    }
  }

  if (startIdx === -1) return null;

  const inner: string[] = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === BLOCK_END) break;
    if (line.startsWith(LINE_PREFIX)) {
      inner.push(line.slice(LINE_PREFIX.length));
    } else if (line.startsWith('%%')) {
      // `%%constraint` with no space — tolerate it
      inner.push(line.slice(2).trimStart());
    }
  }

  return inner;
}

// ── Individual line parsers ───────────────────────────────────────────────────

function parseDirectional(tokens: string[]): DirectionalConstraint | null {
  // <nodeA> <direction> <nodeB>[, <distance>]
  // tokens: ['A', 'south-of', 'B,', '120']  (the comma may be attached)
  // tokens: ['A', 'south-of', 'B']           (distance omitted → 0)
  if (tokens.length < 3) return null;

  const nodeA = tokens[0];
  const direction = tokens[1];
  // nodeB may have a trailing comma: "B,"
  const nodeBRaw = tokens[2].replace(/,$/, '');

  if (!NODE_ID_RE.test(nodeA)) return null;
  if (!DIRECTIONS.has(direction)) return null;
  if (!NODE_ID_RE.test(nodeBRaw)) return null;

  let distance = DEFAULT_DIRECTIONAL_DISTANCE;
  if (tokens.length >= 4) {
    const distanceStr = tokens[3];
    if (!NUMBER_RE.test(distanceStr)) return null;
    distance = parseInt(distanceStr, 10);
  }

  const id = makeId(`directional:${nodeA}:${direction}:${nodeBRaw}:${distance}`);

  return {
    type: 'directional',
    id,
    nodeA,
    direction: direction as Direction,
    nodeB: nodeBRaw,
    distance,
  };
}

function parseAlign(tokens: string[]): AlignConstraint | null {
  // align <nodeA>, <nodeB>, ..., <axis>
  // tokens[0] === 'align', rest are comma-separated nodes then axis
  if (tokens.length < 3) return null;

  // Rejoin from tokens[1] onward and re-split on commas
  const rest = tokens.slice(1).join(' ');
  const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);

  if (parts.length < 2) return null;

  const axis = parts[parts.length - 1];
  if (axis !== 'h' && axis !== 'v') return null;

  const nodes = parts.slice(0, -1);
  if (nodes.length < 2) return null;
  if (!nodes.every((n) => NODE_ID_RE.test(n))) return null;

  const id = makeId(`align:${nodes.join(',')}:${axis}`);

  return {
    type: 'align',
    id,
    nodes,
    axis: axis as Axis,
  };
}

function parseGroup(tokens: string[]): GroupConstraint | null {
  // group <nodeA>, <nodeB>, ... as <name>
  // tokens[0] === 'group'
  if (tokens.length < 4) return null;

  // Find 'as' keyword
  const asIdx = tokens.lastIndexOf('as');
  if (asIdx === -1 || asIdx === tokens.length - 1) return null;

  const name = tokens[asIdx + 1];
  if (!NODE_ID_RE.test(name)) return null;

  // Everything between 'group' and 'as' is the node list (comma-separated)
  const nodeTokens = tokens.slice(1, asIdx).join(' ');
  const nodes = nodeTokens.split(',').map((n) => n.trim()).filter(Boolean);

  if (nodes.length < 1) return null;
  if (!nodes.every((n) => NODE_ID_RE.test(n))) return null;

  const id = makeId(`group:${nodes.join(',')}:${name}`);

  return {
    type: 'group',
    id,
    nodes,
    name,
  };
}

function parseAnchor(tokens: string[]): AnchorConstraint | null {
  // anchor <node>, <x>, <y>
  // tokens[0] === 'anchor'
  if (tokens.length < 4) return null;

  const rest = tokens.slice(1).join(' ');
  const parts = rest.split(',').map((p) => p.trim()).filter(Boolean);

  if (parts.length !== 3) return null;

  const [node, xStr, yStr] = parts;
  if (!NODE_ID_RE.test(node)) return null;
  if (!NUMBER_RE.test(xStr)) return null;
  if (!NUMBER_RE.test(yStr)) return null;

  const x = parseInt(xStr, 10);
  const y = parseInt(yStr, 10);
  const id = makeId(`anchor:${node}:${x}:${y}`);

  return {
    type: 'anchor',
    id,
    node,
    x,
    y,
  };
}

/**
 * Split an edge ID string like "A-->B" into { source, arrow, target }.
 * Returns null if the string doesn't match any known arrow style.
 */
export function splitEdgeId(edgeId: string): { source: string; arrow: string; target: string } | null {
  for (const arrow of ARROWS_SORTED) {
    const idx = edgeId.indexOf(arrow);
    if (idx === -1) continue;
    const source = edgeId.slice(0, idx);
    const target = edgeId.slice(idx + arrow.length);
    if (NODE_ID_RE.test(source) && NODE_ID_RE.test(target)) {
      return { source, arrow, target };
    }
  }
  return null;
}

function parseWaypoint(tokens: string[]): WaypointDeclaration | null {
  // waypoint <edgeId> as <waypointId>
  // tokens[0] === 'waypoint'
  if (tokens.length !== 4) return null;
  if (tokens[2] !== 'as') return null;

  const edgeId = tokens[1];
  const waypointId = tokens[3];

  if (splitEdgeId(edgeId) === null) return null;
  if (!NODE_ID_RE.test(waypointId)) return null;

  const id = makeId(`waypoint:${edgeId}:${waypointId}`);

  return {
    type: 'waypoint',
    id,
    edgeId,
    waypointId,
  };
}

// ── Main line dispatcher ──────────────────────────────────────────────────────

function parseLine(
  line: string,
  knownWaypointIds: Set<string>,
): Constraint | null {
  const tokens = line.trim().split(/\s+/);
  if (tokens.length === 0 || tokens[0] === '') return null;

  const keyword = tokens[0];

  if (keyword === 'align') return parseAlign(tokens);
  if (keyword === 'group') return parseGroup(tokens);
  if (keyword === 'anchor') return parseAnchor(tokens);
  if (keyword === 'waypoint') return parseWaypoint(tokens);

  // Directional: first token is a node ID (real node or previously declared waypoint)
  if (NODE_ID_RE.test(keyword)) {
    // Could be a directional constraint; the second token would be the direction
    if (tokens.length >= 3 && DIRECTIONS.has(tokens[1])) {
      // Validate nodeA is either a known node or waypoint
      // (we accept any valid NODE_ID here; waypoint IDs are valid node IDs)
      void knownWaypointIds; // checked by caller if needed
      return parseDirectional(tokens);
    }
  }

  return null;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Parse the `%% @layout-constraints v1` block from mermaid diagram text.
 *
 * - Missing block → empty ConstraintSet
 * - Malformed line → console.warn + skip
 * - Waypoint IDs declared via `waypoint ... as <id>` become valid node IDs
 *   for subsequent directional and align constraints
 */
export function parseConstraints(mermaidText: string): ConstraintSet {
  const lines = extractBlock(mermaidText);
  if (lines === null) {
    return { version: 1, constraints: [], warnings: [] };
  }

  const constraints: Constraint[] = [];
  const warnings: string[] = [];
  const knownWaypointIds = new Set<string>();

  for (const line of lines) {
    if (line.trim() === '') continue;

    const constraint = parseLine(line, knownWaypointIds);

    if (constraint === null) {
      warnings.push(`Skipping malformed constraint line: "${line}"`);
      continue;
    }

    if (constraint.type === 'waypoint') {
      knownWaypointIds.add(constraint.waypointId);
    }

    constraints.push(constraint);
  }

  return { version: 1, constraints, warnings };
}

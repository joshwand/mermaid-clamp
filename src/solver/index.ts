import type { Constraint, ConstraintSet, LayoutNode } from '../types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 10;
const CONVERGENCE_THRESHOLD = 0.5;
const OVERLAP_PADDING = 10;

// ── Internal types ────────────────────────────────────────────────────────────

/** Working copy of a node used during solving. */
interface SolverNode extends LayoutNode {
  anchored: boolean;
}

/** nodeId → set of co-member nodeIds across all groups. */
type GroupPeers = Map<string, Set<string>>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function cloneNodes(nodes: LayoutNode[]): SolverNode[] {
  return nodes.map((n) => ({ ...n, anchored: false }));
}

function buildNodeMap(nodes: SolverNode[]): Map<string, SolverNode> {
  return new Map(nodes.map((n) => [n.id, n]));
}

/**
 * Build a map of nodeId → set of co-member IDs across all group constraints.
 * A node can belong to multiple groups; all co-members are collected.
 */
function buildGroupPeers(constraints: Constraint[]): GroupPeers {
  const peers: GroupPeers = new Map();

  for (const c of constraints) {
    if (c.type !== 'group') continue;
    for (const id of c.nodes) {
      if (!peers.has(id)) peers.set(id, new Set());
      for (const other of c.nodes) {
        if (other !== id) peers.get(id)!.add(other);
      }
    }
  }

  return peers;
}

/**
 * Move a node by (dx, dy). Also moves all group peers by the same delta,
 * unless the peer is anchored.
 */
function moveNode(
  id: string,
  dx: number,
  dy: number,
  nodeMap: Map<string, SolverNode>,
  peers: GroupPeers,
  visited = new Set<string>(),
): void {
  if (visited.has(id)) return;
  visited.add(id);

  const node = nodeMap.get(id);
  if (!node || node.anchored) return;

  node.x += dx;
  node.y += dy;

  const groupPeers = peers.get(id);
  if (groupPeers) {
    for (const peerId of groupPeers) {
      moveNode(peerId, dx, dy, nodeMap, peers, visited);
    }
  }
}

// ── Constraint application passes ────────────────────────────────────────────

function applyAnchors(
  constraints: Constraint[],
  nodeMap: Map<string, SolverNode>,
): void {
  for (const c of constraints) {
    if (c.type !== 'anchor') continue;
    const node = nodeMap.get(c.node);
    if (!node) continue;
    node.x = c.x;
    node.y = c.y;
    node.anchored = true;
  }
}

function applyAlignments(
  constraints: Constraint[],
  nodeMap: Map<string, SolverNode>,
  peers: GroupPeers,
): void {
  for (const c of constraints) {
    if (c.type !== 'align') continue;

    const nodes = c.nodes.map((id) => nodeMap.get(id)).filter((n): n is SolverNode => n !== undefined);
    if (nodes.length < 2) continue;

    const axis = c.axis === 'h' ? 'y' : 'x';

    // Anchored node wins as reference if one is present; otherwise the first
    // listed node in the constraint is the reference and does not move.
    // All other nodes shift to the reference's position on this axis.
    const reference = nodes.find((n) => n.anchored) ?? nodes[0];
    const target = reference[axis];

    for (const node of nodes) {
      if (node === reference || node.anchored) continue;
      const delta = target - node[axis];
      if (Math.abs(delta) < CONVERGENCE_THRESHOLD) continue;
      if (axis === 'x') moveNode(node.id, delta, 0, nodeMap, peers);
      else moveNode(node.id, 0, delta, nodeMap, peers);
    }
  }
}

function applyDirectionals(
  constraints: Constraint[],
  nodeMap: Map<string, SolverNode>,
  peers: GroupPeers,
): void {
  for (const c of constraints) {
    if (c.type !== 'directional') continue;

    const nodeA = nodeMap.get(c.nodeA);
    const nodeB = nodeMap.get(c.nodeB);
    if (!nodeA || !nodeB || nodeA.anchored) continue;

    // Edge-to-edge semantics: distance is gap between node edges.
    // Waypoints have width=height=0, so the half-size terms vanish for them.
    let targetX = nodeA.x;
    let targetY = nodeA.y;

    switch (c.direction) {
      case 'south-of': targetY = nodeB.y + (nodeB.height + nodeA.height) / 2 + c.distance; break;
      case 'north-of': targetY = nodeB.y - (nodeB.height + nodeA.height) / 2 - c.distance; break;
      case 'east-of':  targetX = nodeB.x + (nodeB.width  + nodeA.width)  / 2 + c.distance; break;
      case 'west-of':  targetX = nodeB.x - (nodeB.width  + nodeA.width)  / 2 - c.distance; break;
    }

    const dx = targetX - nodeA.x;
    const dy = targetY - nodeA.y;

    if (Math.abs(dx) >= CONVERGENCE_THRESHOLD) moveNode(nodeA.id, dx, 0, nodeMap, peers);
    if (Math.abs(dy) >= CONVERGENCE_THRESHOLD) moveNode(nodeA.id, 0, dy, nodeMap, peers);
  }
}

// ── Post-solve passes ─────────────────────────────────────────────────────────

const REPULSION_MAX_ITERS = 20;

/**
 * Iteratively push overlapping node pairs apart until no bounding boxes
 * intersect or the iteration limit is reached.
 *
 * Each overlapping pair is separated along the axis that requires the smaller
 * translation (minimum overlap vector). Anchored nodes don't move; if one
 * node of a pair is anchored the full push falls on the other.
 *
 * Group members are exempt from repulsion against each other — their relative
 * positions are intentional and managed by `moveNode`.
 *
 * Waypoints (width = height = 0) are skipped — they have no physical extent.
 */
function resolveAllOverlaps(nodes: SolverNode[], peers: GroupPeers): void {
  for (let iter = 0; iter < REPULSION_MAX_ITERS; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      if (a.width === 0 && a.height === 0) continue; // waypoint

      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        if (b.width === 0 && b.height === 0) continue; // waypoint

        // Skip group members — their relative positions are intentional.
        if (peers.get(a.id)?.has(b.id)) continue;

        const xOverlap = (a.width + b.width) / 2 - Math.abs(a.x - b.x);
        const yOverlap = (a.height + b.height) / 2 - Math.abs(a.y - b.y);
        if (xOverlap <= 0 || yOverlap <= 0) continue;

        anyOverlap = true;

        if (xOverlap < yOverlap) {
          // Push apart horizontally.
          const push = xOverlap + OVERLAP_PADDING;
          const dir = a.x <= b.x ? 1 : -1; // dir > 0 means b is to the right
          if (a.anchored && !b.anchored) {
            b.x += dir * push;
          } else if (!a.anchored && b.anchored) {
            a.x -= dir * push;
          } else if (!a.anchored && !b.anchored) {
            a.x -= dir * push / 2;
            b.x += dir * push / 2;
          }
        } else {
          // Push apart vertically.
          const push = yOverlap + OVERLAP_PADDING;
          const dir = a.y <= b.y ? 1 : -1; // dir > 0 means b is below
          if (a.anchored && !b.anchored) {
            b.y += dir * push;
          } else if (!a.anchored && b.anchored) {
            a.y -= dir * push;
          } else if (!a.anchored && !b.anchored) {
            a.y -= dir * push / 2;
            b.y += dir * push / 2;
          }
        }
      }
    }

    if (!anyOverlap) break;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Apply a ConstraintSet to an initial set of node positions using iterative
 * relaxation. Returns new node objects with adjusted positions; input is not
 * mutated.
 *
 * Priority order (highest first): anchor > group (peer movement) > align > directional.
 * Waypoints participate as zero-size nodes — no special-casing needed.
 *
 * Convergence: stops when max positional delta < 0.5px or after 10 iterations.
 */
export function solveConstraints(nodes: LayoutNode[], constraints: ConstraintSet): LayoutNode[] {
  if (constraints.constraints.length === 0) {
    return nodes.map((n) => ({ ...n }));
  }

  const working = cloneNodes(nodes);
  const nodeMap = buildNodeMap(working);
  const peers = buildGroupPeers(constraints.constraints);

  // Step 1: Anchors — fixed, applied once before iteration.
  applyAnchors(constraints.constraints, nodeMap);

  // Step 2: Iterative relaxation — align then directional, repeat until convergence.
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const snapshot = working.map((n) => ({ x: n.x, y: n.y }));

    // Directionals run first so that by the time alignments execute, displaced
    // nodes already reflect their constraint-driven positions. Alignment then
    // uses max-y to pull undisplaced nodes down to meet them.
    applyDirectionals(constraints.constraints, nodeMap, peers);
    applyAlignments(constraints.constraints, nodeMap, peers);

    // Convergence check.
    const maxDelta = working.reduce((max, n, i) => {
      const dx = Math.abs(n.x - snapshot[i].x);
      const dy = Math.abs(n.y - snapshot[i].y);
      return Math.max(max, dx, dy);
    }, 0);

    if (maxDelta < CONVERGENCE_THRESHOLD) break;
  }

  // Step 3: Push any overlapping node pairs apart.
  resolveAllOverlaps(working, peers);

  // Return plain LayoutNodes (strip the internal `anchored` flag).
  return working.map(({ anchored: _anchored, ...n }) => n);
}

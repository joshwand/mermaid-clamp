import type { Constraint, ConstraintSet, LayoutNode } from '../types.js';

// ── Constants ────────────────────────────────────────────────────────────────

const MAX_ITERATIONS = 10;
const CONVERGENCE_THRESHOLD = 0.5;

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

/** Displacement of a node from its base (original) position on an axis. */
function displacement(node: SolverNode, base: Map<string, LayoutNode>, axis: 'x' | 'y'): number {
  const b = base.get(node.id);
  return b ? Math.abs(node[axis] - b[axis]) : 0;
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
  base: Map<string, LayoutNode>,
): void {
  for (const c of constraints) {
    if (c.type !== 'align') continue;

    const nodes = c.nodes.map((id) => nodeMap.get(id)).filter((n): n is SolverNode => n !== undefined);
    if (nodes.length < 2) continue;

    const axis = c.axis === 'h' ? 'y' : 'x';

    // Target: weighted average of positions, weighted inversely by displacement
    // (nodes displaced less pull more strongly toward their position).
    // Anchored nodes always contribute with full weight.
    let targetSum = 0;
    let weightSum = 0;
    for (const node of nodes) {
      const disp = node.anchored ? 0 : displacement(node, base, axis);
      const weight = node.anchored ? 1e6 : 1 / (1 + disp);
      targetSum += node[axis] * weight;
      weightSum += weight;
    }
    const target = targetSum / weightSum;

    for (const node of nodes) {
      if (node.anchored) continue;
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

    // Center-to-center semantics per the spec.
    let targetX = nodeA.x;
    let targetY = nodeA.y;

    switch (c.direction) {
      case 'south-of': targetY = nodeB.y + c.distance; break;
      case 'north-of': targetY = nodeB.y - c.distance; break;
      case 'east-of':  targetX = nodeB.x + c.distance; break;
      case 'west-of':  targetX = nodeB.x - c.distance; break;
    }

    const dx = targetX - nodeA.x;
    const dy = targetY - nodeA.y;

    if (Math.abs(dx) >= CONVERGENCE_THRESHOLD) moveNode(nodeA.id, dx, 0, nodeMap, peers);
    if (Math.abs(dy) >= CONVERGENCE_THRESHOLD) moveNode(nodeA.id, 0, dy, nodeMap, peers);
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
  const base = new Map(nodes.map((n) => [n.id, { ...n }]));
  const peers = buildGroupPeers(constraints.constraints);

  // Step 1: Anchors — fixed, applied once before iteration.
  applyAnchors(constraints.constraints, nodeMap);

  // Step 2: Iterative relaxation — align then directional, repeat until convergence.
  for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
    const snapshot = working.map((n) => ({ x: n.x, y: n.y }));

    applyAlignments(constraints.constraints, nodeMap, peers, base);
    applyDirectionals(constraints.constraints, nodeMap, peers);

    // Convergence check.
    const maxDelta = working.reduce((max, n, i) => {
      const dx = Math.abs(n.x - snapshot[i].x);
      const dy = Math.abs(n.y - snapshot[i].y);
      return Math.max(max, dx, dy);
    }, 0);

    if (maxDelta < CONVERGENCE_THRESHOLD) break;
  }

  // Return plain LayoutNodes (strip the internal `anchored` flag).
  return working.map(({ anchored: _anchored, ...n }) => n);
}

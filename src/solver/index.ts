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
    const hasAnchored = nodes.some((n) => n.anchored);

    // For h-alignment (same y) with no anchored nodes:
    //   - If any node has been displaced in Y by a prior constraint, use max-y
    //     so that directionally-placed nodes below the group's natural position
    //     pull all members down.
    //   - If no node has been displaced in Y, use min-y so that nodes lower in
    //     the dagre layout are pulled up to the topmost member's position.
    //
    // For v-alignment (same x) or any alignment containing an anchored node:
    // use a weighted average; anchored nodes dominate with weight 1e6.
    let target: number;
    if (axis === 'y' && !hasAnchored) {
      const anyYDisplaced = nodes.some((n) => Math.abs(n.y - (base.get(n.id)?.y ?? n.y)) >= CONVERGENCE_THRESHOLD);
      target = anyYDisplaced
        ? Math.max(...nodes.map((n) => n.y))
        : Math.min(...nodes.map((n) => n.y));
    } else {
      let targetSum = 0;
      let weightSum = 0;
      for (const node of nodes) {
        const disp = node.anchored ? 0 : displacement(node, base, axis);
        const weight = node.anchored ? 1e6 : 1 / (1 + disp);
        targetSum += node[axis] * weight;
        weightSum += weight;
      }
      target = targetSum / weightSum;
    }

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

/**
 * Push nodes that are still at their dagre (base) y-position downward if a
 * constrained node above them has moved into their space.
 *
 * Algorithm: sort nodes by their original dagre y; for each node whose solved
 * y hasn't moved from its base (i.e., it is unconstrained in y), check every
 * preceding node. If they x-overlap and the unconstrained node's y is too
 * close to the preceding node's solved bottom edge, push it down.
 */
function resolveVerticalOverlaps(
  nodes: SolverNode[],
  base: Map<string, LayoutNode>,
): void {
  const sorted = [...nodes].sort((a, b) => {
    const ay = base.get(a.id)?.y ?? a.y;
    const by_ = base.get(b.id)?.y ?? b.y;
    return ay - by_;
  });

  for (let i = 1; i < sorted.length; i++) {
    const node = sorted[i];
    if (node.anchored) continue;
    const baseY = base.get(node.id)?.y ?? node.y;
    // Only consider nodes that have not been moved in y by a constraint.
    if (Math.abs(node.y - baseY) >= CONVERGENCE_THRESHOLD) continue;

    for (let j = 0; j < i; j++) {
      const prev = sorted[j];
      const xGap = Math.abs(node.x - prev.x);
      const xMinSep = (node.width + prev.width) / 2;
      if (xGap >= xMinSep) continue; // no horizontal overlap — no conflict

      const minY = prev.y + (prev.height + node.height) / 2 + OVERLAP_PADDING;
      if (node.y < minY) node.y = minY;
    }
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

    // Directionals run first so that by the time alignments execute, displaced
    // nodes already reflect their constraint-driven positions. Alignment then
    // uses max-y to pull undisplaced nodes down to meet them.
    applyDirectionals(constraints.constraints, nodeMap, peers);
    applyAlignments(constraints.constraints, nodeMap, peers, base);

    // Convergence check.
    const maxDelta = working.reduce((max, n, i) => {
      const dx = Math.abs(n.x - snapshot[i].x);
      const dy = Math.abs(n.y - snapshot[i].y);
      return Math.max(max, dx, dy);
    }, 0);

    if (maxDelta < CONVERGENCE_THRESHOLD) break;
  }

  // Step 3: Push unconstrained nodes that ended up above constrained nodes
  // that moved downward. Handles cases where a directional constraint moves a
  // node below a sibling that dagre placed below it originally.
  resolveVerticalOverlaps(working, base);

  // Return plain LayoutNodes (strip the internal `anchored` flag).
  return working.map(({ anchored: _anchored, ...n }) => n);
}

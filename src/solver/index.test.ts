import { describe, it, expect } from 'vitest';
import { solveConstraints } from './index.js';
import type { ConstraintSet, LayoutNode } from '../types.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function node(id: string, x: number, y: number, w = 80, h = 40): LayoutNode {
  return { id, x, y, width: w, height: h };
}

function waypoint(id: string, x: number, y: number): LayoutNode {
  return { id, x, y, width: 0, height: 0, isWaypoint: true };
}

function cs(...constraints: ConstraintSet['constraints']): ConstraintSet {
  return { version: 1, constraints };
}

function byId(nodes: LayoutNode[], id: string): LayoutNode {
  const n = nodes.find((n) => n.id === id);
  if (!n) throw new Error(`Node ${id} not found`);
  return n;
}

const CLOSE = 0.6; // tolerance for floating-point position comparisons

// ── No constraints ────────────────────────────────────────────────────────────

describe('solveConstraints — no constraints', () => {
  it('returns positions unchanged when constraint set is empty', () => {
    const nodes = [node('A', 100, 100), node('B', 200, 200)];
    const result = solveConstraints(nodes, { version: 1, constraints: [] });
    expect(result[0]).toMatchObject({ id: 'A', x: 100, y: 100 });
    expect(result[1]).toMatchObject({ id: 'B', x: 200, y: 200 });
  });

  it('does not mutate input nodes', () => {
    const nodes = [node('A', 100, 100)];
    solveConstraints(nodes, cs({ type: 'directional', id: 'x', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 50 }));
    expect(nodes[0].x).toBe(100);
    expect(nodes[0].y).toBe(100);
  });
});

// ── Directional constraints ───────────────────────────────────────────────────

describe('solveConstraints — directional', () => {
  it('south-of: A.y = B.y + (B.h + A.h)/2 + distance (edge-to-edge)', () => {
    // B: h=40, A: h=40 → half-sep = 40. A.y = 50 + 40 + 120 = 210
    const nodes = [node('A', 100, 100), node('B', 100, 50)];
    const result = solveConstraints(nodes, cs(
      { type: 'directional', id: 'x', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 120 },
    ));
    expect(byId(result, 'A').y).toBeCloseTo(50 + 40 + 120, CLOSE);
  });

  it('north-of: A.y = B.y - (B.h + A.h)/2 - distance (edge-to-edge)', () => {
    // B: h=40, A: h=40 → half-sep = 40. A.y = 200 - 40 - 80 = 80
    const nodes = [node('A', 100, 300), node('B', 100, 200)];
    const result = solveConstraints(nodes, cs(
      { type: 'directional', id: 'x', nodeA: 'A', direction: 'north-of', nodeB: 'B', distance: 80 },
    ));
    expect(byId(result, 'A').y).toBeCloseTo(200 - 40 - 80, CLOSE);
  });

  it('east-of: A.x = B.x + (B.w + A.w)/2 + distance (edge-to-edge)', () => {
    // B: w=80, A: w=80 → half-sep = 80. A.x = 50 + 80 + 100 = 230
    const nodes = [node('A', 100, 100), node('B', 50, 100)];
    const result = solveConstraints(nodes, cs(
      { type: 'directional', id: 'x', nodeA: 'A', direction: 'east-of', nodeB: 'B', distance: 100 },
    ));
    expect(byId(result, 'A').x).toBeCloseTo(50 + 80 + 100, CLOSE);
  });

  it('west-of: A.x = B.x - (B.w + A.w)/2 - distance (edge-to-edge)', () => {
    // B: w=80, A: w=80 → half-sep = 80. A.x = 200 - 80 - 60 = 60
    const nodes = [node('A', 300, 100), node('B', 200, 100)];
    const result = solveConstraints(nodes, cs(
      { type: 'directional', id: 'x', nodeA: 'A', direction: 'west-of', nodeB: 'B', distance: 60 },
    ));
    expect(byId(result, 'A').x).toBeCloseTo(200 - 80 - 60, CLOSE);
  });

  it('reference node B does not move', () => {
    const nodes = [node('A', 100, 100), node('B', 100, 50)];
    const result = solveConstraints(nodes, cs(
      { type: 'directional', id: 'x', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 120 },
    ));
    expect(byId(result, 'B').y).toBe(50);
  });
});

// ── Align constraints ─────────────────────────────────────────────────────────

describe('solveConstraints — align', () => {
  it('align h: both nodes end up at the same Y', () => {
    const nodes = [node('A', 100, 100), node('B', 200, 200)];
    const result = solveConstraints(nodes, cs(
      { type: 'align', id: 'x', nodes: ['A', 'B'], axis: 'h' },
    ));
    expect(byId(result, 'A').y).toBeCloseTo(byId(result, 'B').y, CLOSE);
  });

  it('align v: both nodes end up at the same X', () => {
    const nodes = [node('A', 100, 100), node('B', 300, 200)];
    const result = solveConstraints(nodes, cs(
      { type: 'align', id: 'x', nodes: ['A', 'B'], axis: 'v' },
    ));
    expect(byId(result, 'A').x).toBeCloseTo(byId(result, 'B').x, CLOSE);
  });

  it('align h three nodes: all share same Y', () => {
    const nodes = [node('A', 100, 100), node('B', 200, 200), node('C', 300, 150)];
    const result = solveConstraints(nodes, cs(
      { type: 'align', id: 'x', nodes: ['A', 'B', 'C'], axis: 'h' },
    ));
    const yA = byId(result, 'A').y;
    const yB = byId(result, 'B').y;
    const yC = byId(result, 'C').y;
    expect(yA).toBeCloseTo(yB, CLOSE);
    expect(yB).toBeCloseTo(yC, CLOSE);
  });
});

// ── Anchor constraints ────────────────────────────────────────────────────────

describe('solveConstraints — anchor', () => {
  it('pins a node to exact coordinates', () => {
    const nodes = [node('A', 100, 100)];
    const result = solveConstraints(nodes, cs(
      { type: 'anchor', id: 'x', node: 'A', x: 200, y: 300 },
    ));
    expect(byId(result, 'A').x).toBe(200);
    expect(byId(result, 'A').y).toBe(300);
  });

  it('anchored node is not moved by a directional constraint', () => {
    const nodes = [node('A', 100, 100), node('B', 200, 200)];
    const result = solveConstraints(nodes, cs(
      { type: 'anchor', id: 'anc', node: 'A', x: 200, y: 300 },
      { type: 'directional', id: 'dir', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 50 },
    ));
    // Anchor wins — A stays at its anchored position
    expect(byId(result, 'A').x).toBe(200);
    expect(byId(result, 'A').y).toBe(300);
  });

  it('alignment adjusts the non-anchored node to match the anchored one', () => {
    const nodes = [node('A', 100, 100), node('B', 200, 200)];
    const result = solveConstraints(nodes, cs(
      { type: 'anchor', id: 'anc', node: 'A', x: 100, y: 150 },
      { type: 'align', id: 'aln', nodes: ['A', 'B'], axis: 'h' },
    ));
    // A is anchored at y=150; B must move to y=150
    expect(byId(result, 'A').y).toBeCloseTo(150, CLOSE);
    expect(byId(result, 'B').y).toBeCloseTo(150, CLOSE);
  });
});

// ── Group constraints ─────────────────────────────────────────────────────────

describe('solveConstraints — group', () => {
  it('moving a group member by directional moves all members', () => {
    // A, B, C are grouped. External constraint moves A south-of D.
    // B and C should move by the same delta.
    const nodes = [
      node('A', 100, 100),
      node('B', 200, 100), // same Y as A, different X
      node('C', 150, 100), // same Y as A
      node('D', 100, 0),   // reference
    ];
    const result = solveConstraints(nodes, cs(
      { type: 'group', id: 'g', nodes: ['A', 'B', 'C'], name: 'trio' },
      { type: 'directional', id: 'd', nodeA: 'A', direction: 'south-of', nodeB: 'D', distance: 80 },
    ));
    // A should be at D.y + (D.h + A.h)/2 + 80 = 0 + 40 + 80 = 120 (edge-to-edge)
    expect(byId(result, 'A').y).toBeCloseTo(120, CLOSE);
    // B and C move by the same delta as A (120 - 100 = +20)
    expect(byId(result, 'B').y).toBeCloseTo(120, CLOSE);
    expect(byId(result, 'C').y).toBeCloseTo(120, CLOSE);
    // X positions of B and C should be unchanged
    expect(byId(result, 'B').x).toBeCloseTo(200, CLOSE);
    expect(byId(result, 'C').x).toBeCloseTo(150, CLOSE);
  });

  it('group of 3 aligns with external node — all members move', () => {
    const nodes = [
      node('A', 100, 120),
      node('B', 200, 120),
      node('C', 300, 120),
      node('D', 400, 200), // external reference with higher y
    ];
    const result = solveConstraints(nodes, cs(
      { type: 'group', id: 'g', nodes: ['A', 'B', 'C'], name: 'grp' },
      { type: 'align', id: 'aln', nodes: ['A', 'D'], axis: 'h' },
    ));
    // D has no Y displacement; A,B,C have no Y displacement; min-y = 120 (A's level)
    // D moves up to A's Y (120). Group movement: A stays (already at min), B and C unchanged.
    expect(byId(result, 'A').y).toBeCloseTo(byId(result, 'D').y, CLOSE);
    expect(byId(result, 'B').y).toBeCloseTo(byId(result, 'D').y, CLOSE);
    expect(byId(result, 'C').y).toBeCloseTo(byId(result, 'D').y, CLOSE);
  });
});

// ── Waypoints ────────────────────────────────────────────────────────────────

describe('solveConstraints — waypoints', () => {
  it('waypoint west-of C: wp1.x = C.x - C.w/2 - distance (edge-to-edge; waypoint w=0)', () => {
    // C: w=80 → half-sep = 40+0 = 40. wp1.x = 200 - 40 - 20 = 140
    const nodes = [waypoint('wp1', 100, 100), node('C', 200, 100)];
    const result = solveConstraints(nodes, cs(
      { type: 'directional', id: 'x', nodeA: 'wp1', direction: 'west-of', nodeB: 'C', distance: 20 },
    ));
    expect(byId(result, 'wp1').x).toBeCloseTo(200 - 40 - 20, CLOSE);
  });

  it('waypoint can be aligned with a real node', () => {
    const nodes = [waypoint('wp1', 100, 50), node('D', 300, 200)];
    const result = solveConstraints(nodes, cs(
      { type: 'align', id: 'x', nodes: ['wp1', 'D'], axis: 'h' },
    ));
    expect(byId(result, 'wp1').y).toBeCloseTo(byId(result, 'D').y, CLOSE);
  });

  it('waypoint can be anchored', () => {
    const nodes = [waypoint('wp1', 100, 100)];
    const result = solveConstraints(nodes, cs(
      { type: 'anchor', id: 'x', node: 'wp1', x: 150, y: 200 },
    ));
    expect(byId(result, 'wp1').x).toBe(150);
    expect(byId(result, 'wp1').y).toBe(200);
  });
});

// ── Conflict resolution ───────────────────────────────────────────────────────

describe('solveConstraints — conflict resolution', () => {
  it('anchor beats directional on the same axis', () => {
    const nodes = [node('A', 100, 100), node('B', 100, 50)];
    const result = solveConstraints(nodes, cs(
      { type: 'anchor', id: 'anc', node: 'A', x: 100, y: 999 },
      { type: 'directional', id: 'dir', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 10 },
    ));
    // Anchor wins: A.y stays 999
    expect(byId(result, 'A').y).toBe(999);
  });
});

// ── Performance ───────────────────────────────────────────────────────────────

describe('solveConstraints — performance', () => {
  it('50 nodes with 10 constraints completes in under 10ms', () => {
    const nodes: LayoutNode[] = Array.from({ length: 50 }, (_, i) =>
      node(`n${i}`, i * 20, i * 15),
    );
    const constraints: ConstraintSet['constraints'] = [
      { type: 'align', id: 'a1', nodes: ['n0', 'n1', 'n2'], axis: 'h' },
      { type: 'align', id: 'a2', nodes: ['n3', 'n4'], axis: 'v' },
      { type: 'directional', id: 'd1', nodeA: 'n5', direction: 'south-of', nodeB: 'n6', distance: 100 },
      { type: 'directional', id: 'd2', nodeA: 'n7', direction: 'east-of', nodeB: 'n8', distance: 80 },
      { type: 'anchor', id: 'anc', node: 'n9', x: 200, y: 300 },
      { type: 'group', id: 'g1', nodes: ['n10', 'n11', 'n12'], name: 'grp1' },
      { type: 'directional', id: 'd3', nodeA: 'n10', direction: 'north-of', nodeB: 'n9', distance: 50 },
      { type: 'align', id: 'a3', nodes: ['n13', 'n14', 'n15'], axis: 'h' },
      { type: 'directional', id: 'd4', nodeA: 'n16', direction: 'west-of', nodeB: 'n17', distance: 60 },
      { type: 'directional', id: 'd5', nodeA: 'n18', direction: 'south-of', nodeB: 'n19', distance: 40 },
    ];

    const start = performance.now();
    solveConstraints(nodes, { version: 1, constraints });
    const elapsed = performance.now() - start;

    expect(elapsed).toBeLessThan(10);
  });
});

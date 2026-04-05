/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, beforeEach } from 'vitest';
import {
  parseTranslate,
  formatTranslate,
  extractPositionsFromSVG,
  applyPositionsToSVG,
  applyConstraintsToNodes,
  reRouteEdgesInSVG,
  routeEdgeThroughWaypoints,
  buildSplinePath,
  buildWaypointNodes,
  setDiagramText,
} from './index.js';
import type { LayoutNode, WaypointDeclaration } from '../types.js';

// ── parseTranslate ────────────────────────────────────────────────────────────

describe('parseTranslate', () => {
  it('parses a standard translate', () => {
    expect(parseTranslate('translate(100, 200)')).toEqual({ x: 100, y: 200 });
  });

  it('parses negative values', () => {
    expect(parseTranslate('translate(-10, -20)')).toEqual({ x: -10, y: -20 });
  });

  it('parses decimal values', () => {
    const result = parseTranslate('translate(10.5, 20.75)');
    expect(result?.x).toBeCloseTo(10.5);
    expect(result?.y).toBeCloseTo(20.75);
  });

  it('returns null for null input', () => {
    expect(parseTranslate(null)).toBeNull();
  });

  it('returns null for non-translate string', () => {
    expect(parseTranslate('scale(2)')).toBeNull();
  });

  it('handles extra whitespace inside parens', () => {
    expect(parseTranslate('translate( 50 , 75 )')).toEqual({ x: 50, y: 75 });
  });
});

// ── formatTranslate ───────────────────────────────────────────────────────────

describe('formatTranslate', () => {
  it('produces the correct string', () => {
    expect(formatTranslate(100, 200)).toBe('translate(100, 200)');
  });
});

// ── extractPositionsFromSVG ───────────────────────────────────────────────────

function makeSvg(nodes: Array<{ id: string; transform: string }>): Element {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const { id, transform } of nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    g.setAttribute('transform', transform);
    svg.appendChild(g);
  }
  return svg;
}

describe('extractPositionsFromSVG', () => {
  it('extracts positions from node elements', () => {
    const svgEl = makeSvg([
      { id: 'A', transform: 'translate(100, 150)' },
      { id: 'B', transform: 'translate(200, 250)' },
    ]);
    const nodes = [
      { id: 'A', domId: 'A', width: 80, height: 40, isGroup: false },
      { id: 'B', domId: 'B', width: 80, height: 40, isGroup: false },
    ];
    const result = extractPositionsFromSVG(nodes, svgEl);
    expect(result).toHaveLength(2);
    expect(result.find(n => n.id === 'A')).toMatchObject({ x: 100, y: 150 });
    expect(result.find(n => n.id === 'B')).toMatchObject({ x: 200, y: 250 });
  });

  it('skips cluster/group nodes', () => {
    const svgEl = makeSvg([
      { id: 'A', transform: 'translate(100, 150)' },
      { id: 'cluster1', transform: 'translate(0, 0)' },
    ]);
    const nodes = [
      { id: 'A', domId: 'A', width: 80, height: 40, isGroup: false },
      { id: 'cluster1', domId: 'cluster1', width: 200, height: 100, isGroup: true },
    ];
    const result = extractPositionsFromSVG(nodes, svgEl);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A');
  });

  it('skips nodes whose SVG element is missing', () => {
    const svgEl = makeSvg([{ id: 'A', transform: 'translate(100, 150)' }]);
    const nodes = [
      { id: 'A', domId: 'A', width: 80, height: 40, isGroup: false },
      { id: 'B', domId: 'B', width: 80, height: 40, isGroup: false }, // B is missing from SVG
    ];
    const result = extractPositionsFromSVG(nodes, svgEl);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('A');
  });

  it('uses domId when present, node.id otherwise', () => {
    const svgEl = makeSvg([{ id: 'myDiagram-A', transform: 'translate(50, 60)' }]);
    const nodes = [{ id: 'A', domId: 'myDiagram-A', width: 80, height: 40, isGroup: false }];
    const result = extractPositionsFromSVG(nodes, svgEl);
    expect(result[0]).toMatchObject({ id: 'A', x: 50, y: 60 });
  });
});

// ── applyPositionsToSVG ───────────────────────────────────────────────────────

describe('applyPositionsToSVG', () => {
  it('updates the transform attribute of each node element', () => {
    const svgEl = makeSvg([
      { id: 'A', transform: 'translate(100, 100)' },
      { id: 'B', transform: 'translate(200, 200)' },
    ]);
    const solved: LayoutNode[] = [
      { id: 'A', x: 150, y: 180, width: 80, height: 40 },
      { id: 'B', x: 250, y: 300, width: 80, height: 40 },
    ];
    const nodeList = [
      { id: 'A', domId: 'A' },
      { id: 'B', domId: 'B' },
    ];
    applyPositionsToSVG(solved, svgEl, nodeList);
    expect(svgEl.querySelector('[id="A"]')?.getAttribute('transform')).toBe('translate(150, 180)');
    expect(svgEl.querySelector('[id="B"]')?.getAttribute('transform')).toBe('translate(250, 300)');
  });

  it('preserves non-translate parts of the transform', () => {
    const svgEl = makeSvg([{ id: 'A', transform: 'translate(100, 100) scale(2)' }]);
    const solved: LayoutNode[] = [{ id: 'A', x: 200, y: 300, width: 80, height: 40 }];
    applyPositionsToSVG(solved, svgEl, [{ id: 'A', domId: 'A' }]);
    const transform = svgEl.querySelector('[id="A"]')?.getAttribute('transform');
    expect(transform).toContain('translate(200, 300)');
    expect(transform).toContain('scale(2)');
  });
});

// ── applyConstraintsToNodes ───────────────────────────────────────────────────

describe('applyConstraintsToNodes', () => {
  beforeEach(() => {
    // Reset side-channel state between tests
  });

  it('returns nodes unchanged when no diagram text is registered', () => {
    const nodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 100, width: 80, height: 40 },
    ];
    const result = applyConstraintsToNodes(nodes, 'unknown-id');
    expect(result[0]).toMatchObject({ x: 100, y: 100 });
  });

  it('applies constraints when diagram text is registered', () => {
    const text = `flowchart TD
A --> B

%% @layout-constraints v1
%% A south-of B, 150
%% @end-layout-constraints`;

    setDiagramText('test-diag-1', text);

    const nodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 100, width: 80, height: 40 },
      { id: 'B', x: 100, y: 50,  width: 80, height: 40 },
    ];
    const result = applyConstraintsToNodes(nodes, 'test-diag-1');
    // A south-of B, 150 (edge-to-edge): A.y = B.y + (B.h + A.h)/2 + 150 = 50 + 40 + 150 = 240
    expect(result.find(n => n.id === 'A')?.y).toBeCloseTo(240, 0);
    // B should not move
    expect(result.find(n => n.id === 'B')?.y).toBeCloseTo(50, 0);
  });

  it('returns nodes unchanged when constraint set is empty', () => {
    const text = 'flowchart TD\nA --> B';
    setDiagramText('test-diag-2', text);
    const nodes: LayoutNode[] = [{ id: 'A', x: 100, y: 100, width: 80, height: 40 }];
    const result = applyConstraintsToNodes(nodes, 'test-diag-2');
    expect(result[0]).toMatchObject({ x: 100, y: 100 });
  });
});

// ── Bounding box helpers ──────────────────────────────────────────────────────

/** Returns the four corners of a node's bounding box (center x/y, half-extents). */
function bbox(node: LayoutNode) {
  return {
    left:   node.x - node.width / 2,
    right:  node.x + node.width / 2,
    top:    node.y - node.height / 2,
    bottom: node.y + node.height / 2,
  };
}

/** Returns true if two bounding boxes overlap (strictly — touching edges don't count). */
function overlaps(a: LayoutNode, b: LayoutNode): boolean {
  const ba = bbox(a);
  const bb = bbox(b);
  return ba.left < bb.right && ba.right > bb.left && ba.top < bb.bottom && ba.bottom > bb.top;
}

// ── Bounding box corner positions ─────────────────────────────────────────────

describe('bounding box corners after constraint solving', () => {
  it('south-of: solved node bounding box is strictly below the reference', () => {
    const text = `flowchart TD
A --> B
%% @layout-constraints v1
%% B south-of A, 100
%% @end-layout-constraints`;

    setDiagramText('bbox-test-1', text);
    const nodes: LayoutNode[] = [
      { id: 'A', x: 200, y: 60,  width: 120, height: 40 },
      { id: 'B', x: 200, y: 140, width: 120, height: 40 },
    ];
    const solved = applyConstraintsToNodes(nodes, 'bbox-test-1');

    const A = solved.find((n) => n.id === 'A')!;
    const B = solved.find((n) => n.id === 'B')!;

    // B south-of A, 100 (edge-to-edge): B.y = A.y + (A.h + B.h)/2 + 100 = 60 + 40 + 100 = 200
    expect(B.y).toBeCloseTo(A.y + (A.height + B.height) / 2 + 100, 0);

    // B's top edge must be below A's bottom edge (gap = 100)
    expect(bbox(B).top).toBeGreaterThan(bbox(A).bottom);

    // Corners are at the expected positions
    expect(bbox(B).left).toBeCloseTo(B.x - B.width / 2, 1);
    expect(bbox(B).right).toBeCloseTo(B.x + B.width / 2, 1);
    expect(bbox(B).top).toBeCloseTo(B.y - B.height / 2, 1);
    expect(bbox(B).bottom).toBeCloseTo(B.y + B.height / 2, 1);
  });

  it('east-of: solved node right edge is east of reference left edge', () => {
    const text = `flowchart LR
A --> B
%% @layout-constraints v1
%% B east-of A, 180
%% @end-layout-constraints`;

    setDiagramText('bbox-test-2', text);
    const nodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 100, width: 120, height: 40 },
      { id: 'B', x: 300, y: 100, width: 120, height: 40 },
    ];
    const solved = applyConstraintsToNodes(nodes, 'bbox-test-2');

    const A = solved.find((n) => n.id === 'A')!;
    const B = solved.find((n) => n.id === 'B')!;

    // B east-of A, 180 (edge-to-edge): B.x = A.x + (A.w + B.w)/2 + 180 = 100 + 120 + 180 = 400
    expect(B.x).toBeCloseTo(A.x + (A.width + B.width) / 2 + 180, 0);
    expect(bbox(B).left).toBeGreaterThan(bbox(A).right);
  });
});

// ── No-overlap assertions ─────────────────────────────────────────────────────

describe('bounding boxes do not overlap after constraint solving', () => {
  it('two nodes placed south-of and east-of do not overlap', () => {
    const text = `flowchart TD
A --> B
A --> C
%% @layout-constraints v1
%% B south-of A, 100
%% C east-of A, 200
%% @end-layout-constraints`;

    setDiagramText('nooverlap-1', text);
    const nodes: LayoutNode[] = [
      { id: 'A', x: 200, y:  60, width: 120, height: 40 },
      { id: 'B', x: 200, y: 160, width: 120, height: 40 },
      { id: 'C', x: 400, y: 160, width: 120, height: 40 },
    ];
    const solved = applyConstraintsToNodes(nodes, 'nooverlap-1');

    expect(overlaps(solved[0], solved[1])).toBe(false);
    expect(overlaps(solved[0], solved[2])).toBe(false);
    expect(overlaps(solved[1], solved[2])).toBe(false);
  });

  it('aligned nodes do not overlap when positioned correctly', () => {
    const text = `flowchart TD
A --> B
B --> C
%% @layout-constraints v1
%% align A, B, v
%% C south-of B, 100
%% @end-layout-constraints`;

    setDiagramText('nooverlap-2', text);
    const nodes: LayoutNode[] = [
      { id: 'A', x: 200, y:  60, width: 120, height: 40 },
      { id: 'B', x: 200, y: 160, width: 120, height: 40 },
      { id: 'C', x: 200, y: 260, width: 120, height: 40 },
    ];
    const solved = applyConstraintsToNodes(nodes, 'nooverlap-2');

    for (let i = 0; i < solved.length; i++) {
      for (let j = i + 1; j < solved.length; j++) {
        expect(overlaps(solved[i], solved[j])).toBe(false);
      }
    }
  });
});

// ── reRouteEdgesInSVG ─────────────────────────────────────────────────────────

function makeEdgeSvg(
  nodes: Array<{ id: string; transform: string }>,
  paths: Array<{ id: string; d: string }>,
): Element {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const { id, transform } of nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    g.setAttribute('transform', transform);
    svg.appendChild(g);
  }
  const edgePaths = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  edgePaths.setAttribute('class', 'edgePaths');
  for (const { id, d } of paths) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', id);
    path.setAttribute('d', d);
    edgePaths.appendChild(path);
  }
  svg.appendChild(edgePaths);
  return svg;
}

describe('reRouteEdgesInSVG', () => {
  it('rewrites path to straight line between node border points after movement', () => {
    const diagramId = 'test-diagram';
    const svgEl = makeEdgeSvg(
      [
        { id: 'A', transform: 'translate(100, 20)' },
        { id: 'B', transform: 'translate(100, 180)' },
      ],
      [{ id: `${diagramId}-L_A_B_0`, d: 'M 100,40 L 100,160' }],
    );

    const originalNodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 20,  width: 80, height: 40 },
      { id: 'B', x: 100, y: 180, width: 80, height: 40 },
    ];
    // A moves right 50px; B moves down 30px
    const solvedNodes: LayoutNode[] = [
      { id: 'A', x: 150, y: 20,  width: 80, height: 40 },
      { id: 'B', x: 100, y: 210, width: 80, height: 40 },
    ];

    reRouteEdgesInSVG(svgEl, originalNodes, solvedNodes, [{ id: 'L_A_B_0', start: 'A', end: 'B' }], diagramId);

    const d = svgEl.querySelector(`[id="${diagramId}-L_A_B_0"]`)?.getAttribute('d') ?? '';
    const nums = d.match(/-?[\d.]+/g)?.map(Number) ?? [];

    // Path is a straight line: M <exit> L <entry> — exactly 4 numbers
    expect(nums).toHaveLength(4);

    // Start point must lie on A's border
    const [x0, y0] = nums;
    const A = solvedNodes[0];
    const onABorder =
      (Math.abs(x0 - A.x) <= A.width / 2 + 0.5) &&
      (Math.abs(y0 - A.y) <= A.height / 2 + 0.5) &&
      (Math.abs(x0 - A.x) === A.width / 2 || Math.abs(y0 - A.y) === A.height / 2);
    expect(onABorder).toBe(true);

    // End point must be near B's border (within ARROW_MARGIN of it)
    const [x1, y1] = [nums[2], nums[3]];
    const B = solvedNodes[1];
    const nearBBorder =
      (Math.abs(x1 - B.x) <= B.width / 2 + 2 + 0.5) &&
      (Math.abs(y1 - B.y) <= B.height / 2 + 2 + 0.5);
    expect(nearBBorder).toBe(true);
  });

  it('preserves a cubic-bezier curve shape rather than replacing with a straight line', () => {
    const diagramId = 'curve-test';
    // Nodes laid out horizontally; edge has a bezier arc looping below them.
    const svgEl = makeEdgeSvg(
      [
        { id: 'A', transform: 'translate(100, 40)' },
        { id: 'B', transform: 'translate(300, 40)' },
      ],
      [{ id: `${diagramId}-L_A_B_0`, d: 'M140,40 C140,120 260,120 260,40' }],
    );

    const originalNodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 40, width: 80, height: 40 },
      { id: 'B', x: 300, y: 40, width: 80, height: 40 },
    ];
    // A moves right 50px; B is unchanged.
    const solvedNodes: LayoutNode[] = [
      { id: 'A', x: 150, y: 40, width: 80, height: 40 },
      { id: 'B', x: 300, y: 40, width: 80, height: 40 },
    ];

    reRouteEdgesInSVG(svgEl, originalNodes, solvedNodes, [{ id: 'L_A_B_0', start: 'A', end: 'B' }], diagramId);

    const d = svgEl.querySelector(`[id="${diagramId}-L_A_B_0"]`)?.getAttribute('d') ?? '';

    // The path must still be a cubic bezier (contains a C command), not a straight line.
    expect(d).toMatch(/[Cc]/);

    // The new start point must lie on A's border (translated path starts at new exit point).
    const startMatch = /^M([-\d.]+),([-\d.]+)/.exec(d);
    expect(startMatch).not.toBeNull();
    if (startMatch) {
      const sx = parseFloat(startMatch[1]);
      const sy = parseFloat(startMatch[2]);
      const A = solvedNodes[0];
      // Start must be within A's bounding box borders.
      expect(sx).toBeGreaterThanOrEqual(A.x - A.width / 2 - 0.5);
      expect(sx).toBeLessThanOrEqual(A.x + A.width / 2 + 0.5);
      expect(sy).toBeGreaterThanOrEqual(A.y - A.height / 2 - 0.5);
      expect(sy).toBeLessThanOrEqual(A.y + A.height / 2 + 0.5);
    }
  });

  it('leaves path unchanged when no nodes moved', () => {
    const diagramId = 'noop-diagram';
    const originalD = 'M 100,40 L 100,160';
    const svgEl = makeEdgeSvg(
      [],
      [{ id: `${diagramId}-L_A_B_0`, d: originalD }],
    );

    const nodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 20, width: 80, height: 40 },
      { id: 'B', x: 100, y: 180, width: 80, height: 40 },
    ];

    reRouteEdgesInSVG(svgEl, nodes, nodes, [{ id: 'L_A_B_0', start: 'A', end: 'B' }], diagramId);

    const d = svgEl.querySelector(`[id="${diagramId}-L_A_B_0"]`)?.getAttribute('d');
    expect(d).toBe(originalD);
  });

  it('edge start point touches source node border after rerouting', () => {
    const diagramId = 'border-test';
    // Nodes centered at (200, 40) and (200, 180), height=40, so top/bottom borders at y±20
    // Edge starts at bottom of A: y=60; ends at top of B: y=160
    const svgEl = makeEdgeSvg(
      [
        { id: 'A', transform: 'translate(200, 40)' },
        { id: 'B', transform: 'translate(200, 180)' },
      ],
      [{ id: `${diagramId}-L_A_B_0`, d: 'M 200,60 L 200,160' }],
    );

    const originalNodes: LayoutNode[] = [
      { id: 'A', x: 200, y: 40,  width: 120, height: 40 },
      { id: 'B', x: 200, y: 180, width: 120, height: 40 },
    ];
    // Both nodes shift right by 80px (same delta = no distortion)
    const solvedNodes: LayoutNode[] = [
      { id: 'A', x: 280, y: 40,  width: 120, height: 40 },
      { id: 'B', x: 280, y: 180, width: 120, height: 40 },
    ];

    reRouteEdgesInSVG(svgEl, originalNodes, solvedNodes, [{ id: 'L_A_B_0', start: 'A', end: 'B' }], diagramId);

    const d = svgEl.querySelector(`[id="${diagramId}-L_A_B_0"]`)?.getAttribute('d') ?? '';
    const nums = d.match(/-?[\d.]+/g)?.map(Number) ?? [];
    // After rerouting: start=(280,60) — A's bottom center, end≈(280,160) — near B's top center
    expect(nums[0]).toBeCloseTo(280, 0); // start x
    expect(nums[1]).toBeCloseTo(60, 0);  // start y = A.bottom
    expect(nums[2]).toBeCloseTo(280, 0); // end x
    // end y is pulled back by ARROW_MARGIN from B's top border (160), so ≈158
    expect(nums[3]).toBeCloseTo(158, 0);

    // Start point (280, 60) should be on the border of solved node A (center 280,40, h=40)
    const srcNode = solvedNodes.find((n) => n.id === 'A')!;
    const startX = nums[0];
    const startY = nums[1];
    const onBorder =
      Math.abs(startX - srcNode.x) <= srcNode.width / 2 &&
      (Math.abs(startY - (srcNode.y - srcNode.height / 2)) < 1 ||
       Math.abs(startY - (srcNode.y + srcNode.height / 2)) < 1);
    expect(onBorder).toBe(true);
  });
});

// ── Layout loader registration ────────────────────────────────────────────────

describe('constraintLayouts loader', () => {
  it('default export is an array with constrained-dagre entry', async () => {
    const { default: constraintLayouts } = await import('./index.js');
    expect(Array.isArray(constraintLayouts)).toBe(true);
    const entry = constraintLayouts.find(l => l.name === 'constrained-dagre');
    expect(entry).toBeDefined();
    expect(typeof entry?.loader).toBe('function');
  });

  it('loader resolves to an object with a render method', async () => {
    const { default: constraintLayouts } = await import('./index.js');
    const entry = constraintLayouts.find(l => l.name === 'constrained-dagre')!;
    const algorithm = await entry.loader();
    expect(typeof algorithm.render).toBe('function');
  });
});

// ── buildSplinePath ───────────────────────────────────────────────────────────

describe('buildSplinePath', () => {
  it('returns empty string for no points', () => {
    expect(buildSplinePath([])).toBe('');
  });

  it('returns a move-only path for a single point', () => {
    expect(buildSplinePath([{ x: 10, y: 20 }])).toBe('M10,20');
  });

  it('returns M…L for exactly two points', () => {
    const d = buildSplinePath([{ x: 0, y: 0 }, { x: 100, y: 100 }]);
    expect(d).toBe('M0,0L100,100');
  });

  it('returns M…C…C… (cubic bezier) for three or more points', () => {
    const d = buildSplinePath([
      { x: 0, y: 0 },
      { x: 100, y: 100 },
      { x: 200, y: 0 },
    ]);
    expect(d).toMatch(/^M/);
    expect(d).toMatch(/C/); // contains at least one cubic bezier command
  });

  it('path starts at the first point', () => {
    const d = buildSplinePath([{ x: 50, y: 75 }, { x: 150, y: 75 }, { x: 250, y: 75 }]);
    expect(d).toMatch(/^M50,75/);
  });

  it('catmull-rom passes through the interior point (3-point case)', () => {
    // Three collinear points: the spline should be a nearly-straight line
    // with the middle point as the endpoint of the first bezier segment.
    const p0 = { x: 0, y: 0 };
    const p1 = { x: 100, y: 0 };
    const p2 = { x: 200, y: 0 };
    const d = buildSplinePath([p0, p1, p2]);
    // The first C command endpoint is (100, 0) — the middle point.
    const m = /C[\d.,]+(100),(0)/.exec(d.replace(/\s/g, ''));
    expect(m).not.toBeNull();
  });
});

// ── routeEdgeThroughWaypoints ─────────────────────────────────────────────────

function makeWaypointSvg(
  nodes: Array<{ id: string; transform: string }>,
  path: { id: string; d: string },
  label?: { dataId: string; transform: string },
): Element {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  for (const { id, transform } of nodes) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('id', id);
    g.setAttribute('transform', transform);
    svg.appendChild(g);
  }
  const pathEl = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  pathEl.setAttribute('id', path.id);
  pathEl.setAttribute('d', path.d);
  svg.appendChild(pathEl);
  if (label) {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-id', label.dataId);
    g.setAttribute('transform', label.transform);
    svg.appendChild(g);
  }
  return svg;
}

describe('routeEdgeThroughWaypoints', () => {
  it('with one waypoint: path passes through the waypoint position', () => {
    const src: LayoutNode = { id: 'A', x: 100, y: 100, width: 80, height: 40 };
    const tgt: LayoutNode = { id: 'B', x: 400, y: 100, width: 80, height: 40 };
    const waypoint = { x: 250, y: 200 }; // waypoint below the midline

    const svgEl = makeWaypointSvg(
      [{ id: 'A', transform: 'translate(100,100)' }, { id: 'B', transform: 'translate(400,100)' }],
      { id: 'test-L_A_B_0', d: 'M140,100L360,100' },
    );
    const pathEl = svgEl.querySelector('[id="test-L_A_B_0"]')!;

    routeEdgeThroughWaypoints(svgEl, pathEl, 'L_A_B_0', [waypoint], src, tgt);

    const d = pathEl.getAttribute('d') ?? '';
    // The path must contain cubic bezier commands (catmull-rom → bezier).
    expect(d).toMatch(/C/);
    // The waypoint (250, 200) is an interior endpoint of the catmull-rom spline
    // and must appear as the endpoint of the first bezier segment.
    expect(d).toMatch(/250/);
    expect(d).toMatch(/200/);
  });

  it('with two waypoints: path passes through both in order', () => {
    const src: LayoutNode = { id: 'A', x: 50, y: 100, width: 60, height: 40 };
    const tgt: LayoutNode = { id: 'B', x: 350, y: 100, width: 60, height: 40 };
    const wp1 = { x: 150, y: 200 };
    const wp2 = { x: 250, y: 200 };

    const svgEl = makeWaypointSvg(
      [],
      { id: 'diag-L_A_B_0', d: 'M80,100L320,100' },
    );
    const pathEl = svgEl.querySelector('[id="diag-L_A_B_0"]')!;

    routeEdgeThroughWaypoints(svgEl, pathEl, 'L_A_B_0', [wp1, wp2], src, tgt);

    const d = pathEl.getAttribute('d') ?? '';
    // Both waypoint x-coordinates must appear in the path.
    expect(d).toMatch(/150/);
    expect(d).toMatch(/250/);
    // Two C commands for the three segments (exit→wp1, wp1→wp2, wp2→entry).
    const cCount = (d.match(/C/g) ?? []).length;
    expect(cCount).toBeGreaterThanOrEqual(2);
  });

  it('with no waypoints: produces a straight line between border points', () => {
    const src: LayoutNode = { id: 'A', x: 100, y: 40, width: 80, height: 40 };
    const tgt: LayoutNode = { id: 'B', x: 100, y: 200, width: 80, height: 40 };

    const svgEl = makeWaypointSvg([], { id: 'diag-L_A_B_0', d: 'M100,60L100,180' });
    const pathEl = svgEl.querySelector('[id="diag-L_A_B_0"]')!;

    routeEdgeThroughWaypoints(svgEl, pathEl, 'L_A_B_0', [], src, tgt);

    const d = pathEl.getAttribute('d') ?? '';
    // No waypoints → 2 points → straight line (M…L).
    expect(d).toMatch(/^M/);
    expect(d).toMatch(/L/);
    expect(d).not.toMatch(/C/);
  });

  it('repositions the edge label to the midpoint', () => {
    const src: LayoutNode = { id: 'A', x: 100, y: 40, width: 80, height: 40 };
    const tgt: LayoutNode = { id: 'B', x: 300, y: 40, width: 80, height: 40 };

    const svgEl = makeWaypointSvg(
      [],
      { id: 'diag-L_A_B_0', d: 'M140,40L260,40' },
      { dataId: 'L_A_B_0', transform: 'translate(200,40)' },
    );
    const pathEl = svgEl.querySelector('[id="diag-L_A_B_0"]')!;

    routeEdgeThroughWaypoints(svgEl, pathEl, 'L_A_B_0', [], src, tgt);

    // Label should be repositioned.
    const labelTransform = svgEl.querySelector('[data-id="L_A_B_0"]')?.getAttribute('transform') ?? '';
    expect(labelTransform).toMatch(/translate/);
  });
});

// ── buildWaypointNodes ────────────────────────────────────────────────────────

describe('buildWaypointNodes', () => {
  it('creates a zero-size node for a valid waypoint declaration', () => {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    // Add a path for the A-->B edge with midpoint at (200, 100)
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('id', 'diag-L_A_B_0');
    path.setAttribute('d', 'M100,100L300,100');
    svgEl.appendChild(path);

    const decl: WaypointDeclaration = {
      type: 'waypoint',
      id: 'wp:A-->B:wp1',
      edgeId: 'A-->B',
      waypointId: 'wp1',
    };
    const edges = [{ id: 'L_A_B_0', start: 'A', end: 'B' }];
    const existingNodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 100, width: 80, height: 40 },
      { id: 'B', x: 300, y: 100, width: 80, height: 40 },
    ];

    const result = buildWaypointNodes([decl], edges, svgEl, 'diag', existingNodes);

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('wp1');
    expect(result[0].width).toBe(0);
    expect(result[0].height).toBe(0);
    expect(result[0].isWaypoint).toBe(true);
    // Initial position is the midpoint of the path M100,100L300,100 → (200, 100)
    expect(result[0].x).toBeCloseTo(200, 0);
    expect(result[0].y).toBeCloseTo(100, 0);
  });

  it('falls back to node-center midpoint when edge path is not found', () => {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');

    const decl: WaypointDeclaration = {
      type: 'waypoint',
      id: 'wp:A-->B:wp1',
      edgeId: 'A-->B',
      waypointId: 'wp1',
    };
    const existingNodes: LayoutNode[] = [
      { id: 'A', x: 100, y: 100, width: 80, height: 40 },
      { id: 'B', x: 300, y: 200, width: 80, height: 40 },
    ];

    const result = buildWaypointNodes([decl], [], svgEl, 'diag', existingNodes);

    expect(result).toHaveLength(1);
    expect(result[0].x).toBeCloseTo(200, 0); // (100+300)/2
    expect(result[0].y).toBeCloseTo(150, 0); // (100+200)/2
  });

  it('returns empty array when no waypoint declarations given', () => {
    const svgEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const result = buildWaypointNodes([], [], svgEl, 'diag', []);
    expect(result).toHaveLength(0);
  });
});

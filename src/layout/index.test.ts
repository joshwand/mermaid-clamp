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
  setDiagramText,
} from './index.js';
import type { LayoutNode } from '../types.js';

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
    // A should be south-of B by 150: A.y = B.y + 150 = 50 + 150 = 200
    expect(result.find(n => n.id === 'A')?.y).toBeCloseTo(200, 0);
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

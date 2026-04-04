/**
 * Layout engine integration for mermaid-layout-constraints.
 *
 * Architecture:
 * - Registers `constrained-dagre` via mermaid.registerLayoutLoaders()
 * - Our render() calls dagre first to get base positions (via SVG transforms)
 * - Then reads those positions, applies constraint solving, and rewrites transforms
 *
 * Side-channel:
 * - Because mermaid's LayoutData carries no raw diagram text, callers must
 *   register text before rendering via setDiagramText(diagramId, text).
 */

import { parseConstraints } from '../parser/index.js';
import { solveConstraints } from '../solver/index.js';
import type { LayoutAlgorithm, LayoutLoaderDefinition, LayoutNode } from '../types.js';

// ── Side-channel ──────────────────────────────────────────────────────────────

/** diagramId → raw mermaid text (for constraint extraction). */
const diagramTextMap = new Map<string, string>();

/**
 * Register the mermaid source text for a diagram before rendering.
 * Call this before `mermaid.render(diagramId, text)`.
 *
 * @example
 * setDiagramText('my-diagram', text);
 * await mermaid.render('my-diagram', text);
 */
export function setDiagramText(diagramId: string, text: string): void {
  diagramTextMap.set(diagramId, text);
}

// ── SVG transform helpers ─────────────────────────────────────────────────────

const TRANSLATE_RE = /translate\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)/;

/** Minimal CSS identifier escaping for use in querySelector attribute selectors. */
function cssEscapeId(id: string): string {
  // Escape leading digits and characters that need escaping in CSS selectors.
  return id.replace(/([^\w-])/g, '\\$1');
}

/**
 * Parse a `transform="translate(x, y)"` attribute into {x, y}.
 * Returns null if the transform is absent or in an unexpected format.
 */
export function parseTranslate(transform: string | null): { x: number; y: number } | null {
  if (!transform) return null;
  const m = TRANSLATE_RE.exec(transform);
  if (!m) return null;
  return { x: parseFloat(m[1]), y: parseFloat(m[2]) };
}

/**
 * Serialize x, y to a `translate(x, y)` transform string.
 */
export function formatTranslate(x: number, y: number): string {
  return `translate(${x}, ${y})`;
}

// ── Position extraction / application ────────────────────────────────────────

/**
 * Read node center positions from SVG element transforms after dagre has run.
 * Each node `<g>` is found by its `id` attribute (= node.domId after mermaid
 * prepends the diagram ID).
 *
 * Returns only nodes whose SVG element was found and had a parseable transform.
 */
export function extractPositionsFromSVG(
  nodes: Array<{ id: string; domId?: string; width?: number; height?: number; isGroup?: boolean }>,
  svgEl: Element,
): LayoutNode[] {
  const result: LayoutNode[] = [];
  for (const node of nodes) {
    if (node.isGroup) continue; // cluster bounds are handled separately
    const domId = node.domId ?? node.id;
    const el = svgEl.querySelector(`[id="${cssEscapeId(domId)}"]`);
    if (!el) continue;
    const pos = parseTranslate(el.getAttribute('transform'));
    if (!pos) continue;
    result.push({
      id: node.id,
      x: pos.x,
      y: pos.y,
      width: node.width ?? 0,
      height: node.height ?? 0,
    });
  }
  return result;
}

/**
 * Write solved positions back to SVG element transforms.
 */
export function applyPositionsToSVG(
  solved: LayoutNode[],
  svgEl: Element,
  nodeList: Array<{ id: string; domId?: string; isGroup?: boolean }>,
): void {
  const domIdByNodeId = new Map(nodeList.map((n) => [n.id, n.domId ?? n.id]));

  for (const node of solved) {
    const domId = domIdByNodeId.get(node.id);
    if (!domId) continue;
    const el = svgEl.querySelector(`[id="${cssEscapeId(domId)}"]`);
    if (!el) continue;
    const current = el.getAttribute('transform') ?? '';
    // Only replace the translate() part; preserve other transforms (e.g. scale)
    if (TRANSLATE_RE.test(current)) {
      el.setAttribute('transform', current.replace(TRANSLATE_RE, formatTranslate(node.x, node.y)));
    } else {
      el.setAttribute('transform', formatTranslate(node.x, node.y));
    }
  }
}

// ── Constraint application (testable without DOM) ─────────────────────────────

/**
 * Given a list of nodes with positions already set (from extractPositionsFromSVG
 * or from tests), apply constraint solving and return corrected positions.
 */
export function applyConstraintsToNodes(
  nodes: LayoutNode[],
  diagramId: string,
): LayoutNode[] {
  const text = diagramTextMap.get(diagramId);
  if (!text) return nodes;
  const cs = parseConstraints(text);
  if (cs.constraints.length === 0) return nodes;
  return solveConstraints(nodes, cs);
}

// ── Layout algorithm ──────────────────────────────────────────────────────────

/**
 * Lazily-loaded dagre render function.
 * Resolved once and cached to avoid repeated dynamic imports.
 */
let dagreRenderCache: ((data: unknown, svg: unknown) => Promise<void>) | null = null;

async function getDagreRender(): Promise<(data: unknown, svg: unknown) => Promise<void>> {
  if (dagreRenderCache) return dagreRenderCache;
  // mermaid bundles dagre in a versioned chunk. We import via the wildcard
  // export path. Version is pinned in package.json (mermaid ^11.x).
  // mermaid internal
  const mod = await import(
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore — chunk path; no type declarations
    'mermaid/dist/chunks/mermaid.core/dagre-KV5264BT.mjs'
  );
  dagreRenderCache = mod.render as (data: unknown, svg: unknown) => Promise<void>;
  return dagreRenderCache;
}

/**
 * The constrained-dagre layout algorithm object.
 * Matches mermaid's LayoutAlgorithm interface.
 */
const constrainedDagreAlgorithm = {
  async render(
    layoutData: {
      nodes: Array<{ id: string; domId?: string; width?: number; height?: number; isGroup?: boolean }>;
      diagramId?: string;
      [key: string]: unknown;
    },
    svg: unknown,
    _helpers: unknown,
    _options: unknown,
  ): Promise<void> {
    // Step 1: Run base dagre layout (mutates SVG, sets transforms on node elements).
    const dagreRender = await getDagreRender();
    await dagreRender(layoutData, svg);

    // Step 2: Check if there are constraints to apply.
    const diagramId = layoutData.diagramId ?? '';
    const text = diagramTextMap.get(diagramId);
    if (!text) return;
    const cs = parseConstraints(text);
    if (cs.constraints.length === 0) return;

    // Step 3: Read positions from SVG transforms (dagre wrote them there).
    const svgEl = (svg as { node(): Element }).node();
    const nodes = extractPositionsFromSVG(layoutData.nodes, svgEl);
    if (nodes.length === 0) return;

    // Step 4: Solve constraints.
    const solved = solveConstraints(nodes, cs);

    // Step 5: Write corrected positions back to SVG transforms.
    applyPositionsToSVG(solved, svgEl, layoutData.nodes);
  },
};

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Layout loader definitions for mermaid.registerLayoutLoaders().
 *
 * @example
 * import mermaid from 'mermaid';
 * import constraintLayouts from 'mermaid-layout-constraints';
 * mermaid.registerLayoutLoaders(constraintLayouts);
 */
const constraintLayouts: LayoutLoaderDefinition[] = [
  {
    name: 'constrained-dagre',
    loader: async () => constrainedDagreAlgorithm as LayoutAlgorithm,
  },
];

export default constraintLayouts;

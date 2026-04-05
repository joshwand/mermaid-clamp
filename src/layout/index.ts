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

/** Accumulated warnings from the most recent render(s). */
const pendingWarnings: string[] = [];

/**
 * Return and clear all warnings accumulated since the last call.
 * Call this after `mermaid.render()` to surface parser warnings.
 */
export function getAndClearWarnings(): string[] {
  return pendingWarnings.splice(0);
}

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

    // Prefer dimensions from the SVG rect (mermaid's layoutData often has
    // width=0/height=0); fall back to layoutData values if the rect is absent.
    let width = node.width ?? 0;
    let height = node.height ?? 0;
    const rectEl = el.querySelector('rect');
    if (rectEl) {
      const rw = parseFloat(rectEl.getAttribute('width') ?? '');
      const rh = parseFloat(rectEl.getAttribute('height') ?? '');
      if (!isNaN(rw) && rw > 0) width = rw;
      if (!isNaN(rh) && rh > 0) height = rh;
    }

    result.push({
      id: node.id,
      x: pos.x,
      y: pos.y,
      width,
      height,
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

// ── Edge re-routing ───────────────────────────────────────────────────────────

/**
 * Extract all numbers from an SVG path `d` attribute, with their positions in
 * the string. Returns an array of {value, start, end} objects in source order.
 */
function extractPathNumbers(d: string): Array<{ value: number; start: number; end: number }> {
  const re = /-?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;
  const nums: Array<{ value: number; start: number; end: number }> = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    nums.push({ value: parseFloat(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return nums;
}

/**
 * Translate an SVG path's coordinate pairs so the first pair moves by
 * `srcDelta` and the last pair moves by `tgtDelta`. Intermediate pairs are
 * linearly interpolated. The path string is rebuilt in-place (same format,
 * same number of decimal places rounded to 2dp).
 *
 * Assumes dagre-style paths where all numbers appear as (x, y) pairs in order
 * (M, L, C, Q commands with absolute coordinates — no H/V/Z/A).
 */
function translatePath(
  d: string,
  srcDelta: { dx: number; dy: number },
  tgtDelta: { dx: number; dy: number },
): string {
  const nums = extractPathNumbers(d);
  const nPairs = Math.floor(nums.length / 2);
  if (nPairs === 0) return d;

  // Compute shifted values
  const newValues = nums.map((n) => n.value);
  for (let i = 0; i < nPairs; i++) {
    const t = nPairs === 1 ? 0.5 : i / (nPairs - 1);
    newValues[i * 2] += srcDelta.dx * (1 - t) + tgtDelta.dx * t;
    newValues[i * 2 + 1] += srcDelta.dy * (1 - t) + tgtDelta.dy * t;
  }

  // Rebuild the string, replacing each number token in-place
  let result = '';
  let lastEnd = 0;
  for (let i = 0; i < nums.length; i++) {
    result += d.slice(lastEnd, nums[i].start);
    result += (Math.round(newValues[i] * 100) / 100).toString();
    lastEnd = nums[i].end;
  }
  result += d.slice(lastEnd);
  return result;
}

interface EdgeDataEntry {
  id?: string;
  start?: string;
  end?: string;
  v?: string; // graphlib convention
  w?: string; // graphlib convention
  [key: string]: unknown;
}

/**
 * After constraint solving moves nodes, update edge `<path d="...">` attributes
 * so edges remain connected to their (new) node positions.
 *
 * Uses delta interpolation: path start is translated by the source node's
 * positional delta, path end by the target node's delta, intermediate
 * coordinate pairs are linearly interpolated.
 */
export function reRouteEdgesInSVG(
  svgEl: Element,
  originalNodes: LayoutNode[],
  solvedNodes: LayoutNode[],
  edges: EdgeDataEntry[],
  diagramId: string,
): void {
  // Build delta map: nodeId → {dx, dy}
  const originalMap = new Map(originalNodes.map((n) => [n.id, n]));
  const deltaMap = new Map<string, { dx: number; dy: number }>();
  for (const solved of solvedNodes) {
    const orig = originalMap.get(solved.id);
    if (orig) {
      deltaMap.set(solved.id, { dx: solved.x - orig.x, dy: solved.y - orig.y });
    }
  }

  for (const edge of edges) {
    const srcId = edge.start ?? edge.v;
    const tgtId = edge.end ?? edge.w;
    if (!srcId || !tgtId) continue;

    const srcDelta = deltaMap.get(srcId) ?? { dx: 0, dy: 0 };
    const tgtDelta = deltaMap.get(tgtId) ?? { dx: 0, dy: 0 };
    if (srcDelta.dx === 0 && srcDelta.dy === 0 && tgtDelta.dx === 0 && tgtDelta.dy === 0) continue;

    // The SVG path element id = "{diagramId}-{edge.id}"
    // edge.id follows the pattern "L_{srcId}_{tgtId}_{counter}" (mermaid flowchart default)
    const edgeId = edge.id ?? `L_${srcId}_${tgtId}_0`;
    const pathEl = svgEl.querySelector(`[id="${cssEscapeId(`${diagramId}-${edgeId}`)}"]`);
    if (!pathEl) continue;

    const d = pathEl.getAttribute('d');
    if (!d) continue;

    pathEl.setAttribute('d', translatePath(d, srcDelta, tgtDelta));

    // Also shift the edge label marker if present (data-id matches edge.id)
    const labelEl = svgEl.querySelector(`[data-id="${cssEscapeId(edgeId)}"]`);
    if (labelEl) {
      const transform = labelEl.getAttribute('transform');
      if (transform) {
        const pos = parseTranslate(transform);
        if (pos) {
          const t = 0.5;
          const dx = srcDelta.dx * (1 - t) + tgtDelta.dx * t;
          const dy = srcDelta.dy * (1 - t) + tgtDelta.dy * t;
          labelEl.setAttribute(
            'transform',
            transform.replace(TRANSLATE_RE, formatTranslate(pos.x + dx, pos.y + dy)),
          );
        }
      }
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

    // Collect parser warnings.
    for (const w of cs.warnings ?? []) pendingWarnings.push(w);

    // Step 3: Read positions from SVG transforms (dagre wrote them there).
    const svgEl = (svg as { node(): Element }).node();
    const nodes = extractPositionsFromSVG(layoutData.nodes, svgEl);
    if (nodes.length === 0) return;

    // Step 4: Solve constraints.
    const solved = solveConstraints(nodes, cs);

    // Step 5: Write corrected positions back to SVG transforms.
    applyPositionsToSVG(solved, svgEl, layoutData.nodes);

    // Step 6: Re-route edge paths so arrows stay connected to their (moved) nodes.
    const edges = (layoutData as { edges?: EdgeDataEntry[] }).edges ?? [];
    reRouteEdgesInSVG(svgEl, nodes, solved, edges, diagramId);
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

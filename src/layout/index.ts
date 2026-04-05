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

const ARROW_MARGIN = 2; // px to pull the path end back from node border for arrowhead

const PATH_CMD_RE = /([MLCQSTAZmlcqstaz])((?:[^MLCQSTAZmlcqstaz])*)/g;

interface PathSegment {
  cmd: string;
  nums: number[];
}

/** Parse an SVG path `d` string into a list of {cmd, nums} segments. */
function parsePathSegments(d: string): PathSegment[] {
  const segments: PathSegment[] = [];
  const re = new RegExp(PATH_CMD_RE.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const rawNums = m[2].trim().match(/-?[\d.]+(?:e[+-]?\d+)?/gi);
    segments.push({ cmd: m[1], nums: rawNums ? rawNums.map(Number) : [] });
  }
  return segments;
}

/** Serialise parsed segments back to a `d` string. */
function buildPathD(segments: PathSegment[]): string {
  const r = (n: number) => Math.round(n * 100) / 100;
  return segments
    .map((s) => (s.nums.length === 0 ? s.cmd : `${s.cmd}${s.nums.map(r).join(',')}`))
    .join('');
}

/**
 * Re-anchor an SVG path so its first coordinate pair moves to `newStart` and
 * its last coordinate pair moves to `newEnd`, with every intermediate coordinate
 * pair receiving a linearly blended delta between the two.
 *
 * This preserves bezier curve shapes: control points near the source move with
 * the source; control points near the target move with the target; no kinks.
 *
 * For A (arc) commands only the endpoint pair (the last 2 of the 7 arc params)
 * participates in blending; rx, ry, rotation and flags are unchanged.
 *
 * Returns null if the path has fewer than two coordinate pairs.
 */
function reanchorPath(
  d: string,
  newStart: { x: number; y: number },
  newEnd: { x: number; y: number },
): string | null {
  const segments = parsePathSegments(d);

  // Build an ordered list of references into segments[].nums that represent
  // coordinate (x,y) pairs — the things we will blend.
  type PairRef = { si: number; ni: number };
  const refs: PairRef[] = [];

  for (let si = 0; si < segments.length; si++) {
    const { cmd, nums } = segments[si];
    const upper = cmd.toUpperCase();
    if (upper === 'Z') continue;
    if (upper === 'A') {
      // Arc: 7 params per segment — only the final (x,y) at offsets 5,6 are coords.
      for (let i = 0; i + 6 < nums.length; i += 7) {
        refs.push({ si, ni: i + 5 });
      }
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        refs.push({ si, ni: i });
      }
    }
  }

  if (refs.length < 2) return null;

  // Compute source and target deltas from the current first/last pairs.
  const newSegs = segments.map((s) => ({ cmd: s.cmd, nums: [...s.nums] }));
  const first = refs[0];
  const last  = refs[refs.length - 1];

  const sourceDelta = {
    x: newStart.x - segments[first.si].nums[first.ni],
    y: newStart.y - segments[first.si].nums[first.ni + 1],
  };
  const targetDelta = {
    x: newEnd.x - segments[last.si].nums[last.ni],
    y: newEnd.y - segments[last.si].nums[last.ni + 1],
  };

  // Apply linearly blended deltas: t=0 → sourceDelta, t=1 → targetDelta.
  const N = refs.length - 1;
  for (let i = 0; i < refs.length; i++) {
    const { si, ni } = refs[i];
    const t = N > 0 ? i / N : 0;
    newSegs[si].nums[ni]     = segments[si].nums[ni]     + sourceDelta.x * (1 - t) + targetDelta.x * t;
    newSegs[si].nums[ni + 1] = segments[si].nums[ni + 1] + sourceDelta.y * (1 - t) + targetDelta.y * t;
  }

  return buildPathD(newSegs);
}

/**
 * Find the point on the border of a rectangle (cx, cy, w, h) that lies on the
 * ray from the rectangle center toward (targetX, targetY). Returns a point on
 * the nearest border face in that direction.
 *
 * For waypoints (w = h = 0) returns the waypoint center.
 */
function rectBorderPoint(
  cx: number,
  cy: number,
  w: number,
  h: number,
  targetX: number,
  targetY: number,
): { x: number; y: number } {
  if (w === 0 && h === 0) return { x: cx, y: cy }; // waypoint

  const dx = targetX - cx;
  const dy = targetY - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy - h / 2 }; // same center

  const halfW = w / 2;
  const halfH = h / 2;
  const best: { x: number; y: number; t: number }[] = [];

  const tryBorder = (t: number, bx: number, by: number) => {
    if (t <= 0) return;
    if (Math.abs(bx - cx) <= halfW + 0.5 && Math.abs(by - cy) <= halfH + 0.5) {
      best.push({ x: bx, y: by, t });
    }
  };

  if (dx !== 0) {
    tryBorder( halfW / dx, cx + halfW, cy + (halfW / dx) * dy);
    tryBorder(-halfW / dx, cx - halfW, cy - (halfW / dx) * dy);
  }
  if (dy !== 0) {
    tryBorder( halfH / dy, cx + (halfH / dy) * dx, cy + halfH);
    tryBorder(-halfH / dy, cx - (halfH / dy) * dx, cy - halfH);
  }

  if (best.length === 0) return { x: cx, y: cy };
  best.sort((a, b) => a.t - b.t);
  return { x: best[0].x, y: best[0].y };
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
 * After constraint solving moves nodes, rewrite edge `<path d="...">` attributes
 * so arrows connect the actual node borders of their (possibly moved) source and
 * target nodes.
 *
 * For each edge the path is replaced with a straight line from the exit point on
 * the source node border to the entry point on the target node border. Both
 * points lie on the rectangle border in the direction of the opposite node center.
 *
 * Edges whose endpoints did not move are left untouched.
 */
export function reRouteEdgesInSVG(
  svgEl: Element,
  originalNodes: LayoutNode[],
  solvedNodes: LayoutNode[],
  edges: EdgeDataEntry[],
  diagramId: string,
): void {
  const originalMap = new Map(originalNodes.map((n) => [n.id, n]));
  const solvedMap   = new Map(solvedNodes.map((n)   => [n.id, n]));

  for (const edge of edges) {
    const srcId = edge.start ?? edge.v;
    const tgtId = edge.end ?? edge.w;
    if (!srcId || !tgtId) continue;

    const src = solvedMap.get(srcId);
    const tgt = solvedMap.get(tgtId);
    if (!src || !tgt) continue;

    // Skip if neither endpoint moved.
    const origSrc = originalMap.get(srcId);
    const origTgt = originalMap.get(tgtId);
    const srcMoved = origSrc ? Math.abs(src.x - origSrc.x) + Math.abs(src.y - origSrc.y) > 0.5 : false;
    const tgtMoved = origTgt ? Math.abs(tgt.x - origTgt.x) + Math.abs(tgt.y - origTgt.y) > 0.5 : false;
    if (!srcMoved && !tgtMoved) continue;

    const edgeId = edge.id ?? `L_${srcId}_${tgtId}_0`;
    const pathEl = svgEl.querySelector(`[id="${cssEscapeId(`${diagramId}-${edgeId}`)}"]`);
    if (!pathEl) continue;

    // Compute where the line src.center → tgt.center intersects each node border.
    const exitPt  = rectBorderPoint(src.x, src.y, src.width, src.height, tgt.x, tgt.y);
    const entryPt = rectBorderPoint(tgt.x, tgt.y, tgt.width, tgt.height, src.x, src.y);

    // Pull the entry point back by ARROW_MARGIN so the arrowhead tip lands on the border.
    const edgeLen = Math.hypot(entryPt.x - exitPt.x, entryPt.y - exitPt.y);
    let adjustedEntry = entryPt;
    if (edgeLen > ARROW_MARGIN) {
      const ux = (entryPt.x - exitPt.x) / edgeLen;
      const uy = (entryPt.y - exitPt.y) / edgeLen;
      adjustedEntry = { x: entryPt.x - ux * ARROW_MARGIN, y: entryPt.y - uy * ARROW_MARGIN };
    }

    const r = (n: number) => Math.round(n * 100) / 100;

    const originalD = pathEl.getAttribute('d');
    const reanchored = originalD ? reanchorPath(originalD, exitPt, adjustedEntry) : null;

    if (!reanchored) {
      // Unparseable or degenerate path — fall back to straight line.
      pathEl.setAttribute(
        'd',
        `M${r(exitPt.x)},${r(exitPt.y)}L${r(adjustedEntry.x)},${r(adjustedEntry.y)}`,
      );
    } else {
      // Smooth re-anchor: start/end move to new border points, intermediate
      // control points blend linearly so no bezier kinks are introduced.
      pathEl.setAttribute('d', reanchored);
    }

    // Move edge label to the midpoint of the new path.
    const labelEl = svgEl.querySelector(`[data-id="${cssEscapeId(edgeId)}"]`);
    if (labelEl) {
      const transform = labelEl.getAttribute('transform');
      if (transform) {
        const midX = (exitPt.x + entryPt.x) / 2;
        const midY = (exitPt.y + entryPt.y) / 2;
        const pos = parseTranslate(transform);
        if (pos) {
          labelEl.setAttribute('transform', transform.replace(TRANSLATE_RE, formatTranslate(midX, midY)));
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

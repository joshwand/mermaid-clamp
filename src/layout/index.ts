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

import { parseConstraints, splitEdgeId } from '../parser/index.js';
import { solveConstraints } from '../solver/index.js';
import type { BezierHandleConstraint, LayoutAlgorithm, LayoutLoaderDefinition, LayoutNode, WaypointDeclaration } from '../types.js';

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

/**
 * Maximum bezier handle length as a fraction of the edge chord length.
 * Handles longer than this fraction cause visible bulging on short or nearly-
 * straight edges, so we clamp them.
 */
const MAX_HANDLE_FRACTION = 0.4;

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
 * its last coordinate pair moves to `newEnd`.
 *
 * Uses a 2D similarity transform (uniform scale + rotation + translation) that
 * exactly maps oldStart→newStart and oldEnd→newEnd. Every intermediate control
 * point is transformed by the same matrix, so the bezier curve shape is
 * preserved exactly — it just scales and rotates to fit the new endpoints.
 * No kinks, no linear blending distortion.
 *
 * Falls back to a linear positional blend when the original path is degenerate
 * (start === end, i.e. zero-length).
 *
 * For A (arc) commands only the endpoint pair (the last 2 of the 7 arc params)
 * participates in the transform; rx, ry, rotation and flags are unchanged.
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
  // coordinate (x,y) pairs — the coordinates we will transform.
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

  const newSegs = segments.map((s) => ({ cmd: s.cmd, nums: [...s.nums] }));
  const first = refs[0];
  const last  = refs[refs.length - 1];

  const oldStart = {
    x: segments[first.si].nums[first.ni],
    y: segments[first.si].nums[first.ni + 1],
  };
  const oldEnd = {
    x: segments[last.si].nums[last.ni],
    y: segments[last.si].nums[last.ni + 1],
  };

  const oldDx = oldEnd.x - oldStart.x;
  const oldDy = oldEnd.y - oldStart.y;
  const oldLen = Math.hypot(oldDx, oldDy);

  const newDx = newEnd.x - newStart.x;
  const newDy = newEnd.y - newStart.y;
  const newLen = Math.hypot(newDx, newDy);

  if (oldLen < 0.01) {
    // Degenerate original path (start === end): fall back to positional blend.
    const N = refs.length - 1;
    for (let i = 0; i < refs.length; i++) {
      const { si, ni } = refs[i];
      const t = N > 0 ? i / N : 0;
      newSegs[si].nums[ni]     = newStart.x * (1 - t) + newEnd.x * t;
      newSegs[si].nums[ni + 1] = newStart.y * (1 - t) + newEnd.y * t;
    }
    return buildPathD(newSegs);
  }

  // Similarity transform: scale = newLen/oldLen, rotate = angle(new) - angle(old).
  // Transform each point P:
  //   1. Translate origin to oldStart
  //   2. Scale by `scale`
  //   3. Rotate by `theta`
  //   4. Translate to newStart
  // This maps oldStart → newStart and oldEnd → newEnd exactly.
  const scale    = newLen / oldLen;
  const oldAngle = Math.atan2(oldDy, oldDx);
  const newAngle = Math.atan2(newDy, newDx);
  const theta    = newAngle - oldAngle;
  const cosT     = Math.cos(theta);
  const sinT     = Math.sin(theta);

  for (const { si, ni } of refs) {
    const px = segments[si].nums[ni]     - oldStart.x;
    const py = segments[si].nums[ni + 1] - oldStart.y;
    // Scale then rotate then translate.
    newSegs[si].nums[ni]     = newStart.x + scale * (px * cosT - py * sinT);
    newSegs[si].nums[ni + 1] = newStart.y + scale * (px * sinT + py * cosT);
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
 * After `reanchorPath` re-maps a bezier curve to new endpoints, its first and
 * last bezier control points may point in the wrong direction because the
 * similarity transform preserved the original shape orientation. This function
 * clamps:
 *
 * 1. The first control point (cp1 of the first C command) so that the curve
 *    exits `exitPt` in the direction of `adjustedEntry` (toward the target).
 * 2. The last control point (cp2 of the last C command) so that the curve
 *    arrives at `adjustedEntry` from the direction of `exitPt`.
 * 3. All first/last handle lengths to at most `MAX_HANDLE_FRACTION * edgeLen`
 *    to prevent bulging curves on short or nearly-straight edges.
 *
 * Paths with no C command are returned unchanged.
 */
export function clampEndpointHandles(
  d: string,
  exitPt: { x: number; y: number },
  adjustedEntry: { x: number; y: number },
): string {
  const edgeDx = adjustedEntry.x - exitPt.x;
  const edgeDy = adjustedEntry.y - exitPt.y;
  const edgeLen = Math.hypot(edgeDx, edgeDy);
  if (edgeLen < 0.01) return d;

  const segments = parsePathSegments(d);
  const newSegs = segments.map((s) => ({ cmd: s.cmd, nums: [...s.nums] }));
  const maxHandleLen = edgeLen * MAX_HANDLE_FRACTION;

  const ux = edgeDx / edgeLen; // unit vector exit→entry
  const uy = edgeDy / edgeLen;

  // Clamp the first control point (cp1) of the first C command to exit along edge direction.
  for (let si = 0; si < newSegs.length; si++) {
    if (newSegs[si].cmd.toUpperCase() !== 'C') continue;
    const origLen = Math.hypot(newSegs[si].nums[0] - exitPt.x, newSegs[si].nums[1] - exitPt.y);
    const handleLen = Math.min(origLen, maxHandleLen);
    newSegs[si].nums[0] = exitPt.x + ux * handleLen;
    newSegs[si].nums[1] = exitPt.y + uy * handleLen;
    break;
  }

  // Clamp the last control point (cp2) of the last C command to arrive along edge direction.
  for (let si = newSegs.length - 1; si >= 0; si--) {
    if (newSegs[si].cmd.toUpperCase() !== 'C') continue;
    const n = newSegs[si].nums.length;
    // Last cubic in this segment: cp2 at [n-4, n-3], endpoint at [n-2, n-1].
    const epx = newSegs[si].nums[n - 2];
    const epy = newSegs[si].nums[n - 1];
    const origLen = Math.hypot(newSegs[si].nums[n - 4] - epx, newSegs[si].nums[n - 3] - epy);
    const handleLen = Math.min(origLen, maxHandleLen);
    // cp2 sits "behind" the endpoint in the incoming direction (= -edge direction).
    newSegs[si].nums[n - 4] = epx - ux * handleLen;
    newSegs[si].nums[n - 3] = epy - uy * handleLen;
    break;
  }

  return buildPathD(newSegs);
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
      // Then clamp the endpoint handles so the curve exits/enters along the
      // edge direction and short edges don't develop unnecessary bulges.
      pathEl.setAttribute('d', clampEndpointHandles(reanchored, exitPt, adjustedEntry));
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

// ── Waypoint edge routing ─────────────────────────────────────────────────────

/**
 * Catmull-rom tension factor for bezier handle length.
 * Standard catmull-rom uses 1/6 ≈ 0.167 (shorter, tighter handles).
 * Higher values produce longer handles and more pronounced, smoother curves.
 */
const SPLINE_TENSION = 1 / 3;

/**
 * Per-point handle length overrides for `buildSplinePath`.
 * `outLen` overrides the cp1 length for the segment *leaving* this point.
 * `inLen` overrides the cp2 length for the segment *arriving at* this point.
 * The catmull-rom tangent direction is always preserved; only the length changes.
 */
export interface HandleOverride {
  outLen?: number;
  inLen?: number;
}

/**
 * Build a smooth catmull-rom spline SVG path through an ordered sequence of
 * points. Interior points are passed through exactly; endpoints have zero
 * tangent (the phantom endpoints are duplicated).
 *
 * `handleOverrides` is a sparse array (same length as `points`) where each
 * element can override the outgoing and/or incoming handle lengths for that
 * point. Unspecified lengths fall back to the standard catmull-rom value.
 *
 * Returns an SVG `d` string.
 */
export function buildSplinePath(
  points: Array<{ x: number; y: number }>,
  handleOverrides?: Array<HandleOverride | undefined>,
): string {
  if (points.length === 0) return '';
  const r = (n: number) => Math.round(n * 100) / 100;

  if (points.length === 1) {
    return `M${r(points[0].x)},${r(points[0].y)}`;
  }

  if (points.length === 2) {
    return `M${r(points[0].x)},${r(points[0].y)}L${r(points[1].x)},${r(points[1].y)}`;
  }

  // Convert catmull-rom to cubic bezier for each segment.
  // Phantom endpoints: p[-1] = p[0], p[n] = p[n-1].
  let d = `M${r(points[0].x)},${r(points[0].y)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    // Catmull-rom tangent for cp1 (outgoing from p1): direction = p2 - p0.
    const t1x = p2.x - p0.x;
    const t1y = p2.y - p0.y;
    const t1len = Math.hypot(t1x, t1y);

    const outLenOverride = handleOverrides?.[i]?.outLen;
    let cp1x: number;
    let cp1y: number;
    if (t1len < 0.01) {
      cp1x = p1.x;
      cp1y = p1.y;
    } else if (outLenOverride !== undefined) {
      cp1x = p1.x + (t1x / t1len) * outLenOverride;
      cp1y = p1.y + (t1y / t1len) * outLenOverride;
    } else {
      cp1x = p1.x + t1x * SPLINE_TENSION;
      cp1y = p1.y + t1y * SPLINE_TENSION;
    }

    // Catmull-rom tangent for cp2 (incoming to p2): direction = -(p3 - p1).
    const t2x = p3.x - p1.x;
    const t2y = p3.y - p1.y;
    const t2len = Math.hypot(t2x, t2y);

    const inLenOverride = handleOverrides?.[i + 1]?.inLen;
    let cp2x: number;
    let cp2y: number;
    if (t2len < 0.01) {
      cp2x = p2.x;
      cp2y = p2.y;
    } else if (inLenOverride !== undefined) {
      cp2x = p2.x - (t2x / t2len) * inLenOverride;
      cp2y = p2.y - (t2y / t2len) * inLenOverride;
    } else {
      cp2x = p2.x - t2x * SPLINE_TENSION;
      cp2y = p2.y - t2y * SPLINE_TENSION;
    }

    d += `C${r(cp1x)},${r(cp1y)},${r(cp2x)},${r(cp2y)},${r(p2.x)},${r(p2.y)}`;
  }
  return d;
}

/**
 * Re-route a single edge `<path>` element through an ordered sequence of
 * waypoint positions.
 *
 * The path becomes: exitPt(src) → wp[0] → wp[1] → … → adjustedEntry(tgt).
 *
 * Both exitPt and entryPt are computed on the node borders facing the
 * adjacent waypoint (or the other endpoint if no waypoints). The entry
 * point is pulled back by ARROW_MARGIN for the arrowhead.
 *
 * `bezierConstraints` is the list of bezier handle constraints that apply to
 * this edge. `waypointIds` is a parallel array to `waypointPositions` giving
 * the waypoint ID for each position, used to look up per-waypoint overrides.
 *
 * The edge label element (identified by `data-id="<edgeId>"`) is relocated to
 * the geometric midpoint of the new path.
 */
export function routeEdgeThroughWaypoints(
  svgEl: Element,
  pathEl: Element,
  edgeId: string,
  waypointPositions: Array<{ x: number; y: number }>,
  src: LayoutNode,
  tgt: LayoutNode,
  bezierConstraints?: BezierHandleConstraint[],
  waypointIds?: string[],
): void {
  // Exit point: src border facing first waypoint (or tgt if no waypoints).
  const firstTarget = waypointPositions[0] ?? { x: tgt.x, y: tgt.y };
  const exitPt = rectBorderPoint(src.x, src.y, src.width, src.height, firstTarget.x, firstTarget.y);

  // Entry point: tgt border facing last waypoint (or src if no waypoints).
  const lastSource = waypointPositions.length > 0
    ? waypointPositions[waypointPositions.length - 1]
    : { x: src.x, y: src.y };
  const entryPt = rectBorderPoint(tgt.x, tgt.y, tgt.width, tgt.height, lastSource.x, lastSource.y);

  // Pull entry point back by ARROW_MARGIN along the incoming direction.
  const dxIn = entryPt.x - lastSource.x;
  const dyIn = entryPt.y - lastSource.y;
  const distIn = Math.hypot(dxIn, dyIn);
  let adjustedEntry = entryPt;
  if (distIn > ARROW_MARGIN) {
    adjustedEntry = {
      x: entryPt.x - (dxIn / distIn) * ARROW_MARGIN,
      y: entryPt.y - (dyIn / distIn) * ARROW_MARGIN,
    };
  }

  const allPoints = [exitPt, ...waypointPositions, adjustedEntry];

  // Build handle overrides from bezier constraints.
  const handleOverrides = buildHandleOverrides(
    allPoints,
    src.id,
    tgt.id,
    waypointIds ?? [],
    bezierConstraints ?? [],
  );

  pathEl.setAttribute('d', buildSplinePath(allPoints, handleOverrides));

  // Reposition edge label to the geometric midpoint of the new path.
  const labelEl = svgEl.querySelector(`[data-id="${cssEscapeId(edgeId)}"]`);
  if (labelEl) {
    const transform = labelEl.getAttribute('transform');
    if (transform && parseTranslate(transform)) {
      const midX = (exitPt.x + entryPt.x) / 2;
      const midY = (exitPt.y + entryPt.y) / 2;
      labelEl.setAttribute('transform', transform.replace(TRANSLATE_RE, formatTranslate(midX, midY)));
    }
  }
}

/**
 * Translate a list of BezierHandleConstraints into a per-point HandleOverride
 * array parallel to `allPoints` = [exitPt, wp0, wp1, ..., adjustedEntry].
 *
 * - Waypoint form (`bezier wp1, in, out`): sets inLen/outLen at the waypoint's
 *   index in allPoints.
 * - Segment form with real source (`bezier A-->wp1, len`): sets outLen at
 *   index 0 (the exit point from the real source node).
 * - Segment form with real target (`bezier wp1-->B, len`): sets inLen at the
 *   last index (the adjusted entry into the real target node).
 * - Segment form with two waypoints (`bezier wp1-->wp2, len`): sets outLen at
 *   the source waypoint index.
 */
function buildHandleOverrides(
  allPoints: Array<{ x: number; y: number }>,
  srcId: string,
  tgtId: string,
  waypointIds: string[],
  bezierConstraints: BezierHandleConstraint[],
): Array<HandleOverride | undefined> {
  const overrides: Array<HandleOverride | undefined> = new Array(allPoints.length).fill(undefined);
  const waypointSet = new Set(waypointIds);

  const ensure = (i: number): HandleOverride => {
    if (!overrides[i]) overrides[i] = {};
    return overrides[i]!;
  };

  for (const bc of bezierConstraints) {
    const seg = splitEdgeId(bc.targetId);

    if (seg === null) {
      // Waypoint form: targetId is a waypoint ID.
      const wpIdx = waypointIds.indexOf(bc.targetId);
      if (wpIdx === -1) continue;
      const ptIdx = wpIdx + 1; // allPoints[0] = exitPt, so wp[0] is at index 1
      ensure(ptIdx).inLen = bc.incomingLength;
      if (bc.outgoingLength !== undefined) {
        ensure(ptIdx).outLen = bc.outgoingLength;
      }
    } else {
      // Segment form: one length that applies to the "outer" real-node end.
      const { source, target } = seg;
      const sourceIsReal = source === srcId;
      const targetIsReal = target === tgtId;
      const sourceIsWaypoint = waypointSet.has(source);
      const targetIsWaypoint = waypointSet.has(target);

      if (sourceIsReal && targetIsWaypoint) {
        // e.g. "A-->wp1": source is the real node → outgoing handle at exitPt (index 0).
        ensure(0).outLen = bc.incomingLength;
      } else if (sourceIsWaypoint && targetIsReal) {
        // e.g. "wp1-->B": target is the real node → incoming handle at adjustedEntry.
        ensure(allPoints.length - 1).inLen = bc.incomingLength;
      } else if (sourceIsWaypoint && targetIsWaypoint) {
        // e.g. "wp1-->wp2": set outgoing from the source waypoint.
        const wpIdx = waypointIds.indexOf(source);
        if (wpIdx !== -1) ensure(wpIdx + 1).outLen = bc.incomingLength;
      }
    }
  }

  return overrides;
}

/**
 * After constraint solving, route edges that have waypoint declarations
 * through the resolved waypoint positions.
 *
 * Waypoints on the same edge are processed in the order they appear in
 * `waypointDecls` (which preserves parse order = user-specified order).
 *
 * `bezierConstraints` is the full list of bezier handle constraints from the
 * parsed ConstraintSet; each edge receives only the constraints whose targetId
 * references one of its own waypoints or boundary segments.
 *
 * Edges without waypoints are left untouched by this function
 * (they are already handled by `reRouteEdgesInSVG`).
 */
export function routeEdgesWithWaypoints(
  svgEl: Element,
  solvedNodes: LayoutNode[],
  waypointDecls: WaypointDeclaration[],
  edges: EdgeDataEntry[],
  diagramId: string,
  bezierConstraints?: BezierHandleConstraint[],
): void {
  if (waypointDecls.length === 0) return;

  const solvedMap = new Map(solvedNodes.map((n) => [n.id, n]));

  // Group waypoints by their (source, target) edge key, preserving order.
  const waypointsByEdge = new Map<string, Array<{ decl: WaypointDeclaration; pos: LayoutNode }>>();
  for (const decl of waypointDecls) {
    const pos = solvedMap.get(decl.waypointId);
    if (!pos) continue;
    // Use the raw edgeId as the map key (source-->target).
    const entry = waypointsByEdge.get(decl.edgeId) ?? [];
    entry.push({ decl, pos });
    waypointsByEdge.set(decl.edgeId, entry);
  }

  if (waypointsByEdge.size === 0) return;

  for (const edge of edges) {
    const srcId = edge.start ?? edge.v;
    const tgtId = edge.end ?? edge.w;
    if (!srcId || !tgtId) continue;

    // Find the waypoints declared for this edge. The edgeId in the declaration
    // uses the original arrow style; try all stored edgeIds to find a match.
    let matchedWaypoints: Array<{ decl: WaypointDeclaration; pos: LayoutNode }> | undefined;
    for (const [edgeKey, wps] of waypointsByEdge) {
      const parsed = splitEdgeId(edgeKey);
      if (parsed && parsed.source === srcId && parsed.target === tgtId) {
        matchedWaypoints = wps;
        break;
      }
    }
    if (!matchedWaypoints || matchedWaypoints.length === 0) continue;

    const src = solvedMap.get(srcId);
    const tgt = solvedMap.get(tgtId);
    if (!src || !tgt) continue;

    const edgeId = edge.id ?? `L_${srcId}_${tgtId}_0`;
    const pathEl = svgEl.querySelector(`[id="${cssEscapeId(`${diagramId}-${edgeId}`)}"]`);
    if (!pathEl) continue;

    const waypointPositions = matchedWaypoints.map((w) => ({ x: w.pos.x, y: w.pos.y }));
    const waypointIds = matchedWaypoints.map((w) => w.decl.waypointId);

    // Collect bezier constraints that reference this edge's waypoints or boundary segments.
    const edgeBezierConstraints = filterBezierConstraintsForEdge(
      bezierConstraints ?? [],
      srcId,
      tgtId,
      new Set(waypointIds),
    );

    routeEdgeThroughWaypoints(
      svgEl, pathEl, edgeId, waypointPositions, src, tgt,
      edgeBezierConstraints, waypointIds,
    );
  }
}

/**
 * Return only the bezier constraints that apply to the given edge,
 * identified by its source ID, target ID, and waypoint ID set.
 */
function filterBezierConstraintsForEdge(
  all: BezierHandleConstraint[],
  srcId: string,
  tgtId: string,
  waypointIdSet: Set<string>,
): BezierHandleConstraint[] {
  return all.filter((bc) => {
    const seg = splitEdgeId(bc.targetId);
    if (seg === null) {
      // Waypoint form: targetId must be one of this edge's waypoints.
      return waypointIdSet.has(bc.targetId);
    }
    // Segment form: source or target must match this edge's real nodes or waypoints.
    const { source, target } = seg;
    const srcOk = source === srcId || waypointIdSet.has(source);
    const tgtOk = target === tgtId || waypointIdSet.has(target);
    return srcOk && tgtOk;
  });
}

/**
 * Create zero-size LayoutNode entries for each waypoint declaration.
 * The initial position is the geometric midpoint of the corresponding edge path.
 * If the edge path cannot be found, the waypoint is placed at the midpoint
 * between the source and target node centers.
 */
export function buildWaypointNodes(
  waypointDecls: WaypointDeclaration[],
  edges: EdgeDataEntry[],
  svgEl: Element,
  diagramId: string,
  solvedNodes: LayoutNode[],
): LayoutNode[] {
  const solvedMap = new Map(solvedNodes.map((n) => [n.id, n]));
  const result: LayoutNode[] = [];

  for (const decl of waypointDecls) {
    const parsed = splitEdgeId(decl.edgeId);
    if (!parsed) continue;

    // Find the edge matching this declaration.
    const edge = edges.find((e) => {
      const s = e.start ?? e.v;
      const t = e.end ?? e.w;
      return s === parsed.source && t === parsed.target;
    });

    let initX: number;
    let initY: number;

    if (edge) {
      const edgeId = edge.id ?? `L_${parsed.source}_${parsed.target}_0`;
      const pathEl = svgEl.querySelector(`[id="${cssEscapeId(`${diagramId}-${edgeId}`)}"]`);
      const d = pathEl?.getAttribute('d') ?? null;
      const mid = d ? getPathMidpoint(d) : null;
      if (mid) {
        initX = mid.x;
        initY = mid.y;
      } else {
        // Fall back to midpoint between source and target node centers.
        const src = solvedMap.get(parsed.source);
        const tgt = solvedMap.get(parsed.target);
        initX = src && tgt ? (src.x + tgt.x) / 2 : 0;
        initY = src && tgt ? (src.y + tgt.y) / 2 : 0;
      }
    } else {
      const src = solvedMap.get(parsed.source);
      const tgt = solvedMap.get(parsed.target);
      initX = src && tgt ? (src.x + tgt.x) / 2 : 0;
      initY = src && tgt ? (src.y + tgt.y) / 2 : 0;
    }

    result.push({
      id: decl.waypointId,
      x: initX,
      y: initY,
      width: 0,
      height: 0,
      isWaypoint: true,
    });
  }

  return result;
}

/**
 * Return the approximate midpoint of an SVG path by averaging all coordinate
 * pairs (ignoring arc parameters). Used to seed waypoint initial positions.
 */
function getPathMidpoint(d: string): { x: number; y: number } | null {
  const segs = parsePathSegments(d);
  const pairs: Array<{ x: number; y: number }> = [];

  for (const { cmd, nums } of segs) {
    const upper = cmd.toUpperCase();
    if (upper === 'Z') continue;
    if (upper === 'A') {
      for (let i = 0; i + 6 < nums.length; i += 7) {
        pairs.push({ x: nums[i + 5], y: nums[i + 6] });
      }
    } else {
      for (let i = 0; i + 1 < nums.length; i += 2) {
        pairs.push({ x: nums[i], y: nums[i + 1] });
      }
    }
  }

  if (pairs.length === 0) return null;
  // Use midpoint of first and last pair as an approximation.
  const first = pairs[0];
  const last = pairs[pairs.length - 1];
  return { x: (first.x + last.x) / 2, y: (first.y + last.y) / 2 };
}

// ── Debug overlay ─────────────────────────────────────────────────────────────

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * Render a debug overlay onto the SVG showing bezier control handles.
 *
 * - A small red square is drawn at each waypoint position.
 * - Blue handle lines and dots are drawn for every C command in edge paths.
 * - Green anchor dots are drawn at M, L, and C endpoint coordinates.
 *
 * When `debugAllEdges` is true (activated by `%% debug bezier`), handles are
 * drawn for EVERY edge — both constraint-routed and dagre-generated. When
 * false (activated by `debug` inside the constraint block), only waypoint-
 * routed edges are annotated.
 *
 * An existing debug overlay (identified by `id="__clamp-debug"`) is removed
 * and replaced on each call so re-renders stay clean.
 */
export function renderDebugOverlay(
  svgEl: Element,
  solvedNodes: LayoutNode[],
  waypointDecls: WaypointDeclaration[],
  edges: EdgeDataEntry[],
  diagramId: string,
  debugAllEdges?: boolean,
): void {
  // Remove any pre-existing overlay.
  svgEl.querySelector('#__clamp-debug')?.remove();

  const g = document.createElementNS(SVG_NS, 'g');
  g.setAttribute('id', '__clamp-debug');
  g.setAttribute('pointer-events', 'none');

  const solvedMap = new Map(solvedNodes.map((n) => [n.id, n]));

  // Collect waypoint IDs grouped by edge.
  const waypointIdsByEdge = new Map<string, string[]>();
  for (const decl of waypointDecls) {
    const list = waypointIdsByEdge.get(decl.edgeId) ?? [];
    list.push(decl.waypointId);
    waypointIdsByEdge.set(decl.edgeId, list);
  }

  // Draw red squares at each waypoint position.
  const SQUARE_SIZE = 8;
  for (const decl of waypointDecls) {
    const pos = solvedMap.get(decl.waypointId);
    if (!pos) continue;
    const rect = document.createElementNS(SVG_NS, 'rect');
    rect.setAttribute('x', String(pos.x - SQUARE_SIZE / 2));
    rect.setAttribute('y', String(pos.y - SQUARE_SIZE / 2));
    rect.setAttribute('width', String(SQUARE_SIZE));
    rect.setAttribute('height', String(SQUARE_SIZE));
    rect.setAttribute('fill', 'red');
    rect.setAttribute('opacity', '0.85');
    g.appendChild(rect);
  }

  // Draw bezier handle annotations for edge paths.
  const processedEdgeIds = new Set<string>();
  for (const edge of edges) {
    const srcId = edge.start ?? edge.v;
    const tgtId = edge.end ?? edge.w;
    if (!srcId || !tgtId) continue;

    // Determine whether this edge should be annotated.
    let hasWaypoints = false;
    for (const [edgeKey, wpIds] of waypointIdsByEdge) {
      const parsed = splitEdgeId(edgeKey);
      if (parsed && parsed.source === srcId && parsed.target === tgtId && wpIds.length > 0) {
        hasWaypoints = true;
        break;
      }
    }
    if (!debugAllEdges && !hasWaypoints) continue;

    const edgeId = edge.id ?? `L_${srcId}_${tgtId}_0`;
    if (processedEdgeIds.has(edgeId)) continue;
    processedEdgeIds.add(edgeId);

    const pathEl = svgEl.querySelector(`[id="${cssEscapeId(`${diagramId}-${edgeId}`)}"]`);
    const d = pathEl?.getAttribute('d');
    if (!d) continue;

    appendPathHandles(g, d, hasWaypoints);
  }

  svgEl.appendChild(g);
}

/**
 * Parse an SVG path `d` string and append bezier handle annotations to `g`.
 *
 * For every cubic bezier segment (C command):
 * - Dashed blue line from anchor to cp1, blue dot at cp1.
 * - Dashed blue line from endpoint to cp2, blue dot at cp2.
 *
 * For every on-curve point (M, L, C endpoint):
 * - Small green circle (anchor dot). For waypoint edges these are orange to
 *   distinguish them from dagre-generated paths.
 */
function appendPathHandles(g: Element, d: string, isWaypointEdge: boolean): void {
  const anchorColor = isWaypointEdge ? 'orange' : 'green';
  const segs = parsePathSegments(d);
  let currentX = 0;
  let currentY = 0;

  for (const seg of segs) {
    const upper = seg.cmd.toUpperCase();
    if (upper === 'M') {
      currentX = seg.nums[0] ?? 0;
      currentY = seg.nums[1] ?? 0;
      appendAnchorDot(g, currentX, currentY, anchorColor);
    } else if (upper === 'C') {
      // C cp1x,cp1y,cp2x,cp2y,x,y  (may repeat for poly-bezier)
      for (let i = 0; i + 5 < seg.nums.length; i += 6) {
        const cp1x = seg.nums[i];
        const cp1y = seg.nums[i + 1];
        const cp2x = seg.nums[i + 2];
        const cp2y = seg.nums[i + 3];
        const ex   = seg.nums[i + 4];
        const ey   = seg.nums[i + 5];

        appendHandleLine(g, currentX, currentY, cp1x, cp1y);
        appendHandleDot(g, cp1x, cp1y);
        appendHandleLine(g, ex, ey, cp2x, cp2y);
        appendHandleDot(g, cp2x, cp2y);
        appendAnchorDot(g, ex, ey, anchorColor);

        currentX = ex;
        currentY = ey;
      }
    } else if (upper === 'L') {
      for (let i = 0; i + 1 < seg.nums.length; i += 2) {
        currentX = seg.nums[i];
        currentY = seg.nums[i + 1];
        appendAnchorDot(g, currentX, currentY, anchorColor);
      }
    }
  }
}

function appendHandleLine(
  g: Element,
  x1: number, y1: number,
  x2: number, y2: number,
): void {
  const line = document.createElementNS(SVG_NS, 'line');
  line.setAttribute('x1', String(Math.round(x1 * 100) / 100));
  line.setAttribute('y1', String(Math.round(y1 * 100) / 100));
  line.setAttribute('x2', String(Math.round(x2 * 100) / 100));
  line.setAttribute('y2', String(Math.round(y2 * 100) / 100));
  line.setAttribute('stroke', 'blue');
  line.setAttribute('stroke-width', '1');
  line.setAttribute('stroke-dasharray', '3,2');
  line.setAttribute('opacity', '0.8');
  g.appendChild(line);
}

function appendHandleDot(g: Element, cx: number, cy: number): void {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(Math.round(cx * 100) / 100));
  circle.setAttribute('cy', String(Math.round(cy * 100) / 100));
  circle.setAttribute('r', '3');
  circle.setAttribute('fill', 'blue');
  circle.setAttribute('opacity', '0.8');
  g.appendChild(circle);
}

function appendAnchorDot(g: Element, cx: number, cy: number, color: string): void {
  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('cx', String(Math.round(cx * 100) / 100));
  circle.setAttribute('cy', String(Math.round(cy * 100) / 100));
  circle.setAttribute('r', '4');
  circle.setAttribute('fill', color);
  circle.setAttribute('opacity', '0.7');
  g.appendChild(circle);
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
    if (cs.constraints.length === 0 && !cs.debug && !cs.debugBezier) return;

    // Collect parser warnings.
    for (const w of cs.warnings ?? []) pendingWarnings.push(w);

    // Step 3: Read positions from SVG transforms (dagre wrote them there).
    const svgEl = (svg as { node(): Element }).node();
    const nodes = extractPositionsFromSVG(layoutData.nodes, svgEl);
    if (nodes.length === 0) return;

    const edges = (layoutData as { edges?: EdgeDataEntry[] }).edges ?? [];

    // Step 3b: Extract waypoint declarations; inject shadow nodes at initial positions.
    const waypointDecls = cs.constraints.filter(
      (c): c is WaypointDeclaration => c.type === 'waypoint',
    );
    const waypointNodes = buildWaypointNodes(waypointDecls, edges, svgEl, diagramId, nodes);
    const allNodes = [...nodes, ...waypointNodes];

    // Step 4: Solve constraints (waypoint shadow nodes participate as zero-size nodes).
    const solved = solveConstraints(allNodes, cs);

    // Step 5: Write corrected positions back to SVG transforms (waypoints have no DOM element).
    applyPositionsToSVG(solved, svgEl, layoutData.nodes);

    // Step 6: Re-route edge paths for moved nodes (skips edges handled by waypoint router).
    reRouteEdgesInSVG(svgEl, nodes, solved, edges, diagramId);

    // Step 7: Route edges with waypoints through their resolved waypoint positions.
    const bezierConstraints = cs.constraints.filter(
      (c): c is BezierHandleConstraint => c.type === 'bezier',
    );
    routeEdgesWithWaypoints(svgEl, solved, waypointDecls, edges, diagramId, bezierConstraints);

    // Step 8: If debug mode is active, render the debug overlay.
    if (cs.debug || cs.debugBezier) {
      renderDebugOverlay(svgEl, solved, waypointDecls, edges, diagramId, cs.debugBezier);
    }
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

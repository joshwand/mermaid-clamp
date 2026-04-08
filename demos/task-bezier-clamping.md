# Bezier Clamping and debug bezier Overlay

*2026-04-08T04:08:13Z by Showboat 0.6.1*
<!-- showboat-id: 72e48e4f-4016-440d-9608-c72a5ba65e34 -->

Two features added to improve edge rendering quality and debuggability.

## Feature 1: Bezier endpoint clamping

When nodes are moved by constraint solving, reanchorPath() applies a similarity transform (rotate + scale + translate) to remap dagre's original bezier curve to the new endpoints. The transform preserves shape but not direction — so the curve could exit a node at a wrong angle, or bulge wildly on a short edge.

clampEndpointHandles() fixes this post-transform:
- Redirects cp1 of the first C command to exit along the exitPt → adjustedEntry direction
- Redirects cp2 of the last C command to arrive along the same axis
- Caps both handle lengths at 40% of the edge chord length (MAX_HANDLE_FRACTION) to eliminate bulging on short or nearly-straight edges

Applied automatically in reRouteEdgesInSVG after every reanchorPath call.

```bash
grep -A4 'export function clampEndpointHandles' src/layout/index.ts
```

```output
export function clampEndpointHandles(
  d: string,
  exitPt: { x: number; y: number },
  adjustedEntry: { x: number; y: number },
): string {
```

The five tests covering clampEndpointHandles verify each behaviour in isolation:

```bash
pnpm exec vitest run --reporter=verbose 2>&1 | grep -E '(✓|✗).*clampEndpointHandles'
```

```output
 ✓ src/layout/index.test.ts > clampEndpointHandles > returns path unchanged when there are no C commands (straight line)
 ✓ src/layout/index.test.ts > clampEndpointHandles > redirects cp1 to exit along the edge direction
 ✓ src/layout/index.test.ts > clampEndpointHandles > redirects cp2 to arrive along the edge direction
 ✓ src/layout/index.test.ts > clampEndpointHandles > caps handle length at MAX_HANDLE_FRACTION of edge length
 ✓ src/layout/index.test.ts > clampEndpointHandles > returns input unchanged when edge is degenerate (length≈0)
```

## Feature 2: %% debug bezier directive

Adds a top-level mermaid comment — or 'debug bezier' inside the constraint block — that sets debugBezier=true on ConstraintSet.

When active, renderDebugOverlay annotates EVERY edge in the diagram (both dagre-generated and constraint-routed), not just waypoint edges as the existing 'debug' directive does:

- Blue dashed lines + blue dots: bezier control handles
- Green anchor dots: on-curve points on dagre-generated edges
- Orange anchor dots: on-curve points on waypoint-routed edges
- Red squares: waypoint positions (unchanged)

Usage anywhere in the mermaid source, with no constraint block required:

    %% debug bezier

The parser detects it at the top level of mermaid text (no constraint block needed) and also inside the constraint block:

```bash
pnpm exec vitest run --reporter=verbose 2>&1 | grep -E '(✓|✗).*debug bezier'
```

```output
 ✓ src/parser/index.test.ts > parseConstraints — debug bezier directive > sets debugBezier=true for top-level %% debug bezier in mermaid text
 ✓ src/parser/index.test.ts > parseConstraints — debug bezier directive > sets debugBezier=true for "debug bezier" inside constraint block
 ✓ src/parser/index.test.ts > parseConstraints — debug bezier directive > debugBezier=undefined when directive is absent
 ✓ src/parser/index.test.ts > parseConstraints — debug bezier directive > debugBezier coexists with debug and other constraints
 ✓ src/parser/index.test.ts > parseConstraints — debug bezier directive > top-level %% debug bezier works even without a constraint block
```

The renderDebugOverlay extension is tested for all three key behaviours:

```bash
pnpm exec vitest run --reporter=verbose 2>&1 | grep -E '(✓|✗).*debugAllEdges'
```

```output
 ✓ src/layout/index.test.ts > renderDebugOverlay — debugAllEdges > draws handles for non-waypoint edges when debugAllEdges=true
 ✓ src/layout/index.test.ts > renderDebugOverlay — debugAllEdges > does not draw handles for non-waypoint edges when debugAllEdges=false
 ✓ src/layout/index.test.ts > renderDebugOverlay — debugAllEdges > replaces existing overlay on re-render
```

## Full test suite

```bash
pnpm test 2>&1 | tail -8
```

```output
 ✓ src/index.test.ts (7 tests) 9ms
 ✓ src/layout/index.test.ts (50 tests) 69ms

 Test Files  5 passed (5)
      Tests  155 passed (155)
   Start at  04:11:22
   Duration  1.41s (transform 415ms, setup 0ms, collect 545ms, tests 157ms, environment 866ms, prepare 380ms)

```

Ready for review.

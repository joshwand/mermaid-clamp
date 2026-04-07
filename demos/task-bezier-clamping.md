# Bezier Endpoint Clamping + debug bezier overlay

Task: fix odd start/end angles on re-routed bezier edges and unnecessary curves on short edges. Adds `%% debug bezier` directive to show handles for ALL edges.

```bash
$ pnpm test 2>&1 | tail -7
 ✓ src/layout/index.test.ts (50 tests) 50ms

 Test Files  5 passed (5)
      Tests  155 passed (155)
   Start at  05:03:50
   Duration  1.01s (transform 256ms, setup 0ms, collect 345ms, tests 113ms, environment 615ms, prepare 283ms)
```

155 tests passing (13 new).

```bash
$ grep -n 'clampEndpointHandles\|MAX_HANDLE_FRACTION\|debugAllEdges\|debugBezier' src/layout/index.ts | head -20
153:const MAX_HANDLE_FRACTION = 0.4;
353: * 3. All first/last handle lengths to at most `MAX_HANDLE_FRACTION * edgeLen`
358:export function clampEndpointHandles(
370:  const maxHandleLen = edgeLen * MAX_HANDLE_FRACTION;
473:      pathEl.setAttribute('d', clampEndpointHandles(reanchored, exitPt, adjustedEntry));
940: * When `debugAllEdges` is true (activated by `%% debug bezier`), handles are
954:  debugAllEdges?: boolean,
1004:    if (!debugAllEdges && !hasWaypoints) continue;
1172:    if (cs.constraints.length === 0 && !cs.debug && !cs.debugBezier) return;
1207:    if (cs.debug || cs.debugBezier) {
1208:      renderDebugOverlay(svgEl, solved, waypointDecls, edges, diagramId, cs.debugBezier);
```

clampEndpointHandles: after reanchorPath similarity-transforms a dagre path, redirects cp1 of the first C command along the exit direction and cp2 of the last C command along the entry direction. Caps both at edgeLen x 0.4 to prevent bulging on short edges. Applied in reRouteEdgesInSVG.

```bash
$ grep -n 'debugBezier\|debug bezier' src/parser/index.ts src/types.ts
src/parser/index.ts:324:  // Scan the full mermaid text for top-level `%% debug bezier` (outside the constraint block).
src/parser/index.ts:325:  let debugBezier = mermaidText.split('\n').some((l) => l.trim() === '%% debug bezier');
src/parser/index.ts:329:    return { version: 1, constraints: [], warnings: [], ...(debugBezier ? { debugBezier: true } : {}) };
src/parser/index.ts:340:    // `debug bezier` enables the all-edges handle overlay.
src/parser/index.ts:341:    if (line.trim() === 'debug bezier') {
src/parser/index.ts:342:      debugBezier = true;
src/parser/index.ts:371:    ...(debugBezier ? { debugBezier: true } : {}),
src/types.ts:154:   * Activated by a `%% debug bezier` line anywhere in the mermaid source.
src/types.ts:156:  debugBezier?: boolean;
```

% debug bezier works as a top-level mermaid comment (or 'debug bezier' inside the constraint block). Sets debugBezier=true on ConstraintSet. renderDebugOverlay draws handles for ALL edges when debugAllEdges=true: blue dashed handle lines, blue control-point dots, green anchor dots (dagre edges), orange anchor dots (waypoint edges).

Ready for review.


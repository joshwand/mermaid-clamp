# Current Task State

## Current Task: Bugs — BUG-1, BUG-2, BUG-3 (see theBacklog.md)

## Workflow State: READY — no task in flight, awaiting next assignment

## Yak-Shaving Stack: (empty)

## Scratchpad

### Tasks 1–5 status
All complete and committed. 103 tests passing. `demos/task-05.md` rebuilt with 11 scenarios, each including diagram source, constraint source, and screenshot.

### Known bugs recorded (added to top of backlog)

| Bug | Description | Root cause |
|-----|-------------|------------|
| BUG-1 | Curved arrows replaced with straight lines | `reRouteEdgesInSVG` writes `M...L...` for all moved edges, discarding original path shape |
| BUG-2 | Directional constraints lack default offset | Distance defaults to 0 → nodes touch, almost always causing overlap |
| BUG-3 | DIR-of does not drag descendants | Solver moves only the named node; downstream nodes (constrained relative to it) may not converge in the same pass → end up wrong side |

### Implementation notes for bugs

**BUG-1 approach:** Parse the original `d` attribute path. Compute delta between old and new border attachment points. Translate path by that delta. Fall back to straight line only if path is unparseable.

**BUG-2 approach:** Change default distance from `0` to `20` in parser (or apply a layout-level default in the solver when distance is 0). Need to decide: is it a parser default or a solver default? Parser is cleaner — the meaning of "no distance" is defined at parse time.

**BUG-3 approach:** Topological sort the directional constraints before relaxation. Process in dependency order so D sees its final position before H is placed relative to it. Alternatively, increase max iterations — but topological sort is O(n) and correct.

## Action Log

- Session: rebuilt task-05.md with diagram + constraint source per scenario
- Session: updated theTechContext.md with demo rules (include source per scenario)
- Session: updated ConstraintLanguageSpec.md + ConstraintSolver.md (NO OVERLAPS, edge-to-edge, first-is-anchor)
- Session: committed and pushed all above
- Session: added BUG-1, BUG-2, BUG-3 to top of theBacklog.md

# Design: Constraint Solver

## Overview

The constraint solver takes a set of nodes (with initial positions from a base layout algorithm) and a set of constraints, and computes adjusted positions that satisfy the constraints. Waypoints participate as shadow nodes — zero-size entries in the node list.

## Why Iterative Relaxation?

Three solver approaches were considered:

| Approach | Pros | Cons |
|----------|------|------|
| **Linear Programming (LP)** | Formally optimal, handles complex constraint sets | Heavy dependency (GLPK/HiGHS), overkill for our constraint types, slow for interactive use |
| **Force-directed (springs)** | Natural "settling," handles soft constraints well | Non-deterministic, can oscillate, unpredictable for precise positioning |
| **Iterative relaxation with priority** | Simple, fast, deterministic, easy to debug | May not converge for adversarial inputs; limited to constraint types with clear priority ordering |

We choose iterative relaxation because our constraint types have a natural priority ordering and don't form complex systems of simultaneous equations. The constraint set for a typical diagram is small (5-20 constraints on 10-50 nodes), and the solver needs to run in <10ms for interactive use.

## Algorithm

```
function solveConstraints(nodes, constraints):
  // Phase 1: Partition and prepare
  anchors = constraints.filter(type == 'anchor')
  groups = constraints.filter(type == 'group')
  aligns = constraints.filter(type == 'align')
  offsets = constraints.filter(type in ['north-of', 'south-of', 'east-of', 'west-of'])

  // Phase 2: Apply anchors (one-shot, not iterative)
  for each anchor(nodeId, x, y):
    nodes[nodeId].x = x
    nodes[nodeId].y = y
    nodes[nodeId].locked = { x: true, y: true }

  // Phase 3: Compute groups
  for each group(members, name):
    groupState[name] = {
      members: members,
      centroid: average(members.map(n => nodes[n].position)),
      offsets: members.map(n => nodes[n].position - centroid)
    }

  // Phase 4: Iterative relaxation
  for iteration = 0 to MAX_ITERATIONS (10):
    maxDelta = 0

    // 4a: Apply alignments
    for each align(nodeList, axis):
      // Compute target coordinate
      unlocked = nodeList.filter(n => !nodes[n].locked[axis])
      if unlocked.length == 0: continue  // all locked, skip
      target = average(nodeList.map(n => coordinate(nodes[n], axis)))
      for each n in unlocked:
        delta = target - coordinate(nodes[n], axis)
        setCoordinate(nodes[n], axis, target)
        maxDelta = max(maxDelta, abs(delta))
        // If n is in a group, move entire group
        propagateGroupMove(n, axis, delta)

    // 4b: Apply directional offsets
    for each offset(subject, reference, direction, distance):
      if nodes[subject].locked[axisOf(direction)]: continue
      target = computeDirectionalTarget(nodes[reference], direction, distance)
      delta = target - coordinate(nodes[subject], axisOf(direction))
      setCoordinate(nodes[subject], axisOf(direction), target)
      maxDelta = max(maxDelta, abs(delta))
      propagateGroupMove(subject, axisOf(direction), delta)

    // 4c: Check convergence
    if maxDelta < 0.5: break

  return nodes
```

## Directional Target Computation

```
computeDirectionalTarget(refNode, direction, distance):
  switch direction:
    'south-of': return refNode.centerY + distance
    'north-of': return refNode.centerY - distance
    'east-of':  return refNode.centerX + distance
    'west-of':  return refNode.centerX - distance
```

## Group Propagation

When a node that belongs to a group is moved by a constraint, all other group members move by the same delta:

```
propagateGroupMove(nodeId, axis, delta):
  for each group containing nodeId:
    for each member in group (except nodeId):
      if not member.locked[axis]:
        setCoordinate(nodes[member], axis,
          coordinate(nodes[member], axis) + delta)
```

This maintains relative positions within the group while allowing the group to move as a unit.

## Conflict Resolution

When two constraints target the same axis of the same node:
1. If different priorities → higher priority wins
2. If same priority → target position is the average of what each constraint wants

The iteration order (aligns before offsets) means that within a single iteration, offsets can override aligns if they target the same axis. But over multiple iterations, the system converges to a compromise (or the higher-priority constraint dominates).

## Waypoint Handling

Waypoints are added to the node list before solving:

```
for each waypoint_decl(edgeId, wpId):
  midpoint = computeEdgeMidpoint(edgeId)
  nodes.push({
    id: wpId,
    x: midpoint.x,
    y: midpoint.y,
    width: 0,
    height: 0,
    isWaypoint: true
  })
```

Then they participate in the normal solve loop. After solving, the edge router reads their final positions.

## Convergence Guarantees

The solver is **not** guaranteed to converge for adversarial inputs (e.g., circular dependencies: `A south-of B, 100` + `B south-of A, 100`). Mitigation:
- Hard iteration cap (10)
- After cap, use current positions (which will be a partial solution)
- Log a warning listing the non-converged constraints

## Performance Targets

| Metric | Target |
|--------|--------|
| 10 nodes, 5 constraints | < 1ms |
| 50 nodes, 20 constraints | < 10ms |
| 100 nodes, 50 constraints | < 50ms |

These targets are for the solver alone, not including rendering.

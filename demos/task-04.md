# Task 4: Constraint Solver

*2026-04-04T03:15:56Z by Showboat 0.6.1*
<!-- showboat-id: 5a3e8dfa-587f-40d1-bac2-48cb500aa890 -->

Task 4: Constraint Solver. Implements solveConstraints() using iterative relaxation with priority order: anchor > group peer movement > align > directional. Waypoints are zero-size nodes that participate identically. Convergence at max delta < 0.5px or 10 iterations.

```bash
pnpm test -- --reporter=verbose 2>&1 | tail -8
```

```output
 ✓ src/solver/index.test.ts (20 tests) 11ms
 ✓ src/index.test.ts (8 tests) 7ms

 Test Files  4 passed (4)
      Tests  79 passed (79)
   Start at  03:15:57
   Duration  669ms (transform 249ms, setup 0ms, collect 343ms, tests 56ms, environment 1ms, prepare 225ms)

```

```bash
node demos/solver-demo.mjs
```

```output
=== Before ===
  A    x= 100  y= 100
  B    x= 200  y= 180
  C    x= 300  y= 260
  D    x= 400  y=  50
  wp1  x= 150  y= 150

=== After ===
  A    x= 100  y= 140
  B    x= 200  y= 140
  C    x= 300  y= 260
  D    x= 400  y= 340
  wp1  x= 260  y= 150

=== Delta ===
  A    Δx=   0  Δy=  40
  B    Δx=   0  Δy= -40
  C    Δx=   0  Δy=   0
  D    Δx=   0  Δy= 290
  wp1  Δx= 110  Δy=   0
```

79/79 tests passing. Solver correctly applies all constraint types with group peer propagation and anchor priority. Ready for human review.

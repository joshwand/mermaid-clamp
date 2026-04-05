# Task 3: Constraint Serializer

*2026-04-04T03:03:37Z by Showboat 0.6.1*
<!-- showboat-id: 6327d917-2e8f-4cb3-97db-d65441cab70b -->

Task 3: Constraint Serializer. Implements serializeConstraints() (deterministic sorted output), injectConstraints() (replace or append block), and stripConstraints() (remove block). Round-trip parse→serialize→parse preserves all constraint IDs.

```bash
pnpm test -- --reporter=verbose 2>&1 | tail -8
```

```output
 ✓ src/parser/index.test.ts (30 tests) 15ms
 ✓ src/index.test.ts (8 tests) 8ms

 Test Files  3 passed (3)
      Tests  59 passed (59)
   Start at  03:03:38
   Duration  403ms (transform 177ms, setup 0ms, collect 252ms, tests 34ms, environment 0ms, prepare 176ms)

```

```bash
node demos/serializer-demo.mjs
```

```output
=== 1. Parse original ===
  5 constraints parsed

=== 2. Serialize (deterministic, sorted) ===
%% @layout-constraints v1
%% waypoint D-->H as wp1
%% anchor A, 50, 50
%% group B, C as pair
%% align B, C, h
%% A south-of B, 120
%% @end-layout-constraints

=== 3. Round-trip: re-parse the serialized block ===
  IDs match after round-trip: true

=== 4. stripConstraints ===
flowchart TD
    A --> B
    B --> C
    B --> D

=== 5. injectConstraints (replace existing block) ===
flowchart TD
    A --> B
    B --> C
    B --> D

%% @layout-constraints v1
%% C north-of A, 60
%% @end-layout-constraints
```

59/59 tests passing. Round-trip IDs match: true. Ready for human review.

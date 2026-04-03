# Task 2: Constraint Parser

*2026-04-03T23:17:42Z by Showboat 0.6.1*
<!-- showboat-id: 82aaff80-a410-41b5-9a9b-320e590ef20d -->

Task 2: Constraint Parser. Implements parseConstraints(mermaidText) which finds the %% @layout-constraints v1 block, parses all 5 constraint types (directional, align, group, anchor, waypoint), generates deterministic IDs, warns and skips malformed lines, and returns an empty ConstraintSet when no block is present.

```bash
pnpm test -- --reporter=verbose 2>&1 | grep -A 100 'src/parser'
```

```output
 ✓ src/parser/index.test.ts (30 tests) 14ms
 ✓ src/index.test.ts (8 tests) 6ms

 Test Files  2 passed (2)
      Tests  38 passed (38)
   Start at  23:17:48
   Duration  348ms (transform 133ms, setup 0ms, collect 161ms, tests 20ms, environment 0ms, prepare 105ms)

```

```node

const { parseConstraints } = require('./dist/mermaid-layout-constraints.cjs.js');
const text = `flowchart TD
    A --> B
    B --> C
    B --> D

%% @layout-constraints v1
%% align B, C, v
%% D east-of B, 200
%% group E, F as outputs
%% anchor A, 50, 50
%% waypoint D-->H as wp1
%% wp1 west-of C, 20
%% @end-layout-constraints`;

const cs = parseConstraints(text);
console.log(JSON.stringify(cs, null, 2));

```

```output
node:internal/modules/cjs/loader:1386
  throw err;
  ^

Error: Cannot find module '/home/user/mermaid-clamp/
const { parseConstraints } = require('./dist/mermaid-layout-constraints.cjs.js');
const text = `flowchart TD
    A --> B
    B --> C
    B --> D

%% @layout-constraints v1
%% align B, C, v
%% D east-of B, 200
%% group E, F as outputs
%% anchor A, 50, 50
%% waypoint D-->H as wp1
%% wp1 west-of C, 20
%% @end-layout-constraints`;

const cs = parseConstraints(text);
console.log(JSON.stringify(cs, null, 2));
'
    at node:internal/modules/cjs/loader:1383:15
    at node:internal/main/check_syntax:33:20 {
  code: 'MODULE_NOT_FOUND',
  requireStack: []
}

Node.js v22.22.2
```

```bash
node /tmp/parser-demo.mjs
```

```output
{
  "version": 1,
  "constraints": [
    {
      "type": "align",
      "id": "9d1b95ab",
      "nodes": [
        "B",
        "C"
      ],
      "axis": "v"
    },
    {
      "type": "directional",
      "id": "28a74e62",
      "nodeA": "D",
      "direction": "east-of",
      "nodeB": "B",
      "distance": 200
    },
    {
      "type": "group",
      "id": "2c37c6a1",
      "nodes": [
        "E",
        "F"
      ],
      "name": "outputs"
    },
    {
      "type": "anchor",
      "id": "f3f122f9",
      "node": "A",
      "x": 50,
      "y": 50
    },
    {
      "type": "waypoint",
      "id": "1a2174f0",
      "edgeId": "D-->H",
      "waypointId": "wp1"
    },
    {
      "type": "directional",
      "id": "fa8cc27d",
      "nodeA": "wp1",
      "direction": "west-of",
      "nodeB": "C",
      "distance": 20
    }
  ]
}
```

38/38 tests passing. Parser correctly handles all 5 constraint types, deterministic IDs, malformed line warnings, and waypoint ID forwarding. Ready for human review.

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

// ── Diagram sources ──────────────────────────────────────────────────────────

const LINEAR_FLOW = `flowchart LR
    A[Start] --> B[Process]
    B --> C[Validate]
    C --> D[Store]
    C --> E[Reject]`;

const TALL_CHAIN = `flowchart TD
    A[Alpha] --> B[Beta]
    B --> C[Gamma]
    C --> D[Delta]`;

const OBSTACLE_GRAPH = `flowchart LR
    src[Source] --> dst[Dest]
    obs[Obstacle]`;

const CROSS_GRAPH = `flowchart TD
    A[Node A] --> C[Node C]
    B[Node B] --> D[Node D]`;

const MULTI_WP_GRAPH = `flowchart LR
    A[Start] --> B[End]
    mid[Midpoint]`;

const BYPASS_GRAPH = `flowchart TD
    top[Top] --> bot[Bottom]
    left[Left]
    right[Right]`;

const SCURVE_GRAPH = `flowchart LR
    P[Producer] --> Q[Consumer]
    up[Up]
    down[Down]`;

// ── Scenarios ────────────────────────────────────────────────────────────────

const scenarios = [
  // ── Baseline ──────────────────────────────────────────────────────────────
  {
    file: 'demos/task-06/task-06-01-baseline.png',
    diagram: LINEAR_FLOW,
    constraints: '',
    label: 'Baseline: no waypoints — dagre default routing',
  },

  // ── Scenario 1: dip below source ─────────────────────────────────────────
  {
    file: 'demos/task-06/task-06-02-dip-south.png',
    diagram: LINEAR_FLOW,
    constraints: `%% @layout-constraints v1
%% waypoint B-->C as wp1
%% wp1 south-of B, 70
%% @end-layout-constraints`,
    label: 'B→C dips south of B (wp1 south-of B, 70)',
  },

  // ── Scenario 2: route around an obstacle node ────────────────────────────
  {
    file: 'demos/task-06/task-06-03-obstacle-bypass.png',
    diagram: OBSTACLE_GRAPH,
    constraints: `%% @layout-constraints v1
%% obs east-of src, 80
%% waypoint src-->dst as wp1
%% wp1 south-of src, 80
%% @end-layout-constraints`,
    label: 'src→dst routed south to bypass Obstacle node',
  },

  // ── Scenario 3: right-angle turn via east waypoint ───────────────────────
  {
    file: 'demos/task-06/task-06-04-right-angle.png',
    diagram: TALL_CHAIN,
    constraints: `%% @layout-constraints v1
%% waypoint A-->B as wp1
%% wp1 east-of A, 80
%% @end-layout-constraints`,
    label: 'A→B detours east (right-angle elbow)',
  },

  // ── Scenario 4: J-hook — edge detours west (against TD flow) ────────────────
  {
    file: 'demos/task-06/task-06-05-jhook.png',
    diagram: `flowchart TD\n    A[Start] --> B[End]`,
    constraints: `%% @layout-constraints v1
%% waypoint A-->B as wp1
%% wp1 west-of A, 100
%% @end-layout-constraints`,
    label: 'A→B J-hook: waypoint west of A forces edge to detour left',
  },

  // ── Scenario 5: wide bypass clearing two flanking nodes ──────────────────
  {
    file: 'demos/task-06/task-06-06-wide-bypass.png',
    diagram: BYPASS_GRAPH,
    constraints: `%% @layout-constraints v1
%% left west-of top, 80
%% right east-of top, 80
%% waypoint top-->bot as wp1
%% wp1 east-of right, 40
%% @end-layout-constraints`,
    label: 'top→bot routed wide east, clearing Left and Right nodes',
  },

  // ── Scenario 6: waypoint at row/column intersection of two other nodes ────
  {
    file: 'demos/task-06/task-06-07-grid-intersection.png',
    diagram: `flowchart TD\n    A[Alpha] --> D[Delta]\n    B[Beta]\n    C[Gamma]`,
    constraints: `%% @layout-constraints v1
%% B west-of A, 60
%% C east-of A, 60
%% waypoint A-->D as wp1
%% align C, wp1, v
%% align B, wp1, h
%% @end-layout-constraints`,
    label: 'A→D waypoint at intersection of B\'s row and C\'s column',
  },

  // ── Scenario 7: U-shape — each wp in its near node's column (TD) ─────────
  {
    file: 'demos/task-06/task-06-08-ushape.png',
    diagram: `flowchart TD\n    A[Start] --> B[End]`,
    constraints: `%% @layout-constraints v1
%% waypoint A-->B as wp1
%% waypoint A-->B as wp2
%% align A, wp1, h
%% align B, wp2, h
%% wp1 west-of A, 80
%% wp2 west-of B, 80
%% @end-layout-constraints`,
    label: 'A→B C-shape: wp1 left of A (A\'s row), wp2 left of B (B\'s row)',
  },
];

// ── Runner ───────────────────────────────────────────────────────────────────

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto('http://localhost:5174/demo/');
await page.waitForTimeout(2000);

for (const scenario of scenarios) {
  console.log(`Capturing: ${scenario.file}`);
  console.log(`  ${scenario.label}`);

  await page.fill('#diagram-source', scenario.diagram);
  await page.dispatchEvent('#diagram-source', 'input');
  await page.waitForTimeout(400);

  await page.fill('#constraint-source', scenario.constraints);
  await page.dispatchEvent('#constraint-source', 'input');
  await page.waitForTimeout(2000);

  const filePath = `/home/user/mermaid-clamp/${scenario.file}`;
  await page.screenshot({ path: filePath });
  console.log(`  Saved: ${filePath}`);
}

await browser.close();
console.log('\nAll screenshots captured.');

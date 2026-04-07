import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

// ── Diagram sources ───────────────────────────────────────────────────────────

const SIMPLE_CHAIN = `flowchart TD
    A[Alpha] --> B[Beta]
    B --> C[Gamma]`;

const S_CURVE = `flowchart LR
    Start[Start] --> End[End]
    mid[Mid]`;

const MULTI_WP = `flowchart TD
    A[Top] --> B[Bottom]`;

// ── Scenarios ─────────────────────────────────────────────────────────────────

const scenarios = [
  // ── Debug: waypoint markers ───────────────────────────────────────────────
  {
    file: 'demos/task-debug-bezier/01-debug-single-waypoint.png',
    diagram: SIMPLE_CHAIN,
    constraints: `%% @layout-constraints v1
%% debug
%% waypoint A-->B as wp1
%% wp1 east-of A, 80
%% @end-layout-constraints`,
    label: 'debug directive: red square at waypoint, blue bezier handles shown',
  },

  {
    file: 'demos/task-debug-bezier/02-debug-multi-waypoint.png',
    diagram: MULTI_WP,
    constraints: `%% @layout-constraints v1
%% debug
%% waypoint A-->B as wp1
%% waypoint A-->B as wp2
%% align A, wp1, h
%% align B, wp2, h
%% wp1 west-of A, 80
%% wp2 west-of B, 80
%% @end-layout-constraints`,
    label: 'debug: two waypoints both marked with red squares and blue handles',
  },

  // ── Bezier: incoming handle only ─────────────────────────────────────────
  {
    file: 'demos/task-debug-bezier/03-bezier-tight-handles.png',
    diagram: S_CURVE,
    constraints: `%% @layout-constraints v1
%% debug
%% waypoint Start-->End as wp1
%% wp1 south-of Start, 80
%% bezier wp1, 10, 10
%% @end-layout-constraints`,
    label: 'bezier wp1, 10, 10 — tight handles (nearly straight segments)',
  },

  {
    file: 'demos/task-debug-bezier/04-bezier-long-handles.png',
    diagram: S_CURVE,
    constraints: `%% @layout-constraints v1
%% debug
%% waypoint Start-->End as wp1
%% wp1 south-of Start, 80
%% bezier wp1, 80, 80
%% @end-layout-constraints`,
    label: 'bezier wp1, 80, 80 — long handles (more pronounced curves)',
  },

  // ── Bezier: segment form (source end) ────────────────────────────────────
  {
    file: 'demos/task-debug-bezier/05-bezier-segment-source.png',
    diagram: SIMPLE_CHAIN,
    constraints: `%% @layout-constraints v1
%% debug
%% waypoint A-->B as wp1
%% wp1 east-of A, 80
%% bezier A-->wp1, 60
%% @end-layout-constraints`,
    label: 'bezier A-->wp1, 60 — outgoing handle from A = 60px',
  },

  // ── Bezier: segment form (target end) ────────────────────────────────────
  {
    file: 'demos/task-debug-bezier/06-bezier-segment-target.png',
    diagram: SIMPLE_CHAIN,
    constraints: `%% @layout-constraints v1
%% debug
%% waypoint A-->B as wp1
%% wp1 east-of A, 80
%% bezier wp1-->B, 60
%% @end-layout-constraints`,
    label: 'bezier wp1-->B, 60 — incoming handle at B = 60px',
  },

  // ── Bezier: asymmetric handles ────────────────────────────────────────────
  {
    file: 'demos/task-debug-bezier/07-bezier-asymmetric.png',
    diagram: SIMPLE_CHAIN,
    constraints: `%% @layout-constraints v1
%% debug
%% waypoint A-->B as wp1
%% wp1 east-of A, 80
%% bezier wp1, 20, 80
%% @end-layout-constraints`,
    label: 'bezier wp1, 20, 80 — asymmetric handles: tight incoming, long outgoing',
  },

  // ── Bezier: without debug (clean output) ─────────────────────────────────
  {
    file: 'demos/task-debug-bezier/08-bezier-no-debug.png',
    diagram: SIMPLE_CHAIN,
    constraints: `%% @layout-constraints v1
%% waypoint A-->B as wp1
%% wp1 east-of A, 80
%% bezier wp1, 15, 80
%% @end-layout-constraints`,
    label: 'bezier without debug — clean SVG, no overlay',
  },
];

// ── Runner ────────────────────────────────────────────────────────────────────

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
  await page.waitForTimeout(2500);

  const filePath = `/home/user/mermaid-clamp/${scenario.file}`;
  await page.screenshot({ path: filePath });
  console.log(`  Saved: ${filePath}`);
}

await browser.close();
console.log('\nAll screenshots captured.');

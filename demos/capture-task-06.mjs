import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DIAGRAM = `flowchart LR
    A[Start] --> B[Process]
    B --> C[Validate]
    C --> D[Store]
    C --> E[Reject]`;

// Waypoint routing: route the B-->C edge through a waypoint forced west of Validate
const WAYPOINT_CONSTRAINTS = `%% @layout-constraints v1
%% waypoint B-->C as wp1
%% wp1 south-of B, 60
%% @end-layout-constraints`;

// Same diagram with no waypoints (baseline)
const NO_CONSTRAINTS = '';

const scenarios = [
  {
    file: 'demos/task-06/task-06-01-baseline.png',
    diagram: DIAGRAM,
    constraints: NO_CONSTRAINTS,
    screenshot: 'viewport',
    label: 'Baseline: no waypoints — dagre default routing',
  },
  {
    file: 'demos/task-06/task-06-02-waypoint-south-of-B.png',
    diagram: DIAGRAM,
    constraints: WAYPOINT_CONSTRAINTS,
    screenshot: 'viewport',
    label: 'wp1 south-of B, 60 — B→C edge routed through waypoint below B',
  },
  {
    file: 'demos/task-06/task-06-03-two-waypoints.png',
    diagram: `flowchart TD
    A[Alpha] --> B[Beta]
    B --> C[Gamma]
    C --> D[Delta]`,
    constraints: `%% @layout-constraints v1
%% waypoint A-->B as wp1
%% wp1 east-of A, 40
%% @end-layout-constraints`,
    screenshot: 'viewport',
    label: 'A→B edge routed east of A via waypoint',
  },
];

const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto('http://localhost:5174/demo/');
await page.waitForTimeout(2000);

for (const scenario of scenarios) {
  console.log(`Capturing: ${scenario.file}`);
  console.log(`  ${scenario.label}`);

  // Set the diagram source
  await page.fill('#diagram-source', scenario.diagram);
  await page.dispatchEvent('#diagram-source', 'input');
  await page.waitForTimeout(500);

  // Set constraints
  await page.fill('#constraint-source', scenario.constraints);
  await page.dispatchEvent('#constraint-source', 'input');
  await page.waitForTimeout(2000);

  const filePath = `/home/user/mermaid-clamp/${scenario.file}`;
  await page.screenshot({ path: filePath });
  console.log(`  Saved: ${filePath}`);
}

await browser.close();
console.log('\nAll screenshots captured.');

import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const PORT = 5175;

// Scenarios for BUG-1, BUG-2, BUG-3

const scenarios = [
  // ── BUG-2: default distance ─────────────────────────────────────────────────
  {
    file: 'demos/bugs-02-default-distance-no-arg.png',
    description: 'BUG-2: D east-of C with no distance — should show visible 20px gap',
    constraints: `%% @layout-constraints v1
%% D east-of C
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/bugs-02-default-distance-explicit-zero.png',
    description: 'BUG-2: D east-of C, 0 — should mean touching (0px gap)',
    constraints: `%% @layout-constraints v1
%% D east-of C, 0
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/bugs-02-default-distance-compare-viewport.png',
    description: 'BUG-2: side-by-side — before (no constraints) vs after (D east-of C default gap)',
    constraints: `%% @layout-constraints v1
%% D east-of C
%% @end-layout-constraints`,
    screenshot: 'viewport',
  },

  // ── BUG-3: cascade / descendant dragging ────────────────────────────────────
  {
    file: 'demos/bugs-03-cascade-H-below-D.png',
    description: 'BUG-3: H south-of D, 20 + D east-of C, 50 — H must be below D\'s NEW position',
    constraints: `%% @layout-constraints v1
%% H south-of D, 20
%% D east-of C, 50
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/bugs-03-cascade-viewport.png',
    description: 'BUG-3: full page — cascade ordering proof',
    constraints: `%% @layout-constraints v1
%% H south-of D, 20
%% D east-of C, 50
%% @end-layout-constraints`,
    screenshot: 'viewport',
  },

  // ── BUG-1: curved paths preserved ───────────────────────────────────────────
  {
    file: 'demos/bugs-01-curved-paths-before-constraint.png',
    description: 'BUG-1 baseline: no constraints, edges are curved (dagre default)',
    constraints: `%% @layout-constraints v1
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/bugs-01-curved-paths-after-constraint.png',
    description: 'BUG-1: D east-of C, 50 — edges should still be curved, not straight lines',
    constraints: `%% @layout-constraints v1
%% D east-of C, 50
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/bugs-01-curved-paths-full-constraints.png',
    description: 'BUG-1: full default constraints — all edges curved, none replaced with M…L',
    constraints: `%% @layout-constraints v1
%% align B, C, v
%% D east-of C, 50
%% align D, H, v
%% align E, F, h
%% E south-of C, 20
%% H south-of D, 20
%% align G, H, h
%% @end-layout-constraints`,
    screenshot: '#after',
  },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto(`http://localhost:${PORT}/demo/`);
await page.waitForTimeout(3000);

const baseDir = '/home/user/mermaid-clamp/';

for (const scenario of scenarios) {
  console.log(`Capturing: ${scenario.file}`);
  console.log(`  ${scenario.description}`);

  await page.fill('#constraint-source', scenario.constraints);
  await page.dispatchEvent('#constraint-source', 'input');
  await page.waitForTimeout(2500);

  const filePath = baseDir + scenario.file;

  if (scenario.screenshot === 'viewport') {
    await page.screenshot({ path: filePath });
  } else if (scenario.screenshot === 'fullpage') {
    await page.screenshot({ path: filePath, fullPage: true });
  } else {
    const element = page.locator(scenario.screenshot);
    await element.screenshot({ path: filePath });
  }

  console.log(`  Saved: ${filePath}`);
}

await browser.close();
console.log('\nAll screenshots captured.');

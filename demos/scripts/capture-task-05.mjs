import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';

const DEFAULT_CONSTRAINTS = `%% @layout-constraints v1
%% align B, C, v
%% D east-of C, 50
%% align D, H, v
%% align E, F, h
%% E south-of C, 20
%% H south-of D, 20
%% align G, H, h
%% @end-layout-constraints`;

const scenarios = [
  {
    file: 'demos/task-05/task-05-01-default-side-by-side.png',
    constraints: DEFAULT_CONSTRAINTS,
    screenshot: 'viewport',
  },
  {
    file: 'demos/task-05/task-05-02-default-after.png',
    constraints: DEFAULT_CONSTRAINTS,
    screenshot: '#after',
  },
  {
    file: 'demos/task-05/task-05-03-default-before.png',
    constraints: DEFAULT_CONSTRAINTS,
    screenshot: '#before',
  },
  {
    file: 'demos/task-05/task-05-04-align-h-first-is-anchor.png',
    constraints: `%% @layout-constraints v1
%% align B, D, h
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/task-05/task-05-05-align-h-second-follows.png',
    constraints: `%% @layout-constraints v1
%% align G, H, h
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/task-05/task-05-06-align-v.png',
    constraints: `%% @layout-constraints v1
%% align B, C, v
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/task-05/task-05-07-east-of.png',
    constraints: `%% @layout-constraints v1
%% D east-of C, 50
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/task-05/task-05-08-south-of.png',
    constraints: `%% @layout-constraints v1
%% E south-of C, 20
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/task-05/task-05-09-overlap-repulsion.png',
    constraints: `%% @layout-constraints v1
%% align B, D, h
%% align G, H, h
%% @end-layout-constraints`,
    screenshot: '#after',
  },
  {
    file: 'demos/task-05/task-05-10-warnings.png',
    constraints: `%% @layout-constraints v1
%% align B, C, v
%% this is not a valid constraint
%% D east-of C, 50
%% @end-layout-constraints`,
    screenshot: 'viewport',
  },
  {
    file: 'demos/task-05/task-05-11-live-editor.png',
    constraints: DEFAULT_CONSTRAINTS,
    screenshot: 'fullpage',
  },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });

await page.goto('http://localhost:5174/demo/');
await page.waitForTimeout(2000);

const baseDir = '/home/user/mermaid-clamp/';

for (const scenario of scenarios) {
  console.log(`Capturing: ${scenario.file}`);

  await page.fill('#constraint-source', scenario.constraints);
  await page.dispatchEvent('#constraint-source', 'input');
  await page.waitForTimeout(2000);

  const filePath = baseDir + scenario.file;

  if (scenario.screenshot === 'viewport') {
    await page.screenshot({ path: filePath });
  } else if (scenario.screenshot === 'fullpage') {
    await page.screenshot({ path: filePath, fullPage: true });
  } else {
    const element = await page.locator(scenario.screenshot);
    await element.screenshot({ path: filePath });
  }

  console.log(`  Saved: ${filePath}`);
}

await browser.close();
console.log('All screenshots captured.');

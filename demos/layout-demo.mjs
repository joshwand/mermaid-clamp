// Demo: show setDiagramText + applyConstraintsToNodes working together.
// Simulates what happens inside constrainedDagreAlgorithm.render() after dagre runs.
// Run with: node demos/layout-demo.mjs
import {
  setDiagramText,
  applyConstraintsToNodes,
  parseTranslate,
  formatTranslate,
} from '../dist/mermaid-layout-constraints.esm.mjs';

// 1. Register diagram text (user would call this before mermaid.render())
const diagramId = 'demo-diagram';
const diagramText = `flowchart TD
    A[Start] --> B[Process]
    B --> C[End]

%% @layout-constraints v1
%% A south-of B, 200
%% align B, C, v
%% @end-layout-constraints`;

setDiagramText(diagramId, diagramText);
console.log('=== Registered diagram text for:', diagramId);

// 2. Simulate positions dagre would have computed
const dagrePositions = [
  { id: 'A', x: 150, y: 100, width: 80, height: 40 },
  { id: 'B', x: 250, y: 200, width: 80, height: 40 },
  { id: 'C', x: 100, y: 300, width: 80, height: 40 },
];

console.log('\n=== Dagre positions (before constraints) ===');
for (const n of dagrePositions) {
  console.log(`  ${n.id}: x=${n.x}, y=${n.y}`);
}

// 3. Apply constraints
const solved = applyConstraintsToNodes(dagrePositions, diagramId);

console.log('\n=== Solved positions (after constraints) ===');
for (const n of solved) {
  console.log(`  ${n.id}: x=${n.x}, y=${n.y}`);
}

// 4. Verify expectations:
//   A south-of B, 200 → A.y = B.y + 200 = 200 + 200 = 400
//   align B, C, v → B.x = C.x = same (average of 250 and 100 = 175)
const A = solved.find(n => n.id === 'A');
const B = solved.find(n => n.id === 'B');
const C = solved.find(n => n.id === 'C');
console.log('\n=== Verification ===');
console.log(`  A.y = B.y + 200: ${A.y} ≈ ${B.y + 200} → ${Math.abs(A.y - (B.y + 200)) < 1 ? 'PASS' : 'FAIL'}`);
console.log(`  align B, C, v (same X): B.x=${Math.round(B.x)}, C.x=${Math.round(C.x)} → ${Math.abs(B.x - C.x) < 1 ? 'PASS' : 'FAIL'}`);

// 5. Demonstrate SVG transform helpers
console.log('\n=== SVG transform helpers ===');
const transform = 'translate(123.5, 456.75)';
const parsed = parseTranslate(transform);
console.log(`  parseTranslate('${transform}') → ${JSON.stringify(parsed)}`);
console.log(`  formatTranslate(200, 300) → '${formatTranslate(200, 300)}'`);

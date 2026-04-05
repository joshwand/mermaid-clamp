// Demo: show constraint solver before/after positions.
// Run with: node demos/solver-demo.mjs
import { solveConstraints } from '../dist/mermaid-layout-constraints.esm.mjs';

function fmt(nodes) {
  return nodes.map(n => `  ${n.id.padEnd(4)} x=${String(Math.round(n.x)).padStart(4)}  y=${String(Math.round(n.y)).padStart(4)}`).join('\n');
}

const nodes = [
  { id: 'A', x: 100, y: 100, width: 80, height: 40 },
  { id: 'B', x: 200, y: 180, width: 80, height: 40 },
  { id: 'C', x: 300, y: 260, width: 80, height: 40 },
  { id: 'D', x: 400, y:  50, width: 80, height: 40 },
  { id: 'wp1', x: 150, y: 150, width: 0, height: 0, isWaypoint: true },
];

console.log('=== Before ===');
console.log(fmt(nodes));

// Scenario: align A and B horizontally, D south-of A at 200, anchor C, wp1 west-of C
const constraints = {
  version: 1,
  constraints: [
    { type: 'align',       id: 'a1',  nodes: ['A', 'B'], axis: 'h' },
    { type: 'directional', id: 'd1',  nodeA: 'D', direction: 'south-of', nodeB: 'A', distance: 200 },
    { type: 'anchor',      id: 'anc', node: 'C', x: 300, y: 260 },
    { type: 'directional', id: 'd2',  nodeA: 'wp1', direction: 'west-of', nodeB: 'C', distance: 40 },
  ],
};

const result = solveConstraints(nodes, constraints);
console.log('\n=== After ===');
console.log(fmt(result));

console.log('\n=== Delta ===');
for (let i = 0; i < nodes.length; i++) {
  const dx = Math.round(result[i].x - nodes[i].x);
  const dy = Math.round(result[i].y - nodes[i].y);
  console.log(`  ${nodes[i].id.padEnd(4)} Δx=${String(dx).padStart(4)}  Δy=${String(dy).padStart(4)}`);
}

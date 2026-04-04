// Demo: round-trip parse → serialize → parse, and inject/strip.
// Run with: node demos/serializer-demo.mjs
import { parseConstraints } from '../dist/mermaid-layout-constraints.esm.mjs';
import { serializeConstraints, injectConstraints, stripConstraints } from '../dist/mermaid-layout-constraints.esm.mjs';

const original = `flowchart TD
    A --> B
    B --> C
    B --> D

%% @layout-constraints v1
%% waypoint D-->H as wp1
%% anchor A, 50, 50
%% group B, C as pair
%% align B, C, h
%% A south-of B, 120
%% @end-layout-constraints`;

console.log('=== 1. Parse original ===');
const cs = parseConstraints(original);
console.log(`  ${cs.constraints.length} constraints parsed`);

console.log('\n=== 2. Serialize (deterministic, sorted) ===');
const serialized = serializeConstraints(cs);
console.log(serialized);

console.log('\n=== 3. Round-trip: re-parse the serialized block ===');
const reparsed = parseConstraints(serialized);
const idsMatch = JSON.stringify(cs.constraints.map(c => c.id).sort()) ===
                 JSON.stringify(reparsed.constraints.map(c => c.id).sort());
console.log(`  IDs match after round-trip: ${idsMatch}`);

console.log('\n=== 4. stripConstraints ===');
const stripped = stripConstraints(original);
console.log(stripped);

console.log('\n=== 5. injectConstraints (replace existing block) ===');
const newCs = parseConstraints('%% @layout-constraints v1\n%% C north-of A, 60\n%% @end-layout-constraints');
const injected = injectConstraints(original, newCs);
console.log(injected);

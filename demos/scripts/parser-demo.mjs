// Demo: show parseConstraints output for a realistic constraint block.
// Run with: node demos/parser-demo.mjs
import { parseConstraints } from '../dist/mermaid-layout-constraints.esm.mjs';

const text = `flowchart TD
    A[Start] --> B[Validate]
    B --> C[Process]
    B --> D[Reject]

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

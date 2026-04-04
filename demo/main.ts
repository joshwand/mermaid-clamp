import mermaid from 'mermaid';
import constraintLayouts, { setDiagramText } from '../src/index.js';

// ── Diagram source ────────────────────────────────────────────────────────────

const BASE_DIAGRAM = `flowchart TD
    A[Start] --> B[Validate Input]
    B --> C[Process]
    B --> D[Reject]
    C --> E[Store]
    C --> F[Notify]
    E --> G[Complete]
    F --> G
    D --> H[Log Error]`;

const CONSTRAINT_BLOCK = `
%% @layout-constraints v1
%% align B, C, v
%% D east-of B, 200
%% align E, F, h
%% group E, F as outputs
%% E south-of C, 150
%% H east-of G, 180
%% align H, G, h
%% @end-layout-constraints`;

const DIAGRAM_WITH_CONSTRAINTS = BASE_DIAGRAM + '\n' + CONSTRAINT_BLOCK;

// ── Mermaid setup ─────────────────────────────────────────────────────────────

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

mermaid.registerLayoutLoaders(constraintLayouts);

// ── Render ────────────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status')!;
const beforeEl = document.getElementById('before')!;
const afterEl = document.getElementById('after')!;
const constraintTextEl = document.getElementById('constraint-text')!;

constraintTextEl.textContent = CONSTRAINT_BLOCK.trim();

async function renderDiagram(
  id: string,
  text: string,
  layout: string,
  container: HTMLElement,
): Promise<void> {
  const diagramText = layout === 'constrained-dagre'
    ? text
    : text.replace(/\nflowchart TD/, 'flowchart TD'); // unchanged

  // Inject the layout directive into the diagram text
  const withLayout = `%%{init: {"flowchart": {"htmlLabels": true}, "layout": "${layout}"}}%%\n${diagramText}`;

  if (layout === 'constrained-dagre') {
    setDiagramText(id, diagramText);
  }

  const { svg } = await mermaid.render(id, withLayout);
  container.innerHTML = svg;
}

async function main(): Promise<void> {
  try {
    await Promise.all([
      renderDiagram('diagram-before', BASE_DIAGRAM, 'dagre', beforeEl),
      renderDiagram('diagram-after', DIAGRAM_WITH_CONSTRAINTS, 'constrained-dagre', afterEl),
    ]);
    statusEl.textContent = 'Rendered. Constraints applied to the right diagram.';
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = `Render error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
}

main();

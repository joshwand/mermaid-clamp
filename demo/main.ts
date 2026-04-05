import mermaid from 'mermaid';
import constraintLayouts, { setDiagramText, getAndClearWarnings } from '../src/index.js';

// ── Default content ───────────────────────────────────────────────────────────

const DEFAULT_DIAGRAM = `flowchart TD
    A["Start (A)"] --> B["Validate Input (B)"]
    B --> C["Process (C)"]
    B --> D["Reject (D)"]
    C --> E["Store (E)"]
    C --> F["Notify (F)"]
    E --> G["Complete (G)"]
    F --> G
    D --> H["Log Error (H)"]`;

const DEFAULT_CONSTRAINTS = `%% @layout-constraints v1
%% align B, C, v
%% D east-of C, 50
%% align D, H, v
%% align E, F, h
%% E south-of C, 20
%% H south-of D, 20
%% align G, H, h
%% @end-layout-constraints`;

// ── Mermaid setup ─────────────────────────────────────────────────────────────

mermaid.initialize({
  startOnLoad: false,
  theme: 'default',
  securityLevel: 'loose',
});

mermaid.registerLayoutLoaders(constraintLayouts);

// ── DOM refs ──────────────────────────────────────────────────────────────────

const statusEl = document.getElementById('status')!;
const beforeEl = document.getElementById('before')!;
const afterEl  = document.getElementById('after')!;
const diagramTextarea    = document.getElementById('diagram-source') as HTMLTextAreaElement;
const constraintTextarea = document.getElementById('constraint-source') as HTMLTextAreaElement;

diagramTextarea.value    = DEFAULT_DIAGRAM;
constraintTextarea.value = DEFAULT_CONSTRAINTS;

// ── Render ────────────────────────────────────────────────────────────────────

let renderCount = 0;

async function renderDiagram(
  idBase: string,
  text: string,
  layout: string,
  container: HTMLElement,
): Promise<void> {
  const id = `${idBase}-${renderCount}`;
  const withLayout = `%%{init: {"flowchart": {"htmlLabels": true}, "layout": "${layout}"}}%%\n${text}`;

  if (layout === 'constrained-dagre') {
    setDiagramText(id, text);
  }

  const { svg } = await mermaid.render(id, withLayout);
  container.innerHTML = svg;
}

async function render(): Promise<void> {
  renderCount++;
  const baseDiagram   = diagramTextarea.value;
  const constraintSrc = constraintTextarea.value;
  const withConstraints = `${baseDiagram}\n${constraintSrc}`;

  statusEl.className   = 'pending';
  statusEl.textContent = 'Rendering…';

  try {
    await Promise.all([
      renderDiagram('diagram-before', baseDiagram,     'dagre',            beforeEl),
      renderDiagram('diagram-after',  withConstraints, 'constrained-dagre', afterEl),
    ]);
    const warnings = getAndClearWarnings();
    if (warnings.length > 0) {
      statusEl.className   = 'warning';
      statusEl.textContent = warnings.map((w) => `Warning: ${w}`).join('\n');
    } else {
      statusEl.className   = '';
      statusEl.textContent = 'Rendered.';
    }
  } catch (err) {
    statusEl.className   = 'error';
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
}

// ── Debounced re-render on textarea input ─────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRender(): void {
  statusEl.className   = 'pending';
  statusEl.textContent = 'Waiting…';
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 750);
}

diagramTextarea.addEventListener('input', scheduleRender);
constraintTextarea.addEventListener('input', scheduleRender);

// ── Initial render ────────────────────────────────────────────────────────────

render();

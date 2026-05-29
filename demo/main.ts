import mermaid from 'mermaid';
import constraintLayouts, { setDiagramText, getAndClearWarnings } from '../src/index.js';

// ── Preset gallery ──────────────────────────────────────────────────────────
//
// Each preset demonstrates one capability of the constraint layout engine.
// `diagram` is plain mermaid; `constraints` is the `%% @layout-constraints`
// block. The two are concatenated and rendered with `layout: constrained-dagre`
// in the "after" panel, and the bare diagram is rendered with stock `dagre` in
// the "before" panel for comparison.

interface Preset {
  id: string;
  label: string;
  blurb: string;
  diagram: string;
  constraints: string;
}

const PRESETS: Preset[] = [
  {
    id: 'align-offset',
    label: 'Alignment + offsets',
    blurb:
      'Combine alignment (same row/column) with edge-to-edge directional offsets. ' +
      'In an alignment, the first node is the reference and the rest move to it.',
    diagram: `flowchart TD
    A["Start (A)"] --> B["Validate Input (B)"]
    B --> C["Process (C)"]
    B --> D["Reject (D)"]
    C --> E["Store (E)"]
    C --> F["Notify (F)"]
    E --> G["Complete (G)"]
    F --> G
    D --> H["Log Error (H)"]`,
    constraints: `%% @layout-constraints v1
%% align B, C, v
%% D east-of C, 50
%% align D, H, v
%% align E, F, h
%% E south-of C, 20
%% H south-of D, 20
%% align G, H, h
%% @end-layout-constraints`,
  },
  {
    id: 'directional',
    label: 'Directional offsets',
    blurb:
      'The four cardinal offsets (north-of / south-of / east-of / west-of). ' +
      'Distances are edge-to-edge in pixels; omitting the distance defaults to 20px.',
    diagram: `flowchart TD
    Hub["Hub"] --> N["North"]
    Hub --> S["South"]
    Hub --> E["East"]
    Hub --> W["West"]`,
    constraints: `%% @layout-constraints v1
%% N north-of Hub, 80
%% S south-of Hub, 80
%% E east-of Hub, 120
%% W west-of Hub, 120
%% align N, Hub, S, v
%% align W, Hub, E, h
%% @end-layout-constraints`,
  },
  {
    id: 'anchor',
    label: 'Anchor (pin coords)',
    blurb:
      'anchor pins a node to absolute layout coordinates. It is the highest-priority ' +
      'constraint and overrides directional/align constraints on the pinned axes.',
    diagram: `flowchart TD
    A["A"] --> B["B"]
    A --> C["C"]
    B --> D["D"]
    C --> D`,
    constraints: `%% @layout-constraints v1
%% anchor A, 300, 60
%% anchor D, 300, 360
%% @end-layout-constraints`,
  },
  {
    id: 'group',
    label: 'Group as a unit',
    blurb:
      'group ties nodes together so they keep their relative positions and move ' +
      'together when any member is referenced by another constraint.',
    diagram: `flowchart TD
    In["Ingest"] --> P1["Parse"]
    P1 --> P2["Transform"]
    P2 --> P3["Validate"]
    P3 --> Out["Emit"]`,
    constraints: `%% @layout-constraints v1
%% group P1, P2, P3 as pipeline
%% In east-of P1, 100
%% @end-layout-constraints`,
  },
  {
    id: 'waypoint',
    label: 'Edge waypoint',
    blurb:
      'A waypoint is a zero-size shadow node on an edge. It takes ordinary ' +
      'constraints (here south-of), forcing the edge to detour through its position.',
    diagram: `flowchart TD
    A["A"] --> B["B"]
    B --> C["C"]`,
    constraints: `%% @layout-constraints v1
%% waypoint B-->C as wp1
%% wp1 south-of B, 70
%% @end-layout-constraints`,
  },
  {
    id: 'multi-waypoint',
    label: 'Multi-waypoint elbow',
    blurb:
      'Multiple waypoints on one edge are routed in declaration order, letting you ' +
      'shape elbows and detours around other nodes.',
    diagram: `flowchart TD
    A["Source"] --> B["Target"]
    obs["Obstacle"]
    A --> obs`,
    constraints: `%% @layout-constraints v1
%% obs east-of A, 60
%% waypoint A-->B as wp1
%% waypoint A-->B as wp2
%% wp1 east-of A, 90
%% wp2 south-of obs, 40
%% @end-layout-constraints`,
  },
  {
    id: 'bezier',
    label: 'Bezier handle tuning',
    blurb:
      'bezier overrides the control-handle length at a waypoint (incoming, outgoing) ' +
      'or at the real-node end of a segment, tightening or loosening the curve.',
    diagram: `flowchart TD
    A["A"] --> B["B"]
    B --> C["C"]`,
    constraints: `%% @layout-constraints v1
%% waypoint B-->C as wp1
%% wp1 east-of B, 90
%% bezier wp1, 20, 80
%% @end-layout-constraints`,
  },
  {
    id: 'debug',
    label: 'Debug overlay',
    blurb:
      'Add `%% debug bezier` (in the block or at top level) to draw every edge’s ' +
      'bezier control handles and anchor points—useful for inspecting routing.',
    diagram: `flowchart TD
    A["A"] --> B["B"]
    B --> C["C"]
    B --> D["D"]`,
    constraints: `%% @layout-constraints v1
%% waypoint B-->C as wp1
%% wp1 east-of B, 80
%% debug bezier
%% @end-layout-constraints`,
  },
];

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
const afterEl = document.getElementById('after')!;
const blurbEl = document.getElementById('blurb')!;
const presetsEl = document.getElementById('presets')!;
const diagramTextarea = document.getElementById('diagram-source') as HTMLTextAreaElement;
const constraintTextarea = document.getElementById('constraint-source') as HTMLTextAreaElement;

// ── Preset buttons ────────────────────────────────────────────────────────────

let activePresetId = PRESETS[0].id;

function renderPresetButtons(): void {
  presetsEl.innerHTML = '';
  for (const preset of PRESETS) {
    const btn = document.createElement('button');
    btn.className = 'preset-btn' + (preset.id === activePresetId ? ' active' : '');
    btn.textContent = preset.label;
    btn.addEventListener('click', () => loadPreset(preset.id));
    presetsEl.appendChild(btn);
  }
}

function loadPreset(id: string): void {
  const preset = PRESETS.find((p) => p.id === id);
  if (!preset) return;
  activePresetId = id;
  diagramTextarea.value = preset.diagram;
  constraintTextarea.value = preset.constraints;
  blurbEl.textContent = preset.blurb;
  renderPresetButtons();
  render();
}

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
  const baseDiagram = diagramTextarea.value;
  const constraintSrc = constraintTextarea.value;
  const withConstraints = `${baseDiagram}\n${constraintSrc}`;

  statusEl.className = 'pending';
  statusEl.textContent = 'Rendering…';

  try {
    await Promise.all([
      renderDiagram('diagram-before', baseDiagram, 'dagre', beforeEl),
      renderDiagram('diagram-after', withConstraints, 'constrained-dagre', afterEl),
    ]);
    const warnings = getAndClearWarnings();
    if (warnings.length > 0) {
      statusEl.className = 'warning';
      statusEl.textContent = warnings.map((w) => `Warning: ${w}`).join('\n');
    } else {
      statusEl.className = '';
      statusEl.textContent = 'Rendered.';
    }
  } catch (err) {
    statusEl.className = 'error';
    statusEl.textContent = `Error: ${err instanceof Error ? err.message : String(err)}`;
    console.error(err);
  }
}

// ── Debounced re-render on textarea input ─────────────────────────────────────

let debounceTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleRender(): void {
  statusEl.className = 'pending';
  statusEl.textContent = 'Waiting…';
  if (debounceTimer !== null) clearTimeout(debounceTimer);
  debounceTimer = setTimeout(render, 750);
}

diagramTextarea.addEventListener('input', scheduleRender);
constraintTextarea.addEventListener('input', scheduleRender);

// ── Initial render ────────────────────────────────────────────────────────────

renderPresetButtons();
loadPreset(activePresetId);

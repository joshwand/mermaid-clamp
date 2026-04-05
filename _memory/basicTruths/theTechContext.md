# Tech Context

## Technology Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Language | TypeScript (strict mode) | Mermaid itself is TypeScript; type safety for constraint model |
| Build | Vite (library mode) | Mermaid uses Vite; consistent tooling |
| Test | Vitest | Mermaid uses Vitest; integrates with Vite |
| Package format | ESM + CJS dual export | Match `@mermaid-js/layout-elk` pattern |
| SVG manipulation | Direct DOM API | No D3 dependency for editor; keep bundle small |
| Layout base | dagre-d3-es (from mermaid) | Don't bundle a second copy; use mermaid's existing dagre |
| Documentation | VitePress or plain markdown | Mermaid docs use VitePress |
| Agent verification | Showboat + Rodney | CLI tools for building verifiable demo documents with screenshots |

## Dependencies

```json
{
  "peerDependencies": {
    "mermaid": ">=11.0.0"
  },
  "devDependencies": {
    "mermaid": "^11.x",
    "typescript": "^5.x",
    "vite": "^5.x",
    "vitest": "^1.x",
    "showboat": "latest",
    "rodney": "latest"
  }
}
```

Zero runtime dependencies beyond the mermaid peer dep. Showboat and Rodney are dev-only for agent verification.

## Build Outputs

```
dist/
├── mermaid-layout-constraints.esm.mjs    # ESM, layout engine only
├── mermaid-layout-constraints.cjs.js     # CJS, layout engine only
├── mermaid-layout-constraints.d.ts       # Types
├── editor.esm.mjs                        # ESM, editor overlay (separate import)
├── editor.cjs.js                         # CJS, editor overlay
└── editor.d.ts
```

## Standards and Conventions

- TypeScript strict mode. No `any` except at mermaid interop boundaries (comment: `// mermaid internal`).
- Pure functions in `parser/`, `serializer/`, `layout/`. Side effects isolated to `editor/` and `state/`.
- All exports via `src/index.ts` (layout engine) or `src/editor.ts` (editor overlay).
- Test files colocated: `foo.ts` → `foo.test.ts`.
- Constraint solver must be deterministic. Same inputs → same outputs. No randomness.
- Vitest with `describe/it/expect`. Integration tests use actual mermaid render calls.
- ESLint + Prettier.
- Git: branch per task (`task-NN-short-description`), commit messages (`task NN: description`), squash-merge to main.

## Mermaid Plugin API

### registerLayoutLoaders

```typescript
// How external layout engines register with mermaid (v11+)
import mermaid from 'mermaid';
import constraintLayouts from 'mermaid-layout-constraints';
mermaid.registerLayoutLoaders(constraintLayouts);
```

The loader definition pattern (from `@mermaid-js/layout-elk`):

```typescript
const constraintLayouts: LayoutLoaderDefinition[] = [
  {
    name: 'constrained-dagre',
    loader: async () => constrainedDagreLayout,
  },
];
export default constraintLayouts;
```

### LayoutData Interface

All mermaid layout engines consume a standardized `LayoutData` structure containing nodes (with dimensions), edges (with labels), and clusters (subgraphs). The layout function mutates node positions in place.

Key source files to study:
- `packages/mermaid/src/diagrams/flowchart/flowRenderer-v3-unified.ts` (how renderers call layout)
- `packages/mermaid/src/rendering-util/layout-algorithms/dagre/index.js` (dagre implementation)
- `packages/mermaid-layout-elk/src/render.ts` (ELK implementation — our closest reference)

## Verification Workflow (Showboat + Rodney)

### Naming Convention

All demo screenshot files follow: **`task-NN-NN-description.png`**
- First `NN` = task number (matches task-NN.md)
- Second `NN` = scenario number within that task (01, 02, ...)
- `description` = brief kebab-case description of what the scenario proves

Examples: `task-05-02-default-after.png`, `task-06-01-arrow-routing.png`

**Rules:**
- No intermediate/diagnostic files committed. If a fix changes the output, delete all `task-NN-*.png` for that task and regenerate from scratch.
- Maintain a numbered list of scenarios in the task-NN.md; each scenario has its own screenshot.

### Demo Document Requirements

Every task-NN.md must:

1. **State what is being demonstrated** — describe the feature/module at the top.
2. **Include test output** — run `pnpm test` and embed the result verbatim.
3. **Cover all relevant scenarios** — one screenshot per scenario; scenarios must collectively prove:
   - The feature works correctly (happy path)
   - Edge cases and variant inputs work
   - Nothing previously working is broken (regression)
   - The spec is followed exactly (e.g., correct semantics, no overlaps)
4. **Be verbose enough to prove it** — if in doubt, add another scenario.
5. **Include a key implementation facts table** — summarise the critical behaviours.

Your job is to **PROVE** that the work was implemented completely, correctly, follows the spec, and did not break anything else.

### Screenshot Capture Pattern

Use Playwright (available at `/opt/node22/lib/node_modules/playwright/index.mjs`) against the Vite dev server. Always check which port the server started on (5173 or 5174 if busy).

```js
import { chromium } from '/opt/node22/lib/node_modules/playwright/index.mjs';
const browser = await chromium.launch();
const page = await browser.newPage();
await page.setViewportSize({ width: 1400, height: 900 });
await page.goto('http://localhost:5173/demo/');
await page.waitForTimeout(4000); // wait for initial render

// Change constraints
await page.fill('#constraint-source', constraintsText);
await page.dispatchEvent('#constraint-source', 'input');
await page.waitForTimeout(2000); // wait for debounce + render

// Full viewport
await page.screenshot({ path: 'demos/task-NN-NN-description.png' });

// Single panel
const after = await page.$('#after');
await after.screenshot({ path: 'demos/task-NN-NN-after-panel.png' });
```

Use **subagents** to run the capture session — this keeps the main agent's context clean and avoids context bloat from large screenshot data.

### What Each Task Demo Must Prove

Scenarios to always include for layout-engine tasks:
- Default constraints render correctly (before + after side-by-side)
- Each constraint type used in the task renders correctly in isolation
- **No overlaps** in any scenario (visually verify + solver test assertions)
- Alignment first-is-anchor rule works (first node = reference, others move)
- Directional distances are edge-to-edge (not center-to-center)
- Arrow routing connects to node borders correctly
- Warnings surface in the status bar for malformed constraints
- Live editor textarea triggers re-render

At the end of every task, **delete all task-NN-*.png and regenerate all scenarios from scratch** to ensure all screenshots reflect the current implementation.

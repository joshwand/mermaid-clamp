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

At each implementation milestone, the agent must:

1. Build a Showboat demo document (`showboat init demos/task-NN.md`)
2. Add narrative context (`showboat note demos/task-NN.md "..."`)
3. Execute test commands and capture output (`showboat exec demos/task-NN.md bash "pnpm test -- --reporter=verbose"`)
4. For visual tasks (editor, affordances), use Rodney to:
   - Serve the test HTML page (`rodney open http://localhost:...`)
   - Capture screenshots (`rodney screenshot demos/task-NN-screenshot.png`)
   - Embed in Showboat doc (`showboat image demos/task-NN.md demos/task-NN-screenshot.png`)
5. **Human reviews the Showboat document before agent proceeds to next task**

This creates a verifiable trail of what was built and what it actually looks like, beyond just "tests pass."

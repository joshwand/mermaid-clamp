# Task 1: Project Scaffold + Type Definitions

*2026-04-03T02:56:59Z by Showboat 0.6.1*
<!-- showboat-id: a88526f3-1061-4c4f-8b8a-497c1f089448 -->

Task 1: Project Scaffold + Type Definitions. This demo shows that the project builds cleanly and all smoke tests pass. The scaffold includes: TypeScript strict mode, Vite library mode with dual ESM/CJS output, two entry points (layout engine + editor), all constraint and layout types defined in src/types.ts, placeholder modules for every task 2-12 component, and 8 smoke tests.

```bash
pnpm test -- --reporter=verbose
```

```output

> mermaid-layout-constraints@0.1.0 test /home/user/mermaid-clamp
> vitest run -- --reporter=verbose


 RUN  v2.1.9 /home/user/mermaid-clamp

 ✓ src/index.test.ts (8 tests) 9ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
   Start at  02:57:12
   Duration  867ms (transform 132ms, setup 0ms, collect 90ms, tests 9ms, environment 0ms, prepare 439ms)

```

```bash
pnpm build
```

```output

> mermaid-layout-constraints@0.1.0 build /home/user/mermaid-clamp
> vite build && tsc --emitDeclarationOnly --declaration --declarationDir dist

vite v5.4.21 building for production...
transforming...
✓ 9 modules transformed.
rendering chunks...
computing gzip size...
dist/mermaid-layout-constraints.esm.mjs  0.47 kB │ gzip: 0.24 kB
dist/editor.esm.mjs                      0.81 kB │ gzip: 0.41 kB
dist/mermaid-layout-constraints.cjs.js  0.50 kB │ gzip: 0.28 kB
dist/editor.cjs.js                      0.56 kB │ gzip: 0.33 kB
✓ built in 137ms
```

```bash
ls dist/
```

```output
editor
editor.cjs.js
editor.d.ts
editor.esm.mjs
index.d.ts
index.test.d.ts
inference
layout
mermaid-layout-constraints.cjs.js
mermaid-layout-constraints.esm.mjs
parser
serializer
solver
state
types.d.ts
```

Build and tests both pass cleanly. Four output files produced (ESM + CJS for each entry point). TypeScript declarations generated. Ready for human review before proceeding to Task 2 (Constraint Parser).

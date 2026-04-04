import { defineConfig } from 'vite';
import { resolve } from 'path';

const isDemo = process.env.VITE_DEMO === '1';

export default defineConfig(isDemo
  ? {
      // ── Demo app mode (pnpm demo) ───────────────────────────────────────────
      root: resolve(__dirname, 'demo'),
      server: { port: 5174 },
      test: { environment: 'node' },
    }
  : {
      // ── Library build mode (pnpm build / pnpm test) ─────────────────────────
      build: {
        lib: {
          entry: {
            'mermaid-layout-constraints': resolve(__dirname, 'src/index.ts'),
            editor: resolve(__dirname, 'src/editor.ts'),
          },
          formats: ['es', 'cjs'],
          fileName: (format, entryName) => {
            const ext = format === 'es' ? 'esm.mjs' : 'cjs.js';
            return `${entryName}.${ext}`;
          },
        },
        rollupOptions: {
          external: [
            'mermaid',
            /^mermaid\//, // mermaid sub-paths (chunks, internals)
          ],
          output: {
            exports: 'named',
          },
        },
      },
      test: {
        environment: 'node',
      },
    });

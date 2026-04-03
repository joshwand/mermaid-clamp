import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
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
      external: ['mermaid'],
      output: {
        exports: 'named',
      },
    },
  },
  test: {
    environment: 'node',
  },
});

import type { LayoutFunction, LayoutLoaderDefinition } from '../types.js';

/**
 * The constrained-dagre layout function.
 * Wraps mermaid's default dagre layout with constraint solving.
 *
 * Implemented in Task 5.
 */
const constrainedDagreLayout: LayoutFunction = async (_data, _options) => {
  // no-op stub — full implementation in Task 5
};

/** Layout loader registration entry for mermaid.registerLayoutLoaders(). */
const constraintLayouts: LayoutLoaderDefinition[] = [
  {
    name: 'constrained-dagre',
    loader: async () => constrainedDagreLayout,
  },
];

export default constraintLayouts;

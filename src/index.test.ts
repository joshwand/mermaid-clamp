import { describe, it, expect } from 'vitest';
import constraintLayouts, { parseConstraints, solveConstraints } from './index.js';

describe('mermaid-layout-constraints scaffold', () => {
  describe('layout loader', () => {
    it('exports a non-empty layout loader array', () => {
      expect(Array.isArray(constraintLayouts)).toBe(true);
      expect(constraintLayouts.length).toBeGreaterThan(0);
    });

    it('contains a constrained-dagre loader entry', () => {
      const entry = constraintLayouts.find((l) => l.name === 'constrained-dagre');
      expect(entry).toBeDefined();
      expect(typeof entry?.loader).toBe('function');
    });

    it('loader resolves to a callable layout function', async () => {
      const entry = constraintLayouts.find((l) => l.name === 'constrained-dagre')!;
      const layoutFn = await entry.loader();
      expect(typeof layoutFn).toBe('function');
    });

    it('layout function can be called with no-op data', async () => {
      const entry = constraintLayouts.find((l) => l.name === 'constrained-dagre')!;
      const layoutFn = await entry.loader();
      await expect(layoutFn({})).resolves.toBeUndefined();
    });
  });

  describe('parseConstraints stub', () => {
    it('returns an empty ConstraintSet for any input', () => {
      const result = parseConstraints('flowchart TD\nA --> B');
      expect(result.version).toBe(1);
      expect(result.constraints).toHaveLength(0);
    });

    it('returns an empty ConstraintSet for empty string', () => {
      const result = parseConstraints('');
      expect(result.version).toBe(1);
      expect(result.constraints).toHaveLength(0);
    });
  });

  describe('solveConstraints stub', () => {
    it('returns the same positions when no constraints are present', () => {
      const nodes = [
        { id: 'A', x: 100, y: 100, width: 80, height: 40 },
        { id: 'B', x: 200, y: 200, width: 80, height: 40 },
      ];
      const result = solveConstraints(nodes, { version: 1, constraints: [] });
      expect(result).toHaveLength(2);
      expect(result[0]).toMatchObject({ id: 'A', x: 100, y: 100 });
      expect(result[1]).toMatchObject({ id: 'B', x: 200, y: 200 });
    });

    it('does not mutate the input nodes array', () => {
      const nodes = [{ id: 'A', x: 100, y: 100, width: 80, height: 40 }];
      const original = { ...nodes[0] };
      solveConstraints(nodes, { version: 1, constraints: [] });
      expect(nodes[0]).toMatchObject(original);
    });
  });
});

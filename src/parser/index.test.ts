import { describe, it, expect } from 'vitest';
import { parseConstraints } from './index.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function wrap(constraints: string): string {
  return [
    'flowchart TD',
    'A --> B',
    '',
    '%% @layout-constraints v1',
    ...constraints.split('\n').map((l) => (l ? `%% ${l}` : l)),
    '%% @end-layout-constraints',
  ].join('\n');
}

// ── Empty / missing block ─────────────────────────────────────────────────────

describe('parseConstraints — empty / missing', () => {
  it('returns empty ConstraintSet for empty string', () => {
    const result = parseConstraints('');
    expect(result).toEqual({ version: 1, constraints: [], warnings: [] });
  });

  it('returns empty ConstraintSet when no block is present', () => {
    const result = parseConstraints('flowchart TD\nA --> B\nB --> C');
    expect(result).toEqual({ version: 1, constraints: [], warnings: [] });
  });

  it('returns empty ConstraintSet for a block with no constraint lines', () => {
    const result = parseConstraints(wrap(''));
    expect(result).toEqual({ version: 1, constraints: [], warnings: [] });
  });
});

// ── Directional constraints ───────────────────────────────────────────────────

describe('parseConstraints — directional', () => {
  it('parses south-of', () => {
    const result = parseConstraints(wrap('A south-of B, 120'));
    expect(result.constraints).toHaveLength(1);
    const c = result.constraints[0];
    expect(c.type).toBe('directional');
    if (c.type === 'directional') {
      expect(c.nodeA).toBe('A');
      expect(c.direction).toBe('south-of');
      expect(c.nodeB).toBe('B');
      expect(c.distance).toBe(120);
    }
  });

  it('parses north-of', () => {
    const result = parseConstraints(wrap('A north-of B, 80'));
    expect(result.constraints[0]).toMatchObject({ type: 'directional', direction: 'north-of', distance: 80 });
  });

  it('parses east-of', () => {
    const result = parseConstraints(wrap('A east-of B, 100'));
    expect(result.constraints[0]).toMatchObject({ type: 'directional', direction: 'east-of', distance: 100 });
  });

  it('parses west-of', () => {
    const result = parseConstraints(wrap('A west-of B, 60'));
    expect(result.constraints[0]).toMatchObject({ type: 'directional', direction: 'west-of', distance: 60 });
  });

  it('generates a stable deterministic ID', () => {
    const r1 = parseConstraints(wrap('A south-of B, 120'));
    const r2 = parseConstraints(wrap('A south-of B, 120'));
    expect(r1.constraints[0].id).toBe(r2.constraints[0].id);
  });

  it('generates different IDs for different constraints', () => {
    const r1 = parseConstraints(wrap('A south-of B, 120'));
    const r2 = parseConstraints(wrap('A south-of B, 130'));
    expect(r1.constraints[0].id).not.toBe(r2.constraints[0].id);
  });

  it('omitted distance defaults to 20', () => {
    const result = parseConstraints(wrap('D east-of C'));
    expect(result.constraints).toHaveLength(1);
    const c = result.constraints[0];
    expect(c.type).toBe('directional');
    if (c.type === 'directional') {
      expect(c.distance).toBe(20);
    }
  });

  it('explicit zero distance overrides the default', () => {
    const result = parseConstraints(wrap('D east-of C, 0'));
    expect(result.constraints).toHaveLength(1);
    const c = result.constraints[0];
    if (c.type === 'directional') {
      expect(c.distance).toBe(0);
    }
  });

  it('omitted distance and explicit 20 produce the same constraint ID', () => {
    const r1 = parseConstraints(wrap('D east-of C'));
    const r2 = parseConstraints(wrap('D east-of C, 20'));
    expect(r1.constraints[0].id).toBe(r2.constraints[0].id);
  });
});

// ── Align constraints ─────────────────────────────────────────────────────────

describe('parseConstraints — align', () => {
  it('parses align h (two nodes)', () => {
    const result = parseConstraints(wrap('align A, B, h'));
    expect(result.constraints).toHaveLength(1);
    const c = result.constraints[0];
    expect(c.type).toBe('align');
    if (c.type === 'align') {
      expect(c.nodes).toEqual(['A', 'B']);
      expect(c.axis).toBe('h');
    }
  });

  it('parses align v (two nodes)', () => {
    const result = parseConstraints(wrap('align A, B, v'));
    expect(result.constraints[0]).toMatchObject({ type: 'align', axis: 'v' });
  });

  it('parses align h (three nodes)', () => {
    const result = parseConstraints(wrap('align A, B, C, h'));
    const c = result.constraints[0];
    expect(c.type).toBe('align');
    if (c.type === 'align') {
      expect(c.nodes).toEqual(['A', 'B', 'C']);
      expect(c.axis).toBe('h');
    }
  });
});

// ── Group constraints ─────────────────────────────────────────────────────────

describe('parseConstraints — group', () => {
  it('parses group with two nodes', () => {
    const result = parseConstraints(wrap('group A, B as mygroup'));
    expect(result.constraints).toHaveLength(1);
    const c = result.constraints[0];
    expect(c.type).toBe('group');
    if (c.type === 'group') {
      expect(c.nodes).toEqual(['A', 'B']);
      expect(c.name).toBe('mygroup');
    }
  });

  it('parses group with three nodes', () => {
    const result = parseConstraints(wrap('group A, B, C as processing'));
    const c = result.constraints[0];
    expect(c.type).toBe('group');
    if (c.type === 'group') {
      expect(c.nodes).toEqual(['A', 'B', 'C']);
      expect(c.name).toBe('processing');
    }
  });
});

// ── Anchor constraints ────────────────────────────────────────────────────────

describe('parseConstraints — anchor', () => {
  it('parses anchor with x and y', () => {
    const result = parseConstraints(wrap('anchor A, 200, 300'));
    expect(result.constraints).toHaveLength(1);
    const c = result.constraints[0];
    expect(c.type).toBe('anchor');
    if (c.type === 'anchor') {
      expect(c.node).toBe('A');
      expect(c.x).toBe(200);
      expect(c.y).toBe(300);
    }
  });
});

// ── Waypoint declarations ─────────────────────────────────────────────────────

describe('parseConstraints — waypoint', () => {
  it('parses waypoint declaration with --> arrow', () => {
    const result = parseConstraints(wrap('waypoint A-->B as wp1'));
    expect(result.constraints).toHaveLength(1);
    const c = result.constraints[0];
    expect(c.type).toBe('waypoint');
    if (c.type === 'waypoint') {
      expect(c.edgeId).toBe('A-->B');
      expect(c.waypointId).toBe('wp1');
    }
  });

  it('parses waypoint declaration with --- arrow', () => {
    const result = parseConstraints(wrap('waypoint A---B as wp1'));
    expect(result.constraints[0]).toMatchObject({ type: 'waypoint', edgeId: 'A---B' });
  });

  it('parses waypoint declaration with -.-> arrow', () => {
    const result = parseConstraints(wrap('waypoint A-.->B as wp1'));
    expect(result.constraints[0]).toMatchObject({ type: 'waypoint', edgeId: 'A-.->B' });
  });

  it('parses waypoint declaration with ==> arrow', () => {
    const result = parseConstraints(wrap('waypoint A==>B as wp1'));
    expect(result.constraints[0]).toMatchObject({ type: 'waypoint', edgeId: 'A==>B' });
  });

  it('allows directional constraint on a declared waypoint ID', () => {
    const text = wrap('waypoint A-->B as wp1\nwp1 west-of C, 20');
    const result = parseConstraints(text);
    expect(result.constraints).toHaveLength(2);
    expect(result.constraints[1]).toMatchObject({
      type: 'directional',
      nodeA: 'wp1',
      direction: 'west-of',
      nodeB: 'C',
      distance: 20,
    });
  });

  it('allows align constraint on a declared waypoint ID', () => {
    const text = wrap('waypoint A-->B as wp1\nalign wp1, D, h');
    const result = parseConstraints(text);
    expect(result.constraints).toHaveLength(2);
    expect(result.constraints[1]).toMatchObject({ type: 'align', nodes: ['wp1', 'D'] });
  });

  it('allows anchor constraint on a declared waypoint ID', () => {
    const text = wrap('waypoint A-->B as wp1\nanchor wp1, 150, 200');
    const result = parseConstraints(text);
    expect(result.constraints).toHaveLength(2);
    expect(result.constraints[1]).toMatchObject({ type: 'anchor', node: 'wp1', x: 150, y: 200 });
  });
});

// ── Multiple constraints ──────────────────────────────────────────────────────

describe('parseConstraints — multiple constraints', () => {
  it('parses several constraints in sequence', () => {
    const text = wrap([
      'align B, C, v',
      'D east-of B, 200',
      'align E, F, h',
      'group E, F as outputs',
      'E south-of C, 150',
    ].join('\n'));

    const result = parseConstraints(text);
    expect(result.constraints).toHaveLength(5);
    expect(result.constraints.map((c) => c.type)).toEqual([
      'align', 'directional', 'align', 'group', 'directional',
    ]);
  });

  it('parses the full example from the spec', () => {
    const text = `flowchart TD
    A[Start] --> B[Validate]
    B --> C[Process]
    B --> D[Reject]

%% @layout-constraints v1
%% align B, C, v
%% D east-of B, 200
%% align E, F, h
%% group E, F as outputs
%% E south-of C, 150
%% H east-of G, 180
%% align H, G, h
%% waypoint D-->H as wp1
%% wp1 east-of G, 40
%% wp1 south-of D, 80
%% @end-layout-constraints`;

    const result = parseConstraints(text);
    expect(result.constraints).toHaveLength(10);
  });
});

// ── Malformed lines ───────────────────────────────────────────────────────────

describe('parseConstraints — malformed lines', () => {
  it('skips completely unrecognizable lines and adds to warnings', () => {
    const result = parseConstraints(wrap('this is not a constraint'));
    expect(result.constraints).toHaveLength(0);
    expect(result.warnings!).toHaveLength(1);
    expect(result.warnings![0]).toContain('this is not a constraint');
  });

  it('parses directional with no distance as the default (20)', () => {
    const result = parseConstraints(wrap('A south-of B'));
    expect(result.constraints).toHaveLength(1);
    expect(result.warnings!).toHaveLength(0);
    const c = result.constraints[0];
    if (c.type === 'directional') expect(c.distance).toBe(20);
  });

  it('skips align with invalid axis and adds to warnings', () => {
    const result = parseConstraints(wrap('align A, B, z'));
    expect(result.constraints).toHaveLength(0);
    expect(result.warnings!).toHaveLength(1);
  });

  it('skips anchor with wrong number of args and adds to warnings', () => {
    const result = parseConstraints(wrap('anchor A, 200'));
    expect(result.constraints).toHaveLength(0);
    expect(result.warnings!).toHaveLength(1);
  });

  it('parses good lines around a malformed line', () => {
    const text = wrap('A south-of B, 120\nnot valid\nalign C, D, h');
    const result = parseConstraints(text);
    expect(result.constraints).toHaveLength(2);
    expect(result.warnings!).toHaveLength(1);
    expect(result.constraints[0].type).toBe('directional');
    expect(result.constraints[1].type).toBe('align');
  });

  it('only parses the first block when multiple exist', () => {
    const text = [
      'flowchart TD',
      'A --> B',
      '%% @layout-constraints v1',
      '%% A south-of B, 120',
      '%% @end-layout-constraints',
      '%% @layout-constraints v1',
      '%% align C, D, h',
      '%% @end-layout-constraints',
    ].join('\n');
    const result = parseConstraints(text);
    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0].type).toBe('directional');
  });
});

// ── debug directive ───────────────────────────────────────────────────────────

describe('parseConstraints — debug directive', () => {
  it('sets debugWaypoints when debug appears alone in the block', () => {
    const result = parseConstraints(wrap('debug'));
    expect(result.debugWaypoints).toBe(true);
    expect(result.constraints).toHaveLength(0);
  });

  it('sets debugWaypoints alongside constraints', () => {
    const result = parseConstraints(wrap('debug\nA south-of B, 100\nwaypoint A-->B as wp1'));
    expect(result.debugWaypoints).toBe(true);
    expect(result.constraints).toHaveLength(2);
  });

  it('debugWaypoints is absent when debug is not present', () => {
    const result = parseConstraints(wrap('A south-of B, 100'));
    expect(result.debugWaypoints).toBeUndefined();
  });

  it('is not confused by a node ID called "debug" used in a directional constraint', () => {
    // "debug south-of B, 50" is a valid directional constraint, not a debug directive.
    const result = parseConstraints(wrap('debug south-of B, 50'));
    expect(result.debugWaypoints).toBeUndefined();
    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0].type).toBe('directional');
  });
});

import { describe, it, expect } from 'vitest';
import { serializeConstraints, injectConstraints, stripConstraints } from './index.js';
import { parseConstraints } from '../parser/index.js';
import type { ConstraintSet } from '../types.js';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const EMPTY: ConstraintSet = { version: 1, constraints: [] };

const FULL_TEXT = `flowchart TD
    A --> B
    B --> C

%% @layout-constraints v1
%% waypoint A-->B as wp1
%% anchor A, 50, 50
%% group B, C as pair
%% align B, C, h
%% A south-of B, 120
%% @end-layout-constraints`;

// ── serializeConstraints ──────────────────────────────────────────────────────

describe('serializeConstraints', () => {
  it('returns empty string for an empty ConstraintSet', () => {
    expect(serializeConstraints(EMPTY)).toBe('');
  });

  it('wraps output in the correct sentinels', () => {
    const cs = parseConstraints(FULL_TEXT);
    const out = serializeConstraints(cs);
    expect(out.startsWith('%% @layout-constraints v1')).toBe(true);
    expect(out.endsWith('%% @end-layout-constraints')).toBe(true);
  });

  it('prefixes every constraint line with "%% "', () => {
    const cs = parseConstraints(FULL_TEXT);
    const inner = serializeConstraints(cs)
      .split('\n')
      .slice(1, -1); // strip sentinels
    for (const line of inner) {
      expect(line.startsWith('%% ')).toBe(true);
    }
  });

  it('is deterministic — same set produces identical output', () => {
    const cs = parseConstraints(FULL_TEXT);
    expect(serializeConstraints(cs)).toBe(serializeConstraints(cs));
  });

  it('produces the same output regardless of input ordering', () => {
    const cs1 = parseConstraints(FULL_TEXT);
    // Reverse the constraints order
    const cs2: ConstraintSet = { version: 1, constraints: [...cs1.constraints].reverse() };
    expect(serializeConstraints(cs1)).toBe(serializeConstraints(cs2));
  });

  it('sorts: waypoint before anchor before group before align before directional', () => {
    const cs = parseConstraints(FULL_TEXT);
    const lines = serializeConstraints(cs).split('\n').slice(1, -1).map(l => l.slice(3));
    expect(lines[0]).toMatch(/^waypoint/);
    expect(lines[1]).toMatch(/^anchor/);
    expect(lines[2]).toMatch(/^group/);
    expect(lines[3]).toMatch(/^align/);
    expect(lines[4]).toMatch(/south-of|north-of|east-of|west-of/);
  });

  it('serializes a directional constraint correctly', () => {
    const cs: ConstraintSet = {
      version: 1,
      constraints: [{ type: 'directional', id: 'x', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 120 }],
    };
    expect(serializeConstraints(cs)).toContain('%% A south-of B, 120');
  });

  it('serializes an align constraint correctly', () => {
    const cs: ConstraintSet = {
      version: 1,
      constraints: [{ type: 'align', id: 'x', nodes: ['A', 'B', 'C'], axis: 'h' }],
    };
    expect(serializeConstraints(cs)).toContain('%% align A, B, C, h');
  });

  it('serializes a group constraint correctly', () => {
    const cs: ConstraintSet = {
      version: 1,
      constraints: [{ type: 'group', id: 'x', nodes: ['A', 'B'], name: 'mygroup' }],
    };
    expect(serializeConstraints(cs)).toContain('%% group A, B as mygroup');
  });

  it('serializes an anchor constraint correctly', () => {
    const cs: ConstraintSet = {
      version: 1,
      constraints: [{ type: 'anchor', id: 'x', node: 'A', x: 200, y: 300 }],
    };
    expect(serializeConstraints(cs)).toContain('%% anchor A, 200, 300');
  });

  it('serializes a waypoint constraint correctly', () => {
    const cs: ConstraintSet = {
      version: 1,
      constraints: [{ type: 'waypoint', id: 'x', edgeId: 'A-->B', waypointId: 'wp1' }],
    };
    expect(serializeConstraints(cs)).toContain('%% waypoint A-->B as wp1');
  });
});

// ── Round-trip ────────────────────────────────────────────────────────────────

describe('round-trip: parse → serialize → parse', () => {
  it('produces the same ConstraintSet for a directional constraint', () => {
    const cs = parseConstraints(`%% @layout-constraints v1\n%% A south-of B, 120\n%% @end-layout-constraints`);
    const cs2 = parseConstraints(serializeConstraints(cs));
    expect(cs2.constraints).toHaveLength(1);
    expect(cs2.constraints[0]).toMatchObject({ type: 'directional', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 120 });
  });

  it('round-trips all 5 constraint types with matching IDs', () => {
    const original = parseConstraints(FULL_TEXT);
    const serialized = serializeConstraints(original);
    const reparsed = parseConstraints(serialized);

    // Same number of constraints
    expect(reparsed.constraints).toHaveLength(original.constraints.length);

    // IDs are stable (deterministic hash) — they must match after round-trip
    const originalIds = original.constraints.map(c => c.id).sort();
    const reparsedIds = reparsed.constraints.map(c => c.id).sort();
    expect(reparsedIds).toEqual(originalIds);
  });
});

// ── stripConstraints ──────────────────────────────────────────────────────────

describe('stripConstraints', () => {
  it('returns text unchanged when no block is present', () => {
    const text = 'flowchart TD\nA --> B';
    expect(stripConstraints(text)).toBe(text);
  });

  it('removes the constraint block', () => {
    const result = stripConstraints(FULL_TEXT);
    expect(result).not.toContain('@layout-constraints');
    expect(result).not.toContain('@end-layout-constraints');
  });

  it('preserves diagram content before the block', () => {
    const result = stripConstraints(FULL_TEXT);
    expect(result).toContain('flowchart TD');
    expect(result).toContain('A --> B');
    expect(result).toContain('B --> C');
  });

  it('is idempotent — stripping twice is the same as stripping once', () => {
    expect(stripConstraints(stripConstraints(FULL_TEXT))).toBe(stripConstraints(FULL_TEXT));
  });
});

// ── injectConstraints ─────────────────────────────────────────────────────────

describe('injectConstraints', () => {
  it('appends a block to text that has none', () => {
    const text = 'flowchart TD\nA --> B';
    const cs: ConstraintSet = {
      version: 1,
      constraints: [{ type: 'directional', id: 'x', nodeA: 'A', direction: 'south-of', nodeB: 'B', distance: 120 }],
    };
    const result = injectConstraints(text, cs);
    expect(result).toContain('flowchart TD');
    expect(result).toContain('@layout-constraints v1');
    expect(result).toContain('A south-of B, 120');
  });

  it('replaces an existing block', () => {
    const cs1 = parseConstraints(FULL_TEXT);
    const newCs: ConstraintSet = {
      version: 1,
      constraints: [{ type: 'directional', id: 'y', nodeA: 'C', direction: 'north-of', nodeB: 'A', distance: 50 }],
    };
    const result = injectConstraints(FULL_TEXT, newCs);
    expect(result).toContain('C north-of A, 50');
    expect(result).not.toContain('A south-of B');
    // Original block replaced, not duplicated
    expect(result.split('@layout-constraints v1').length - 1).toBe(1);
    void cs1;
  });

  it('removes the block when given an empty ConstraintSet', () => {
    const result = injectConstraints(FULL_TEXT, EMPTY);
    expect(result).not.toContain('@layout-constraints');
  });

  it('injectConstraints(text, parse(text)) preserves the same constraints', () => {
    const cs = parseConstraints(FULL_TEXT);
    const injected = injectConstraints(FULL_TEXT, cs);
    const reparsed = parseConstraints(injected);
    const originalIds = cs.constraints.map(c => c.id).sort();
    const reparsedIds = reparsed.constraints.map(c => c.id).sort();
    expect(reparsedIds).toEqual(originalIds);
  });
});

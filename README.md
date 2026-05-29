# mermaid-layout-constraints

Constraint-based layout for [MermaidJS](https://mermaid.js.org/). Keep your diagram
as text, but nudge the auto-layout where it gets things wrong — align nodes, set
directional offsets, group nodes, pin coordinates, and route edges through
waypoints. Constraints are written as a plain mermaid comment block, so the same
source still renders in stock mermaid (just without the adjustments).

It registers a `constrained-dagre` layout algorithm via mermaid's public
`registerLayoutLoaders()` API — it is **not** a fork. Constraints are solved as a
post-processing pass on top of dagre's base layout.

```
┌──────────────┐     ┌────────────────────┐     ┌─────────────────┐
│ mermaid text │ --> │ dagre base layout  │ --> │ constraint pass │ --> SVG
│  + %% block  │     │ (initial positions)│     │ + edge routing  │
└──────────────┘     └────────────────────┘     └─────────────────┘
```

## Status

| Area | State |
|------|-------|
| Constraint layout engine (`constrained-dagre`) | Working |
| Parser / serializer / solver | Working |
| Waypoint edge routing + bezier handle tuning | Working |
| Debug overlay | Working |
| Interactive drag editor (`/editor`) | Not yet implemented (API surface stubbed) |

The static, text-driven workflow below is fully functional. The interactive
drag-to-edit overlay is on the roadmap; its entry point exists but the methods
are stubs — don't rely on it yet.

## Installation

```bash
npm install mermaid-layout-constraints mermaid
# or
pnpm add mermaid-layout-constraints mermaid
```

`mermaid` (>= 11.0.0) is a peer dependency.

## Quick start

```ts
import mermaid from 'mermaid';
import constraintLayouts, { setDiagramText, getAndClearWarnings } from 'mermaid-layout-constraints';

mermaid.initialize({ startOnLoad: false });
mermaid.registerLayoutLoaders(constraintLayouts);

const text = `%%{init: {"layout": "constrained-dagre"}}%%
flowchart TD
    A["Start"] --> B["Validate"]
    B --> C["Process"]
    B --> D["Reject"]

%% @layout-constraints v1
%% align B, C, v
%% D east-of C, 50
%% @end-layout-constraints`;

// Mermaid's LayoutData carries no raw text, so register the source by id first:
setDiagramText('diagram-1', text);
const { svg } = await mermaid.render('diagram-1', text);
document.body.innerHTML = svg;

// Surface any parser warnings (malformed constraint lines, etc.):
for (const w of getAndClearWarnings()) console.warn(w);
```

Two things make a diagram constraint-aware:

1. Select the layout with `%%{init: {"layout": "constrained-dagre"}}%%` (or set it
   in `mermaid.initialize`).
2. Call `setDiagramText(id, text)` **before** `mermaid.render(id, text)`. This is
   required because mermaid does not pass the raw source through to layout plugins,
   so the engine reads the constraint block via this side-channel.

## The constraint block

Constraints live in a comment block. Because every line starts with `%%`, mermaid
ignores it entirely — the diagram is still valid mermaid without this library.

```
%% @layout-constraints v1
%% <constraint>
%% <constraint>
%% @end-layout-constraints
```

Node IDs are the mermaid **short IDs** (the identifier before the label). For
`A["Start"]`, the constraint references `A`. Only the first block in the source is
parsed. Malformed lines are skipped and reported via `getAndClearWarnings()`.

### Constraint reference

| Constraint | Syntax | Meaning |
|-----------|--------|---------|
| Directional offset | `A south-of B, 120` | Place A 120px (edge-to-edge) below B. Directions: `north-of`, `south-of`, `east-of`, `west-of`. Distance optional (defaults to 20). |
| Alignment | `align A, B, C, h` | Put nodes on the same row (`h`) or column (`v`). The **first** node is the reference; the rest move to it. |
| Group | `group A, B, C as name` | Tie nodes into a unit that keeps relative positions and moves together when any member is referenced. |
| Anchor | `anchor A, 200, 300` | Pin A's center to absolute coordinates. Highest priority; overrides other constraints on the pinned axes. |
| Waypoint | `waypoint A-->B as wp1` | Create a zero-size shadow node on edge `A-->B`. `wp1` then takes ordinary constraints, routing the edge through it. |
| Bezier handle | `bezier wp1, 20, 80` | Override control-handle lengths at a waypoint (incoming, outgoing) or `bezier A-->wp1, 40` for the real-node end of a segment. |

Notes:

- **Directional distances are edge-to-edge**, not center-to-center: `A south-of B, 0`
  means A's top touches B's bottom.
- **No overlaps, ever.** After solving, a repulsion pass guarantees no two node
  bounding boxes overlap, even when constraints are geometrically impossible.
- **Multiple waypoints** on one edge route in declaration order, letting you build
  elbows and detours around other nodes.
- Edge IDs use the arrow style from the diagram: `-->`, `---`, `-.->`, `==>`, `--`.
  For a labeled edge `A--"yes"-->B`, drop the label: reference it as `A-->B`.

### Worked example

```
flowchart TD
    A["Start (A)"] --> B["Validate (B)"]
    B --> C["Process (C)"]
    B --> D["Reject (D)"]
    C --> E["Store (E)"]
    C --> F["Notify (F)"]

%% @layout-constraints v1
%% align B, C, v       — C moves into B's column
%% D east-of C, 50     — D placed 50px east of C
%% align E, F, h       — F moves to E's row (E is the reference)
%% E south-of C, 20    — E placed 20px below C
%% @end-layout-constraints
```

### Debug overlay

Add `%% debug bezier` (anywhere in the source, or inside the block) to draw every
edge's bezier control handles and anchor points — handy for inspecting routing.
`%% debug` (inside the block) marks waypoints and waypoint-edge handles only.

## Live demo

A browser playground with examples for every constraint type lives in `demo/`:

```bash
pnpm install
pnpm demo          # serves at http://localhost:5174
```

Pick a preset, then edit the diagram or constraint block to see the before/after
layout update live.

## Programmatic API

The main entry (`mermaid-layout-constraints`) also exports the pure building blocks,
useful for tooling and tests:

```ts
import {
  parseConstraints,      // (text) => ConstraintSet
  serializeConstraints,  // (ConstraintSet) => string (the %% block)
  injectConstraints,     // (text, ConstraintSet) => text with block replaced/appended
  stripConstraints,      // (text) => text with the block removed
  solveConstraints,      // (LayoutNode[], ConstraintSet) => LayoutNode[]
  setDiagramText,
  getAndClearWarnings,
} from 'mermaid-layout-constraints';
```

The default export is the array of `LayoutLoaderDefinition`s passed to
`mermaid.registerLayoutLoaders()`. All constraint and layout types
(`Constraint`, `ConstraintSet`, `LayoutNode`, …) are exported as TypeScript types.

## Development

```bash
pnpm install
pnpm test          # vitest (155 tests)
pnpm typecheck     # tsc --noEmit
pnpm build         # ESM + CJS + .d.ts into dist/
pnpm demo          # live playground
```

Source layout and conventions are documented in `CLAUDE.md`.

## License

See repository.

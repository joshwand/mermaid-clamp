# Product Context

## Why This Project Exists

MermaidJS generates diagram layouts automatically via algorithms (Dagre, ELK, etc.), which is its core value proposition — you describe structure, not presentation. But the resulting layouts are frequently *wrong enough* to be frustrating: nodes overlap, hierarchies read poorly, related concepts end up far apart, and edges cross unnecessarily. Users have zero post-render control over node placement or edge routing.

The only recourse today is to hack statement ordering, add invisible nodes, or switch to a fully manual tool (Excalidraw, draw.io) and lose the text-as-source-of-truth benefit entirely.

## Problems It Solves

1. **No fine-tuning:** Mermaid renders are take-it-or-leave-it. There's no mechanism for "mostly right but move this node over there."
2. **Layout-sensitive information is lost:** Spatial proximity, alignment, and grouping carry meaning in diagrams that pure graph structure doesn't capture. The layout algorithm doesn't know that nodes A and B should be side-by-side because they're conceptually paired.
3. **Manual tools lose the source:** Once you switch to draw.io/Excalidraw for layout control, you lose diffability, version control, and text-as-source-of-truth.
4. **Edge routing is uncontrollable:** Edges cross nodes, take weird paths, and there's no way to say "route this edge around that cluster."

## How It Should Work

A user writes a standard mermaid diagram, renders it, then optionally enters an interactive edit mode. In edit mode:

- They drag nodes to better positions
- The editor proposes layout **constraints** (alignment, directional offset, grouping) based on the drag position
- They accept, refine, or reject constraints
- They export the diagram text, which now includes human-readable constraint annotations
- The annotated text re-renders identically in a constraints-aware renderer
- The same text renders correctly (ignoring constraints, using default layout) in stock mermaid

The constraint annotations are the innovation — they capture *intent* ("these two nodes should be horizontally aligned", "this node should be south of that one at 120px") rather than absolute coordinates, so they survive re-renders when the diagram structure changes.

## User Experience Goals

- **Progressive disclosure:** A user who doesn't know about constraints sees a normal mermaid diagram. The constraint system is opt-in.
- **Discoverable:** Constraints are proposed by the system during drag, not authored by hand. The user never needs to learn the constraint syntax to use the editor.
- **Round-trippable:** text → render → edit → export → text → render produces consistent results.
- **Human-readable output:** An engineer should be able to read the constraint annotations and understand what they do, even without the editor.

## Competitive Landscape

| Tool | Text-as-source | Visual editing | Constraint-based layout | Portable format |
|------|---------------|----------------|------------------------|-----------------|
| MermaidJS (today) | ✅ | ❌ | ❌ | ✅ |
| draw.io / diagrams.net | ❌ | ✅ | Partial (snap/align) | XML |
| Excalidraw | ❌ | ✅ | ❌ | JSON |
| D2 | ✅ | ❌ | Partial (`near`, grid) | ✅ |
| PlantUML | ✅ | ❌ | ❌ | ✅ |
| **This project** | ✅ | ✅ | ✅ | ✅ |

D2's `near` keyword and grid layouts are the closest prior art, but they're baked into the language grammar rather than discoverable via interaction.

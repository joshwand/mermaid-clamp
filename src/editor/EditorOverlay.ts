import type { ConstraintSet } from '../types.js';

export interface EditorOptions {
  /** Called when the user commits a constraint change. */
  onChange?: (cs: ConstraintSet) => void;
}

/**
 * Interactive overlay that attaches to a rendered mermaid SVG.
 * Provides drag-based constraint editing with affordance rendering.
 *
 * Implemented in Tasks 9–12.
 */
export class EditorOverlay {
  constructor(
    _svgElement: SVGElement,
    _mermaidText: string,
    _options?: EditorOptions,
  ) {
    // stub — implemented in Task 9
  }

  /** Enable or disable edit mode. */
  setEditMode(_enabled: boolean): void {
    // stub
  }

  /** Export current mermaid text with constraint block. */
  export(): string {
    return '';
  }

  /** Remove all event listeners and DOM additions. */
  destroy(): void {
    // stub
  }
}

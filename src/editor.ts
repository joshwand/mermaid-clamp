/**
 * mermaid-layout-constraints — editor overlay entry point.
 *
 * Usage:
 *   import { EditorOverlay } from 'mermaid-layout-constraints/editor';
 *   const editor = new EditorOverlay(svgElement, mermaidText, { onChange });
 */

export { EditorOverlay } from './editor/EditorOverlay.js';
export { StateManager } from './state/StateManager.js';
export { inferConstraints } from './inference/index.js';

export type { EditorOptions } from './editor/EditorOverlay.js';

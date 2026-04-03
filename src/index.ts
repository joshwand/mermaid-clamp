/**
 * mermaid-layout-constraints — layout engine entry point.
 *
 * Usage:
 *   import mermaid from 'mermaid';
 *   import constraintLayouts from 'mermaid-layout-constraints';
 *   mermaid.registerLayoutLoaders(constraintLayouts);
 */

export { default } from './layout/index.js';

export type {
  Constraint,
  ConstraintSet,
  DirectionalConstraint,
  AlignConstraint,
  GroupConstraint,
  AnchorConstraint,
  WaypointDeclaration,
  Direction,
  Axis,
  ArrowStyle,
  LayoutNode,
  LayoutFunction,
  LayoutLoaderDefinition,
  ProposedConstraint,
} from './types.js';

export { parseConstraints } from './parser/index.js';
export { serializeConstraints, injectConstraints, stripConstraints } from './serializer/index.js';
export { solveConstraints } from './solver/index.js';

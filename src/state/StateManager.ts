import type { Constraint, ConstraintSet } from '../types.js';

type Listener = (state: ConstraintSet) => void;

/**
 * Snapshot-based undo/redo manager for the constraint set.
 * Pub/sub notification on every mutation.
 *
 * Fully implemented in Task 7. This stub exposes the public API surface
 * with no-op method bodies so dependents can import and type-check.
 */
export class StateManager {
  private current: ConstraintSet = { version: 1, constraints: [] };
  private listeners: Set<Listener> = new Set();

  getState(): ConstraintSet {
    return { ...this.current, constraints: [...this.current.constraints] };
  }

  applyConstraint(_constraint: Constraint): void {
    // stub — implemented in Task 7
  }

  removeConstraint(_id: string): void {
    // stub — implemented in Task 7
  }

  undo(): void {
    // stub — implemented in Task 7
  }

  redo(): void {
    // stub — implemented in Task 7
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

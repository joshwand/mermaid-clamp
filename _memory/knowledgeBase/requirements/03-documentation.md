# Requirements: Documentation

## User Stories

### US-3.1: Installation guide
**As** a developer adopting this extension,
**I want** clear installation instructions for npm, CDN, and common environments,
**So that** I can get started in under 5 minutes.

**Acceptance criteria:**
- npm/pnpm install command
- CDN script tag (ESM)
- `registerLayoutLoaders` registration step
- Verified examples for: plain HTML, VitePress/MkDocs, Obsidian (noting ELK plugin limitations)

### US-3.2: Getting started tutorial
**As** a new user,
**I want** a step-by-step tutorial that walks me through adding constraints to a simple diagram,
**So that** I understand the core workflow.

**Acceptance criteria:**
- Starts with a 5-node flowchart
- Shows the diagram before constraints
- Adds 2-3 constraints (alignment, directional offset)
- Shows the diagram after constraints
- Explains what each constraint does
- Takes less than 5 minutes to follow

### US-3.3: Editor usage guide
**As** a user of the interactive editor,
**I want** a guide explaining the drag, affordance, shift-select, and export workflow,
**So that** I can use the editor effectively.

**Acceptance criteria:**
- Explains edit mode toggle
- Explains normal drag behavior and affordances
- Explains shift+drag constraint selection
- Explains edge waypoint creation
- Explains undo/redo
- Explains export
- Includes screenshots or GIFs of each interaction

### US-3.4: Constraint language reference
**As** a power user or someone hand-editing constraints,
**I want** a complete reference for the constraint syntax,
**So that** I can write and debug constraints by hand.

**Acceptance criteria:**
- Lists every constraint type with syntax, semantics, and examples
- Documents priority order
- Documents compatibility rules
- Documents waypoint declaration and usage
- Documents edge ID format
- Includes a grammar reference
- Includes a complete example diagram

### US-3.5: API reference
**As** a developer integrating the editor programmatically,
**I want** API documentation for `enableEditor`, `EditorInstance`, `EditorOptions`,
**So that** I can build the editor into my application.

**Acceptance criteria:**
- All exported functions and types documented
- Constructor/factory signatures with parameter descriptions
- Method descriptions with return types
- Code examples for common integration patterns

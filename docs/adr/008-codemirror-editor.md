# ADR 008: CodeMirror 6 Editor Integration for Code Block Rendering

## Context and Problem Statement

NYX previously rendered assistant-generated code blocks in chat histories using `react-syntax-highlighter` (backed by Prism.js). While functional, this approach introduced several limitations:
1. **Performance Bottlenecks:** Re-rendering massive code files within a chat list caused noticeable frame drops and latency in streaming responses.
2. **Readability & Customization:** Prism.js lacks dynamic features (like robust syntax folding, indentation guides, and accurate theme customization) that modern developer environments demand.
3. **Interactive Actions:** Performing actions like copy-to-clipboard, saving directly to the workspace, or executing shell scripts required complex outer wrapping layers rather than an integrated editor model.

## Decision Drivers

* **Performance:** Minimize memory usage and DOM rendering complexity during chat interactions.
* **Modern Developer Aesthetics:** Match the rest of the dark-first, premium glassmorphism layout of NYX.
* **Rich Interactions:** Provide a base for future inline editing, diff views, and deep terminal/workspace integrations.

## Decision Outcome

We decided to integrate **CodeMirror 6** (`@codemirror/*`) to render code blocks inside our message streams using a dedicated, read-only container component (`CodeMirrorBlock.tsx`).

### Implementation Strategy

1. **Lightweight Read-Only Mode:** Disable all editing capabilities (`EditorState.readOnly.of(true)` and `EditorView.editable.of(false)`) while keeping selectability, line numbers, and scrolling fully interactive.
2. **Dynamic Syntax Packs:** Dynamically inject language packs (JavaScript, TypeScript, Python, HTML, CSS) based on the code block's markdown identifier.
3. **One Dark Styling Integration:** Apply the standard `oneDark` editor theme custom-scoped to blend seamlessly with the translucent panels and glassmorphic borders of the NYX UI.

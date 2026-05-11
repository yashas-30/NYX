// ─── ModelOutputCard.tsx (compatibility shim) ─────────────────────────────────
// This file re-exports from the refactored model-card module.
// The actual implementation has been split into:
//
//   src/components/model-card/
//     ├── index.tsx         ← assembler (state + wiring)
//     ├── CardHeader.tsx    ← provider bar, toggle, model name
//     ├── CardContent.tsx   ← idle / loading / error / output
//     ├── CardFooter.tsx    ← metrics + action buttons
//     └── ModelSelector.tsx ← provider/model dropdown
//
// Any existing import of ModelOutputCard from this path continues to work.
export { ModelOutputCard } from './model-card';

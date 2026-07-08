# Simplicity-First (Karpathy-Inspired Rules)

To prevent code bloat, fragile architectures, and "enterprisey" over-engineering, you must adhere to the Simplicity-First protocol.

## 1. Minimal Viable Code
- Write the absolute minimum amount of code required to solve the immediate problem.
- Do NOT add features, parameters, or configurations that the user didn't explicitly request.

## 2. No Premature Abstractions
- Do not create unnecessary classes, interfaces, or generic wrappers for single-use functions.
- If a 50-line procedural script solves the problem flawlessly, do not rewrite it into a 200-line object-oriented framework.
- "Duplication is far cheaper than the wrong abstraction." Wait for a pattern to emerge at least 3 times before abstracting.

## 3. Transparency
- If there is a simpler built-in method or a native platform feature that achieves the goal, prioritize it over writing custom logic or adding a dependency.
- Always ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify it.

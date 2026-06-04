# Backend Feature-First Architecture Pattern

This directory contains the feature-first backend modules of NYX. Each feature should follow a modular, isolated architecture using a three-file boilerplate pattern:

## Boilerplate Pattern

Every feature is structured into three distinct layers, each with its own file and responsibility:

1. **`[feature].router.ts` (HTTP / Express Layer)**
   - Responsible for Express routing and request/response handling.
   - Minimal business logic. It handles authorization, parses parameters, performs validation using schemas, and delegates domain work to the service layer.
   - Should never directly call DB models or third-party APIs.

2. **`[feature].service.ts` (Domain / Business Logic)**
   - Contains pure business logic.
   - Independent of the Express context (no `req`, `res`, or HTTP status codes).
   - Interacts with database, workspace files, models, and external services.
   - Easily testable in isolation.

3. **`[feature].schema.ts` (Validation Layer)**
   - Defines Zod validation schemas for requests entering the module.
   - Leveraged by Express middleware `validate(...)` to reject bad requests early.

## Directory Structure Example

```
server/features/vault/
├── vault.router.ts   # Express route definitions
├── vault.service.ts  # Database / secret retrieval logic
└── vault.schema.ts  # Request schema definitions
```

## Layer Dependency Rules

- **Unidirectional Flow**: Router -> Service -> DB/Models.
- **Isolation**: A service from one feature should not directly reference files or routes inside another feature's folder unless done through an explicit public interface.
- Shared utility functions and engines reside under `server/lib/`.

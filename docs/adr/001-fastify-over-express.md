# ADR 001: Fastify over Express

**Date**: 2026-06-06  
**Status**: Accepted

## Context
NYX requires high-throughput, low-latency Server-Sent Events (SSE) streaming from multiple AI providers. Express, while ubiquitous, carries legacy overhead and a slower router implementation that impacts high-concurrency connections.

## Decision
We transitioned the backend from Express to Fastify.

## Consequences
- **Positive**: Substantially higher requests-per-second and better event loop utilization. Native support for schema-based validation via Zod.
- **Negative**: Less ecosystem compatibility compared to Express. Middleware requires `fastify-plugin` adaptation.

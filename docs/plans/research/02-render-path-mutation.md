# Research Note 02 — Render-path mutation risk

Date: 2026-02-19

## Previous observation

A render-adjacent helper (`getRenderableMessages()`) previously mutated component state (`this.systemPrompt`) while preparing render data.

## Current status

Mitigated in current branch:

- `getRenderableMessages()` no longer mutates `this.systemPrompt`.
- System prompt synchronization is now handled in explicit update paths:
  - `handleStateMessage(...)`
  - `handleAgentResponse(...)`
  - helper `syncSystemPrompt(...)` / `deriveSystemPrompt(...)`

## Remaining note

- Multiple write origins for `systemPrompt` still exist (state and response handlers), but they are event-driven handlers rather than render-time side effects.

(Notes only; no redesign proposal in this document.)

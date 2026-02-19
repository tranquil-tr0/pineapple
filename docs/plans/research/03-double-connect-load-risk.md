# Research Note 03 — Double connect/load risk

Date: 2026-02-19

## Previous observation

Setup calls (`connect`, `loadSessionName`, `loadRuntimeInfo`, `focusChatInput`) were duplicated in both `connectedCallback()` and `updated(sessionId)` paths.

## Current status

Mitigated in current branch:

- Setup path is centralized in `bootstrapSessionRuntime()`.
- Session reset path is centralized in `resetSessionState()`.
- `updated(...)` now applies explicit `sessionId` change checks before reset/reconnect.

## Remaining risk shape

- Reconnect timer behavior and lifecycle transitions still interact under rapid route churn.
- Risk is reduced by shared helpers and guards, but not fully eliminated while WS reconnect + route updates remain asynchronous.

(Notes only; no redesign proposal in this document.)

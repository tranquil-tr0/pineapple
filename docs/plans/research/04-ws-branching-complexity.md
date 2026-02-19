# Research Note 04 — WS branching complexity (client/server)

Date: 2026-02-19

## Server side (`src/server/ws-handler.ts`)

Current shape after refactor:
- Client message dispatch uses a typed handler map (`ClientMessageHandlers`) with **13 message kinds**.
- Dispatch path uses payload guards (`hasMessageType`, `isClientMessageType`) and `dispatchClientMessage(...)`.
- Pending RPC response mapping remains centralized in `handlePendingRpcResponse(...)` with **5 response kinds**.

Observed file size remains high: **635 LOC**.

## Client side (`src/client/components/chat-view.ts`)

Current shape after refactor:
- Server message dispatch now uses `serverMessageHandlers` keyed by `ServerMessage["type"]`.
- Agent event dispatch now uses `agentEventHandlers` keyed by event `type`.
- Event-specific logic is split into helpers (`handleStateMessage`, `handleAgentMessageUpdate`, `handleToolExecutionUpdate`, `handleAgentResponse`, etc.).

Observed file size: **1532 LOC**.

## Coverage signal

- E2E suite exercises UI-visible protocol paths and currently passes end-to-end (`64 passed`).
- Branching readability improved, but complexity remains concentrated in `chat-view.ts` due broad responsibility scope.

(Notes only; no redesign proposal in this document.)

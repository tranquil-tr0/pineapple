# Research Note 06 — Message pipeline trace

Date: 2026-02-19

## End-to-end trace (observed)

### 1) User input capture
- `chat-input` emits `send` / `steer` / `follow-up` events with text + optional images.
- `chat-view` receives these in `onSend` / `onSteer` / `onFollowUp` and delegates to `routeAndSubmitInput(...)`.

### 2) Input routing + local UI append
- `routeAndSubmitInput(...)`:
  - normalizes images
  - parses slash command hints
  - routes with `routeInputText(...)` (`src/client/utils/input-router.ts`)
  - appends local user message (`appendUserMessage`) for prompt/steer/follow_up
  - sends WS command via `wsSend(...)`.

### 3) WebSocket client→server dispatch
- `ws-handler` receives raw JSON and validates `type` (`hasMessageType`, `isClientMessageType`).
- Dispatch to handler map (`ClientMessageHandlers`) and forward to RPC/local shell (`src/server/ws-handler.ts`).

### 4) RPC interaction
- RPC commands are sent through `RpcProcess.send(...)` (`src/server/rpc-process.ts`).
- Responses/events stream back through listener callback registered by `SessionManager.getOrSpawn(...)`.

### 5) Server response mapping to browser WS
- Pending RPC command responses are mapped in `handlePendingRpcResponse(...)`:
  - state, available models, commands, bash result.
- Non-consumed events are forwarded as `agent_event`.

### 6) Client server-message handling
- `chat-view.handleServerMessage(...)` dispatches top-level server messages (`state`, `agent_event`, etc.) via `serverMessageHandlers`.
- `agent_event` is dispatched by `agentEventHandlers` (streaming/tool/response/extension flows).

### 7) Render shaping
- `getRenderableMessages()` filters/transforms message list and assigns `_targetId` for deep links.
- `message-list` renders final rows by role.

## Implicit assumptions observed

- Local optimistic append for user messages precedes server confirmation.
- Some UI state is sourced from both REST (`loadSessionName`) and WS (`state.sessionName`).
- Extension notifications are represented as inline custom messages + status/widget side channels.

(Notes only; no redesign proposal in this document.)

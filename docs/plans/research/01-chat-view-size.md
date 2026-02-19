# Research Note 01 — `chat-view.ts` size and responsibility concentration

Date: 2026-02-19

## File size snapshot

- `src/client/components/chat-view.ts`: **1532 LOC** (`wc -l`).
- Related large files in the same interaction flow:
  - `src/client/components/message-list.ts`: 839 LOC
  - `src/client/components/chat-input.ts`: 832 LOC
  - `src/server/ws-handler.ts`: 635 LOC
  - `src/client/utils/extension-ui-state.ts`: 203 LOC (extracted helper)
  - `src/client/utils/render-extension-ui-dialog.ts`: 89 LOC (extracted dialog template helper)
  - `src/client/utils/render-chat-sidebar.ts`: 79 LOC (extracted sidebar template helper)
  - `src/client/utils/render-session-info-stack.ts`: 125 LOC (extracted session-info template helper)
  - `src/client/utils/render-chat-editor-footer.ts`: 268 LOC (extracted editor footer template helper)
  - `src/client/utils/message-shaping.ts`: 218 LOC (extracted message shaping logic)
  - `src/client/utils/session-actions.ts`: 70 LOC (extracted session action logic)

## Responsibility map (observed in `chat-view.ts`)

`chat-view.ts` still combines these concerns in one component:

1. Lifecycle/bootstrap/reset orchestration (`connectedCallback`, `updated`, `bootstrapSessionRuntime`, `resetSessionState`).
2. WebSocket lifecycle and protocol IO (`connect`, reconnect, send/receive).
3. Server + agent event dispatch and state updates (`serverMessageHandlers`, `agentEventHandlers`).
4. User input routing + submit behavior.
5. Session name/runtime metadata fetch + rename/unarchive behavior.
6. Message shaping/deep-link/sidebar indexing.
7. Main UI render composition.

## Recent maintainability movement

- Extension request queue/state transitions were extracted into `src/client/utils/extension-ui-state.ts`.
- Extension dialog template branching was extracted into `src/client/utils/render-extension-ui-dialog.ts`.
- Sidebar, session metadata/tools/prompt, and editor footer/status template branching were extracted into dedicated helpers in `src/client/utils/render-*.ts`.
- Pure logic for message shaping (renderable message filtering, sidebar entry generation, preview text extraction) was extracted into `src/client/utils/message-shaping.ts`.
- Async session management actions (load info, rename, unarchive) were extracted into `src/client/utils/session-actions.ts`.
- `chat-view.ts` now consumes these helpers for request intake, dialog input state, response dequeueing, modal rendering, large render blocks, and session lifecycle.

## Coupling signals

- Network protocol handlers still directly update many UI state fields.
- Rendering depends on state assembled from REST + WS + extension events.
- Handler-map + helper extraction improved local readability, but file-level responsibility concentration remains high.

(Notes only; no redesign proposal in this document.)

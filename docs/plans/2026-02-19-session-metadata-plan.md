# Session Metadata Redesign — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace confusing session metadata display with clear categories (user/assistant/tool calls), history size (messages + tokens), and context window info (messages + token %).

**Architecture:** Server parses per-role stats from JSONL during its existing scan pass, sends `SessionMessageStats` instead of flat `messageCount`. Client uses these stats plus existing `UsageTotals` and `currentContextWindow` to render three info rows. Tests cover the server-side parsing logic via API tests and a new unit test for the stats extraction helper.

**Tech Stack:** TypeScript, Lit web components, Express, Vitest

---

### Task 1: Add `SessionMessageStats` type to shared types

**Files:**
- Modify: `src/shared/types.ts:26-34` (SessionMeta) and `:74-95` (StateMessage)

**Step 1: Add the `SessionMessageStats` interface and update `SessionMeta`**

In `src/shared/types.ts`, add the new interface before `SessionMeta`, then replace `messageCount: number` with `messageStats: SessionMessageStats`:

```typescript
export interface SessionMessageStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
  totalMessages: number;
}

export interface SessionMeta {
  id: string;
  name: string;
  createdAt: string;
  lastActivityAt: string;
  messageStats: SessionMessageStats;
  model?: string;
  activity: SessionActivity;
}
```

**Step 2: Update `StateMessage` to use `messageStats`**

Replace `messageCount?: number` with `messageStats?: SessionMessageStats`:

```typescript
export interface StateMessage {
  type: "state";
  model: { provider: string; id: string; contextWindow?: number; maxTokens?: number } | null;
  thinkingLevel: string;
  steeringMode?: QueueDeliveryMode;
  followUpMode?: QueueDeliveryMode;
  sessionName?: string;
  isStreaming: boolean;
  autoCompactionEnabled?: boolean;
  messages: AgentMessageData[];
  messageStats?: SessionMessageStats;
  pendingMessageCount?: number;
  systemPrompt?: string;
  tools?: ToolSpec[];
}
```

**Step 3: Commit**

```bash
git add src/shared/types.ts
git commit -m "refactor: replace messageCount with SessionMessageStats type"
```

---

### Task 2: Extract stats-counting helper and write tests

**Files:**
- Create: `src/shared/session-stats.ts`
- Create: `tests/unit/session-stats.test.ts`
- Modify: `vitest.config.ts:11` (expand test include)

**Step 1: Update vitest config to include unit tests**

In `vitest.config.ts`, change the `include` to also match unit tests:

```typescript
test: {
  include: ["tests/**/*.test.ts"],
  testTimeout: 30000,
},
```

**Step 2: Write the failing tests**

Create `tests/unit/session-stats.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import {
  countMessageStats,
  emptyMessageStats,
  type JsonlMessageEntry,
} from "../../src/shared/session-stats.js";

describe("emptyMessageStats", () => {
  it("returns all zeros", () => {
    expect(emptyMessageStats()).toEqual({
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      totalMessages: 0,
    });
  });
});

describe("countMessageStats", () => {
  it("counts user messages", () => {
    const entries: JsonlMessageEntry[] = [
      { role: "user", content: "hello" },
      { role: "user", content: "world" },
    ];
    const stats = countMessageStats(entries);
    expect(stats.userMessages).toBe(2);
    expect(stats.totalMessages).toBe(2);
  });

  it("counts assistant messages", () => {
    const entries: JsonlMessageEntry[] = [
      { role: "assistant", content: "hi there" },
    ];
    const stats = countMessageStats(entries);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.toolCalls).toBe(0);
  });

  it("counts tool_use blocks in assistant messages as tool calls", () => {
    const entries: JsonlMessageEntry[] = [
      {
        role: "assistant",
        content: [
          { type: "text", text: "Let me check" },
          { type: "tool_use", id: "t1", name: "read", input: {} },
          { type: "tool_use", id: "t2", name: "write", input: {} },
        ],
      },
    ];
    const stats = countMessageStats(entries);
    expect(stats.assistantMessages).toBe(1);
    expect(stats.toolCalls).toBe(2);
  });

  it("counts toolCall blocks as tool calls", () => {
    const entries: JsonlMessageEntry[] = [
      {
        role: "assistant",
        content: [
          { type: "toolCall", name: "bash", input: "ls" },
        ],
      },
    ];
    const stats = countMessageStats(entries);
    expect(stats.toolCalls).toBe(1);
  });

  it("ignores tool_result and other roles", () => {
    const entries: JsonlMessageEntry[] = [
      { role: "tool_result", content: "output" },
      { role: "system", content: "you are helpful" },
    ];
    const stats = countMessageStats(entries);
    expect(stats).toEqual({
      userMessages: 0,
      assistantMessages: 0,
      toolCalls: 0,
      totalMessages: 2,
    });
  });

  it("handles mixed conversation", () => {
    const entries: JsonlMessageEntry[] = [
      { role: "user", content: "fix the bug" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "I'll read the file" },
          { type: "tool_use", id: "t1", name: "read", input: {} },
        ],
      },
      { role: "tool_result", content: "file contents..." },
      {
        role: "assistant",
        content: [
          { type: "text", text: "Here's the fix" },
          { type: "tool_use", id: "t2", name: "edit", input: {} },
        ],
      },
      { role: "tool_result", content: "ok" },
      { role: "assistant", content: "Done! The bug is fixed." },
      { role: "user", content: "thanks" },
    ];
    const stats = countMessageStats(entries);
    expect(stats.userMessages).toBe(2);
    expect(stats.assistantMessages).toBe(3);
    expect(stats.toolCalls).toBe(2);
    expect(stats.totalMessages).toBe(7);
  });

  it("handles empty array", () => {
    expect(countMessageStats([])).toEqual(emptyMessageStats());
  });
});
```

**Step 3: Run tests to verify they fail**

Run: `npx vitest run tests/unit/session-stats.test.ts`
Expected: FAIL — module not found

**Step 4: Write the implementation**

Create `src/shared/session-stats.ts`:

```typescript
import type { SessionMessageStats } from "./types.js";

export interface JsonlMessageEntry {
  role: string;
  content?: string | Array<{ type: string; [key: string]: unknown }>;
}

export function emptyMessageStats(): SessionMessageStats {
  return { userMessages: 0, assistantMessages: 0, toolCalls: 0, totalMessages: 0 };
}

export function countMessageStats(entries: JsonlMessageEntry[]): SessionMessageStats {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;

  for (const entry of entries) {
    if (entry.role === "user") {
      userMessages++;
    } else if (entry.role === "assistant") {
      assistantMessages++;
      if (Array.isArray(entry.content)) {
        for (const block of entry.content) {
          if (block.type === "tool_use" || block.type === "toolCall") {
            toolCalls++;
          }
        }
      }
    }
  }

  return { userMessages, assistantMessages, toolCalls, totalMessages: entries.length };
}
```

**Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/unit/session-stats.test.ts`
Expected: all PASS

**Step 6: Commit**

```bash
git add src/shared/session-stats.ts tests/unit/session-stats.test.ts vitest.config.ts
git commit -m "feat: add session-stats helper with tests"
```

---

### Task 3: Update server JSONL parsing to use `SessionMessageStats`

**Files:**
- Modify: `src/server/session-manager.ts:24-32` (ParsedSessionFile), `:448-511` (parseSessionFile), `:58-115` (listSessions)

**Step 1: Update `ParsedSessionFile` interface**

Replace `messageCount: number` with `messageStats: SessionMessageStats` at line 30. Add the import for `SessionMessageStats` and `countMessageStats`/`emptyMessageStats` from `@shared/session-stats.js`:

```typescript
import type { SessionMessageStats } from "@shared/types.js";
import { countMessageStats, emptyMessageStats, type JsonlMessageEntry } from "@shared/session-stats.js";
```

```typescript
interface ParsedSessionFile {
  file: string;
  id: string;
  createdAt: string;
  name: string | undefined;
  lastActivityAt: string;
  messageStats: SessionMessageStats;
  model: string | undefined;
}
```

**Step 2: Update `parseSessionFile` to collect message entries and count stats**

Replace `let messageCount = 0;` with `const messageEntries: JsonlMessageEntry[] = [];`. In the `type === "message"` branch, push the message entry instead of incrementing a counter. At the end, compute stats via `countMessageStats(messageEntries)`.

The loop body for `type === "message"` becomes:

```typescript
} else if (parsedLine.type === "message") {
  if (parsedLine.message) {
    messageEntries.push({
      role: parsedLine.message.role || "",
      content: parsedLine.message.content,
    });
  }
  if (!firstUserMessage && parsedLine.message?.role === "user") {
    // ... existing firstUserMessage extraction unchanged ...
  }
}
```

And the `ParsedSessionFile` construction:

```typescript
const parsed: ParsedSessionFile = {
  file,
  id: header.id,
  createdAt: header.timestamp || new Date().toISOString(),
  name,
  lastActivityAt: lastTimestamp,
  messageStats: countMessageStats(messageEntries),
  model,
};
```

**Step 3: Update `listSessions` to pass `messageStats`**

In `listSessions`, the two places that construct `SessionMeta` objects need to use `messageStats` instead of `messageCount`:

For disk sessions (line ~77):
```typescript
messageStats: parsed.messageStats,
```

For active-only sessions (line ~100):
```typescript
messageStats: emptyMessageStats(),
```

**Step 4: Run existing API tests**

Run: `npx vitest run tests/api/sessions.test.ts`
Expected: FAIL on `s1.messageCount` assertions — these need updating (next task)

**Step 5: Commit**

```bash
git add src/server/session-manager.ts
git commit -m "refactor: server parses per-role message stats from JSONL"
```

---

### Task 4: Update API tests for `messageStats`

**Files:**
- Modify: `tests/api/sessions.test.ts:177-187` and `:304`

**Step 1: Update session listing test assertions**

Replace `expect(s1.messageCount).toBe(2)` with:

```typescript
expect(s1.messageStats).toEqual({
  userMessages: 1,
  assistantMessages: 1,
  toolCalls: 0,
  totalMessages: 2,
});
```

Replace `expect(s2.messageCount).toBe(1)` with:

```typescript
expect(s2.messageStats).toEqual({
  userMessages: 1,
  assistantMessages: 0,
  toolCalls: 0,
  totalMessages: 1,
});
```

Replace `expect(typeof session.messageCount).toBe("number")` (line ~304) with:

```typescript
expect(session.messageStats).toBeDefined();
expect(typeof session.messageStats.totalMessages).toBe("number");
```

**Step 2: Run tests**

Run: `npx vitest run tests/api/sessions.test.ts`
Expected: all PASS

**Step 3: Commit**

```bash
git add tests/api/sessions.test.ts
git commit -m "test: update API tests for messageStats shape"
```

---

### Task 5: Update WebSocket state message to pass `messageStats`

**Files:**
- Modify: `src/server/ws-handler.ts:412-419`

**Step 1: Replace `messageCount` with `messageStats` in state message construction**

In the `get_state` handler (around line 412), replace the `messageCount` field with:

```typescript
messageStats:
  data?.messageStats && typeof data.messageStats === "object"
    ? (data.messageStats as SessionMessageStats)
    : typeof data?.messageCount === "number"
      ? {
          userMessages: 0,
          assistantMessages: 0,
          toolCalls: 0,
          totalMessages: data.messageCount as number,
        }
      : undefined,
```

This handles backwards compatibility: if the RPC still sends a flat `messageCount`, we wrap it into the stats shape. Add the import:

```typescript
import type { SessionMessageStats } from "@shared/types.js";
```

**Step 2: Commit**

```bash
git add src/server/ws-handler.ts
git commit -m "feat: pass messageStats through WebSocket state message"
```

---

### Task 6: Update client session runtime and session-actions

**Files:**
- Modify: `src/client/utils/session-runtime.ts:19-40`, `:67-88`, `:204-214`
- Modify: `src/client/utils/session-actions.ts:2-8`, `:23-28`

**Step 1: Update `SessionRuntimeState` — replace raw count with `messageStats`**

This is handled implicitly: the `StateMessage` type change propagates. But the runtime does store `pendingMessageCount` separately, which stays. No new field needed in `SessionRuntimeState` since `messageStats` comes from the `StateMessage` and is accessed through the state object.

**Step 2: Update `handleStateMessage` to extract `messageStats`**

The state message handler already spreads `msg` properties. Ensure `messageStats` is stored. Check if there's explicit extraction needed.

In session-runtime.ts, the `handleStateMessage` method builds a `patch` object. Add:

```typescript
const patch: Partial<SessionRuntimeState> = {
  // ... existing fields ...
};
// messageStats is accessed directly from the state message, no explicit storage needed
// unless we want to cache it. It flows through StateMessage -> chat-view render.
```

Actually, the chat-view accesses `rs?.pendingMessageCount` directly from runtime state, but `messageStats` would come from the state message. Let's check if we need to store it explicitly.

Since `chat-view.ts` stores `persistedMessageCount` as a `@state()` and loads it from `fetchSessionInfo`, we need to update `session-actions.ts` to carry `messageStats` instead of `messageCount`.

Update `SessionInfo` in `session-actions.ts`:

```typescript
import type { SessionMessageStats } from "@shared/types.js";

export interface SessionInfo {
  name: string;
  createdAt: string;
  lastActivityAt: string;
  messageStats: SessionMessageStats;
}
```

Update `fetchSessionInfo` return:

```typescript
return {
  name: session.name || "Session",
  createdAt: session.createdAt || "",
  lastActivityAt: session.lastActivityAt || "",
  messageStats: session.messageStats || { userMessages: 0, assistantMessages: 0, toolCalls: 0, totalMessages: 0 },
};
```

**Step 3: Commit**

```bash
git add src/client/utils/session-actions.ts
git commit -m "refactor: client session-actions uses messageStats"
```

---

### Task 7: Update chat-view to use `messageStats` and pass usage/context to info stack

**Files:**
- Modify: `src/client/components/chat-view.ts:47-53`, `:91`, `:186-189`, `:320-327`, `:486-509`, `:610-628`

**Step 1: Replace `persistedMessageCount` state with `persistedMessageStats`**

Change line 91:
```typescript
@state() private persistedMessageStats: SessionMessageStats = { userMessages: 0, assistantMessages: 0, toolCalls: 0, totalMessages: 0 };
```

Add import:
```typescript
import type { SessionMessageStats } from "@shared/types.js";
import { emptyMessageStats } from "@shared/session-stats.js";
```

Use `emptyMessageStats()` for the default and reset values.

**Step 2: Update `loadSessionName` to store `messageStats`**

```typescript
this.persistedMessageStats = info.messageStats;
```

**Step 3: Simplify `SessionStats` and `computeStats`**

```typescript
interface SessionStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
}
```

```typescript
private computeStats(renderable: AgentMessageData[]): SessionStats {
  let userMessages = 0;
  let assistantMessages = 0;
  let toolCalls = 0;

  for (const msg of renderable) {
    if (msg.role === "user" || msg.role === "user-with-attachments") {
      userMessages++;
    } else if (msg.role === "assistant") {
      assistantMessages++;
      if (Array.isArray(msg.content)) {
        for (const part of msg.content) {
          if (part && typeof part === "object" && (part as any).type === "toolCall") {
            toolCalls++;
          }
        }
      }
    }
  }
  return { userMessages, assistantMessages, toolCalls };
}
```

**Step 4: Update `renderSessionInfoStack` call to pass new props**

Add `usage` and `currentContextWindow` props, replace `persistedMessageCount`/`pendingMessageCount` with `persistedMessageStats`:

```typescript
${renderSessionInfoStack({
  sessionId: this.sessionId,
  sessionName: this.sessionName,
  renamingName: this.renamingName,
  editName: this.editName,
  createdAtLabel,
  lastActivityAtLabel,
  modelLabel,
  thinkingLevel: rs?.currentThinkingLevel || "off",
  stats,
  persistedMessageStats: this.persistedMessageStats,
  pendingMessageCount: rs?.pendingMessageCount || 0,
  usage,
  currentContextWindow: rs?.currentContextWindow || null,
  contextMessageCount: renderableMessages.length,
  systemPrompt: rs?.systemPrompt || "",
  knownTools,
  onStartRename: () => this.startRename(),
  onEditNameInput: (e: InputEvent) => (this.editName = (e.target as HTMLInputElement).value),
  onTitleKeydown: (e: KeyboardEvent) => this.onTitleKeydown(e),
  onCommitRename: () => this.commitRename(),
})}
```

**Step 5: Commit**

```bash
git add src/client/components/chat-view.ts
git commit -m "refactor: chat-view uses messageStats and passes usage to info stack"
```

---

### Task 8: Redesign the session info stack display

**Files:**
- Modify: `src/client/utils/render-session-info-stack.ts` (entire file)

**Step 1: Update the interface and rendering**

Import `UsageTotals` from `render-chat-editor-footer.js` and `SessionMessageStats` from `@shared/types.js`.

Update `SessionInfoStats` to match the simplified shape:

```typescript
interface SessionInfoStats {
  userMessages: number;
  assistantMessages: number;
  toolCalls: number;
}
```

Update `RenderSessionInfoStackOptions` — replace `persistedMessageCount`/`pendingMessageCount` with:

```typescript
interface RenderSessionInfoStackOptions {
  // ... existing fields ...
  stats: SessionInfoStats;
  persistedMessageStats: SessionMessageStats;
  pendingMessageCount: number;
  usage: UsageTotals;
  currentContextWindow: number | null;
  contextMessageCount: number;
  // ... rest unchanged ...
}
```

**Step 2: Add formatting helpers**

```typescript
function formatCompactCount(value: number): string {
  if (!Number.isFinite(value) || value === 0) return "0";
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(Math.max(0, value));
}

function formatHistoryRow(stats: SessionMessageStats, totalTokens: number): string {
  const pending = "";
  const tokens = totalTokens > 0 ? ` · ${formatCompactCount(totalTokens)} tokens` : "";
  return `${stats.totalMessages} messages${tokens}`;
}

function formatContextRow(
  contextMessageCount: number,
  activeContextTokens: number | null,
  contextWindow: number | null,
): string {
  if (contextWindow && contextWindow > 0 && activeContextTokens !== null) {
    const pct = Math.min(100, Math.max(0, (activeContextTokens / contextWindow) * 100));
    return `${contextMessageCount} messages · ${pct.toFixed(1)}% of ${formatCompactCount(contextWindow)}`;
  }
  return `${contextMessageCount} messages`;
}
```

**Step 3: Update the HTML template**

Replace the "Messages", "Tool Calls", and "Persisted" rows with:

```html
<div class="cv-info-item">
  <span>Messages</span>
  <strong>${stats.userMessages} user · ${stats.assistantMessages} assistant · ${stats.toolCalls} tool calls</strong>
</div>
<div class="cv-info-item">
  <span>History</span>
  <strong>${formatHistoryRow(persistedMessageStats, usage.input + usage.output)}</strong>
</div>
<div class="cv-info-item">
  <span>Context</span>
  <strong>${formatContextRow(contextMessageCount, usage.activeContextTokens, currentContextWindow)}</strong>
</div>
```

**Step 4: Commit**

```bash
git add src/client/utils/render-session-info-stack.ts
git commit -m "feat: redesign session info stack with messages/history/context rows"
```

---

### Task 9: Update session list to use `messageStats`

**Files:**
- Modify: `src/client/components/session-list.ts:623`

**Step 1: Update the metadata display**

Replace `${s.messageCount} msg` with `${s.messageStats?.totalMessages ?? 0} msg`:

```typescript
const metaParts = [
  `${s.messageStats?.totalMessages ?? 0} msg`,
  s.model || "unknown model",
  relativeTime(s.lastActivityAt),
];
```

**Step 2: Commit**

```bash
git add src/client/components/session-list.ts
git commit -m "fix: session list uses messageStats.totalMessages"
```

---

### Task 10: Verify everything builds and tests pass

**Step 1: Run all tests**

Run: `npx vitest run`
Expected: all PASS

**Step 2: Run the TypeScript build**

Run: `npx tsc --noEmit`
Expected: no errors

**Step 3: Run the dev build**

Run: `npm run build` (or `npx vite build`)
Expected: successful build

**Step 4: Final commit if any fixes needed, then verify with a visual check**

Open the app, navigate to a session, expand the metadata card and confirm:
- Messages row shows "X user · Y assistant · Z tool calls"
- History row shows "N messages · Xk tokens"
- Context row shows "N messages · X% of Yk"
- Session list still shows "N msg" correctly

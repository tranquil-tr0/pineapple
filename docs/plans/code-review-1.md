# Code Review Remediation Plan #1

_Date: 2026-02-19_

## 0) Scope, priorities, and constraints

This plan covers the requested review/remediation items in strict priority order.

### Priority order (required)
1. **Tooling + quality gaps first** (linting/checking/CI guardrails).
2. **E2E reliability + realism** (user-driven interactions, no internal state mutation in tests).
3. **Correctness for missing/unused paths** (routing/WS/server→client gaps).
4. **Cleanup of unused/dead/over-modeled code** (deps/config/exports/styles).
5. **Investigation notes only (no redesign yet)** for deferred architecture topics.

### Explicitly out of scope for this iteration
- Unsafe HTML rendering hardening.
- Bundle size optimization/code-splitting.

---

## 1) Current baseline snapshot

- `npm run check`: passing.
- `npm run test:api`: passing.
- `npm run test:e2e`: passing after fixing the archived-session send path.
- `npx tsc --noEmit`: passing.
- `npm run build`: passing (with large-chunk warning, intentionally deferred).

Known repo hotspots (LOC):
- `src/client/components/chat-view.ts` (~1532)
- `src/client/styles/theme.css` (~1430)
- `tests/e2e/app.spec.ts` (~884)
- `src/client/components/chat-input.ts` (~832)
- `src/client/components/message-list.ts` (~839)

---

## 2) Phase A — Tooling and quality gates (first)

### A1. Add explicit quality scripts in `package.json`
Add:
- `typecheck`: `tsc --noEmit && tsc --noEmit --project tsconfig.server.json`
- `check:unused:exports`: `ts-prune -p tsconfig.json`
- `check:unused:deps`: dependency usage check (e.g. `depcheck` or `knip`)
- `lint`: ESLint for TS + Lit templates
- `lint:css`: Stylelint for `src/client/styles/theme.css`
- `check`: aggregate script running all of the above + tests

### A2. Add CI gate (or local mandatory pre-merge command)
- Run: `npm run check`
- Fail merge on any non-zero step.

### A3. Add test quality guardrails
- Add a rule/check for E2E files disallowing:
  - direct mutation of component internals in `page.evaluate`
  - calling private/internal methods from tests
- Allow list only for unavoidable browser APIs (small, explicit exceptions).

### A4. Baseline docs
- Create `docs/plans/quality-gates.md` with:
  - required commands
  - expected runtime
  - troubleshooting notes

### A5. Current implementation status (completed in this branch)
- Added scripts in `package.json`:
  - `typecheck`
  - `lint`
  - `lint:css`
  - `check:unused:exports`
  - `check:unused:deps`
  - `check:e2e:guardrails`
  - `check`
- Added ESLint config: `eslint.config.mjs` (TypeScript + Lit checks).
- Added Stylelint config: `stylelint.config.mjs`.
- Added E2E guardrail script: `scripts/check-e2e-guardrails.mjs`.
- Added/updated E2E guardrail baseline: `tests/e2e/.guardrail-baseline.json` (now zero allowed fingerprints after migration).
- Added quality-gate doc: `docs/plans/quality-gates.md`.
- Verified `npm run check` passes end-to-end.

**Phase A done when**: all scripts exist, documented, and run cleanly in one command.

---

## 3) Phase B — E2E realism + flaky-path fix

### B1. Lock in the archive/unarchive fix path
- Keep test interaction user-driven:
  - open session via route
  - type in `<chat-input>` textarea
  - submit via keyboard/button
- Avoid internal method calls (e.g., removed dependency on missing `routeAndSubmitText`).

### B2. Migrate brittle E2E patterns incrementally
Refactor `tests/e2e/app.spec.ts` to remove internal mutations in phases:
1. Replace direct `view.messages = [...]` with API/WS-driven setup fixtures.
2. Replace `view.wsSend = ...` interception with observable UI outcomes.
3. Replace deep shadow/internal `evaluate` interactions where Playwright locators suffice.

### B3. Introduce E2E helpers
Create helper functions for:
- `openSession(page, id)`
- `sendMessage(page, text)`
- `renameSessionFromHeader(page, name)`
- `openSessionContextMenu(page, sessionName)`

This reduces duplicated internals and keeps interactions user-level.

### B4. Current implementation status (completed in this branch)
- Reworked `tests/e2e/app.spec.ts` to remove direct `chat-view` internal mutation and private/internal method calls.
- Replaced internal message injection with seeded real session JSONL fixtures written to the configured e2e session dir (`/tmp/pi-web-e2e-sessions`).
- Replaced internal command injection with real command discovery assertions.
- Replaced extension confirm internal method invocation with WebSocket-route protocol-level simulation (`page.routeWebSocket(...)`) and user-click response assertion.
- Added reusable interaction helpers (`openSession`, `sendMessage`, `renameSessionFromHeader`, `openSessionContextMenu`).
- Updated guardrail baseline to zero allowed fingerprints.
- Verified guardrails now report: `0 known baseline hit(s), 0 new violation(s)`.

**Phase B done when**: no E2E test mutates app internal fields/methods directly.

---

## 4) Phase C — Missing/unused behavior paths (correctness)

### C1. Server → client field support
Resolved in current branch:
- Confirmed `sessionName` from `state` payload is consumed in chat state handling.
- Added E2E regression: `Chat View › applies server state session name before send`.
  - Test verifies a WS `state` update with server-provided `sessionName` is reflected in the chat header before user send action.

### C2. Unused routing branch
Resolved in current branch:
- Removed dead `local_command` route branch from `input-router` and `chat-view`.
- Simplified `RoutedInput` and `RouteInputOptions` accordingly.

Follow-up:
- If local-only slash commands are introduced later, add explicit command registry and tests with user-visible behavior.

### C3. Unused WS message path
Resolved in current branch:
- Removed unsupported `abort_bash` message path from shared client/server message contracts.
- Consolidated local shell cancellation under existing `abort` handling on the server.

Follow-up:
- If separate shell-only abort semantics are needed later, add them with explicit UI trigger + tests.

### C4. WS handler switch decomposition
Resolved in current branch:
- Replaced the large `switch (msg.type)` branch in `src/server/ws-handler.ts` with a typed handler map (`ClientMessageHandlers`) and explicit dispatcher (`dispatchClientMessage`).
- Added explicit inbound payload checks (`hasMessageType`, `isClientMessageType`) before dispatch.
- Extracted response mapping for pending RPC commands into `handlePendingRpcResponse(...)`.
- Centralized repeated shell shutdown logic via `stopRunningLocalShell()`.

Verification:
- `npm run typecheck && npm run lint` passed.
- `npm run test:api && npm run test:e2e` passed.

**Phase C done when**: every declared client/server message path is either used+tested or removed.

---

## 5) Phase D — Unused/over-modeled/dead cleanup

### D1. Dependencies
Resolved in current branch:
- Removed `glob`
- Removed `@mariozechner/pi-web-ui`

Follow-up actions:
1. Add `check:unused:deps` automation to prevent regressions.
2. Re-verify dependency usage whenever new packages are added.

### D2. Unused config fields
Resolved in current branch:
- Removed unused `defaultModel` and `defaultThinkingLevel` from `ServerConfig` and `loadConfig()`.
- Removed test fixture references to those fields.

Follow-up:
- If defaults are needed later, reintroduce only with concrete runtime use and tests.

### D3. Unused exports / type over-modeling
Resolved baseline in current branch:
- Removed unused REST response exports from `src/shared/types.ts`:
  - `SessionListResponse`
  - `SessionCreatedResponse`
  - `SessionUpdatedResponse`
  - `HealthResponse`
- Updated `check:unused:exports` to focus on actionable items (`ts-prune ... -i "used in module"`).

Follow-up:
- Continue trimming additional over-modeled exports as they become unreferenced.

### D4. CSS/style dead code
Resolved in current branch:
- Audited `src/client/styles/theme.css` against current rendered class usage.
- Removed high-confidence dead selectors no longer referenced by UI render paths:
  - `.cv-extension-status-list`
  - `.cv-extension-status-item` (+ nested `span`/`strong` rules)
  - `.cv-extension-widget-item` (+ `summary`/`pre` rules)
  - `.line-count`
- Added visual smoke checklist for major UI states:
  - `docs/plans/visual-smoke-checklist.md`
- Saved audit evidence note:
  - `docs/plans/research/07-css-style-audit.md`

Verification:
- `npm run lint:css` passed.
- `npm run test:e2e` passed (`64` tests).

### D5. Deep-link target stability
Resolved in current branch:
- `message-list` now prefers explicit per-message `_targetId` when provided.
- `chat-view` now assigns message target ids from source-message index (`msg-${sourceIndex}`) before render filtering.
- This avoids deep-link id shifts caused by changes in visible/rendered index composition.

Follow-up:
- Long-term stability should move from source index to durable message ids from persisted message metadata.

**Phase D done when**: dependency/config/export/style audits produce no unresolved high-confidence dead items.

---

## 6) Phase E — Deferred architecture investigations (collect facts only, no redesign)

For each topic below, produce a short evidence note in `docs/plans/research/`:

1. **`chat-view.ts` too large**
   - Record responsibility map (routing, WS, rendering, state sync, dialogs, sidebar, metadata).
   - Identify top-level cohesive slices and coupling points.

2. **State mutation during render path**
   - Document occurrences (e.g., render-path helper mutating component state).
   - Record risks (rerender loops, hard-to-reason update order).

3. **Double connect/load risk**
   - Trace lifecycle (`connectedCallback` + `updated(sessionId)` paths).
   - Capture whether duplicate calls can happen under route churn.

4. **Giant WS event switch in client/server**
   - Count cases and group by domain.
   - Record branching complexity and test coverage per branch.

5. **Repeated session list scan+parse**
   - Measure repeated scans from `listSessions`/`findSessionFile`.
   - Capture performance profile with many session files.

6. **Hard-to-follow message pipeline**
   - Create sequence trace: input → route → wsSend → server handler → rpc event → UI message assembly.
   - Note transformation points and implicit assumptions.

Deliverables for this phase are **notes only**, no architecture redesign proposal yet.

### E7. Current implementation status (completed in this branch)
Created evidence notes in `docs/plans/research/`:
- `01-chat-view-size.md`
- `02-render-path-mutation.md`
- `03-double-connect-load-risk.md`
- `04-ws-branching-complexity.md`
- `05-session-scan-parse-repetition.md`
- `06-message-pipeline-trace.md`
- `07-css-style-audit.md`

---

## 7) Execution checklist (step-by-step)

1. Add quality scripts + docs (Phase A).
2. Run baseline checks and store outputs.
3. Migrate archive/unarchive E2E to user-driven flow (done).
4. Add regression for server-provided session name usage (done: E2E test `applies server state session name before send`).
5. Remove remaining internal-mutation E2E patterns incrementally (done: suite migrated; guardrail baseline now zero).
6. Resolve `local_command` branch decision (done: removed dead branch).
7. Resolve `abort_bash` path decision (done: removed path; folded shell abort into `abort`).
8. Decompose WS handler switch with tests intact (done: handler map + pending-response mapper; API/E2E green).
9. Remove verified unused deps (done for `glob` and `@mariozechner/pi-web-ui`).
10. Resolve `defaultModel`/`defaultThinkingLevel` usage vs removal (done: removed as unused).
11. Trim unused exports/types (done baseline pass for unused shared REST response exports).
12. Stabilize deep-link ids against render-index drift (done: source-index-based `_targetId` wiring).
13. Run CSS dead-style sweep + visual smoke pass (done: removed dead selectors + added `docs/plans/visual-smoke-checklist.md`; lint/e2e green).
14. Produce deferred architecture evidence notes (done: `docs/plans/research/01..07-*.md`).
15. Final full verification (done): `npm run check` (green), including `test:api` (18 passed), `test:e2e` (64 passed), and `build`.
16. Incremental `chat-view` maintainability slice (done): centralized lifecycle setup/reset helpers, replaced `handleServerMessage`/`handleAgentEvent` switch blocks with handler maps, and removed render-path `systemPrompt` mutation.
17. Incremental session lookup optimization (done): added id↔file index fast path in `SessionManager.findSessionFile()` with stale-entry cleanup, reducing repeated full scans on hot paths.
18. Incremental `chat-view` maintainability slice (done): extracted extension UI request queue/state/reply plumbing into `src/client/utils/extension-ui-state.ts`, keeping chat-view side effects focused on WS send + UI rendering.
19. Incremental `chat-view` maintainability slice (done): extracted extension dialog template branching into `src/client/utils/render-extension-ui-dialog.ts`, reducing UI branching noise in `chat-view.ts`.
20. Incremental `chat-view` maintainability slice (done): extracted sidebar and session-info render blocks into `src/client/utils/render-chat-sidebar.ts` and `src/client/utils/render-session-info-stack.ts`.
21. Incremental `chat-view` maintainability slice (done): extracted editor footer and status-line render blocks into `src/client/utils/render-chat-editor-footer.ts`.
22. Incremental `chat-view` maintainability slice (done): extracted message shaping and session action logic into `src/client/utils/message-shaping.ts` and `src/client/utils/session-actions.ts`.

---

## 8) Acceptance criteria for this plan

- Tooling-first order enforced.
- Every requested review point appears as a concrete tracked action.
- Deferred architecture topics are captured as investigation tasks only (no redesign in this doc).
- Out-of-scope items (unsafe HTML, bundle size) remain explicitly deferred.

---

## 9) Collected investigation details (no redesign)

Canonical evidence is stored in:
- `docs/plans/research/01-chat-view-size.md`
- `docs/plans/research/02-render-path-mutation.md`
- `docs/plans/research/03-double-connect-load-risk.md`
- `docs/plans/research/04-ws-branching-complexity.md`
- `docs/plans/research/05-session-scan-parse-repetition.md`
- `docs/plans/research/06-message-pipeline-trace.md`
- `docs/plans/research/07-css-style-audit.md`

Current summary (aligned to those notes):

### 9.1 `chat-view.ts` size / responsibility concentration
- Current size is ~1532 LOC (after extracting extension request state/queue logic, extension dialog rendering, sidebar rendering, session-info rendering, editor footer rendering, message shaping, and session action logic helpers).
- The component still combines lifecycle/connect, WS protocol mapping, message shaping, session actions, and render composition; concentration remains high despite incremental splits.

### 9.2 State mutation during render path
- Mitigated in current branch: `getRenderableMessages()` no longer mutates `this.systemPrompt`.
- System prompt synchronization now happens in explicit message/state handlers (`handleStateMessage` / `handleAgentResponse`).

### 9.3 Double connect/load risk
- Mitigated in current branch: setup/reset logic now runs through shared helpers (`bootstrapSessionRuntime`, `resetSessionState`) with explicit `sessionId` change guards in `updated(...)`.
- Remaining risk is lower, but lifecycle + reconnect interactions still warrant observation under rapid route churn.

### 9.4 WS branching complexity
- Server side `switch (msg.type)` was decomposed to a typed handler map + dispatcher (resolved C4).
- Client side now also dispatches via handler maps (`serverMessageHandlers`, `agentEventHandlers`) instead of large `switch` blocks, but overall file-level complexity in `chat-view.ts` remains high.

### 9.5 Repeated session file scan+parse
- Mitigated in current branch: `findSessionFile()` now uses in-memory id↔file indexes (`sessionFileById` / `sessionIdByFile`) before falling back to full scan.
- Full directory scans still occur in `listSessions()` and on cache miss/stale mapping, so worst-case scan complexity remains.

### 9.6 Message pipeline complexity
- Multi-stage pipeline remains spread across `chat-input` → router → `chat-view` → WS handler → RPC → back to UI message assembly/rendering.

---

## 10) Final architectural/maintainability review summary

### 10.1 Overall assessment
The codebase is in a significantly better reliability and maintainability state than baseline:
- Quality gates are explicit and enforced through a single `npm run check` path.
- E2E coverage now validates user behavior instead of mutating component internals.
- Unused or misleading paths/types/dependencies were removed.
- WS server dispatch readability improved through typed handler mapping.
- Several high-risk `chat-view` complexity points were reduced through incremental extraction.

Current maturity: **good operational discipline, moderate architecture concentration risk**.

### 10.2 What is now strong
1. **Tooling/quality discipline (high confidence)**
   - Typecheck/lint/css-lint/unused checks/API/E2E/build are all in one gate.
   - E2E guardrails are active with zero baseline exceptions.

2. **Behavioral test realism (high confidence)**
   - UI tests use navigation/click/type flows and protocol-level simulation where needed.
   - Archive/unarchive, extension confirm, session-name race, and deep-link behavior are covered in realistic scenarios.

3. **Protocol-path correctness (medium-high confidence)**
   - Dead message/routing branches removed (`local_command`, `abort_bash`).
   - Server WS dispatch now follows typed message handlers with explicit guards.

4. **Dead-code reduction (medium confidence)**
   - Unused deps/config/exports and confirmed dead CSS selectors were removed.
   - Session lookup hot path got id↔file indexing to reduce repeated scans.

### 10.3 Highest remaining architecture risks
1. **`chat-view.ts` concentration risk (highest)**
   - Even after extractions, `chat-view.ts` remains ~1532 LOC with broad responsibilities.
   - This still increases onboarding cost and change-coupling risk.

2. **Message/deep-link durability model (medium)**
   - Deep-link ids are source-index-based (`msg-${sourceIndex}`), better than render-index drift but still not durable IDs tied to persisted message identity.

3. **Pipeline traceability (medium)**
   - Message flow crosses many layers (`chat-input` → router → WS → RPC → state/event handlers → render), making end-to-end reasoning non-trivial.

4. **Operational noise (low-medium)**
   - Repeated model-pattern warnings in API/E2E runs are still present and reduce signal quality.

### 10.4 Prioritized next refactor plan
1. **Split `chat-view` by cohesive slices (first priority)**
   - Continue extracting self-contained UI/state slices (as done for extension state/dialog).
   - Target: reduce branch-heavy render and protocol-handling concentration.

2. **Introduce durable message IDs end-to-end**
   - Move deep-link targets from index-derived ids to persisted message identity.

3. **Add message-pipeline observability points**
   - Lightweight trace hooks around route/send/receive/render boundaries for easier diagnosis.

4. **Handle test-run warning noise**
   - Decide whether to align model patterns in test config or classify/suppress expected warnings.

### 10.5 Constraint alignment check
- Bundle-size optimization: still intentionally deferred.
- Unsafe HTML hardening: still intentionally deferred.
- Tooling-first ordering: satisfied.
- User-driven E2E requirement: satisfied.

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
- `npm run test:e2e`: passing with 64 tests.
- `npx tsc --noEmit`: passing.
- `npm run build`: passing (with large-chunk warning, intentionally deferred).

Known repo hotspots (LOC):
- `src/client/components/chat-view.ts` (~697)
- `src/client/styles/theme.css` (~1342)
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

### A5. Current implementation status (completed)
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

### B4. Current implementation status (completed)
- Reworked `tests/e2e/app.spec.ts` to remove direct `chat-view` internal mutation and private/internal method calls.
- Replaced internal message injection with seeded real session JSONL fixtures written to the configured e2e session dir (`/tmp/pi-web-e2e-sessions`).
- Replaced internal command injection with real command discovery assertions.
- Replaced extension confirm internal method invocation with WebSocket-route protocol-level simulation (`page.routeWebSocket(...)`) and user-click response assertion.
- Added reusable interaction helpers (`openSession`, `sendMessage`, `renameSessionFromHeader`, `openSessionContextMenu`).
- Updated guardrail baseline to zero allowed fingerprints.
- Verified guardrails now report: `0 known baseline hit(s), 0 new violation(s)`.

---

## 4) Phase C — Decomposition & Refactoring

### C1. Extract session name/metadata helpers from `chat-view.ts` to `session-actions.ts`.
- [x] Done.

### C2. Extract message processing/sidebar logic to `message-shaping.ts`.
- [x] Done.

### C3. Extract UI component chunks (Session Info stack, Sidebar, Editor Footer).
- [x] Done.

### C4. Refactor `chat-view.ts` into a `SessionRuntime` controller and a presentation component.
- [x] Done. `chat-view.ts` LOC reduced from ~2236 to ~697.
- [x] `SessionRuntime` handles WebSocket lifecycle, protocol mapping, and session state.

### C5. Encapsulate Extension UI state in `ExtensionUiState`.
- [x] Done. Manages request queue, side effects, and response payload generation.

### C6. Extract extension dialog template branching to `render-extension-ui-dialog.ts`.
- [x] Done.

### C7. Server WS handler switch decomposition.
- [x] Done. Replaced large switch in `ws-handler.ts` with typed handler map.

---

## 5) Phase D — Unused/over-modeled/dead cleanup

### D1. Dependencies
- [x] Removed `glob`
- [x] Removed `@mariozechner/pi-web-ui`

### D2. Unused config fields
- [x] Removed `defaultModel` and `defaultThinkingLevel`.

### D3. Unused exports / type over-modeling
- [x] Removed unused REST response exports from `src/shared/types.ts`.

### D4. CSS/style dead code
- [x] Removed dead selectors from `theme.css`.

### D5. Deep-link target stability
- [x] Implemented source-index-based `_targetId` wiring.

---

## 6) Phase E — Deferred architecture investigations (collect facts only, no redesign)

1. **`chat-view.ts` too large** -> `01-chat-view-size.md`
2. **State mutation during render path** -> `02-render-path-mutation.md`
3. **Double connect/load risk** -> `03-double-connect-load-risk.md`
4. **Giant WS event switch in client/server** -> `04-ws-branching-complexity.md`
5. **Repeated session list scan+parse** -> `05-session-scan-parse-repetition.md`
6. **Hard-to-follow message pipeline** -> `06-message-pipeline-trace.md`
7. **CSS/style dead code audit evidence** -> `07-css-style-audit.md`

---

## 7) Final architectural/maintainability review summary

### 7.1 Overall assessment
The codebase is in a significantly better reliability and maintainability state than baseline.
The massive reduction in `chat-view.ts` (70% LOC reduction) is a major architectural milestone.

Current maturity: **high operational discipline, low-to-moderate architecture concentration risk**.

### 7.2 What is now strong
1. **Tooling/quality discipline (high confidence)**
   - Unified `npm run check` gate.
   - Zero private-internal mutation in E2E tests.
2. **State/Protocol Separation (high confidence)**
   - `SessionRuntime` decouples UI from WebSocket idiosyncrasies.
   - `ExtensionUiState` encapsulates complex request/response logic.
3. **Decomposed Presentation (high confidence)**
   - `chat-view.ts` is now a clean orchestrator of sub-renderers and a runtime controller.

### 7.3 Highest remaining architecture risks
1. **Durable Message Identity**
   - Deep-links still rely on source-index-based IDs which are stable across render filters but not across session edits.
2. **Pipeline complexity**
   - Multi-stage pipeline is still hard to trace from input to final render.

### 7.4 Prioritized next refactor plan
1. **Durable message IDs**: transition to persisted unique IDs.
2. **Pipeline observability**: add lightweight hooks for tracing message flow.
3. **Model warning cleanup**: eliminate "no models match" noise in test runs.

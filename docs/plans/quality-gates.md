# Quality Gates

_Date: 2026-02-19_

## Required commands before merge

Run the full gate:

```bash
npm run check
```

Or run steps individually:

1. `npm run typecheck`
2. `npm run lint`
3. `npm run lint:css`
4. `npm run check:e2e:guardrails`
5. `npm run check:unused:deps`
6. `npm run check:unused:exports`
7. `npm run test:api`
8. `npm run test:e2e`
9. `npm run build`

## Typical runtime (local)

- `typecheck`: ~2-10s
- `lint` + `lint:css`: ~2-10s
- `check:e2e:guardrails`: <1s
- `check:unused:deps` + `check:unused:exports`: ~1-5s
- `test:api`: ~1-3s
- `test:e2e`: ~15-30s
- `build`: ~1-5s

Total `npm run check`: typically ~25-60s.

## Guardrail note (E2E internals)

`check:e2e:guardrails` blocks new direct mutation/calls of `chat-view` internals from E2E tests.

- Existing violations are tracked in `tests/e2e/.guardrail-baseline.json`.
- New violations fail the check.
- To intentionally refresh baseline (rare):

```bash
npm run check:e2e:guardrails:update-baseline
```

## Troubleshooting

- If lint fails due parser/plugin updates, run `npm install` and retry.
- If `check:unused:deps` reports false positives, verify script ignore list in `package.json`.
- If `check:unused:exports` reports candidates, treat as review queue items (triage before removal).
- If e2e guardrail fails, replace internal mutation with user-driven interactions (navigate/click/type/assert).
- If e2e flakes locally, rerun single test with Playwright headed mode first, then rerun suite.

# Research Note 07 — CSS dead-style audit (`theme.css`)

Date: 2026-02-19

## Scope

Audit focused on high-confidence dead selectors in `src/client/styles/theme.css` that are no longer emitted by current Lit render paths.

## Removed selectors

Removed from `theme.css`:

- `.cv-extension-status-list`
- `.cv-extension-status-item`
- `.cv-extension-status-item span`
- `.cv-extension-status-item strong`
- `.cv-extension-widget-item`
- `.cv-extension-widget-item summary`
- `.cv-extension-widget-item pre`
- `.line-count`

## Evidence

- `rg` lookup over `src/client/components`, `src/client/utils`, and `tests` showed no render-time class usage for the removed selectors.
- Current extension status/widgets render paths use:
  - `cv-editor-status*`
  - `cv-editor-widget*`
- `line-numbers` remains used by tool diff/path rendering; `line-count` had no usage.

## Verification

- `npm run lint:css` passed.
- `npm run test:e2e` passed (`64` tests).

## Kept intentionally (not removed in this pass)

- Dynamic/runtime classes that may come from rendered markdown/highlighting pipelines (e.g. `hljs-*`, `note-warning`, `note-error`, `cv-tree-role-*`, `cv-editor-widget-aboveEditor`) were not removed unless direct absence was high-confidence.

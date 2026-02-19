# Visual Smoke Checklist

Date: 2026-02-19

Purpose: quick UI verification list to run after CSS/style cleanup.

## Core screens

- [x] Landing page renders header/new button/empty state.
- [x] Chat view renders header, sidebar, message area, and input.
- [x] Session-not-found screen renders.

## Chat interaction states

- [x] Send button enabled/disabled behavior.
- [x] User + assistant messages render.
- [x] Markdown blocks render.
- [x] Bash execution blocks expand/collapse.
- [x] Model/context/status bar visible below input.
- [x] Deep-link target + copy-link works.

## Extension + compaction states

- [x] Extension confirm modal renders and responds.
- [x] Extension notify requests render inline.
- [x] Auto-compaction inline notifications render.
- [x] Compaction summary messages render.

## Session workflows

- [x] Rename session in chat header.
- [x] Archive from landing context menu.
- [x] Sending to archived session unarchives title.
- [x] Delete session from landing context menu.

## Settings + responsive

- [x] Settings panel opens.
- [x] Theme toggle renders.
- [x] Thinking level control renders.
- [x] Desktop/mobile landing + chat layouts render.

## Verification source

Validated by green Playwright suite:
- `npm run test:e2e` → 64 passed

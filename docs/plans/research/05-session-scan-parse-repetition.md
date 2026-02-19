# Research Note 05 — Repeated session scan + parse paths

Date: 2026-02-19

## Core scan/parse functions

In `src/server/session-manager.ts`:
- `scanSessionFiles()` reads directory entries (`readdir`) and parses each `.jsonl` file (`parseSessionFile`).
- `parseSessionFile()` may `stat` + `readFile` and parse line-by-line JSON.
- `findSessionFile(sessionId)` now checks an in-memory id→file index first, then falls back to scan.

## Repetition points (still present)

- `listSessions()` still scans directory entries.
- `updateSession()` / `deleteSession()` / `getOrSpawn()` can still trigger scan paths on cache miss or stale mapping.

## Current mitigation

In addition to per-file parse cache (`fileCache`), current branch added:

- `sessionFileById` (session id → file) lookup.
- `sessionIdByFile` (file → session id) reverse mapping.
- `findSessionFile()` fast path:
  - validate cached file with single-file parse
  - only fallback to full `scanSessionFiles()` when needed.
- Mapping/cache cleanup for removed files during scan and delete paths.

## Behavior-level implication

- Worst-case scan complexity still scales with number of session files.
- Common repeated `findSessionFile()` calls avoid full directory scans when id/file mapping is warm and valid.

(Notes only; no redesign proposal in this document.)

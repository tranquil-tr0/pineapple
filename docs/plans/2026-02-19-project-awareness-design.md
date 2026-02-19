# Project/CWD Awareness Design

**Issue**: #13 — Make pizza project/CWD aware
**Date**: 2026-02-19

## Problem

The server binds to a single CWD at startup (`process.cwd()`). All sessions use that
CWD. Session listing shows only sessions from that CWD's bucket. Users want to work
across multiple projects from a single web UI instance.

## Approach: Thin Multi-Project Layer

Add minimal project awareness to the existing architecture. One `SessionManager` scans
multiple session buckets. A new `ProjectRegistry` discovers known projects. The frontend
gains a project picker and per-session CWD display.

## Path Resolution (Backtracking Decoder)

Session buckets are stored with encoded CWD names (e.g. `--Users-user-code-my-pi-web--`).
The encoding (`encodeCwd`) replaces `/`, `\`, `:` with `-`, which is lossy — we can't
naively reverse it.

**Algorithm**: backtracking search over the dash-separated segments.

1. Strip `--` prefix/suffix, split on `-`.
2. At each segment boundary, try two options:
   - **Split** (dash was a `/`): validate `/<path-so-far>` is a real directory.
   - **Join** (dash was literal): extend the current path component.
3. DFS with filesystem validation prunes impossible branches.
4. Return the first valid complete path, or `null` if unresolvable.

Results cached in memory for the server lifetime.

## Project Registry

**New module**: `src/server/project-registry.ts`

```typescript
interface ProjectInfo {
  cwd: string;            // resolved absolute path
  encodedCwd: string;     // bucket dir name
  sessionDir: string;     // full path to bucket
  sessionCount: number;   // .jsonl files in bucket
  lastActivityAt: string; // ISO timestamp of most recent session file
  displayPath: string;    // shortened (~ for homedir)
}
```

`listProjects(sessionsRoot)` scans the root directory, filters to `--...--` directories,
resolves each via the backtracking decoder, skips unresolvable ones, returns sorted by
`lastActivityAt` descending. Cached with 30-second TTL.

## SessionManager Changes

1. `sessionDir` → `sessionsRoot`: points to `~/.pi/agent/sessions/` (parent of all
   CWD buckets) instead of a single bucket.
2. `cwd` removed from `ServerConfig` — no longer a single server CWD.
3. `listSessions()` scans all project bucket directories. Each `SessionMeta` gains a
   `cwd` field. Filters to sessions from the last 7 days.
4. `createSession(cwd: string)` takes a CWD parameter. Computes the bucket from the
   CWD. Spawns `pi --mode rpc` with the given CWD.
5. `ActiveSession` gains `cwd: string`.
6. `findSessionFile(id)` and `getOrSpawn(sessionId)` search across all buckets.

## API Changes

**Modified**:
- `POST /api/sessions` — requires `{ cwd: string }` body. Returns 400 if missing or
  invalid directory.
- `GET /api/sessions` — returns sessions from all projects. Each `SessionMeta` includes
  `cwd` (display path) and `cwdRaw` (absolute path). Filtered to last 7 days server-side.
- `GET /api/health` — `cwd` replaced with `sessionsRoot`.

**New**:
- `GET /api/projects` — returns discovered projects sorted by most recently used.

## Frontend Changes

### Session List

- Session cards show shortened CWD path (e.g. `~/code/my-pi-web`) below the session
  name in muted/secondary style.
- Sessions from all projects in a single time-sorted list.

### New Session Button → Project Picker

The header "+" button opens a dropdown listing projects sorted by most recently used.
Each item shows the shortened CWD path. Clicking an item creates a session in that
project.

### Bottom Project List

Below the session list, a "Projects" section shows all discovered projects. Each row
displays the shortened CWD, session count, and a "New session" button.

### Empty State

If no projects are discovered: show "No projects found. Use pi in a project directory
first."

## Testing

- **Path resolver unit tests**: backtracking algorithm with temp directory structures
  that test disambiguation (e.g. `/tmp/a-b/c` vs `/tmp/a/b-c`).
- **Project registry unit tests**: temp session root with mock buckets.
- **API tests**: `POST /sessions` with `cwd`, `GET /sessions` returns `cwd`, `GET
  /projects` endpoint, 400 on missing `cwd`.
- **E2E tests**: updated for project picker flow (click button → pick project → session
  created).
- **Test cleanup**: tests must clean up their session bucket directories.

## Error Handling

- Unresolvable bucket names: skipped silently, logged at debug level.
- Missing `cwd` in `POST /sessions`: 400 error.
- Non-existent `cwd` directory: 400 error.
- Empty project list: informational message in frontend.
- Empty bucket (no sessions): still shown as a project with `sessionCount: 0`.

## Out of Scope

- Bootstrapping new project directories (creating buckets for directories where pi
  hasn't been used before).
- Per-project git branch display.
- Stale bucket cleanup (one-time manual cleanup for existing test artifacts).

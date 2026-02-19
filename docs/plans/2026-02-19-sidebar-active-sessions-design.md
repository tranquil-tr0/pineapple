# Sidebar Active Sessions Quick-Links

Issue: #9

## Problem

Navigating between active sessions requires going back to the session list page. When working with multiple sessions, this is friction-heavy.

## Solution

Add a bottom-aligned "active sessions" section to the chat-view desktop sidebar. This section shows recently active, non-archived sessions (excluding the current one) as compact quick-links.

## Layout

```
┌─────────────────────┐
│ Search + Filters    │  cv-sidebar-controls (fixed)
├─────────────────────┤
│ Message tree        │  cv-tree-container (flex: 1, scrolls)
│  • user: hello      │
│  • assistant: hi    │
├─────────────────────┤
│ 42 entries          │  cv-tree-status
├─────────────────────┤
│ Sessions            │  new: section header
│ ● my-project        │  new: active session links
│ ● refactor-auth     │
└─────────────────────┘
```

## Filtering

A session appears in the quick-links if ALL conditions are true:
- Not archived (by name prefix)
- `lastActivityAt` within the past hour
- `activity.state` is not `inactive`
- Not the currently viewed session

If no sessions match, the entire section is hidden.

## Item Display

Minimal: session display name (truncated with ellipsis) + colored activity dot.
- Green dot: user attached
- Gray dot: process running (activeHere but not attached)
- No dot otherwise (warm/idle just show the name)

Each item is an `<a href="#/session/{id}">` for standard navigation.

## Real-Time Updates

- On chat-view mount: fetch `/api/sessions` for initial list
- Connect to `/api/sessions/events` SSE for live activity updates
- On disconnect/reconnect: refetch full list
- Session appears/disappears as activity changes

## Implementation

- Extend `renderChatSidebar()` with new props: `activeSessions` array and rendering
- Add SSE + fetch logic to `chat-view.ts` (the parent component)
- Add CSS for the new section to `theme.css`
- Reuse `SessionMeta` type and `isArchivedSessionName` utility

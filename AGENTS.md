# Agent Guidelines

When making changes to this codebase:

1. **Lint** after every chunk of changes
2. **Test** after every chunk of changes
3. **Commit** after every chunk of changes

This ensures each commit represents a tested, working state and makes it easier to bisect issues if they arise.

## Commands

Use the justfile when possible:

```bash
just lint        # Run ESLint
just test        # Run API/unit tests
just build       # Build for production
```

## Architecture

Express/Node backend manages Pi agent RPC subprocesses. Lit web components on the frontend. WebSocket proxies communication between client and Pi process. Sessions stored as JSONL files on disk. Vite builds the client, tsc compiles the server.

## Tools

- Use `agent-browser` to test the application in a Chrome instance, allowing interaction and screenshots. Run `agent-browser --help` to learn how to use it.


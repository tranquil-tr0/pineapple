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
just test        # Run all tests (API + E2E)
just test-api    # Run API/unit tests only
just test-e2e    # Run Playwright E2E tests
just build       # Build for production
```

Alternative npm scripts (if just is not available):

```bash
npm run lint     # Run ESLint
npm test         # Run all tests
npm run test:api # Run API/unit tests only
npm run test:e2e # Run Playwright E2E tests
npm run build    # Build for production
```

Note: E2E tests require the dev server to not be running on port 3001.

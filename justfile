dev:
    bun run dev

lint:
    bun run lint

test:
    bun test

test-api:
    bun run test:api

test-e2e:
    bun run test:e2e

build:
    bun run build

run: build
    bun start

import { execa } from "execa";

const server = execa({
  stdout: "inherit",
  stderr: "inherit",
})`bun src/server/main.ts --watch`;
const client = execa({ stdout: "inherit", stderr: "inherit" })`vite dev`;

await Promise.allSettled([server, client]);

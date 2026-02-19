import { join } from "path";
import { homedir } from "os";

export interface ServerConfig {
  port: number;
  sessionsRoot: string;
  idleTimeoutMs: number;
  piCommand: string;
}

export function encodeCwd(cwd: string): string {
  return `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`;
}

export function loadConfig(argv: string[]): ServerConfig {
  const args = parseArgs(argv);

  const sessionsRoot =
    args["sessions-root"] ||
    process.env.PI_SESSIONS_ROOT ||
    join(homedir(), ".pi", "agent", "sessions");

  const port = parseInt(
    args["port"] || process.env.PI_PORT || "3000",
    10,
  );

  const idleTimeoutMs = parseInt(
    process.env.PI_IDLE_TIMEOUT_MS || "300000",
    10,
  );
  const piCommand = process.env.PI_COMMAND || "pi";

  return {
    port,
    sessionsRoot,
    idleTimeoutMs,
    piCommand,
  };
}

function parseArgs(argv: string[]): Record<string, string> {
  const result: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith("--") && i + 1 < argv.length) {
      const key = argv[i].slice(2);
      result[key] = argv[i + 1];
      i++;
    }
  }
  return result;
}

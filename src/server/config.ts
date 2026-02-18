import { resolve } from "path";
import { homedir } from "os";

export interface ServerConfig {
  port: number;
  sessionDir: string;
  defaultModel: string | null;
  defaultThinkingLevel: string;
  idleTimeoutMs: number;
  piCommand: string;
}

export function loadConfig(argv: string[]): ServerConfig {
  const args = parseArgs(argv);

  const sessionDir =
    args["session-dir"] ||
    process.env.PI_SESSION_DIR ||
    resolve(homedir(), ".pi", "agent", "sessions");

  const port = parseInt(
    args["port"] || process.env.PI_PORT || "3000",
    10,
  );

  const defaultModel = process.env.PI_DEFAULT_MODEL || null;
  const defaultThinkingLevel = process.env.PI_DEFAULT_THINKING_LEVEL || "off";
  const idleTimeoutMs = parseInt(
    process.env.PI_IDLE_TIMEOUT_MS || "300000",
    10,
  );
  const piCommand = process.env.PI_COMMAND || "pi";

  return {
    port,
    sessionDir,
    defaultModel,
    defaultThinkingLevel,
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

import { readFile, stat } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

interface GlobalSettingsFile {
  enabledModels?: unknown;
}

function resolveGlobalAgentDir(): string {
  const configured = process.env.PI_CODING_AGENT_DIR;
  if (!configured) {
    return join(homedir(), ".pi", "agent");
  }
  if (configured === "~") {
    return homedir();
  }
  if (configured.startsWith("~/")) {
    return join(homedir(), configured.slice(2));
  }
  return configured;
}

function parseEnabledModels(value: unknown): Set<string> | null {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }

  const modelIds = value
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (modelIds.length === 0) {
    return null;
  }

  return new Set(modelIds);
}

function isNotFoundError(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}

export class GlobalModelScope {
  private readonly settingsPath: string;
  private loadedMtimeMs: number | null | undefined;
  private enabledModels: Set<string> | null = null;

  constructor(settingsPath = join(resolveGlobalAgentDir(), "settings.json")) {
    this.settingsPath = settingsPath;
  }

  async refresh(): Promise<void> {
    let nextMtimeMs: number | null;
    try {
      const fileStat = await stat(this.settingsPath);
      nextMtimeMs = fileStat.mtimeMs;
    } catch (err) {
      if (isNotFoundError(err)) {
        this.loadedMtimeMs = null;
        this.enabledModels = null;
        return;
      }
      console.error(
        `[models] Failed to stat global settings at ${this.settingsPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      return;
    }

    if (this.loadedMtimeMs === nextMtimeMs) {
      return;
    }

    try {
      const raw = await readFile(this.settingsPath, "utf-8");
      const parsed = JSON.parse(raw) as GlobalSettingsFile;
      this.enabledModels = parseEnabledModels(parsed.enabledModels);
      this.loadedMtimeMs = nextMtimeMs;
    } catch (err) {
      console.error(
        `[models] Failed to parse global settings at ${this.settingsPath}: ${
          err instanceof Error ? err.message : String(err)
        }`,
      );
      this.loadedMtimeMs = nextMtimeMs;
      this.enabledModels = null;
    }
  }

  getEnabledModels(): ReadonlySet<string> | null {
    return this.enabledModels;
  }
}

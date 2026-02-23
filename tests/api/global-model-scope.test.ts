import { beforeEach, describe, expect, it } from "vitest";
import { mkdir, mkdtemp, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { GlobalModelScope } from "../../src/server/global-model-scope.js";

describe("global-model-scope", () => {
  let rootDir: string;
  let settingsPath: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "pi-web-model-scope-"));
    settingsPath = join(rootDir, "settings.json");
  });

  it("returns null when settings file is missing", async () => {
    const scope = new GlobalModelScope(settingsPath);
    await scope.refresh();
    expect(scope.getEnabledModels()).toBeNull();
  });

  it("reads enabledModels from global settings", async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({
        enabledModels: [
          "openrouter/z-ai/glm-5",
          " openai-codex/gpt-5.3-codex ",
          123,
          "",
        ],
      }),
    );

    const scope = new GlobalModelScope(settingsPath);
    await scope.refresh();

    expect(Array.from(scope.getEnabledModels() || [])).toEqual([
      "openrouter/z-ai/glm-5",
      "openai-codex/gpt-5.3-codex",
    ]);
  });

  it("updates when settings file changes", async () => {
    await writeFile(
      settingsPath,
      JSON.stringify({ enabledModels: ["openrouter/z-ai/glm-5"] }),
    );

    const scope = new GlobalModelScope(settingsPath);
    await scope.refresh();
    expect(Array.from(scope.getEnabledModels() || [])).toEqual([
      "openrouter/z-ai/glm-5",
    ]);

    await new Promise((resolve) => setTimeout(resolve, 5));
    await writeFile(
      settingsPath,
      JSON.stringify({ enabledModels: ["openai-codex/gpt-5.3-codex"] }),
    );

    await scope.refresh();
    expect(Array.from(scope.getEnabledModels() || [])).toEqual([
      "openai-codex/gpt-5.3-codex",
    ]);
  });

  it("falls back to null when settings JSON is invalid", async () => {
    await writeFile(settingsPath, "{not json");

    const scope = new GlobalModelScope(settingsPath);
    await scope.refresh();

    expect(scope.getEnabledModels()).toBeNull();
  });

  it("falls back to null when enabledModels is not an array", async () => {
    await mkdir(rootDir, { recursive: true });
    await writeFile(settingsPath, JSON.stringify({ enabledModels: "not-array" }));

    const scope = new GlobalModelScope(settingsPath);
    await scope.refresh();

    expect(scope.getEnabledModels()).toBeNull();
  });
});

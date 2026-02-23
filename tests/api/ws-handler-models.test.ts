import { describe, expect, it } from "vitest";
import { mapAvailableModels } from "../../src/server/ws-handler.js";

describe("mapAvailableModels", () => {
  it("maps all models when no scope is configured", () => {
    const models = mapAvailableModels(
      [
        {
          provider: "openrouter",
          modelId: "z-ai/glm-5",
          name: "GLM 5",
        },
        {
          provider: "openai-codex",
          id: "gpt-5.3-codex",
          label: "GPT-5.3 Codex",
        },
      ],
      null,
    );

    expect(models).toEqual([
      {
        provider: "openrouter",
        id: "z-ai/glm-5",
        label: "GLM 5",
      },
      {
        provider: "openai-codex",
        id: "gpt-5.3-codex",
        label: "GPT-5.3 Codex",
      },
    ]);
  });

  it("filters models by exact provider/id from enabledModels", () => {
    const models = mapAvailableModels(
      [
        {
          provider: "openrouter",
          modelId: "z-ai/glm-5",
          name: "GLM 5",
        },
        {
          provider: "openai-codex",
          id: "gpt-5.3-codex",
          label: "GPT-5.3 Codex",
        },
      ],
      new Set(["openai-codex/gpt-5.3-codex"]),
    );

    expect(models).toEqual([
      {
        provider: "openai-codex",
        id: "gpt-5.3-codex",
        label: "GPT-5.3 Codex",
      },
    ]);
  });

  it("does not treat enabledModels entries as patterns", () => {
    const models = mapAvailableModels(
      [
        {
          provider: "openrouter",
          modelId: "google/gemini-3-pro-preview",
          name: "Gemini 3 Pro",
        },
      ],
      new Set(["openrouter/google/*"]),
    );

    expect(models).toEqual([]);
  });
});

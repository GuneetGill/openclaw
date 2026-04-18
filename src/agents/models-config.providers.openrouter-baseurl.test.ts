import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveOpenClawAgentDir } from "./agent-paths.js";
import {
  installModelsConfigTestHooks,
  MODELS_CONFIG_IMPLICIT_ENV_VARS,
  unsetEnv,
  withModelsTempHome,
  withTempEnv,
} from "./models-config.e2e-harness.js";
import { ensureOpenClawModelsJson } from "./models-config.js";
import {
  CANONICAL_OPENROUTER_BASE_URL,
  rewriteKnownBadOpenRouterBaseUrl,
  rewriteOpenRouterProviderBaseUrls,
} from "./models-config.providers.openrouter-baseurl.js";
import type { ProviderConfig } from "./models-config.providers.secrets.js";
import { readGeneratedModelsJson } from "./models-config.test-utils.js";

installModelsConfigTestHooks();

describe("rewriteKnownBadOpenRouterBaseUrl", () => {
  it("rewrites legacy marketing-site path /v1 to /api/v1", () => {
    expect(rewriteKnownBadOpenRouterBaseUrl("https://openrouter.ai/v1")).toBe(
      CANONICAL_OPENROUTER_BASE_URL,
    );
    expect(rewriteKnownBadOpenRouterBaseUrl("https://openrouter.ai/v1/")).toBe(
      CANONICAL_OPENROUTER_BASE_URL,
    );
    expect(rewriteKnownBadOpenRouterBaseUrl("  https://openrouter.ai/v1/  ")).toBe(
      CANONICAL_OPENROUTER_BASE_URL,
    );
  });

  it("does not change the canonical API base", () => {
    expect(rewriteKnownBadOpenRouterBaseUrl(CANONICAL_OPENROUTER_BASE_URL)).toBe(
      CANONICAL_OPENROUTER_BASE_URL,
    );
  });

  it("does not change other hosts or paths", () => {
    expect(rewriteKnownBadOpenRouterBaseUrl("https://api.openrouter.ai/v1")).toBe(
      "https://api.openrouter.ai/v1",
    );
    expect(rewriteKnownBadOpenRouterBaseUrl("https://openrouter.ai/api/v1/custom")).toBe(
      "https://openrouter.ai/api/v1/custom",
    );
  });
});

describe("rewriteOpenRouterProviderBaseUrls", () => {
  it("rewrites openrouter and arcee provider entries", () => {
    const providers: Record<string, ProviderConfig> = {
      openrouter: {
        baseUrl: "https://openrouter.ai/v1",
        api: "openai-completions",
        models: [],
      },
      arcee: {
        baseUrl: "https://openrouter.ai/v1/",
        api: "openai-completions",
        models: [],
      },
      other: {
        baseUrl: "https://openrouter.ai/v1",
        api: "openai-completions",
        models: [],
      },
    };
    const out = rewriteOpenRouterProviderBaseUrls(providers);
    expect(out.openrouter?.baseUrl).toBe(CANONICAL_OPENROUTER_BASE_URL);
    expect(out.arcee?.baseUrl).toBe(CANONICAL_OPENROUTER_BASE_URL);
    expect(out.other?.baseUrl).toBe("https://openrouter.ai/v1");
  });

  it("returns the same object reference when nothing changes", () => {
    const input: Record<string, ProviderConfig> = {
      openrouter: {
        baseUrl: CANONICAL_OPENROUTER_BASE_URL,
        api: "openai-completions",
        models: [],
      },
    };
    expect(rewriteOpenRouterProviderBaseUrls(input)).toBe(input);
  });
});

describe("openrouter models.json baseUrl migration", () => {
  it("replaces stale openrouter baseUrl preserved by merge mode", async () => {
    await withModelsTempHome(async () => {
      await withTempEnv(MODELS_CONFIG_IMPLICIT_ENV_VARS, async () => {
        unsetEnv(MODELS_CONFIG_IMPLICIT_ENV_VARS);
        process.env.OPENROUTER_API_KEY = "sk-or-v1-test"; // pragma: allowlist secret

        const agentDir = resolveOpenClawAgentDir();
        await fs.mkdir(agentDir, { recursive: true });
        await fs.writeFile(
          path.join(agentDir, "models.json"),
          JSON.stringify(
            {
              providers: {
                openrouter: {
                  baseUrl: "https://openrouter.ai/v1",
                  api: "openai-completions",
                  models: [
                    {
                      id: "auto",
                      name: "OpenRouter Auto",
                      reasoning: false,
                      input: ["text", "image"],
                      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                      contextWindow: 200000,
                      maxTokens: 8192,
                    },
                  ],
                },
              },
            },
            null,
            2,
          ),
          "utf8",
        );

        await ensureOpenClawModelsJson({});

        const parsed = await readGeneratedModelsJson<{
          providers: Record<string, { baseUrl?: string }>;
        }>();
        expect(parsed.providers.openrouter?.baseUrl).toBe(CANONICAL_OPENROUTER_BASE_URL);
      });
    });
  });
});

import type { ProviderConfig } from "./models-config.providers.secrets.js";

/** OpenAI-compatible API base for OpenRouter (not `https://openrouter.ai/v1`, which serves HTML). */
export const CANONICAL_OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

const LEGACY_OPENROUTER_HOST = "openrouter.ai";

/** Provider ids that use the OpenRouter HTTP API surface. */
const OPENROUTER_BASEURL_REWRITE_IDS = new Set(["openrouter", "arcee"]);

export function rewriteKnownBadOpenRouterBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim();
  if (!trimmed) {
    return baseUrl;
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.hostname.toLowerCase() !== LEGACY_OPENROUTER_HOST) {
      return baseUrl;
    }
    const path = parsed.pathname.replace(/\/+$/, "") || "/";
    if (path !== "/v1") {
      return baseUrl;
    }
    return CANONICAL_OPENROUTER_BASE_URL;
  } catch {
    return baseUrl;
  }
}

function rewriteProviderOpenRouterBaseUrls(provider: ProviderConfig): ProviderConfig {
  const nextTop =
    typeof provider.baseUrl === "string"
      ? rewriteKnownBadOpenRouterBaseUrl(provider.baseUrl)
      : provider.baseUrl;
  let nextModels = provider.models;
  if (Array.isArray(provider.models)) {
    let copy: typeof provider.models | undefined;
    for (let i = 0; i < provider.models.length; i++) {
      const entry = provider.models[i];
      if (!entry || typeof entry !== "object") {
        continue;
      }
      const baseUrl = (entry as { baseUrl?: unknown }).baseUrl;
      if (typeof baseUrl !== "string") {
        continue;
      }
      const rewritten = rewriteKnownBadOpenRouterBaseUrl(baseUrl);
      if (rewritten === baseUrl) {
        continue;
      }
      copy ??= provider.models.slice();
      copy[i] = {
        ...(entry as object),
        baseUrl: rewritten,
      } as unknown as (typeof provider.models)[number];
    }
    if (copy) {
      nextModels = copy;
    }
  }

  if (nextTop === provider.baseUrl && nextModels === provider.models) {
    return provider;
  }
  return {
    ...provider,
    ...(nextTop !== provider.baseUrl ? { baseUrl: nextTop } : {}),
    ...(nextModels !== provider.models ? { models: nextModels } : {}),
  };
}

export function rewriteOpenRouterProviderBaseUrls(
  providers: Record<string, ProviderConfig>,
): Record<string, ProviderConfig> {
  let changed = false;
  const next: Record<string, ProviderConfig> = { ...providers };
  for (const id of OPENROUTER_BASEURL_REWRITE_IDS) {
    const provider = providers[id];
    if (!provider) {
      continue;
    }
    const rewritten = rewriteProviderOpenRouterBaseUrls(provider);
    if (rewritten !== provider) {
      next[id] = rewritten;
      changed = true;
    }
  }
  return changed ? next : providers;
}

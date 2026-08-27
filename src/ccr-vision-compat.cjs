"use strict";

const CHAT_PROTOCOL = "openai_chat_completions";
const PRIMARY_PROTOCOL = "openai_responses";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeModelSelector(value) {
  const selector = nonEmptyString(value);
  if (!selector) {
    return undefined;
  }

  const comma = selector.indexOf(",");
  if (comma > 0 && comma < selector.length - 1) {
    const provider = selector.slice(0, comma).trim();
    const model = selector.slice(comma + 1).trim();
    return provider && model ? `${provider}/${model}` : undefined;
  }

  return selector;
}

function providerBaseUrl(provider) {
  return nonEmptyString(provider.api_base_url) || nonEmptyString(provider.baseUrl);
}

function hasSRDCloudHostname(baseUrl) {
  if (!baseUrl) {
    return false;
  }
  try {
    const hostname = new URL(baseUrl).hostname.toLowerCase();
    return hostname === "srdcloud.cn" || hostname.endsWith(".srdcloud.cn");
  } catch {
    return false;
  }
}

function isSRDCloudProvider(provider) {
  if (!isRecord(provider)) {
    return false;
  }

  const name = nonEmptyString(provider.name)?.toLowerCase();
  return name === "srdcloud" || hasSRDCloudHostname(providerBaseUrl(provider));
}

function selectedVisionModels(profile, provider) {
  if (
    !isRecord(profile) ||
    profile.enabled === false ||
    profile.execution?.matchMultimodal !== true
  ) {
    return [];
  }

  const fusionVision = profile.metadata?.fusionVision;
  if (!isRecord(fusionVision) || nonEmptyString(fusionVision.baseUrl)) {
    return [];
  }

  const providerNames = [nonEmptyString(provider.id), nonEmptyString(provider.name)]
    .filter(Boolean)
    .map((value) => value.toLowerCase());
  const primarySelector = normalizeModelSelector(fusionVision.modelSelector) ||
    normalizeModelSelector(fusionVision.model);
  const fallbackSelectors = Array.isArray(fusionVision.fallbackModels)
    ? fusionVision.fallbackModels.map(normalizeModelSelector).filter(Boolean)
    : [];
  return [primarySelector, ...fallbackSelectors].flatMap((selector) => {
    const separator = selector?.indexOf("/") ?? -1;
    if (separator <= 0 || separator === selector.length - 1) {
      return [];
    }
    const providerHint = selector.slice(0, separator).trim().toLowerCase();
    if (!providerNames.includes(providerHint)) {
      return [];
    }
    const model = nonEmptyString(selector.slice(separator + 1));
    return model ? [model] : [];
  });
}

function affectedVisionModels(profiles, provider) {
  return [...new Set(
    profiles.flatMap((profile) => selectedVisionModels(profile, provider))
  )];
}

function explicitCapabilities(provider, baseUrl, primaryProtocol) {
  const capabilities = Array.isArray(provider.capabilities)
    ? [...provider.capabilities]
    : [];
  if (capabilities.length === 0) {
    capabilities.push({ baseUrl, type: primaryProtocol });
  }
  return capabilities;
}

function applyFusionVisionCompatibility(appConfig, options = {}) {
  const normalizedOptions = isRecord(options) ? options : {};
  if (normalizedOptions.enabled === false) {
    return { state: "disabled" };
  }

  const providers = Array.isArray(appConfig?.Providers) ? appConfig.Providers : [];
  const profiles = Array.isArray(appConfig?.virtualModelProfiles)
    ? appConfig.virtualModelProfiles
    : [];
  const candidates = providers.filter(isSRDCloudProvider);
  if (candidates.length !== 1) {
    return { state: candidates.length === 0 ? "not-required" : "ambiguous" };
  }

  const provider = candidates[0];
  const selectedModels = affectedVisionModels(profiles, provider);
  if (selectedModels.length === 0) {
    return { state: "not-required" };
  }
  if (!Array.isArray(provider.models)) {
    return { state: "ambiguous" };
  }
  if (selectedModels.some((model) => !provider.models.includes(model))) {
    return { state: "ambiguous" };
  }

  const id = nonEmptyString(provider.id);
  const baseUrl = providerBaseUrl(provider);
  const primaryProtocol = nonEmptyString(provider.type);
  if (!id || !baseUrl || primaryProtocol !== PRIMARY_PROTOCOL) {
    return { state: "ambiguous" };
  }

  const capabilities = explicitCapabilities(provider, baseUrl, primaryProtocol);
  const alreadyCapable = capabilities.some((item) => {
    return isRecord(item) &&
      nonEmptyString(item.baseUrl) &&
      nonEmptyString(item.type) === CHAT_PROTOCOL;
  });
  if (!alreadyCapable) {
    capabilities.push({ baseUrl, type: CHAT_PROTOCOL });
  }
  provider.capabilities = capabilities;

  return {
    chatProviderName: `${id}::${CHAT_PROTOCOL}`,
    primaryProviderName: `${id}::${primaryProtocol}`,
    state: alreadyCapable ? "already-capable" : "applied"
  };
}

module.exports = {
  applyFusionVisionCompatibility
};

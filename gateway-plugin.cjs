"use strict";

const fs = require("node:fs");
const path = require("node:path");

const {
  createControlledLogger,
  createSRDCloudProviderPlugin
} = require("./src/srdcloud-transformer.cjs");

const DEFAULT_RUNTIME_CONFIG_PATH = path.join(__dirname, ".ccr-gateway-plugin.config.json");
const PLUGIN_CONFIG_KEYS = new Set([
  "apiKey",
  "authHeader",
  "clientType",
  "clientVersion",
  "credentials",
  "credentialsPath",
  "discoverModelLimits",
  "flattenToolMessages",
  "fusionVisionCompatibility",
  "fusionVisionProviderName",
  "key",
  "logFile",
  "logLevel",
  "logMaxBytes",
  "logMaxFiles",
  "logToFile",
  "logging",
  "maxTokensCap",
  "modelLimitsTtlMs",
  "modelMaxOutputTokens",
  "modelName",
  "provider",
  "providerName",
  "sessionId",
  "subService",
  "userAgent",
  "userId"
]);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasPluginConfigKeys(value) {
  return isRecord(value) && Object.keys(value).some((key) => PLUGIN_CONFIG_KEYS.has(key));
}

function runtimeConfigPath() {
  const configured = process.env.SRDCLOUD_CCR_GATEWAY_PLUGIN_CONFIG;
  return typeof configured === "string" && configured.trim()
    ? configured.trim()
    : DEFAULT_RUNTIME_CONFIG_PATH;
}

function readRuntimeConfig(filePath = runtimeConfigPath()) {
  try {
    if (!fs.existsSync(filePath)) {
      return {};
    }
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isRecord(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

function resolvePluginConfig(input) {
  const runtimeConfig = readRuntimeConfig();
  const normalizedMatch = isRecord(input?.plugin?.match) ? input.plugin.match : {};
  if (isRecord(input?.plugin?.config)) {
    return {
      ...runtimeConfig,
      ...input.plugin.config
    };
  }
  if (hasPluginConfigKeys(input?.config)) {
    return {
      ...runtimeConfig,
      ...input.config
    };
  }
  return {
    ...runtimeConfig,
    ...(typeof normalizedMatch.provider === "string" ? { provider: normalizedMatch.provider } : {}),
    ...(typeof normalizedMatch.providerName === "string" ? { providerName: normalizedMatch.providerName } : {})
  };
}

function logGatewayPluginCreated(pluginConfig) {
  const logger = createControlledLogger(pluginConfig);
  logger.debug("[SRDCloudTransformer] gateway plugin created", {
    flattenToolMessages: pluginConfig.flattenToolMessages === true,
    hasProviderName: typeof pluginConfig.providerName === "string" && Boolean(pluginConfig.providerName),
    logFileConfigured: typeof pluginConfig.logFile === "string" && Boolean(pluginConfig.logFile)
  });
}

function createGatewayPlugin(input = {}) {
  const pluginConfig = {
    flattenToolMessages: true,
    ...resolvePluginConfig(input)
  };
  logGatewayPluginCreated(pluginConfig);
  const providerHooks = [createSRDCloudProviderPlugin(pluginConfig)];
  if (
    pluginConfig.fusionVisionCompatibility !== false &&
    typeof pluginConfig.fusionVisionProviderName === "string" &&
    pluginConfig.fusionVisionProviderName.trim()
  ) {
    providerHooks.push(createSRDCloudProviderPlugin({
      ...pluginConfig,
      key: `${pluginConfig.key || "srdcloud-target-adapter"}-fusion-vision`,
      providerName: pluginConfig.fusionVisionProviderName.trim()
    }));
  }

  return {
    providerHooks
  };
}

module.exports = {
  DEFAULT_RUNTIME_CONFIG_PATH,
  createGatewayPlugin,
  readRuntimeConfig,
  resolvePluginConfig
};

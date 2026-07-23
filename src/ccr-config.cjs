"use strict";

const fs = require("node:fs");
const path = require("node:path");

const DEFAULT_PLUGIN_ID = "srdcloud-transformer";
const DEFAULT_PROVIDER_PLUGIN_KEY = "srdcloud-target-adapter";
const DEFAULT_PLUGIN_CONFIG = Object.freeze({
  flattenToolMessages: true
});

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function codefreeAuthFileFromEnvironment(environment = process.env) {
  const value = environment.SRDCLOUD_CODEFREE_AUTH_FILE;
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function serializablePluginConfig(pluginConfig) {
  const config = {};
  for (const [key, value] of Object.entries(pluginConfig || {})) {
    if (typeof value !== "function" && value !== undefined) {
      config[key] = value;
    }
  }
  return config;
}

function findSRDCloudProvider(appConfig) {
  const providers = Array.isArray(appConfig?.Providers) ? appConfig.Providers : [];
  return providers.find((provider) => {
    const id = typeof provider.id === "string" ? provider.id.toLowerCase() : "";
    const name = typeof provider.name === "string" ? provider.name.toLowerCase() : "";
    const baseUrl = typeof provider.api_base_url === "string" ? provider.api_base_url.toLowerCase() : "";
    return id.includes("srdcloud") || name.includes("srdcloud") || baseUrl.includes("srdcloud.cn");
  });
}

function providerNameForSRDCloud(appConfig, explicitProviderName) {
  if (typeof explicitProviderName === "string" && explicitProviderName.trim()) {
    return explicitProviderName.trim();
  }

  const provider = findSRDCloudProvider(appConfig);
  if (!provider || typeof provider.id !== "string" || typeof provider.type !== "string") {
    return undefined;
  }
  return `${provider.id}::${provider.type}`;
}

function gatewayPluginModulePath(projectRoot) {
  return path.join(projectRoot, "gateway-plugin.cjs");
}

function gatewayPluginRuntimeConfigPath(projectRoot) {
  return path.join(projectRoot, ".ccr-gateway-plugin.config.json");
}

function writeGatewayPluginRuntimeConfig(pluginConfig, options = {}) {
  const projectRoot = options.projectRoot || path.resolve(__dirname, "..");
  const filePath = options.filePath || gatewayPluginRuntimeConfigPath(projectRoot);
  const config = serializablePluginConfig(pluginConfig);
  fs.writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return filePath;
}

function buildGatewayModulePlugin({ appConfig, modulePath, pluginConfig = {}, pluginConfigDefaults = {} }) {
  const config = {
    ...DEFAULT_PLUGIN_CONFIG,
    ...serializablePluginConfig(pluginConfigDefaults),
    ...serializablePluginConfig(pluginConfig)
  };
  const providerName = providerNameForSRDCloud(appConfig, config.providerName);
  if (providerName) {
    config.providerName = providerName;
  }

  return {
    config,
    enabled: pluginConfig.enabled !== false,
    key: pluginConfig.key || DEFAULT_PROVIDER_PLUGIN_KEY,
    modulePath
  };
}

function sameModulePlugin(left, right) {
  return left?.key === right.key || left?.modulePath === right.modulePath;
}

function upsertGatewayModulePlugin(plugins, plugin) {
  const existing = Array.isArray(plugins) ? plugins : [];
  return [...existing.filter((item) => !sameModulePlugin(item, plugin)), plugin];
}

function withSRDCloudCoreGatewayPlugin(appConfig, options = {}) {
  if (!isRecord(appConfig)) {
    throw new TypeError("CCR app config must be an object.");
  }

  const pluginId = options.pluginId || DEFAULT_PLUGIN_ID;
  const projectRoot = options.projectRoot || path.resolve(__dirname, "..");
  const modulePath = options.modulePath || gatewayPluginModulePath(projectRoot);
  const pluginConfigDefaults = {
    ...DEFAULT_PLUGIN_CONFIG,
    ...serializablePluginConfig(options.pluginConfigDefaults || {})
  };
  const nextConfig = structuredClone(appConfig);
  const plugins = Array.isArray(nextConfig.plugins) ? nextConfig.plugins : [];
  const pluginIndex = plugins.findIndex((plugin) => plugin?.id === pluginId);

  if (pluginIndex < 0) {
    throw new Error(`CCR plugin entry not found: ${pluginId}`);
  }

  const wrapperPlugin = { ...plugins[pluginIndex] };
  const existingPluginConfig = isRecord(wrapperPlugin.config) ? wrapperPlugin.config : {};
  const pluginConfig = {
    ...serializablePluginConfig(pluginConfigDefaults),
    ...serializablePluginConfig(existingPluginConfig)
  };
  wrapperPlugin.config = pluginConfig;
  const gatewayPlugin = buildGatewayModulePlugin({
    appConfig: nextConfig,
    modulePath,
    pluginConfig
  });
  const coreGateway = isRecord(wrapperPlugin.coreGateway) ? { ...wrapperPlugin.coreGateway } : {};
  const coreGatewayConfig = isRecord(coreGateway.config) ? { ...coreGateway.config } : {};

  coreGatewayConfig.plugins = upsertGatewayModulePlugin(coreGatewayConfig.plugins, gatewayPlugin);
  wrapperPlugin.coreGateway = {
    ...coreGateway,
    config: coreGatewayConfig
  };
  plugins[pluginIndex] = wrapperPlugin;
  nextConfig.plugins = plugins;

  return {
    appConfig: nextConfig,
    gatewayPlugin
  };
}

module.exports = {
  DEFAULT_PLUGIN_ID,
  DEFAULT_PROVIDER_PLUGIN_KEY,
  buildGatewayModulePlugin,
  codefreeAuthFileFromEnvironment,
  gatewayPluginModulePath,
  gatewayPluginRuntimeConfigPath,
  providerNameForSRDCloud,
  serializablePluginConfig,
  withSRDCloudCoreGatewayPlugin,
  writeGatewayPluginRuntimeConfig
};

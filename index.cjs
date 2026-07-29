"use strict";

const path = require("node:path");

const {
  buildGatewayModulePlugin,
  writeGatewayPluginRuntimeConfig
} = require("./src/ccr-config.cjs");
const {
  applyFusionVisionCompatibility
} = require("./src/ccr-vision-compat.cjs");
const {
  createControlledLogger
} = require("./src/srdcloud-transformer.cjs");

const GATEWAY_PLUGIN_PATH = path.join(__dirname, "gateway-plugin.cjs");

module.exports = {
  async setup(ctx) {
    const pluginConfig = ctx.pluginConfig && typeof ctx.pluginConfig === "object" ? ctx.pluginConfig : {};
    const providerPluginKey = pluginConfig.key || "srdcloud-target-adapter";
    const defaultLogFile = ctx.paths?.pluginDataDir
      ? path.join(ctx.paths.pluginDataDir, "srdcloud-transformer.log")
      : undefined;
    const compatibility = applyFusionVisionCompatibility(ctx.config, {
      enabled: pluginConfig.fusionVisionCompatibility !== false
    });
    const compatibilityActive =
      compatibility.state === "applied" || compatibility.state === "already-capable";
    const gatewayPluginConfig = { ...pluginConfig };
    delete gatewayPluginConfig.fusionVisionProviderName;
    const gatewayPlugin = buildGatewayModulePlugin({
      appConfig: ctx.config,
      modulePath: GATEWAY_PLUGIN_PATH,
      pluginConfig: gatewayPluginConfig,
      pluginConfigDefaults: {
        ...(defaultLogFile ? { logFile: defaultLogFile } : {}),
        ...(compatibilityActive
          ? { fusionVisionProviderName: compatibility.chatProviderName }
          : {})
      }
    });
    const runtimeConfigPath = writeGatewayPluginRuntimeConfig(gatewayPlugin.config, { projectRoot: __dirname });
    createControlledLogger(gatewayPlugin.config).debug("[SRDCloudTransformer] wrapper configured gateway module", {
      flattenToolMessages: gatewayPlugin.config.flattenToolMessages === true,
      fusionVisionCompatibility: compatibility.state,
      fusionVisionGatewayHookConfigured: compatibilityActive,
      hasProviderName: typeof gatewayPlugin.config.providerName === "string" && Boolean(gatewayPlugin.config.providerName),
      logFileConfigured: typeof gatewayPlugin.config.logFile === "string" && Boolean(gatewayPlugin.config.logFile)
    });

    ctx.registerGatewayRoute?.({
      auth: "none",
      handler(_request, response, helpers) {
        helpers.sendJson(response, 200, {
          gatewayPluginModule: GATEWAY_PLUGIN_PATH,
          logFile: gatewayPlugin.config.logFile,
          mode: "gateway-module-plugin",
          ok: true,
          plugin: ctx.pluginId || "srdcloud-transformer",
          providerPlugin: providerPluginKey,
          runtimeConfigPath
        });
      },
      id: "srdcloud-transformer-status",
      method: "GET",
      path: "/plugins/srdcloud-transformer"
    });

    ctx.logger?.info?.("SRD Cloud transformer extension loaded");

    return {
      coreGateway: {
        config: {
          plugins: [
            gatewayPlugin
          ]
        }
      }
    };
  }
};

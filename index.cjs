"use strict";

const path = require("node:path");

const {
  buildGatewayModulePlugin,
  writeGatewayPluginRuntimeConfig
} = require("./src/ccr-config.cjs");
const {
  createControlledLogger,
  createSRDCloudProviderPlugin
} = require("./src/srdcloud-transformer.cjs");

const GATEWAY_PLUGIN_PATH = path.join(__dirname, "gateway-plugin.cjs");

module.exports = {
  async setup(ctx) {
    const pluginConfig = ctx.pluginConfig && typeof ctx.pluginConfig === "object" ? ctx.pluginConfig : {};
    const providerPluginKey = pluginConfig.key || "srdcloud-target-adapter";
    const defaultLogFile = ctx.paths?.pluginDataDir
      ? path.join(ctx.paths.pluginDataDir, "srdcloud-transformer.log")
      : undefined;
    const gatewayPlugin = buildGatewayModulePlugin({
      appConfig: ctx.config,
      modulePath: GATEWAY_PLUGIN_PATH,
      pluginConfig,
      pluginConfigDefaults: {
        ...(defaultLogFile ? { logFile: defaultLogFile } : {})
      }
    });
    const runtimeConfigPath = writeGatewayPluginRuntimeConfig(gatewayPlugin.config, { projectRoot: __dirname });
    const providerPlugin = createSRDCloudProviderPlugin(gatewayPlugin.config);
    ctx.registerCoreGatewayProviderPlugin?.(providerPlugin);
    createControlledLogger(gatewayPlugin.config).debug("[SRDCloudTransformer] wrapper registered provider hook", {
      fallbackModuleConfigured: true,
      flattenToolMessages: gatewayPlugin.config.flattenToolMessages === true,
      hasProviderName: typeof gatewayPlugin.config.providerName === "string" && Boolean(gatewayPlugin.config.providerName),
      logFileConfigured: typeof gatewayPlugin.config.logFile === "string" && Boolean(gatewayPlugin.config.logFile)
    });

    ctx.registerGatewayRoute?.({
      auth: "none",
      handler(_request, response, helpers) {
        helpers.sendJson(response, 200, {
          gatewayPluginModule: GATEWAY_PLUGIN_PATH,
          logFile: gatewayPlugin.config.logFile,
          mode: "direct-provider-plugin",
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

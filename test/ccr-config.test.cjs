"use strict";

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

const {
  providerNameForSRDCloud,
  withSRDCloudCoreGatewayPlugin
} = require("../src/ccr-config.cjs");

test("providerNameForSRDCloud resolves the Desktop provider runtime name", () => {
  assert.equal(
    providerNameForSRDCloud({
      Providers: [
        {
          api_base_url: "https://www.srdcloud.cn",
          id: "provider-srdcloud-e5357f9414",
          name: "srdcloud",
          type: "openai_responses"
        }
      ]
    }),
    "provider-srdcloud-e5357f9414::openai_responses"
  );
});

test("withSRDCloudCoreGatewayPlugin writes a module plugin into the saved wrapper config", () => {
  const appConfig = {
    Providers: [
      {
        api_base_url: "https://www.srdcloud.cn",
        id: "provider-srdcloud-e5357f9414",
        name: "srdcloud",
        type: "openai_responses"
      }
    ],
    plugins: [
      {
        config: {
          authHeader: "Bearer configured"
        },
        id: "srdcloud-transformer",
        module: "/repo/index.cjs"
      }
    ]
  };
  const projectRoot = path.resolve("/repo");
  const { appConfig: nextConfig, gatewayPlugin } = withSRDCloudCoreGatewayPlugin(appConfig, {
    pluginConfigDefaults: {
      logFile: "/logs/srdcloud-transformer.log",
      logLevel: "debug"
    },
    projectRoot
  });

  assert.deepEqual(gatewayPlugin, {
    config: {
      authHeader: "Bearer configured",
      flattenToolMessages: true,
      logFile: "/logs/srdcloud-transformer.log",
      logLevel: "debug",
      providerName: "provider-srdcloud-e5357f9414::openai_responses"
    },
    enabled: true,
    key: "srdcloud-target-adapter",
    modulePath: path.join(projectRoot, "gateway-plugin.cjs")
  });
  assert.deepEqual(nextConfig.plugins[0].config, {
    authHeader: "Bearer configured",
    flattenToolMessages: true,
    logFile: "/logs/srdcloud-transformer.log",
    logLevel: "debug"
  });
  assert.deepEqual(nextConfig.plugins[0].coreGateway.config.plugins, [gatewayPlugin]);
});

test("withSRDCloudCoreGatewayPlugin preserves an explicit flattening opt-out", () => {
  const appConfig = {
    Providers: [
      {
        api_base_url: "https://www.srdcloud.cn",
        id: "provider-srdcloud-e5357f9414",
        name: "srdcloud",
        type: "openai_responses"
      }
    ],
    plugins: [
      {
        config: {
          flattenToolMessages: false
        },
        id: "srdcloud-transformer",
        module: "/repo/index.cjs"
      }
    ]
  };

  const { appConfig: nextConfig, gatewayPlugin } = withSRDCloudCoreGatewayPlugin(appConfig, {
    projectRoot: path.resolve("/repo")
  });

  assert.equal(nextConfig.plugins[0].config.flattenToolMessages, false);
  assert.equal(gatewayPlugin.config.flattenToolMessages, false);
});

"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const gatewayPlugin = require("../gateway-plugin.cjs");

function withRuntimeConfigPath(filePath, callback) {
  const previous = process.env.SRDCLOUD_CCR_GATEWAY_PLUGIN_CONFIG;
  process.env.SRDCLOUD_CCR_GATEWAY_PLUGIN_CONFIG = filePath;
  try {
    return callback();
  } finally {
    if (previous === undefined) {
      delete process.env.SRDCLOUD_CCR_GATEWAY_PLUGIN_CONFIG;
    } else {
      process.env.SRDCLOUD_CCR_GATEWAY_PLUGIN_CONFIG = previous;
    }
  }
}

test("resolvePluginConfig accepts CCR module plugin objects directly", () => {
  const config = {
    flattenToolMessages: true,
    providerName: "provider-srdcloud::openai_responses"
  };

  withRuntimeConfigPath(path.join(os.tmpdir(), "missing-srdcloud-runtime-config.json"), () => {
    assert.deepEqual(gatewayPlugin.resolvePluginConfig({ config }), config);
  });
});

test("resolvePluginConfig preserves the private CodeFree auth-file setting", () => {
  const codefreeAuthFile = "/synthetic/private-auth.json";

  withRuntimeConfigPath(path.join(os.tmpdir(), "missing-srdcloud-runtime-config.json"), () => {
    assert.deepEqual(
      gatewayPlugin.resolvePluginConfig({ config: { codefreeAuthFile } }),
      { codefreeAuthFile }
    );
  });
});

test("resolvePluginConfig accepts wrapped CCR plugin context objects", () => {
  const config = {
    flattenToolMessages: true,
    providerName: "provider-srdcloud::openai_responses"
  };

  withRuntimeConfigPath(path.join(os.tmpdir(), "missing-srdcloud-runtime-config.json"), () => {
    assert.deepEqual(gatewayPlugin.resolvePluginConfig({ plugin: { config } }), config);
  });
});

test("gateway plugin module returns an executable SRDCloud provider hook", () => {
  const result = gatewayPlugin.createGatewayPlugin({
    config: {},
    plugin: {
      config: {
        credentials: null,
        fusionVisionCompatibility: true,
        fusionVisionProviderName: "provider-srdcloud::openai_chat_completions",
        providerName: "provider-srdcloud::openai_responses",
        userId: "user-1"
      }
    }
  });

  assert.equal(result.providerHooks.length, 2);
  assert.equal(result.providerHooks[0].key, "srdcloud-target-adapter");
  assert.equal(result.providerHooks[0].providerName, "provider-srdcloud::openai_responses");
  assert.equal(typeof result.providerHooks[0].transformRequest, "function");
  assert.equal(result.providerHooks[1].key, "srdcloud-target-adapter-fusion-vision");
  assert.equal(result.providerHooks[1].providerName, "provider-srdcloud::openai_chat_completions");
});

test("gateway plugin module honours the Fusion vision compatibility opt-out", () => {
  const result = gatewayPlugin.createGatewayPlugin({
    plugin: {
      config: {
        credentials: null,
        fusionVisionCompatibility: false,
        fusionVisionProviderName: "provider-srdcloud::openai_chat_completions",
        providerName: "provider-srdcloud::openai_responses"
      }
    }
  });

  assert.equal(result.providerHooks.length, 1);
  assert.equal(result.providerHooks[0].key, "srdcloud-target-adapter");
  assert.equal(result.providerHooks[0].providerName, "provider-srdcloud::openai_responses");
});

test("gateway plugin module uses direct config and writes a creation log marker", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srdcloud-gateway-logs-"));
  const logFile = path.join(dir, "srdcloud-transformer.log");

  const result = gatewayPlugin.createGatewayPlugin({
    config: {
      credentials: null,
      flattenToolMessages: true,
      logFile,
      logLevel: "debug",
      providerName: "provider-srdcloud::openai_responses",
      userId: "user-1"
    }
  });

  assert.equal(result.providerHooks[0].providerName, "provider-srdcloud::openai_responses");
  assert.equal(fs.readFileSync(logFile, "utf8").includes("[SRDCloudTransformer] gateway plugin created"), true);
});

test("gateway plugin module reads runtime config after CCR normalizes plugin config away", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srdcloud-gateway-runtime-"));
  const runtimeConfigPath = path.join(dir, ".ccr-gateway-plugin.config.json");
  const logFile = path.join(dir, "srdcloud-transformer.log");
  fs.writeFileSync(
    runtimeConfigPath,
    JSON.stringify({
      credentials: null,
      flattenToolMessages: true,
      logFile,
      logLevel: "debug",
      providerName: "provider-srdcloud::openai_responses",
      userId: "user-1"
    })
  );

  await withRuntimeConfigPath(runtimeConfigPath, async () => {
    const result = gatewayPlugin.createGatewayPlugin({
      config: {
        plugins: [
          {
            enabled: true,
            key: "srdcloud-target-adapter",
            modulePath: "/repo/gateway-plugin.cjs"
          }
        ]
      },
      plugin: {
        enabled: true,
        key: "srdcloud-target-adapter",
        modulePath: "/repo/gateway-plugin.cjs"
      }
    });

    assert.equal(result.providerHooks[0].providerName, "provider-srdcloud::openai_responses");
    await result.providerHooks[0].transformRequest({
      request: {
        body: {
          messages: [
            {
              role: "assistant",
              content: [
                {
                  type: "tool_use",
                  id: "tool-1",
                  name: "Read",
                  input: { file_path: "/tmp/a.txt" }
                }
              ]
            }
          ],
          model: "srdcloud/GLM-5.1"
        }
      },
      targetProviderConfig: {
        baseurl: "https://www.srdcloud.cn"
      },
      upstreamRequest: {
        body: {},
        headers: {},
        url: "https://old.example/v1/responses"
      }
    });

    const log = fs.readFileSync(logFile, "utf8");
    assert.equal(log.includes("[SRDCloudTransformer] gateway plugin created"), true);
    assert.equal(log.includes('"hasAssistantToolUse":false'), true);
  });
});

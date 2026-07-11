"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const extension = require("../index.cjs");

test("extension exposes a setup function and registers the SRDCloud provider hook", async () => {
  const providerPlugins = [];
  const routes = [];
  const ctx = {
    config: {
      Providers: [
        {
          api_base_url: "https://www.srdcloud.cn",
          id: "provider-srdcloud-e5357f9414",
          models: ["GLM-5.1-ctyun-oc", "Qwen3.5-122B-A10B"],
          name: "srdcloud",
          type: "openai_responses"
        }
      ],
      virtualModelProfiles: [{
        enabled: true,
        execution: { matchMultimodal: true },
        metadata: {
          fusionVision: {
            modelSelector: "srdcloud,Qwen3.5-122B-A10B",
            toolName: "vision_understand_test"
          }
        }
      }]
    },
    logger: {
      info() {}
    },
    paths: {
      pluginDataDir: "/tmp/srdcloud-transformer-plugin"
    },
    pluginConfig: {
      authHeader: "Bearer configured",
      clientVersion: "1.2.3",
      credentials: null,
      fusionVisionProviderName: "provider-stale::openai_chat_completions",
      skipVersionUpdate: true
    },
    pluginId: "srdcloud-transformer",
    registerGatewayRoute(route) {
      routes.push(route);
    },
    registerCoreGatewayProviderPlugin(plugin) {
      providerPlugins.push(plugin);
    }
  };

  const registration = await extension.setup(ctx);

  assert.equal(providerPlugins.length, 2);
  assert.equal(providerPlugins[0].key, "srdcloud-target-adapter");
  assert.equal(providerPlugins[0].providerName, "provider-srdcloud-e5357f9414::openai_responses");
  assert.equal(typeof providerPlugins[0].transformRequest, "function");
  assert.equal(providerPlugins[1].key, "srdcloud-target-adapter-fusion-vision");
  assert.equal(
    providerPlugins[1].providerName,
    "provider-srdcloud-e5357f9414::openai_chat_completions"
  );
  assert.deepEqual(ctx.config.Providers[0].capabilities, [
    { baseUrl: "https://www.srdcloud.cn", type: "openai_responses" },
    { baseUrl: "https://www.srdcloud.cn", type: "openai_chat_completions" }
  ]);
  assert.equal(routes.length, 1);
  assert.equal(routes[0].path, "/plugins/srdcloud-transformer");
  assert.equal(routes[0].auth, "none");
  const sent = {};
  routes[0].handler({}, {}, {
    sendJson(_response, status, body) {
      sent.status = status;
      sent.body = body;
    }
  });
  assert.equal(sent.status, 200);
  assert.equal(sent.body.mode, "direct-provider-plugin");
  assert.match(sent.body.gatewayPluginModule, /gateway-plugin\.cjs$/);
  assert.match(sent.body.logFile, /srdcloud-transformer\.log$/);
  assert.equal(registration.coreGateway.providerPlugins, undefined);
  assert.equal(registration.coreGateway.config.plugins.length, 1);
  assert.equal(registration.coreGateway.config.plugins[0].key, "srdcloud-target-adapter");
  assert.equal(registration.coreGateway.config.plugins[0].enabled, true);
  assert.equal(registration.coreGateway.config.plugins[0].config.authHeader, "Bearer configured");
  assert.equal(
    registration.coreGateway.config.plugins[0].config.fusionVisionProviderName,
    "provider-srdcloud-e5357f9414::openai_chat_completions"
  );
  assert.match(registration.coreGateway.config.plugins[0].config.logFile, /srdcloud-transformer\.log$/);
  assert.match(registration.coreGateway.config.plugins[0].modulePath, /gateway-plugin\.cjs$/);
});

test("extension honours the Fusion vision compatibility opt-out", async () => {
  const providerPlugins = [];
  const ctx = {
    config: {
      Providers: [{
        api_base_url: "https://www.srdcloud.cn",
        id: "provider-srdcloud-e5357f9414",
        models: ["Qwen3.5-122B-A10B"],
        name: "srdcloud",
        type: "openai_responses"
      }],
      virtualModelProfiles: [{
        enabled: true,
        execution: { matchMultimodal: true },
        metadata: {
          fusionVision: {
            modelSelector: "srdcloud,Qwen3.5-122B-A10B"
          }
        }
      }]
    },
    logger: { info() {} },
    pluginConfig: {
      credentials: null,
      fusionVisionCompatibility: false,
      fusionVisionProviderName: "provider-stale::openai_chat_completions"
    },
    registerCoreGatewayProviderPlugin(plugin) {
      providerPlugins.push(plugin);
    }
  };

  const registration = await extension.setup(ctx);

  assert.equal(providerPlugins.length, 1);
  assert.equal(providerPlugins[0].providerName, "provider-srdcloud-e5357f9414::openai_responses");
  assert.equal(ctx.config.Providers[0].capabilities, undefined);
  assert.equal(
    Object.hasOwn(registration.coreGateway.config.plugins[0].config, "fusionVisionProviderName"),
    false
  );
});

test("extension reports that the compatibility hook was not registered without a callback", async () => {
  const events = [];
  const ctx = {
    config: {
      Providers: [{
        api_base_url: "https://www.srdcloud.cn",
        id: "provider-srdcloud-e5357f9414",
        models: ["Qwen3.5-122B-A10B"],
        name: "srdcloud",
        type: "openai_responses"
      }],
      virtualModelProfiles: [{
        enabled: true,
        execution: { matchMultimodal: true },
        metadata: {
          fusionVision: {
            modelSelector: "srdcloud,Qwen3.5-122B-A10B"
          }
        }
      }]
    },
    logger: { info() {} },
    pluginConfig: {
      credentials: null,
      logger: {
        debug(message, metadata) {
          events.push([message, metadata]);
        }
      },
      logLevel: "debug"
    }
  };

  await extension.setup(ctx);

  const registrationEvent = events.find(([message]) => {
    return message === "[SRDCloudTransformer] wrapper registered provider hook";
  });
  assert.notEqual(registrationEvent, undefined);
  assert.equal(registrationEvent[1].fusionVisionCompatibility, "applied");
  assert.equal(registrationEvent[1].fusionVisionProviderHookRegistered, false);
});

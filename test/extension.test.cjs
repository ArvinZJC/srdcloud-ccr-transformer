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
          name: "srdcloud",
          type: "openai_responses"
        }
      ]
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

  assert.equal(providerPlugins.length, 1);
  assert.equal(providerPlugins[0].key, "srdcloud-target-adapter");
  assert.equal(providerPlugins[0].providerName, "provider-srdcloud-e5357f9414::openai_responses");
  assert.equal(typeof providerPlugins[0].transformRequest, "function");
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
  assert.match(registration.coreGateway.config.plugins[0].config.logFile, /srdcloud-transformer\.log$/);
  assert.match(registration.coreGateway.config.plugins[0].modulePath, /gateway-plugin\.cjs$/);
});

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const LegacyTransformer = require("../node_modules/codefree-helper/dist/ccr/transformer/srdcloud.transformer.js");
const { SRDCloudTransformer } = require("../src/srdcloud-transformer.cjs");

LegacyTransformer.prototype._updateClientVersion = async function updateClientVersionForTest() {};

function comparable(value) {
  return JSON.parse(JSON.stringify(value));
}

async function runLegacy(body, requestConfig, options = {}) {
  const transformer = new LegacyTransformer({
    apiKey: "credential-key",
    authHeader: "Bearer custom",
    clientVersion: "1.2.3",
    modelName: options.modelName,
    userAgent: "UnitTest/1.0",
    userId: "user-1"
  });
  transformer._versionUpdatePromise = null;
  return comparable(await transformer.transformRequestIn(comparable(body), requestConfig));
}

function withCodeFreeOHeaders(value) {
  const comparableValue = comparable(value);
  comparableValue.config.headers.clientType = "codefree-o";
  comparableValue.config.headers.subService = "codefree_o_chat";
  return comparableValue;
}

async function runRestored(body, requestConfig, options = {}) {
  const transformer = new SRDCloudTransformer({
    apiKey: "credential-key",
    authHeader: "Bearer custom",
    clientVersion: "1.2.3",
    credentials: null,
    modelName: options.modelName,
    skipVersionUpdate: true,
    userAgent: "UnitTest/1.0",
    userId: "user-1"
  });
  return comparable(await transformer.transformRequestIn(comparable(body), requestConfig));
}

test("restored transformer keeps legacy request shape with CodeFree-O client headers", async () => {
  const cases = [
    {
      body: { messages: [{ role: "user", content: "hi" }], model: "body-model" },
      name: "basic body model",
      requestConfig: { apiKey: "provided-key" }
    },
    {
      body: { model: "body-model" },
      name: "empty caller apiKey remains empty",
      requestConfig: { apiKey: "" }
    },
    {
      body: { modelName: "body-model-name" },
      name: "baseUrl origin replaces default origin",
      requestConfig: { apiKey: "provided-key", baseUrl: "https://gateway.example/base/" }
    },
    {
      body: { model: "body-model", modelName: "body-model-name" },
      name: "fixed modelName option wins",
      options: { modelName: "fixed-model" },
      requestConfig: { apiKey: "provided-key" }
    }
  ];

  for (const item of cases) {
    assert.deepEqual(
      await runRestored(item.body, item.requestConfig, item.options),
      withCodeFreeOHeaders(await runLegacy(item.body, item.requestConfig, item.options)),
      item.name
    );
  }
});

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  applyFusionVisionCompatibility
} = require("../src/ccr-vision-compat.cjs");

function affectedConfig() {
  return {
    Providers: [{
      api_base_url: "https://www.srdcloud.cn",
      id: "provider-srdcloud-test",
      models: ["GLM-5.1-ctyun-oc", "Qwen3.5-122B-A10B"],
      name: "srdcloud",
      type: "openai_responses"
    }],
    virtualModelProfiles: [{
      enabled: true,
      execution: { matchMultimodal: true },
      metadata: {
        fusionVision: {
          modelSelector: "srdcloud/Qwen3.5-122B-A10B",
          toolName: "vision_understand_test"
        }
      }
    }]
  };
}

test("adds Chat Completions capability for an affected SRDCloud Responses provider", () => {
  const appConfig = affectedConfig();

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "applied");
  assert.equal(result.primaryProviderName, "provider-srdcloud-test::openai_responses");
  assert.equal(result.chatProviderName, "provider-srdcloud-test::openai_chat_completions");
  assert.deepEqual(appConfig.Providers[0].capabilities, [
    { baseUrl: "https://www.srdcloud.cn", type: "openai_responses" },
    { baseUrl: "https://www.srdcloud.cn", type: "openai_chat_completions" }
  ]);
});

test("accepts CCR's saved provider-comma-model vision selector", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles[0].metadata.fusionVision.modelSelector =
    "srdcloud,Qwen3.5-122B-A10B";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "applied");
  assert.equal(
    result.chatProviderName,
    "provider-srdcloud-test::openai_chat_completions"
  );
});

test("does not identify a provider from a lookalike ID", () => {
  const appConfig = affectedConfig();
  Object.assign(appConfig.Providers[0], {
    api_base_url: "https://example.test",
    id: "not-srdcloud",
    name: "other"
  });
  appConfig.virtualModelProfiles[0].metadata.fusionVision.modelSelector =
    "not-srdcloud/Qwen3.5-122B-A10B";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("does not identify a provider from a lookalike URL hostname", () => {
  const appConfig = affectedConfig();
  Object.assign(appConfig.Providers[0], {
    api_base_url: "https://srdcloud.cn.evil.test",
    id: "provider-other",
    name: "other"
  });
  appConfig.virtualModelProfiles[0].metadata.fusionVision.modelSelector =
    "other/Qwen3.5-122B-A10B";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("does not identify a provider from URL path or query lookalikes", () => {
  const appConfig = affectedConfig();
  Object.assign(appConfig.Providers[0], {
    api_base_url: "https://example.test/srdcloud.cn?redirect=srdcloud.cn",
    id: "provider-other",
    name: "other"
  });
  appConfig.virtualModelProfiles[0].metadata.fusionVision.modelSelector =
    "other/Qwen3.5-122B-A10B";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("does not mutate capabilities when compatibility is disabled", () => {
  const appConfig = affectedConfig();

  const result = applyFusionVisionCompatibility(appConfig, { enabled: false });

  assert.equal(result.state, "disabled");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("treats null options as default options", () => {
  const appConfig = affectedConfig();

  const result = applyFusionVisionCompatibility(appConfig, null);

  assert.equal(result.state, "applied");
});

test("treats non-record options as default options", () => {
  const appConfig = affectedConfig();

  const result = applyFusionVisionCompatibility(appConfig, "disabled");

  assert.equal(result.state, "applied");
});

test("does not require compatibility without a Fusion vision profile", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles = [];

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("does not require compatibility for direct Fusion vision base URLs", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles[0].metadata.fusionVision.baseUrl = "https://vision.example.test";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("treats a blank Fusion vision base URL as absent", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles[0].metadata.fusionVision.baseUrl = "   ";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "applied");
});

test("uses the Fusion vision model field when modelSelector is absent", () => {
  const appConfig = affectedConfig();
  const fusionVision = appConfig.virtualModelProfiles[0].metadata.fusionVision;
  fusionVision.model = fusionVision.modelSelector;
  delete fusionVision.modelSelector;

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "applied");
});

test("ignores disabled Fusion vision profiles", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles[0].enabled = false;

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("ignores Fusion vision profiles without explicit multimodal matching", () => {
  const appConfig = affectedConfig();
  delete appConfig.virtualModelProfiles[0].execution.matchMultimodal;

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("ignores Fusion vision profiles with multimodal matching disabled", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles[0].execution.matchMultimodal = false;

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("deduplicates the same selected model across Fusion vision profiles", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles.push(structuredClone(appConfig.virtualModelProfiles[0]));
  const models = appConfig.Providers[0].models;
  const arrayIncludes = Array.prototype.includes;
  let includesCalls = 0;
  Object.defineProperty(models, "includes", {
    value(model) {
      includesCalls += 1;
      return arrayIncludes.call(this, model);
    }
  });

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "applied");
  assert.equal(includesCalls, 1);
});

test("does not choose between multiple SRDCloud providers", () => {
  const appConfig = affectedConfig();
  appConfig.Providers.push({
    api_base_url: "https://www.srdcloud.cn",
    id: "provider-srdcloud-other",
    models: ["Qwen3.5-122B-A10B"],
    name: "srdcloud-other",
    type: "openai_responses"
  });

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "ambiguous");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
  assert.equal(appConfig.Providers[1].capabilities, undefined);
});

test("does not augment a provider for an unknown selected model", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles[0].metadata.fusionVision.modelSelector = "srdcloud/unknown";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "ambiguous");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("does not activate for a selector that cannot identify the provider", () => {
  const appConfig = affectedConfig();
  appConfig.virtualModelProfiles[0].metadata.fusionVision.modelSelector =
    "srdcloud-backup/Qwen3.5-122B-A10B";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("treats malformed provider models as ambiguous", () => {
  const appConfig = affectedConfig();
  appConfig.Providers[0].models = "Qwen3.5-122B-A10B";

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "ambiguous");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("ignores malformed provider models when no Fusion vision profile is affected", () => {
  const appConfig = affectedConfig();
  appConfig.Providers[0].models = "Qwen3.5-122B-A10B";
  appConfig.virtualModelProfiles = [];

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "not-required");
  assert.equal(appConfig.Providers[0].capabilities, undefined);
});

test("preserves an existing Chat Completions capability without duplication", () => {
  const appConfig = affectedConfig();
  const responsesCapability = {
    baseUrl: "https://responses.srdcloud.cn",
    headers: { "x-route": "responses" },
    type: "openai_responses"
  };
  const chatCapability = {
    baseUrl: "https://chat.srdcloud.cn",
    headers: { "x-route": "chat" },
    type: "openai_chat_completions"
  };
  appConfig.Providers[0].capabilities = [responsesCapability, chatCapability];

  const firstResult = applyFusionVisionCompatibility(appConfig);
  const secondResult = applyFusionVisionCompatibility(appConfig);

  assert.equal(firstResult.state, "already-capable");
  assert.equal(secondResult.state, "already-capable");
  assert.equal(appConfig.Providers[0].capabilities[0], responsesCapability);
  assert.equal(appConfig.Providers[0].capabilities[1], chatCapability);
  assert.deepEqual(appConfig.Providers[0].capabilities, [responsesCapability, chatCapability]);
});

test("preserves every explicit capability entry while appending Chat Completions", () => {
  const appConfig = affectedConfig();
  const malformedObject = { type: "custom_without_base_url" };
  const unrelatedCapability = {
    baseUrl: "https://other.example.test",
    headers: { "x-route": "other" },
    type: "custom_protocol"
  };
  const capabilities = [null, "malformed", 17, malformedObject, unrelatedCapability];
  appConfig.Providers[0].capabilities = capabilities;

  const result = applyFusionVisionCompatibility(appConfig);

  assert.equal(result.state, "applied");
  assert.notEqual(appConfig.Providers[0].capabilities, capabilities);
  assert.equal(appConfig.Providers[0].capabilities.length, capabilities.length + 1);
  capabilities.forEach((capability, index) => {
    assert.equal(appConfig.Providers[0].capabilities[index], capability);
  });
  assert.deepEqual(appConfig.Providers[0].capabilities.at(-1), {
    baseUrl: "https://www.srdcloud.cn",
    type: "openai_chat_completions"
  });
});

for (const primaryProtocol of ["openai_chat_completions", "unknown_protocol"]) {
  test(`fails closed for ${primaryProtocol} as the provider primary protocol`, () => {
    const appConfig = affectedConfig();
    const provider = appConfig.Providers[0];
    provider.type = primaryProtocol;

    const result = applyFusionVisionCompatibility(appConfig);

    assert.deepEqual(result, { state: "ambiguous" });
    assert.equal(provider.capabilities, undefined);
    assert.equal(result.primaryProviderName, undefined);
    assert.equal(result.chatProviderName, undefined);
  });
}

"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

function loadFusionModule() {
  return require("../src/ccr-fusion.cjs");
}

function fusionConfig() {
  return {
    providers: [
      {
        name: "provider-srdcloud::openai_responses",
        type: "openai_responses"
      }
    ],
    virtualModelProfiles: [
      {
        enabled: true,
        key: "exact-search",
        match: {
          exactAliases: ["Fusion/search-model", "search-model"],
          prefixes: [],
          suffixes: []
        }
      },
      {
        enabled: true,
        key: "short-suffix",
        match: {
          exactAliases: [],
          prefixes: ["vision-"],
          suffixes: ["-tools"]
        }
      },
      {
        enabled: true,
        key: "long-suffix",
        match: {
          exactAliases: [],
          prefixes: ["vision-pro-"],
          suffixes: ["-mcp-tools"]
        }
      }
    ]
  };
}

test("matchVirtualModelProfile matches generated Fusion aliases", () => {
  const { matchVirtualModelProfile } = loadFusionModule();

  const match = matchVirtualModelProfile("Fusion/search-model", fusionConfig());

  assert.equal(match.profile.key, "exact-search");
  assert.equal(match.matchedBy, "exact");
  assert.equal(match.matchedToken, "Fusion/search-model");
});

test("matchVirtualModelProfile compares provider-qualified model-only aliases", () => {
  const { matchVirtualModelProfile } = loadFusionModule();

  const match = matchVirtualModelProfile(
    "provider-srdcloud::openai_responses/search-model",
    fusionConfig()
  );

  assert.equal(match.profile.key, "exact-search");
  assert.equal(match.matchedToken, "search-model");
});

test("matchVirtualModelProfile prefers the longest suffix then longest prefix", () => {
  const { matchVirtualModelProfile } = loadFusionModule();
  const config = fusionConfig();

  assert.equal(
    matchVirtualModelProfile("GLM-mcp-tools", config).profile.key,
    "long-suffix"
  );
  assert.equal(
    matchVirtualModelProfile("vision-pro-GLM", config).profile.key,
    "long-suffix"
  );
});

test("matchVirtualModelProfile ignores disabled and malformed profiles", () => {
  const { matchVirtualModelProfile } = loadFusionModule();
  const config = {
    virtualModelProfiles: [
      { enabled: false, match: { exactAliases: ["Fusion/off"] } },
      null,
      { enabled: true, match: null }
    ]
  };

  assert.equal(matchVirtualModelProfile("Fusion/off", config), null);
  assert.equal(matchVirtualModelProfile(null, config), null);
});

test("buildAnthropicBodyFromStandardRequest preserves canonical Fusion state", () => {
  const { buildAnthropicBodyFromStandardRequest } = loadFusionModule();
  const body = buildAnthropicBodyFromStandardRequest(
    {
      metadata: { client: "claude-code" },
      model: "Fusion/search-model",
      tools: [{ type: "web_search_20250305", name: "web_search" }]
    },
    {
      input: [
        {
          type: "message",
          role: "assistant",
          content: [
            { type: "reasoning", text: "check first" },
            {
              type: "tool_use",
              id: "call-1",
              name: "search_model_web_search",
              input: { prompt: "CCR Fusion" },
              thought_signature: "sig-1"
            }
          ]
        },
        {
          type: "message",
          role: "user",
          content: [
            {
              type: "tool_result",
              tool_use_id: "call-1",
              content: "search evidence",
              is_error: false,
              result_format: "web_search"
            },
            { type: "input_text", text: "answer now" }
          ]
        }
      ],
      instructions: "Use the Fusion tool before answering.",
      max_output_tokens: 4096,
      model: "provider-srdcloud::openai_responses/GLM-5.1",
      output_config: { format: "text" },
      reasoning: { effort: "high" },
      stop: ["STOP"],
      stream: true,
      temperature: 0.2,
      thinking: { type: "enabled" },
      tool_choice: { type: "auto" },
      tools: [
        {
          type: "function",
          name: "search_model_web_search",
          description: "Search",
          input_schema: { type: "object", properties: { prompt: { type: "string" } } }
        }
      ],
      top_p: 0.9
    }
  );

  assert.equal(body.model, "provider-srdcloud::openai_responses/GLM-5.1");
  assert.equal(body.system, "Use the Fusion tool before answering.");
  assert.equal(body.metadata.client, "claude-code");
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].name, "search_model_web_search");
  assert.equal(JSON.stringify(body).includes("web_search_20250305"), false);
  assert.deepEqual(body.messages[0].content[0], {
    type: "thinking",
    thinking: "check first"
  });
  assert.equal(body.messages[0].content[1].thought_signature, "sig-1");
  assert.equal(body.messages[1].content[0].tool_use_id, "call-1");
  assert.equal(body.messages[1].content[1].text, "answer now");
  assert.equal(body.max_tokens, 4096);
  assert.deepEqual(body.stop_sequences, ["STOP"]);
  assert.equal(body.stream, true);
  assert.equal(body.temperature, 0.2);
  assert.equal(body.top_p, 0.9);
  assert.deepEqual(body.reasoning, { effort: "high" });
  assert.deepEqual(body.thinking, { type: "enabled" });
  assert.deepEqual(body.output_config, { format: "text" });
});

test("buildAnthropicBodyFromStandardRequest maps string and encrypted reasoning input", () => {
  const { buildAnthropicBodyFromStandardRequest } = loadFusionModule();

  assert.deepEqual(
    buildAnthropicBodyFromStandardRequest({}, { input: "hello", model: "GLM" }).messages,
    [{ role: "user", content: [{ type: "text", text: "hello" }] }]
  );
  assert.deepEqual(
    buildAnthropicBodyFromStandardRequest({}, {
      input: [{
        type: "message",
        role: "assistant",
        content: [{ type: "reasoning", encrypted_content: "opaque" }]
      }],
      model: "GLM"
    }).messages[0].content,
    [{ type: "redacted_thinking", data: "opaque" }]
  );
  assert.deepEqual(
    buildAnthropicBodyFromStandardRequest({}, {
      input: [{
        type: "message",
        role: "assistant",
        content: [{
          type: "reasoning",
          text: "signed thought",
          reasoning_details: [{
            type: "reasoning.text",
            format: "anthropic-claude-v1",
            signature: "signature-1"
          }]
        }]
      }],
      model: "GLM"
    }).messages[0].content,
    [{ type: "thinking", thinking: "signed thought", signature: "signature-1" }]
  );
});

test("buildAnthropicBodyFromStandardRequest preserves structured tool-result arrays", () => {
  const { buildAnthropicBodyFromStandardRequest } = loadFusionModule();
  const body = buildAnthropicBodyFromStandardRequest({}, {
    input: [{
      type: "message",
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "call-array",
        content: [
          "plain evidence",
          { type: "text", text: "typed evidence" },
          { type: "input_text", text: "input evidence" },
          { type: "output_text", text: "output evidence" },
          { score: 0.75 }
        ],
        is_error: true
      }]
    }],
    model: "GLM"
  });

  assert.deepEqual(body.messages[0].content[0], {
    type: "tool_result",
    tool_use_id: "call-array",
    content: [
      "plain evidence",
      "typed evidence",
      "input evidence",
      "output evidence",
      '{"score":0.75}'
    ].join("\n"),
    is_error: true
  });
});

test("buildAnthropicBodyFromStandardRequest serializes record tool results", () => {
  const { buildAnthropicBodyFromStandardRequest } = loadFusionModule();
  const body = buildAnthropicBodyFromStandardRequest({}, {
    input: [{
      type: "message",
      role: "user",
      content: [{
        type: "tool_result",
        tool_use_id: "call-record",
        content: { answer: "preserved", count: 2 }
      }]
    }],
    model: "GLM"
  });

  assert.equal(
    body.messages[0].content[0].content,
    '{"answer":"preserved","count":2}'
  );
});

test("buildAnthropicBodyFromStandardRequest rejects an empty canonical request", () => {
  const { buildAnthropicBodyFromStandardRequest } = loadFusionModule();

  assert.throws(
    () => buildAnthropicBodyFromStandardRequest({}, { input: [], model: "GLM" }),
    /non-empty input or instructions/
  );
});

test("selectSRDCloudChatBody leaves non-Fusion requests on the direct path", () => {
  const { selectSRDCloudChatBody } = loadFusionModule();
  const requestBody = { model: "srdcloud/GLM", messages: [{ role: "user", content: "hi" }] };
  const selected = selectSRDCloudChatBody({
    config: fusionConfig(),
    requestBody,
    sourceAdapterKey: "anthropic_messages",
    standardRequest: { model: "GLM", input: "changed" },
    upstreamBody: { model: "GLM", input: "changed" }
  });

  assert.equal(selected.ok, true);
  assert.equal(selected.body, requestBody);
  assert.equal(selected.diagnostics.requestMode, "direct");
});

test("selectSRDCloudChatBody uses canonical Anthropic state for Fusion", () => {
  const { selectSRDCloudChatBody } = loadFusionModule();
  const selected = selectSRDCloudChatBody({
    config: fusionConfig(),
    requestBody: {
      model: "Fusion/search-model",
      messages: [{ role: "user", content: "search" }],
      tools: [{ type: "web_search_20250305", name: "web_search" }]
    },
    sourceAdapterKey: "anthropic_messages",
    standardRequest: {
      model: "provider-srdcloud::openai_responses/GLM",
      instructions: "Call the internal function.",
      input: [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "search" }]
      }],
      tools: [{
        type: "function",
        name: "search_model_web_search",
        input_schema: { type: "object" }
      }]
    },
    upstreamBody: { model: "GLM", input: "wrong protocol" }
  });

  assert.equal(selected.ok, true);
  assert.equal(selected.diagnostics.requestMode, "fusion-canonical");
  assert.equal(selected.body.tools[0].name, "search_model_web_search");
  assert.equal(selected.body.system, "Call the internal function.");
});

test("selectSRDCloudChatBody uses CCR target bodies for non-Anthropic Fusion", () => {
  const { selectSRDCloudChatBody } = loadFusionModule();
  const upstreamBody = { model: "GLM", input: "canonical Codex input", tools: [] };
  const selected = selectSRDCloudChatBody({
    config: fusionConfig(),
    requestBody: { model: "Fusion/search-model", input: "original" },
    sourceAdapterKey: "openai_responses",
    standardRequest: { model: "GLM", input: "canonical Codex input" },
    upstreamBody
  });

  assert.equal(selected.ok, true);
  assert.equal(selected.body, upstreamBody);
  assert.equal(selected.diagnostics.requestMode, "fusion-canonical");
});

test("selectSRDCloudChatBody marks missing canonical state as legacy fallback", () => {
  const { selectSRDCloudChatBody } = loadFusionModule();
  const requestBody = { model: "Fusion/search-model", messages: [] };
  const selected = selectSRDCloudChatBody({
    config: fusionConfig(),
    requestBody,
    sourceAdapterKey: "anthropic_messages"
  });

  assert.equal(selected.ok, true);
  assert.equal(selected.body, requestBody);
  assert.equal(selected.diagnostics.requestMode, "fusion-legacy-fallback");
});

test("selectSRDCloudChatBody rejects malformed current canonical state", () => {
  const { selectSRDCloudChatBody } = loadFusionModule();
  const selected = selectSRDCloudChatBody({
    config: fusionConfig(),
    requestBody: { model: "Fusion/search-model", messages: [] },
    sourceAdapterKey: "anthropic_messages",
    standardRequest: { input: [] }
  });

  assert.deepEqual(selected, {
    ok: false,
    error: "CCR Fusion canonical request could not be projected for SRDCloud."
  });
});

test("selectSRDCloudChatBody preserves vision context and custom MCP results", () => {
  const { selectSRDCloudChatBody } = loadFusionModule();
  const config = {
    virtualModelProfiles: [{
      enabled: true,
      key: "fusion-agent",
      match: { exactAliases: ["Fusion/agent"], prefixes: [], suffixes: [] },
      execution: { matchMultimodal: true },
      metadata: { fusionVision: {} }
    }]
  };
  const selected = selectSRDCloudChatBody({
    config,
    requestBody: { model: "Fusion/agent", messages: [] },
    sourceAdapterKey: "anthropic_messages",
    standardRequest: {
      model: "GLM",
      input: [{
        type: "message",
        role: "user",
        content: [
          { type: "input_text", text: "Media reference: media_ref_1" },
          {
            type: "tool_result",
            tool_use_id: "mcp-1",
            content: "internal system result"
          }
        ]
      }],
      tools: [
        { type: "function", name: "vision_understand", input_schema: { type: "object" } },
        { type: "function", name: "internal_lookup", input_schema: { type: "object" } }
      ]
    },
    upstreamBody: {}
  });

  assert.equal(selected.ok, true);
  assert.equal(selected.diagnostics.hasFusionVision, true);
  assert.equal(selected.diagnostics.hasCanonicalToolResult, true);
  assert.deepEqual(
    selected.body.tools.map((tool) => tool.name),
    ["vision_understand", "internal_lookup"]
  );
  assert.equal(selected.body.messages[0].content[0].text, "Media reference: media_ref_1");
  assert.equal(selected.body.messages[0].content[1].content, "internal system result");
});

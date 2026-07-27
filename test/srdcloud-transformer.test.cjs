"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  SRDCloudTransformer,
  createModelLimitsCache,
  createSRDCloudProviderPlugin,
  decryptApiKey,
  discoverModelLimits,
  normalizeSRDCloudRequestBody,
  readCredentials,
  stripProviderPrefix
} = require("../src/srdcloud-transformer.cjs");

const AES_KEY = Buffer.from("Xtpa6sS&+D.NAo%CP8LA:7pk", "utf8");
const AES_IV = Buffer.from("%1KJIrl3!XUxr04V", "utf8");

function encryptApiKey(value) {
  const cipher = crypto.createCipheriv("aes-192-cbc", AES_KEY, AES_IV);
  return cipher.update(value, "utf8", "base64") + cipher.final("base64");
}

function modernAuthFixture(overrides = {}) {
  return {
    async applyHeaders({ headers }) {
      return {
        ...Object.fromEntries(
          Object.entries(headers || {}).filter(
            ([key]) => !["apikey", "authorization"].includes(key.toLowerCase())
          )
        ),
        "X-Cf-Token": "token-fixture",
        userId: "user-modern",
        projectId: "0",
        "X-Cf-AppId": "client-fixture",
        "X-Cf-Timestamp": "1721720000",
        "X-Cf-Nonce": "nonce-fixture",
        "X-Cf-Signature": "signature-fixture"
      };
    },
    async authenticatedFetch() {
      throw new Error("not used");
    },
    ...overrides
  };
}

test("decryptApiKey restores CodeFree oauth credential apikey values", () => {
  const encrypted = encryptApiKey("test-api-key");

  assert.equal(decryptApiKey(encrypted), "test-api-key");
});

test("readCredentials reads id_token as userId and decrypted apikey as apiKey", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srdcloud-creds-"));
  const credentialsPath = path.join(dir, "oauth_creds.json");
  fs.writeFileSync(
    credentialsPath,
    JSON.stringify({
      id_token: "user-from-file",
      apikey: encryptApiKey("api-key-from-file")
    })
  );

  assert.deepEqual(readCredentials(credentialsPath), {
    apiKey: "api-key-from-file",
    userId: "user-from-file"
  });
});

test("transformRequestIn sends CodeFree-O client headers and subservice", async () => {
  const transformer = new SRDCloudTransformer({
    authHeader: "Bearer custom",
    clientVersion: "1.2.3",
    skipVersionUpdate: true,
    userAgent: "UnitTest/1.0",
    userId: "user-1"
  });

  const body = {
    messages: [{ role: "user", content: "hello" }],
    model: "body-model"
  };
  const result = await transformer.transformRequestIn(body, {
    apiKey: "provided-key",
    baseUrl: "https://gateway.example/base"
  });

  assert.equal(result.body, body);
  assert.equal(
    String(result.config.url),
    "https://gateway.example/api/acbackend/codechat/v1/completions"
  );
  assert.deepEqual(result.config.headers, {
    Accept: "application/json",
    "User-Agent": "UnitTest/1.0",
    apiKey: "provided-key",
    authorization: "Bearer custom",
    userId: "user-1",
    subService: "codefree_o_chat",
    modelName: "body-model",
    clientType: "codefree-o",
    clientVersion: "1.2.3"
  });
});

test("transformRequestIn uses the CodeFree-O 1.5.2 client identity by default", async () => {
  const transformer = new SRDCloudTransformer({
    skipVersionUpdate: true,
    userId: "user-1"
  });

  const result = await transformer.transformRequestIn(
    { model: "GLM-5.1" },
    { apiKey: "secret-key" }
  );

  assert.equal(result.config.headers["User-Agent"], "opencode/1.5.2");
  assert.equal(result.config.headers.clientVersion, "1.5.2");
});

test("transformRequestIn can include an explicit SRDCloud sessionId", async () => {
  const transformer = new SRDCloudTransformer({
    sessionId: "session-1",
    skipVersionUpdate: true,
    userId: "user-1"
  });

  const result = await transformer.transformRequestIn({ model: "GLM-5.1" }, { apiKey: "secret-key" });

  assert.equal(result.config.headers.sessionId, "session-1");
});

test("transformRequestIn preserves an empty caller apiKey like the legacy transformer", async () => {
  const transformer = new SRDCloudTransformer({
    apiKey: "credential-key",
    clientVersion: "1.2.3",
    skipVersionUpdate: true,
    userId: "user-1"
  });

  const result = await transformer.transformRequestIn({ modelName: "model-name" }, { apiKey: "" });

  assert.equal(result.config.headers.apiKey, "");
  assert.equal(result.config.headers.modelName, "model-name");
});

test("transformRequestIn uses modern auth when a CodeFree auth file is configured", async () => {
  const transformer = new SRDCloudTransformer({
    apiKey: "legacy-key",
    codefreeAuthFile: "/synthetic/private-auth.json",
    codefreeTokenAuth: modernAuthFixture(),
    skipVersionUpdate: true
  });

  const result = await transformer.transformRequestIn(
    { model: "GLM-5.1" },
    { apiKey: "caller-legacy-key" }
  );

  assert.equal(result.config.headers.apiKey, undefined);
  assert.equal(result.config.headers.authorization, undefined);
  assert.equal(result.config.headers["X-Cf-Token"], "token-fixture");
  assert.equal(result.config.headers.userId, "user-modern");
});

test("logLevel silent suppresses constructor warnings", () => {
  const calls = [];
  new SRDCloudTransformer({
    credentials: { apiKey: null, userId: null },
    logLevel: "silent",
    logger: {
      warn(message) {
        calls.push(message);
      }
    },
    skipVersionUpdate: true
  });

  assert.deepEqual(calls, []);
});

test("logLevel debug emits request metadata without leaking api keys", async () => {
  const calls = [];
  const transformer = new SRDCloudTransformer({
    clientVersion: "1.2.3",
    logLevel: "debug",
    logger: {
      debug(message, metadata) {
        calls.push([message, metadata]);
      },
      warn() {}
    },
    skipVersionUpdate: true,
    userId: "user-1"
  });

  await transformer.transformRequestIn({ model: "srdcloud/model-a" }, { apiKey: "secret-key" });

  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], "[SRDCloudTransformer] request transformed");
  assert.deepEqual(calls[0][1], {
    authMode: "legacy",
    hasApiKey: true,
    hasUserId: true,
    modelName: "srdcloud/model-a",
    url: "https://www.srdcloud.cn/api/acbackend/codechat/v1/completions"
  });
  assert.equal(JSON.stringify(calls).includes("secret-key"), false);
});

test("stripProviderPrefix removes CCR provider prefixes without touching plain model names", () => {
  assert.equal(stripProviderPrefix("srdcloud/GLM-5.1"), "GLM-5.1");
  assert.equal(stripProviderPrefix("provider-srdcloud::openai_responses/GLM-5.1"), "GLM-5.1");
  assert.equal(stripProviderPrefix("GLM-5.1"), "GLM-5.1");
});

test("normalizeSRDCloudRequestBody preserves request shape and converts only Anthropic tools", () => {
  const body = {
    max_tokens: 128,
    messages: [{ role: "user", content: "hi" }],
    model: "srdcloud/GLM-5.1",
    tools: [
      {
        description: "Read a file",
        input_schema: {
          properties: {
            path: { type: "string" }
          },
          required: ["path"],
          type: "object"
        },
        name: "read_file"
      },
      {
        function: {
          name: "already_openai",
          parameters: {
            type: "object"
          }
        },
        type: "function"
      }
    ]
  };

  assert.deepEqual(normalizeSRDCloudRequestBody(body), {
    max_tokens: 128,
    messages: [{ role: "user", content: "hi" }],
    model: "GLM-5.1",
    tools: [
      {
        function: {
          description: "Read a file",
          name: "read_file",
          parameters: {
            properties: {
              path: { type: "string" }
            },
            required: ["path"],
            type: "object"
          }
        },
        type: "function"
      },
      {
        function: {
          name: "already_openai",
          parameters: {
            type: "object"
          }
        },
        type: "function"
      }
    ]
  });
});

test("discoverModelLimits reads SRDCloud model manager output token metadata", async () => {
  const calls = [];
  const limits = await discoverModelLimits({
    apiKey: "secret-key",
    baseUrl: "https://www.srdcloud.cn",
    clientVersion: "1.4.0",
    fetch: async (url, init) => {
      calls.push([url, init]);
      return {
        ok: true,
        async json() {
          return {
            data: [
              {
                modelName: "GLM-5.1-ctyun-oc",
                maxTokens: 112000,
                maxOutputTokens: 16000
              },
              {
                modelName: "GLM-4.7",
                maxTokens: 80000,
                maxOutputTokens: 8000
              }
            ],
            optResult: 0
          };
        }
      };
    },
    userId: "user-1"
  });

  assert.deepEqual(limits, {
    "GLM-4.7": { maxOutputTokens: 8000, maxTokens: 80000 },
    "GLM-5.1-ctyun-oc": { maxOutputTokens: 16000, maxTokens: 112000 }
  });
  assert.equal(
    calls[0][0],
    "https://www.srdcloud.cn/api/acbackend/modelmgr/v1/clients/codefree-o/versions/1.4.0"
  );
  assert.deepEqual(calls[0][1].headers, {
    apiKey: "secret-key",
    clientType: "codefree-o",
    clientVersion: "1.4.0",
    userId: "user-1"
  });
});

test("model limit cache shares concurrent discovery misses", async () => {
  let fetchCount = 0;
  let releaseFetch;
  const fetchGate = new Promise((resolve) => {
    releaseFetch = resolve;
  });
  const limits = {
    "GLM-5.1-ctyun-oc": { maxOutputTokens: 16000, maxTokens: 112000 }
  };
  const cache = createModelLimitsCache({
    discover: async () => {
      fetchCount += 1;
      await fetchGate;
      return limits;
    },
    modelLimitsTtlMs: 60 * 60 * 1000,
    now: () => 1000
  });

  const first = cache.get({});
  const second = cache.get({});

  assert.equal(fetchCount, 1);
  releaseFetch();
  assert.deepEqual(await first, { limits, state: "miss" });
  assert.deepEqual(await second, { limits, state: "shared" });
});

test("model limit cache backs off after discovery failures", async () => {
  let now = 0;
  let fetchCount = 0;
  const cache = createModelLimitsCache({
    discover: async () => {
      fetchCount += 1;
      throw new Error(`failure-${fetchCount}`);
    },
    modelLimitsTtlMs: 1000,
    now: () => now
  });

  const first = await cache.get({});
  assert.equal(first.state, "failed");
  assert.equal(first.error.message, "failure-1");
  assert.equal(first.retryAfterMs, 30000);

  now = 29999;
  assert.deepEqual(await cache.get({}), { limits: {}, state: "backoff" });
  assert.equal(fetchCount, 1);

  now = 30000;
  const second = await cache.get({});
  assert.equal(second.state, "failed");
  assert.equal(second.retryAfterMs, 60000);
  assert.equal(fetchCount, 2);
});

test("model limit cache shares discovery failures", async () => {
  let fetchCount = 0;
  let rejectFetch;
  const fetchGate = new Promise((_resolve, reject) => {
    rejectFetch = reject;
  });
  const cache = createModelLimitsCache({
    discover: async () => {
      fetchCount += 1;
      return fetchGate;
    },
    modelLimitsTtlMs: 1000,
    now: () => 0
  });

  const first = cache.get({});
  const second = cache.get({});
  rejectFetch(new Error("metadata unavailable"));

  const firstResult = await first;
  const secondResult = await second;
  assert.equal(fetchCount, 1);
  assert.equal(firstResult.state, "failed");
  assert.equal(firstResult.error.message, "metadata unavailable");
  assert.equal(firstResult.retryAfterMs, 30000);
  assert.deepEqual(secondResult, { limits: {}, state: "shared-failed" });
});

test("model limit cache caps cooldown and resets it after success", async () => {
  let now = 0;
  let shouldFail = true;
  const limits = {
    "GLM-5.1-ctyun-oc": { maxOutputTokens: 16000, maxTokens: 112000 }
  };
  const cache = createModelLimitsCache({
    discover: async () => {
      if (shouldFail) {
        throw new Error("unavailable");
      }
      return limits;
    },
    modelLimitsTtlMs: 1000,
    now: () => now
  });

  const expectedDelays = [30000, 60000, 120000, 240000, 300000, 300000];
  for (const expectedDelay of expectedDelays) {
    const failed = await cache.get({});
    assert.equal(failed.retryAfterMs, expectedDelay);
    now += expectedDelay;
  }

  shouldFail = false;
  assert.deepEqual(await cache.get({}), { limits, state: "miss" });
  now += 1000;
  shouldFail = true;
  const failedAfterReset = await cache.get({});
  assert.equal(failedAfterReset.retryAfterMs, 30000);
});

test("model limit cache does not reuse expired limits after refresh failure", async () => {
  let now = 0;
  let shouldFail = false;
  const limits = {
    "GLM-5.1-ctyun-oc": { maxOutputTokens: 16000, maxTokens: 112000 }
  };
  const cache = createModelLimitsCache({
    discover: async () => {
      if (shouldFail) {
        throw new Error("refresh failed");
      }
      return limits;
    },
    modelLimitsTtlMs: 1000,
    now: () => now
  });

  assert.deepEqual(await cache.get({}), { limits, state: "miss" });
  now = 1000;
  shouldFail = true;
  const refresh = await cache.get({});
  assert.deepEqual(refresh.limits, {});
  assert.equal(refresh.state, "failed");
});

test("normalizeSRDCloudRequestBody converts Anthropic image blocks to OpenAI image_url blocks", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgo="
            }
          }
        ]
      }
    ],
    model: "srdcloud/Qwen3.5-122B-A10B"
  };

  assert.deepEqual(normalizeSRDCloudRequestBody(body), {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          {
            type: "image_url",
            image_url: {
              url: "data:image/png;base64,iVBORw0KGgo="
            }
          }
        ]
      }
    ],
    model: "Qwen3.5-122B-A10B"
  });
});

test("normalizeSRDCloudRequestBody moves system messages before image messages", () => {
  const body = {
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: "describe this" },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: "image/png",
              data: "iVBORw0KGgo="
            }
          }
        ]
      },
      {
        role: "system",
        content: "Use concise output."
      },
      {
        role: "assistant",
        content: [{ type: "text", text: "Earlier answer." }]
      }
    ],
    model: "srdcloud/Qwen3.5-122B-A10B"
  };

  const normalized = normalizeSRDCloudRequestBody(body);

  assert.deepEqual(normalized.messages.map((message) => message.role), [
    "system",
    "user",
    "assistant"
  ]);
  assert.equal(normalized.messages[1].content[1].type, "image_url");
});

test("normalizeSRDCloudRequestBody preserves system message order without images", () => {
  const body = {
    messages: [
      { role: "user", content: "hello" },
      { role: "system", content: "Use concise output." }
    ],
    model: "srdcloud/GLM-5.1"
  };

  const normalized = normalizeSRDCloudRequestBody(body);

  assert.deepEqual(normalized.messages.map((message) => message.role), ["user", "system"]);
});

test("normalizeSRDCloudRequestBody flattens paired historical tool blocks by default", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [
          { type: "text", text: "I will read it." },
          {
            type: "tool_use",
            id: "tool-1",
            name: "Read",
            input: { file_path: "/tmp/a.txt" }
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "file contents"
          }
        ]
      }
    ],
    model: "srdcloud/GLM-5.1"
  };

  const normalized = normalizeSRDCloudRequestBody(body);

  assert.deepEqual(normalized.messages, [
    {
      role: "assistant",
      content: [
        { type: "text", text: "I will read it." }
      ]
    },
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Completed internal operation \"Read\".\n" +
            "Parameters: {\"file_path\":\"/tmp/a.txt\"}\n" +
            "Outcome: succeeded\n" +
            "Result:\n" +
            "file contents"
        }
      ]
    }
  ]);
});

test("normalizeSRDCloudRequestBody preserves failed operation context without protocol markers", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool-bash-1",
            name: "Bash",
            input: { command: "grep -n needle file.py" }
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-bash-1",
            is_error: true,
            content: "file.py: No such file"
          }
        ]
      }
    ],
    model: "srdcloud/GLM-5.1"
  };

  const normalized = normalizeSRDCloudRequestBody(body);
  const serialized = JSON.stringify(normalized.messages);

  assert.deepEqual(normalized.messages, [
    {
      role: "user",
      content: [
        {
          type: "text",
          text:
            "Completed internal operation \"Bash\".\n" +
            "Parameters: {\"command\":\"grep -n needle file.py\"}\n" +
            "Outcome: failed\n" +
            "Result:\n" +
            "file.py: No such file"
        }
      ]
    }
  ]);
  assert.equal(serialized.includes("tool-bash-1"), false);
  assert.equal(serialized.includes("tool_use"), false);
  assert.equal(serialized.includes("tool_result"), false);
});

test("normalizeSRDCloudRequestBody bounds flattened operation parameters", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: [
          {
            type: "tool_use",
            id: "tool-agent-1",
            name: "Agent",
            input: { prompt: `START-${"x".repeat(3000)}-PRIVATE-TAIL` }
          }
        ]
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-agent-1",
            content: "Agent completed"
          }
        ]
      }
    ],
    model: "srdcloud/GLM-5.1"
  };

  const normalized = normalizeSRDCloudRequestBody(body);
  const text = normalized.messages[0].content[0].text;

  assert.match(text, /Parameters: .*\[truncated from \d+ characters\]/s);
  assert.equal(text.includes("-PRIVATE-TAIL"), false);
  assert.equal(text.length < 2300, true);
});

test("normalizeSRDCloudRequestBody allows an explicit flattening opt-out", () => {
  const body = {
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
      },
      {
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: "tool-1",
            content: "file contents"
          }
        ]
      }
    ],
    model: "srdcloud/GLM-5.1"
  };

  const normalized = normalizeSRDCloudRequestBody(body, { flattenToolMessages: false });

  assert.equal(normalized.messages[0].content[0].type, "tool_use");
  assert.equal(normalized.messages[1].content[0].type, "tool_result");
});

test("normalizeSRDCloudRequestBody sanitizes literal tool call transcripts when flattening", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content: "Let me check.[tool_use id=chatcmpl-tool-1 name=SendMessage]\n{\"to\":\"agent-1\"}"
      },
      {
        role: "assistant",
        content: [
          {
            type: "text",
            text: "Again [tool_result id=chatcmpl-tool-1]\nDone"
          }
        ]
      }
    ],
    model: "srdcloud/GLM-5.1"
  };

  const normalized = normalizeSRDCloudRequestBody(body, { flattenToolMessages: true });
  const serialized = JSON.stringify(normalized.messages);

  assert.equal(serialized.includes("[tool_use"), false);
  assert.equal(serialized.includes("[tool_result"), false);
  assert.equal(serialized.includes("Historical assistant tool request"), false);
  assert.equal(serialized.includes("Historical tool result"), false);
  assert.equal(serialized.includes("name=SendMessage"), false);
  assert.equal(serialized.includes("Observation from previous internal operation"), true);
});

test("normalizeSRDCloudRequestBody removes generated historical tool request text", () => {
  const body = {
    messages: [
      {
        role: "assistant",
        content:
          "Still waiting for the ansible _utils and caches/utils agents.Historical assistant tool request\n" +
          "id: chatcmpl-tool-8f3e1e1b2e8b4c5f\n" +
          "name: Bash\n" +
          "input: {\"command\":\"sleep 30 && echo \\\"waited\\\"\",\"description\":\"Wait for remaining agents\"}"
      }
    ],
    model: "srdcloud/GLM-5.1"
  };

  const normalized = normalizeSRDCloudRequestBody(body, { flattenToolMessages: true });
  const serialized = JSON.stringify(normalized.messages);

  assert.equal(serialized.includes("Historical assistant tool request"), false);
  assert.equal(serialized.includes("name: Bash"), false);
  assert.equal(serialized.includes("sleep 30"), false);
  assert.equal(serialized.includes("Still waiting for the ansible _utils and caches/utils agents."), true);
});

test("createSRDCloudProviderPlugin exposes native CCR Desktop request adapter config", async () => {
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    authHeader: "Bearer custom",
    clientVersion: "1.2.3",
    providerName: "provider-srdcloud::openai_responses",
    userAgent: "UnitTest/1.0",
    userId: "user-1"
  });

  assert.equal(plugin.key, "srdcloud-target-adapter");
  assert.equal(plugin.providerName, "provider-srdcloud::openai_responses");
  assert.equal(typeof plugin.authenticate, "function");
  assert.equal(typeof plugin.transformRequest, "function");

  const authed = plugin.authenticate({
    targetProviderConfig: {},
    upstreamRequest: {
      body: { model: "ignored" },
      headers: { "content-type": "application/json" },
      url: "https://old.example/v1/responses"
    }
  });

  assert.equal(authed.ok, true);
  assert.deepEqual(authed.value.headers, {
    "content-type": "application/json",
    Accept: "application/json",
    "User-Agent": "UnitTest/1.0",
    apiKey: "secret-key",
    authorization: "Bearer custom",
    clientType: "codefree-o",
    clientVersion: "1.2.3",
    subService: "codefree_o_chat",
    userId: "user-1",
    modelName: undefined
  });

  const transformed = await plugin.transformRequest({
    request: {
      body: {
        model: "srdcloud/GLM-5.1",
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
          },
          {
            role: "user",
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-1",
                content: "file contents"
              }
            ]
          }
        ],
        tools: [{ input_schema: { type: "object" }, name: "read_file" }]
      }
    },
    targetProviderConfig: {
      baseurl: "https://www.srdcloud.cn",
      apikey: "provider-key"
    },
    upstreamRequest: {
      body: { model: "upstream-model" },
      headers: { "content-type": "application/json" },
      url: "https://old.example/v1/responses"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.url, "https://www.srdcloud.cn/api/acbackend/codechat/v1/completions");
  assert.equal(transformed.value.body.model, "GLM-5.1");
  assert.equal(transformed.value.body.tools[0].type, "function");
  assert.equal(transformed.value.body.messages.length, 1);
  assert.equal(transformed.value.body.messages[0].content[0].type, "text");
  assert.match(transformed.value.body.messages[0].content[0].text, /Completed internal operation "Read"/);
  assert.equal(transformed.value.headers.modelName, "GLM-5.1");
});

test("provider hook gives modern auth precedence over a configured legacy api key", async () => {
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "legacy-key",
    codefreeAuthFile: "/synthetic/private-auth.json",
    codefreeTokenAuth: modernAuthFixture(),
    credentials: null,
    userId: "legacy-user"
  });
  const upstreamRequest = {
    body: { model: "upstream-model" },
    headers: {
      apiKey: "upstream-legacy-key",
      authorization: "Bearer legacy",
      "content-type": "application/json"
    },
    url: "https://old.example/v1/responses"
  };

  const authenticated = plugin.authenticate({
    targetProviderConfig: {},
    upstreamRequest
  });
  assert.deepEqual(authenticated.value.headers, upstreamRequest.headers);

  const transformed = await plugin.transformRequest({
    request: {
      body: {
        messages: [{ role: "user", content: "hello" }],
        model: "srdcloud/GLM-5.1"
      }
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.headers.apiKey, undefined);
  assert.equal(transformed.value.headers.authorization, undefined);
  assert.equal(transformed.value.headers["X-Cf-Token"], "token-fixture");
  assert.equal(transformed.value.headers.userId, "user-modern");
});

test("provider hook preserves legacy auth when modern auth is absent", () => {
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "legacy-key",
    authHeader: "Bearer custom",
    credentials: null,
    userId: "legacy-user"
  });
  const result = plugin.authenticate({
    targetProviderConfig: {},
    upstreamRequest: {
      body: {},
      headers: { "content-type": "application/json" },
      url: "https://old.example/v1/responses"
    }
  });

  assert.deepEqual(result.value.headers, {
    "content-type": "application/json",
    Accept: "application/json",
    "User-Agent": "opencode/1.5.2",
    apiKey: "legacy-key",
    authorization: "Bearer custom",
    userId: "legacy-user",
    subService: "codefree_o_chat",
    modelName: undefined,
    clientType: "codefree-o",
    clientVersion: "1.5.2"
  });
});

test("provider hook does not fall back when modern auth configuration is invalid", () => {
  assert.throws(
    () => createSRDCloudProviderPlugin({
      apiKey: "legacy-key",
      codefreeAuthFile: "/missing/private-auth.json"
    }),
    (error) => error.code === "AUTH_FILE_READ" &&
      error.message.includes("legacy-key") === false
  );
});

test("provider hook reports a sanitized error when authentication is missing", () => {
  const plugin = createSRDCloudProviderPlugin({ credentials: null });
  const result = plugin.authenticate({
    targetProviderConfig: {},
    upstreamRequest: { body: {}, headers: {}, url: "https://old.example" }
  });

  assert.deepEqual(result, {
    error: "SRDCloud authentication is not configured.",
    ok: false
  });
});

test("provider hook emits the legacy auth deprecation warning once", () => {
  const warnings = [];
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "legacy-key",
    credentials: null,
    logger: {
      warn(message) {
        warnings.push(message);
      }
    },
    userId: "legacy-user"
  });
  const context = {
    targetProviderConfig: {},
    upstreamRequest: { body: {}, headers: {}, url: "https://old.example" }
  };

  plugin.authenticate(context);
  plugin.authenticate(context);

  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /deprecated/i);
  assert.equal(warnings[0].includes("legacy-key"), false);
});

test("provider hook clamps chat max_tokens with discovered model maxOutputTokens", async () => {
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    clientVersion: "1.4.0",
    credentials: null,
    discoverModelLimits: true,
    modelLimitsTtlMs: 60 * 60 * 1000,
    modelLimitsFetch: async () => ({
      ok: true,
      async json() {
        return {
          data: [
            {
              modelName: "GLM-5.1-ctyun-oc",
              maxTokens: 112000,
              maxOutputTokens: 16000
            }
          ],
          optResult: 0
        };
      }
    }),
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });

  const transformed = await plugin.transformRequest({
    request: {
      body: {
        max_tokens: 32000,
        messages: [{ role: "user", content: "hello" }],
        model: "srdcloud/GLM-5.1-ctyun-oc"
      }
    },
    targetProviderConfig: {
      baseurl: "https://www.srdcloud.cn"
    },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/chat/completions"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.body.max_tokens, 16000);
});

test("provider hook uses modern auth for model discovery", async () => {
  let discoveredHeaders;
  const tokenAuth = modernAuthFixture({
    async authenticatedFetch(_url, init) {
      discoveredHeaders = init.headers;
      return new Response(JSON.stringify({
        data: [{
          modelName: "GLM-5.1",
          maxTokens: 80000,
          maxOutputTokens: 6000
        }],
        optResult: 0
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }
  });
  const plugin = createSRDCloudProviderPlugin({
    codefreeAuthFile: "/synthetic/private-auth.json",
    codefreeTokenAuth: tokenAuth,
    credentials: null,
    discoverModelLimits: true
  });

  const transformed = await plugin.transformRequest({
    request: {
      body: {
        max_tokens: 10000,
        messages: [{ role: "user", content: "hello" }],
        model: "srdcloud/GLM-5.1"
      }
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/responses"
    }
  });

  assert.equal(transformed.value.body.max_tokens, 6000);
  assert.deepEqual(discoveredHeaders, {
    clientType: "codefree-o",
    clientVersion: "1.5.2"
  });
  assert.equal(transformed.value.headers["X-Cf-Token"], "token-fixture");
});

test("provider hook logs runtime-local fingerprints and limit decisions", async () => {
  const debugEvents = [];
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    discoverModelLimits: true,
    logger: {
      debug(message, metadata) {
        debugEvents.push([message, metadata]);
      }
    },
    logLevel: "debug",
    modelLimitsFetch: async () => ({
      ok: true,
      async json() {
        return {
          data: [{
            modelName: "GLM-5.1-ctyun-oc",
            maxTokens: 112000,
            maxOutputTokens: 16000
          }],
          optResult: 0
        };
      }
    }),
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });
  const transform = (content) => plugin.transformRequest({
    request: {
      body: {
        max_tokens: 32000,
        messages: [{ role: "user", content }],
        model: "srdcloud/GLM-5.1-ctyun-oc"
      }
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/chat/completions"
    }
  });

  await transform("private prompt alpha");
  await transform("private prompt alpha");
  await transform("private prompt beta");

  const metadata = debugEvents.map(([, value]) => value);
  assert.equal(metadata[0].incomingMaxTokens, 32000);
  assert.equal(metadata[0].outgoingMaxTokens, 16000);
  assert.equal(metadata[0].discoveredMaxInputTokens, 112000);
  assert.equal(metadata[0].discoveredMaxOutputTokens, 16000);
  assert.deepEqual(metadata[0].maxTokenLimitSources, ["discovered"]);
  assert.equal(metadata[0].modelLimitsCache, "miss");
  assert.equal(metadata[1].modelLimitsCache, "fresh");
  assert.match(metadata[0].requestFingerprint, /^[a-f0-9]{16}$/);
  assert.equal(metadata[0].requestFingerprint, metadata[1].requestFingerprint);
  assert.notEqual(metadata[1].requestFingerprint, metadata[2].requestFingerprint);
  assert.equal(JSON.stringify(metadata).includes("private prompt"), false);
  assert.equal(JSON.stringify(metadata).includes("secret-key"), false);
});

test("provider hook forwards without a fingerprint when key generation fails", async (t) => {
  const debugEvents = [];
  t.mock.method(crypto, "randomBytes", () => {
    throw new Error("entropy unavailable");
  });

  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logger: {
      debug(message, metadata) {
        debugEvents.push([message, metadata]);
      }
    },
    logLevel: "debug",
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });
  const transformed = await plugin.transformRequest({
    request: {
      body: {
        messages: [{ role: "user", content: "private prompt" }],
        model: "srdcloud/GLM-5.1"
      }
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/chat/completions"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.body.messages[0].content, "private prompt");
  assert.equal(debugEvents.length, 1);
  assert.equal(debugEvents[0][1].requestFingerprint, undefined);
  assert.equal(debugEvents[0][1].body.messageCount, 1);
});

test("provider hook skips fingerprint key generation outside debug logging", (t) => {
  let randomBytesCalls = 0;
  t.mock.method(crypto, "randomBytes", () => {
    randomBytesCalls += 1;
    throw new Error("entropy unavailable");
  });

  assert.doesNotThrow(() => createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logLevel: "warn",
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  }));
  assert.equal(randomBytesCalls, 0);
});

test("provider hook forwards when diagnostic serialization fails", async () => {
  const debugEvents = [];
  const cyclic = {};
  cyclic.self = cyclic;
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logger: {
      debug(message, metadata) {
        debugEvents.push([message, metadata]);
      }
    },
    logLevel: "debug",
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });
  const transformed = await plugin.transformRequest({
    request: {
      body: {
        messages: [{ role: "user", content: "private prompt" }],
        model: "srdcloud/GLM-5.1",
        diagnosticTrap: cyclic
      }
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/chat/completions"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.body.diagnosticTrap, cyclic);
  assert.equal(debugEvents.length, 1);
  assert.equal(debugEvents[0][1].body, undefined);
  assert.equal(debugEvents[0][1].requestFingerprint, undefined);
});

test("provider hook debug metadata excludes tool, system, and image content", async () => {
  const debugEvents = [];
  const sentinels = {
    image: "PRIVATE_IMAGE_SENTINEL_7f86",
    system: "PRIVATE_SYSTEM_SENTINEL_4c21",
    toolResult: "PRIVATE_TOOL_RESULT_SENTINEL_9a53"
  };
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logger: {
      debug(message, metadata) {
        debugEvents.push([message, metadata]);
      }
    },
    logLevel: "debug",
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });
  const transformed = await plugin.transformRequest({
    request: {
      body: {
        messages: [
          { role: "system", content: sentinels.system },
          {
            role: "user",
            content: [{
              type: "image",
              source: {
                type: "base64",
                media_type: "image/png",
                data: sentinels.image
              }
            }]
          },
          {
            role: "user",
            content: [{ type: "tool_result", content: sentinels.toolResult }]
          }
        ],
        model: "srdcloud/GLM-5.1",
        system: sentinels.system
      }
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/chat/completions"
    }
  });

  assert.equal(transformed.ok, true);
  const serializedMetadata = JSON.stringify(debugEvents);
  for (const sentinel of Object.values(sentinels)) {
    assert.equal(serializedMetadata.includes(sentinel), false);
  }
  assert.equal(debugEvents[0][1].body.hasImage, true);
  assert.equal(debugEvents[0][1].body.hasToolResult, false);
  assert.equal(debugEvents[0][1].body.systemType, "string");
});

function countedBody(counter) {
  return {
    max_tokens: 32000,
    messages: [{ role: "user", content: "private prompt" }],
    model: "srdcloud/GLM-5.1-ctyun-oc",
    toJSON() {
      counter.count += 1;
      return {
        max_tokens: this.max_tokens,
        messages: this.messages,
        model: this.model
      };
    }
  };
}

test("provider hook serializes diagnostics once only at debug level", async () => {
  const transform = (plugin, body) => plugin.transformRequest({
    request: { body },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/chat/completions"
    }
  });
  const debugCounter = { count: 0 };
  const debugPlugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logger: { debug() {} },
    logLevel: "debug",
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });
  await transform(debugPlugin, countedBody(debugCounter));
  assert.equal(debugCounter.count, 1);

  const warnCounter = { count: 0 };
  const warnPlugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logger: { warn() {} },
    logLevel: "warn",
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });
  await transform(warnPlugin, countedBody(warnCounter));
  assert.equal(warnCounter.count, 0);
});

test("provider hook applies configured caps during model discovery failure cooldown", async () => {
  let fetchCount = 0;
  const warnings = [];
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    discoverModelLimits: true,
    logger: {
      warn(message, metadata) {
        warnings.push([message, metadata]);
      }
    },
    logLevel: "warn",
    maxTokensCap: 12000,
    now: () => 0,
    modelLimitsFetch: async () => {
      fetchCount += 1;
      return { ok: false, status: 503, statusText: "Busy" };
    },
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });
  const args = {
    request: {
      body: {
        max_tokens: 32000,
        messages: [{ role: "user", content: "hello" }],
        model: "srdcloud/GLM-5.1-ctyun-oc"
      }
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/chat/completions"
    }
  };

  const first = await plugin.transformRequest(args);
  const second = await plugin.transformRequest(args);

  assert.equal(first.value.body.max_tokens, 12000);
  assert.equal(second.value.body.max_tokens, 12000);
  assert.equal(fetchCount, 1);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /model discovery failed/);
  assert.equal(warnings[0][1].retryAfterMs, 30000);
});

test("provider hook drops internal x-codefree-sub-service while preserving session affinity", async () => {
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    userId: "user-1"
  });

  const transformed = await plugin.transformRequest({
    request: {
      body: {
        messages: [{ role: "user", content: "hello" }],
        model: "srdcloud/GLM-5.1"
      }
    },
    targetProviderConfig: {},
    upstreamRequest: {
      body: {},
      headers: {
        "content-type": "application/json",
        "x-codefree-sub-service": "internal-route",
        "x-session-affinity": "session-from-ccr"
      },
      url: "https://old.example/v1/chat/completions"
    }
  });

  assert.equal(transformed.value.headers["x-codefree-sub-service"], undefined);
  assert.equal(transformed.value.headers.sessionId, "session-from-ccr");
  assert.equal(transformed.value.headers.subService, "codefree_o_chat");
});

test("provider hook routes embeddings without chat normalization", async () => {
  const plugin = createSRDCloudProviderPlugin({
    codefreeAuthFile: "/synthetic/private-auth.json",
    codefreeTokenAuth: modernAuthFixture(),
    credentials: null,
    providerName: "provider-srdcloud::openai_responses"
  });

  const transformed = await plugin.transformRequest({
    request: {
      body: {
        encoding_format: "float",
        input: ["hello"],
        model: "srdcloud/embedding-model"
      }
    },
    targetProviderConfig: {
      baseurl: "https://www.srdcloud.cn"
    },
    upstreamRequest: {
      body: {},
      headers: {},
      url: "https://old.example/v1/embeddings"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(
    transformed.value.url,
    "https://www.srdcloud.cn/api/aebackend/codefree-embedding-svc/v1/text-to-embedding-vector"
  );
  assert.deepEqual(transformed.value.body, {
    encoding_format: "float",
    input: ["hello"],
    model: "embedding-model"
  });
  assert.equal(transformed.value.headers.modelName, "embedding-model");
  assert.equal(transformed.value.headers["X-Cf-Token"], "token-fixture");
});

test("provider hook debug logging writes request metadata to a configured log file", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srdcloud-logs-"));
  const logFile = path.join(dir, "srdcloud-transformer.log");
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logger: {
      debug() {}
    },
    logFile,
    logLevel: "debug",
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });

  await plugin.transformRequest({
    request: {
      body: {
        messages: [
          {
            role: "user",
            content: [{ type: "tool_result", content: "hidden" }]
          }
        ],
        model: "srdcloud/GLM-5.1",
        stream: true,
        tools: [{ input_schema: { type: "object" }, name: "read_file" }]
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
  assert.equal(log.includes("secret-key"), false);
  assert.equal(log.includes("hidden"), false);
  assert.equal(log.includes('"hasToolResult":false'), true);
  assert.equal(log.includes('"toolCount":1'), true);
});

test("provider hook file logging rotates before appending past the size cap", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "srdcloud-logs-"));
  const logFile = path.join(dir, "srdcloud-transformer.log");
  fs.writeFileSync(logFile, `${"x".repeat(220)}\n`);
  fs.writeFileSync(`${logFile}.1`, `${"y".repeat(220)}\n`);

  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    logger: {
      debug() {}
    },
    logFile,
    logLevel: "debug",
    logMaxBytes: 256,
    logMaxFiles: 2,
    providerName: "provider-srdcloud::openai_responses",
    userId: "user-1"
  });

  await plugin.transformRequest({
    request: {
      body: {
        messages: [{ role: "user", content: "hidden" }],
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

  assert.equal(fs.readFileSync(`${logFile}.1`, "utf8"), `${"x".repeat(220)}\n`);
  assert.equal(fs.existsSync(`${logFile}.2`), false);
  const currentLog = fs.readFileSync(logFile, "utf8");
  assert.equal(currentLog.includes("[SRDCloudTransformer] provider hook transformed request"), true);
  assert.equal(currentLog.includes("secret-key"), false);
  assert.equal(currentLog.includes("hidden"), false);
});

test("transformResponseOut is a pass-through", async () => {
  const transformer = new SRDCloudTransformer({ skipVersionUpdate: true });
  const response = { ok: true };

  assert.equal(await transformer.transformResponseOut(response, {}), response);
});

test("provider hook sends CCR canonical Fusion tools instead of hosted web search", async () => {
  const plugin = createSRDCloudProviderPlugin({
    codefreeAuthFile: "/synthetic/private-auth.json",
    codefreeTokenAuth: modernAuthFixture(),
    credentials: null,
    providerName: "provider-srdcloud::openai_responses"
  });
  const transformed = await plugin.transformRequest({
    config: {
      providers: [{ name: "provider-srdcloud::openai_responses", type: "openai_responses" }],
      virtualModelProfiles: [{
        enabled: true,
        key: "fusion-search",
        match: { exactAliases: ["Fusion/search-model"], prefixes: [], suffixes: [] },
        execution: { matchWebSearch: true },
        metadata: { fusionWebSearch: { provider: "browser" } }
      }]
    },
    model: "GLM-5.1",
    request: {
      body: {
        model: "Fusion/search-model",
        messages: [{ role: "user", content: "search" }],
        tools: [{ type: "web_search_20250305", name: "web_search" }]
      }
    },
    sourceAdapterKey: "anthropic_messages",
    standardRequest: {
      model: "provider-srdcloud::openai_responses/GLM-5.1",
      instructions: "Use the internal search function.",
      input: [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "search" }]
      }],
      tools: [{
        type: "function",
        name: "search_model_web_search",
        input_schema: { type: "object", properties: { prompt: { type: "string" } } }
      }]
    },
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: { model: "GLM-5.1", input: "wrong" },
      headers: {},
      url: "https://old.example/v1/responses"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.body.model, "GLM-5.1");
  assert.equal(transformed.value.body.system, "Use the internal search function.");
  assert.equal(transformed.value.body.tools[0].function.name, "search_model_web_search");
  assert.equal(JSON.stringify(transformed.value.body).includes("web_search_20250305"), false);
  assert.equal(transformed.value.headers["X-Cf-Token"], "token-fixture");
});

test("provider hook keeps non-Fusion direct images on the original body path", async () => {
  const plugin = createSRDCloudProviderPlugin({
    codefreeAuthFile: "/synthetic/private-auth.json",
    codefreeTokenAuth: modernAuthFixture(),
    credentials: null
  });
  const transformed = await plugin.transformRequest({
    config: { virtualModelProfiles: [] },
    request: {
      body: {
        model: "srdcloud/Qwen3.5-122B-A10B",
        messages: [{
          role: "user",
          content: [{
            type: "image",
            source: { type: "base64", media_type: "image/png", data: "image-data" }
          }]
        }]
      }
    },
    sourceAdapterKey: "anthropic_messages",
    standardRequest: { model: "Qwen3.5-122B-A10B", input: [] },
    targetProviderConfig: {},
    upstreamRequest: {
      body: { model: "Qwen3.5-122B-A10B", input: [] },
      headers: {},
      url: "https://old.example/v1/responses"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.body.messages[0].content[0].type, "image_url");
  assert.equal(transformed.value.headers["X-Cf-Token"], "token-fixture");
});

test("Chat Completions compatibility hook preserves image_url requests", async () => {
  const plugin = createSRDCloudProviderPlugin({
    apiKey: "secret-key",
    credentials: null,
    providerName: "provider-srdcloud::openai_chat_completions",
    userId: "user-1"
  });
  const imageUrl = "data:image/png;base64,aW1hZ2UtZGF0YQ==";
  const transformed = await plugin.transformRequest({
    config: { virtualModelProfiles: [] },
    request: {
      body: {
        model: "srdcloud/Qwen3.5-122B-A10B",
        messages: [{
          role: "user",
          content: [{
            type: "image_url",
            image_url: { url: imageUrl }
          }]
        }]
      }
    },
    sourceAdapterKey: "openai_chat",
    targetProviderConfig: { baseurl: "https://www.srdcloud.cn" },
    upstreamRequest: {
      body: {},
      headers: { "content-type": "application/json" },
      url: "https://old.example/v1/chat/completions"
    }
  });

  assert.equal(transformed.ok, true);
  assert.equal(transformed.value.body.model, "Qwen3.5-122B-A10B");
  assert.deepEqual(transformed.value.body.messages[0].content[0], {
    type: "image_url",
    image_url: { url: imageUrl }
  });
  assert.equal(transformed.value.headers.apiKey, "secret-key");
  assert.equal(transformed.value.headers.userId, "user-1");
  assert.equal(
    transformed.value.url,
    "https://www.srdcloud.cn/api/acbackend/codechat/v1/completions"
  );
});

test("provider hook logs structural Fusion diagnostics without content", async () => {
  const events = [];
  const plugin = createSRDCloudProviderPlugin({
    credentials: null,
    logLevel: "debug",
    logger: {
      debug(message, metadata) {
        events.push([message, metadata]);
      },
      warn(message, metadata) {
        events.push([message, metadata]);
      }
    },
    userId: "user-1"
  });
  const privateEvidence = "PRIVATE_SEARCH_EVIDENCE";
  await plugin.transformRequest({
    config: {
      virtualModelProfiles: [{
        enabled: true,
        match: { exactAliases: ["Fusion/search"], prefixes: [], suffixes: [] },
        execution: { matchWebSearch: true },
        metadata: { fusionWebSearch: {} }
      }]
    },
    request: { body: { model: "Fusion/search", messages: [] } },
    sourceAdapterKey: "anthropic_messages",
    standardRequest: {
      model: "GLM",
      instructions: privateEvidence,
      input: [{
        type: "message",
        role: "user",
        content: [{ type: "input_text", text: "private" }]
      }],
      tools: []
    },
    targetProviderConfig: {},
    upstreamRequest: { body: {}, headers: {}, url: "https://old.example/v1/responses" }
  });

  const metadata = events.at(-1)[1];
  assert.equal(metadata.requestMode, "fusion-canonical");
  assert.equal(metadata.virtualProfileMatched, true);
  assert.equal(metadata.canonicalMessageCount, 1);
  assert.equal(metadata.canonicalToolCount, 0);
  assert.equal(metadata.hasFusionWebSearch, true);
  assert.equal(JSON.stringify(events).includes(privateEvidence), false);
  assert.equal(JSON.stringify(events).includes('"private"'), false);
});

test("provider hook warns and forwards on older Fusion hook contexts", async () => {
  const warnings = [];
  const plugin = createSRDCloudProviderPlugin({
    credentials: null,
    logger: {
      warn(message, metadata) {
        warnings.push([message, metadata]);
      }
    },
    logLevel: "warn",
    userId: "user-1"
  });
  const transformed = await plugin.transformRequest({
    config: {
      virtualModelProfiles: [{
        enabled: true,
        match: { exactAliases: ["Fusion/legacy"], prefixes: [], suffixes: [] }
      }]
    },
    request: {
      body: {
        model: "Fusion/legacy",
        messages: [{ role: "user", content: "hi" }]
      }
    },
    sourceAdapterKey: "anthropic_messages",
    targetProviderConfig: {},
    upstreamRequest: { body: {}, headers: {}, url: "https://old.example/v1/responses" }
  });

  assert.equal(transformed.ok, true);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0][0], /Fusion canonical request unavailable/);
  assert.deepEqual(warnings[0][1], {
    requestMode: "fusion-legacy-fallback",
    sourceAdapterKey: "anthropic_messages"
  });
});

test("provider hook honours structured and flattened Fusion follow-up policy", async () => {
  const config = {
    virtualModelProfiles: [{
      enabled: true,
      match: { exactAliases: ["Fusion/tool-loop"], prefixes: [], suffixes: [] }
    }]
  };
  const args = {
    config,
    request: { body: { model: "Fusion/tool-loop", messages: [] } },
    sourceAdapterKey: "anthropic_messages",
    standardRequest: {
      model: "GLM",
      input: [
        {
          type: "message",
          role: "assistant",
          content: [{ type: "tool_use", id: "call-1", name: "internal_lookup", input: {} }]
        },
        {
          type: "message",
          role: "user",
          content: [{ type: "tool_result", tool_use_id: "call-1", content: "lookup result" }]
        }
      ],
      tools: [{ type: "function", name: "internal_lookup", input_schema: { type: "object" } }]
    },
    targetProviderConfig: {},
    upstreamRequest: { body: {}, headers: {}, url: "https://old.example/v1/responses" }
  };
  const flattened = await createSRDCloudProviderPlugin({
    credentials: null,
    userId: "user-1"
  }).transformRequest(args);
  const structured = await createSRDCloudProviderPlugin({
    credentials: null,
    flattenToolMessages: false,
    userId: "user-1"
  }).transformRequest(args);

  assert.equal(JSON.stringify(flattened.value.body.messages).includes('"tool_use"'), false);
  assert.match(JSON.stringify(flattened.value.body.messages), /Completed internal operation/);
  assert.equal(structured.value.body.messages[0].content[0].type, "tool_use");
  assert.equal(structured.value.body.messages[1].content[0].type, "tool_result");
});

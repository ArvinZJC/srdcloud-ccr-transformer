"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  SRDCloudTransformer,
  createSRDCloudProviderPlugin,
  decryptApiKey,
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

test("transformRequestIn preserves the legacy SRD Cloud request contract", async () => {
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
    subService: "cli_chat",
    modelName: "body-model",
    clientType: "codefree-cli",
    clientVersion: "1.2.3"
  });
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

test("normalizeSRDCloudRequestBody can flatten historical tool blocks for SRDCloud compatibility", () => {
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

  const normalized = normalizeSRDCloudRequestBody(body, { flattenToolMessages: true });

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
          text: "Observation from previous internal operation:\nfile contents"
        }
      ]
    }
  ]);
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

test("createSRDCloudProviderPlugin exposes native CCR Desktop request adapter config", () => {
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
    clientType: "codefree-cli",
    clientVersion: "1.2.3",
    subService: "cli_chat",
    userId: "user-1",
    modelName: undefined
  });

  const transformed = plugin.transformRequest({
    request: {
      body: {
        model: "srdcloud/GLM-5.1",
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
  assert.equal(transformed.value.headers.modelName, "GLM-5.1");
});

test("provider hook debug logging writes request metadata to a configured log file", () => {
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

  plugin.transformRequest({
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
  assert.equal(log.includes('"hasToolResult":true'), true);
  assert.equal(log.includes('"toolCount":1'), true);
});

test("provider hook file logging rotates before appending past the size cap", () => {
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

  plugin.transformRequest({
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

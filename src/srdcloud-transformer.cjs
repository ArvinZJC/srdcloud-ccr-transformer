"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");

const { selectSRDCloudChatBody } = require("./ccr-fusion.cjs");
const { createCodeFreeTokenAuth } = require("./codefree-token-auth.cjs");

const DEFAULT_BASE_URL = "https://www.srdcloud.cn";
const DEFAULT_AUTH_HEADER = "Bearer codefree";
const DEFAULT_CLIENT_TYPE = "codefree-o";
const DEFAULT_CLIENT_VERSION = "1.6.0";
const DEFAULT_PACKAGE_NAME = "@srdcloud/codefree-o";
const DEFAULT_SUB_SERVICE = "codefree_o_chat";
const DEFAULT_USER_AGENT = `opencode/${DEFAULT_CLIENT_VERSION}`;
const ENDPOINT_PATH = "/api/acbackend/codechat/v1/completions";
const EMBEDDINGS_ENDPOINT_PATH = "/api/aebackend/codefree-embedding-svc/v1/text-to-embedding-vector";
const MODEL_MANAGER_PATH = "/api/acbackend/modelmgr/v1/clients/codefree-o/versions/";
const CREDENTIALS_PATH = path.join(os.homedir(), ".codefree-cli/oauth_creds.json");
const VERSION_CACHE_FILE = path.join(os.homedir(), ".codefree-cli/.version_cache.json");
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const MODEL_LIMITS_TTL_MS = 60 * 60 * 1000;
const MODEL_LIMITS_RETRY_BASE_MS = 30 * 1000;
const MODEL_LIMITS_RETRY_MAX_MS = 5 * 60 * 1000;

const AES_KEY = Buffer.from("Xtpa6sS&+D.NAo%CP8LA:7pk", "utf8");
const AES_IV = Buffer.from("%1KJIrl3!XUxr04V", "utf8");
const LOG_LEVELS = {
  silent: 0,
  error: 1,
  warn: 2,
  info: 3,
  debug: 4
};
const DEFAULT_LOG_MAX_BYTES = 5 * 1024 * 1024;
const DEFAULT_LOG_MAX_FILES = 3;

function decryptApiKey(encrypted) {
  const decipher = crypto.createDecipheriv("aes-192-cbc", AES_KEY, AES_IV);
  return decipher.update(encrypted, "base64", "utf8") + decipher.final("utf8");
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readCredentials(credentialsPath = CREDENTIALS_PATH) {
  if (!fs.existsSync(credentialsPath)) {
    return null;
  }

  const credentials = readJsonFile(credentialsPath);
  return {
    apiKey: credentials.apikey ? decryptApiKey(credentials.apikey) : credentials.apiKey || null,
    userId: credentials.id_token || credentials.userId || null
  };
}

function getCachedVersion(cacheFile = VERSION_CACHE_FILE, now = Date.now()) {
  try {
    if (!fs.existsSync(cacheFile)) {
      return null;
    }

    const cache = readJsonFile(cacheFile);
    if (typeof cache.version === "string" && now - Number(cache.timestamp) < VERSION_CACHE_TTL_MS) {
      return cache.version;
    }
  } catch {
    return null;
  }

  return null;
}

function setCachedVersion(version, cacheFile = VERSION_CACHE_FILE) {
  try {
    const directory = path.dirname(cacheFile);
    if (!fs.existsSync(directory)) {
      fs.mkdirSync(directory, { recursive: true });
    }

    fs.writeFileSync(cacheFile, JSON.stringify({ version, timestamp: Date.now() }));
  } catch {
    // Version caching is only an optimization.
  }
}

function getLatestVersion(packageName = DEFAULT_PACKAGE_NAME) {
  return new Promise((resolve, reject) => {
    const url = `https://registry.npmjs.org/${packageName.replace("/", "%2F")}`;
    https
      .get(url, (response) => {
        let body = "";
        response.on("data", (chunk) => {
          body += chunk;
        });
        response.on("end", () => {
          try {
            const metadata = JSON.parse(body);
            resolve(metadata["dist-tags"].latest);
          } catch (error) {
            reject(new Error(`Failed to parse npm response: ${error.message}`));
          }
        });
      })
      .on("error", (error) => {
        reject(new Error(`Failed to fetch from npm: ${error.message}`));
      });
  });
}

async function getLatestVersionWithCache(packageName, cacheFile) {
  const cached = getCachedVersion(cacheFile);
  if (cached) {
    return cached;
  }

  const latest = await getLatestVersion(packageName);
  setCachedVersion(latest, cacheFile);
  return latest;
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizeLogLevel(options = {}) {
  if (options.logging === false) {
    return "silent";
  }
  const level = typeof options.logLevel === "string" ? options.logLevel.toLowerCase() : "warn";
  return hasOwn(LOG_LEVELS, level) ? level : "warn";
}

function isLogLevelEnabled(options = {}, level) {
  const threshold = LOG_LEVELS[normalizeLogLevel(options)] ?? LOG_LEVELS.warn;
  return threshold >= (LOG_LEVELS[level] ?? Number.POSITIVE_INFINITY);
}

function createLevelLogger(logger = console, level = "warn") {
  const threshold = LOG_LEVELS[level] ?? LOG_LEVELS.warn;
  const controlled = {};
  for (const [name, priority] of Object.entries(LOG_LEVELS)) {
    if (name === "silent") {
      continue;
    }
    controlled[name] = (...args) => {
      if (threshold >= priority) {
        logger[name]?.(...args);
      }
    };
  }
  return controlled;
}

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parsePositiveInteger(value) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function rotateLogFile(filePath, maxFiles) {
  const backupCount = Math.max(0, maxFiles - 1);
  if (backupCount === 0) {
    fs.rmSync(filePath, { force: true });
    return;
  }

  fs.rmSync(`${filePath}.${backupCount}`, { force: true });
  for (let index = backupCount - 1; index >= 1; index -= 1) {
    const source = `${filePath}.${index}`;
    if (fs.existsSync(source)) {
      fs.renameSync(source, `${filePath}.${index + 1}`);
    }
  }
  if (fs.existsSync(filePath)) {
    fs.renameSync(filePath, `${filePath}.1`);
  }
}

function maybeRotateLogFile(filePath, nextLineBytes, options = {}) {
  const maxBytes = normalizePositiveInteger(options.logMaxBytes, DEFAULT_LOG_MAX_BYTES);
  const maxFiles = normalizePositiveInteger(options.logMaxFiles, DEFAULT_LOG_MAX_FILES);
  if (!fs.existsSync(filePath)) {
    return;
  }

  const currentBytes = fs.statSync(filePath).size;
  if (currentBytes + nextLineBytes > maxBytes) {
    rotateLogFile(filePath, maxFiles);
  }
}

function writeLogFileLine(filePath, level, message, metadata, options = {}) {
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const line = `${JSON.stringify({
      timestamp: new Date().toISOString(),
      level,
      message,
      ...(metadata === undefined ? {} : { metadata })
    })}\n`;
    maybeRotateLogFile(filePath, Buffer.byteLength(line), options);
    fs.appendFileSync(filePath, line);
  } catch {
    // File logging must not break request handling.
  }
}

function createFileLogger(filePath, options = {}) {
  const logger = {};
  for (const level of Object.keys(LOG_LEVELS)) {
    if (level === "silent") {
      continue;
    }
    logger[level] = (message, metadata) => writeLogFileLine(filePath, level, message, metadata, options);
  }
  return logger;
}

function createCompositeLogger(...loggers) {
  const logger = {};
  for (const level of Object.keys(LOG_LEVELS)) {
    if (level === "silent") {
      continue;
    }
    logger[level] = (...args) => {
      for (const candidate of loggers) {
        candidate?.[level]?.(...args);
      }
    };
  }
  return logger;
}

function createControlledLogger(options = {}) {
  const baseLogger = options.logger || console;
  const loggers = [baseLogger];
  if (options.logToFile !== false && typeof options.logFile === "string" && options.logFile.trim()) {
    loggers.push(createFileLogger(options.logFile.trim(), options));
  }
  return createLevelLogger(createCompositeLogger(...loggers), normalizeLogLevel(options));
}

function stripProviderPrefix(model) {
  if (typeof model !== "string") {
    return model;
  }
  const trimmed = model.trim();
  if (!trimmed) {
    return model;
  }
  const slash = trimmed.lastIndexOf("/");
  if (slash > 0 && slash < trimmed.length - 1) {
    return trimmed.slice(slash + 1);
  }
  return trimmed;
}

function normalizeToolDefinition(tool) {
  if (!isRecord(tool)) {
    return tool;
  }
  if (isRecord(tool.function) && tool.type === "function") {
    return tool;
  }

  const name = typeof tool.name === "string" ? tool.name : undefined;
  const parameters = isRecord(tool.input_schema)
    ? tool.input_schema
    : isRecord(tool.inputSchema)
      ? tool.inputSchema
      : undefined;
  if (!name || !parameters) {
    return tool;
  }

  return {
    type: "function",
    function: {
      name,
      ...(typeof tool.description === "string" ? { description: tool.description } : {}),
      parameters
    }
  };
}

function normalizeImageBlock(block) {
  if (!isRecord(block) || block.type !== "image" || !isRecord(block.source)) {
    return block;
  }

  const source = block.source;
  if (source.type === "base64" && typeof source.media_type === "string" && typeof source.data === "string") {
    return {
      type: "image_url",
      image_url: {
        url: `data:${source.media_type};base64,${source.data}`
      }
    };
  }

  if (source.type === "url" && typeof source.url === "string") {
    return {
      type: "image_url",
      image_url: {
        url: source.url
      }
    };
  }

  return block;
}

function normalizeMessageContentBlocks(messages) {
  if (!Array.isArray(messages)) {
    return messages;
  }

  return messages.map((message) => {
    if (!isRecord(message) || !Array.isArray(message.content)) {
      return message;
    }

    return {
      ...message,
      content: message.content.map(normalizeImageBlock)
    };
  });
}

function contentHasImageBlock(content) {
  if (!Array.isArray(content)) {
    return false;
  }
  return content.some((block) => isRecord(block) && (
    block.type === "image" ||
    block.type === "image_url" ||
    block.type === "input_image"
  ));
}

function messagesHaveImageContent(messages) {
  return Array.isArray(messages) && messages.some((message) => (
    isRecord(message) && contentHasImageBlock(message.content)
  ));
}

function moveSystemMessagesToFrontForImages(messages) {
  if (!messagesHaveImageContent(messages)) {
    return messages;
  }

  const systemMessages = [];
  const otherMessages = [];
  for (const message of messages) {
    if (isRecord(message) && message.role === "system") {
      systemMessages.push(message);
    } else {
      otherMessages.push(message);
    }
  }
  if (systemMessages.length === 0) {
    return messages;
  }
  return [...systemMessages, ...otherMessages];
}

function stringifyJson(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function blockTextContent(content) {
  if (typeof content === "string") {
    return sanitizeLiteralToolTranscripts(content);
  }
  if (Array.isArray(content)) {
    return content.map((item) => {
      if (typeof item === "string") {
        return sanitizeLiteralToolTranscripts(item);
      }
      if (isRecord(item) && typeof item.text === "string") {
        return sanitizeLiteralToolTranscripts(item.text);
      }
      return stringifyJson(item);
    }).join("\n");
  }
  if (content === undefined || content === null) {
    return "";
  }
  return stringifyJson(content);
}

function sanitizeLiteralToolTranscripts(text) {
  if (typeof text !== "string" || !text) {
    return text;
  }
  return text
    .replace(
      /(?:\n?Historical assistant tool request\n(?:id: [^\n]*\n)?(?:name: [^\n]*\n)?input: [^\n]*(?=\n|$))/g,
      ""
    )
    .replace(
      /Historical tool result\n(?:id: [^\n]*\n)?content:\n/g,
      "Observation from previous internal operation:\n"
    )
    .replace(/\[tool_use\s+id=([^\]\s]+)(?:\s+name=([^\]]+))?\](?:\s*\n\s*\{[^\n]*\})?/g, "")
    .replace(/\[tool_result\s+id=([^\]]+)\]/g, "Observation from previous internal operation:");
}

function operationParameters(input) {
  const serialized = stringifyJson(input);
  const maxCharacters = 2048;
  if (serialized.length <= maxCharacters) {
    return serialized;
  }
  return `${serialized.slice(0, maxCharacters)}… [truncated from ${serialized.length} characters]`;
}

function completedOperationText(block, operation) {
  const result = blockTextContent(block.content);
  if (!operation) {
    return [
      "Observation from previous internal operation:",
      result
    ].filter((line) => line !== "").join("\n");
  }

  return [
    `Completed internal operation ${stringifyJson(operation.name)}.`,
    `Parameters: ${operationParameters(operation.input)}`,
    `Outcome: ${block.is_error === true ? "failed" : "succeeded"}`,
    ...(result === "" ? [] : ["Result:", result])
  ].join("\n");
}

function flattenToolBlock(block, operations) {
  if (!isRecord(block) || typeof block.type !== "string") {
    if (isRecord(block) && typeof block.text === "string") {
      return {
        ...block,
        text: sanitizeLiteralToolTranscripts(block.text)
      };
    }
    return block;
  }

  if (block.type === "tool_use") {
    if (typeof block.id === "string" && block.id) {
      operations.set(block.id, {
        input: block.input === undefined ? {} : block.input,
        name: typeof block.name === "string" && block.name ? block.name : "unknown"
      });
    }
    return null;
  }

  if (block.type === "tool_result") {
    const operation = typeof block.tool_use_id === "string"
      ? operations.get(block.tool_use_id)
      : undefined;
    if (typeof block.tool_use_id === "string") {
      operations.delete(block.tool_use_id);
    }
    return {
      type: "text",
      text: completedOperationText(block, operation)
    };
  }

  if (typeof block.text === "string") {
    return {
      ...block,
      text: sanitizeLiteralToolTranscripts(block.text)
    };
  }
  return block;
}

function flattenHistoricalToolMessages(messages) {
  if (!Array.isArray(messages)) {
    return messages;
  }
  const operations = new Map();
  return messages.map((message) => {
    if (!isRecord(message)) {
      return message;
    }
    if (typeof message.content === "string") {
      return {
        ...message,
        content: sanitizeLiteralToolTranscripts(message.content)
      };
    }
    if (!Array.isArray(message.content)) {
      return message;
    }
    const content = message.content
      .map((block) => flattenToolBlock(block, operations))
      .filter((block) => block !== null);
    if (content.length === 0) {
      return null;
    }
    return {
      ...message,
      content
    };
  }).filter((message) => message !== null);
}

function normalizeSRDCloudRequestBody(body, options = {}) {
  if (!isRecord(body)) {
    return body;
  }

  const normalized = { ...body };
  if (typeof normalized.model === "string") {
    normalized.model = stripProviderPrefix(normalized.model);
  }
  if (typeof normalized.modelName === "string") {
    normalized.modelName = stripProviderPrefix(normalized.modelName);
  }
  if (Array.isArray(normalized.tools)) {
    normalized.tools = normalized.tools.map(normalizeToolDefinition);
  }
  normalized.messages = normalizeMessageContentBlocks(normalized.messages);
  normalized.messages = moveSystemMessagesToFrontForImages(normalized.messages);
  if (options.flattenToolMessages !== false) {
    normalized.messages = flattenHistoricalToolMessages(normalized.messages);
  }
  return normalized;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

function providerBaseUrl(providerConfig = {}) {
  return firstString(
    providerConfig.baseurl,
    providerConfig.baseUrl,
    providerConfig.api_base_url,
    providerConfig.apiBaseUrl
  ) || DEFAULT_BASE_URL;
}

function providerApiKey(providerConfig = {}) {
  return firstString(providerConfig.apikey, providerConfig.apiKey, providerConfig.api_key);
}

function headerValue(headers = {}, name) {
  if (!headers || typeof headers !== "object") {
    return undefined;
  }
  if (typeof headers.get === "function") {
    return headers.get(name) || undefined;
  }
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowerName) {
      return value;
    }
  }
  return undefined;
}

function forwardedRequestHeaders(headers = {}) {
  if (!headers || typeof headers !== "object") {
    return {};
  }
  const forwarded = {};
  const assign = (key, value) => {
    if (key.toLowerCase() !== "x-codefree-sub-service") {
      forwarded[key] = value;
    }
  };
  if (typeof headers.forEach === "function") {
    headers.forEach((value, key) => assign(key, value));
    return forwarded;
  }
  for (const [key, value] of Object.entries(headers)) {
    assign(key, value);
  }
  return forwarded;
}

function srdCloudSessionId(options = {}, existingHeaders = {}) {
  return firstString(
    options.sessionId,
    headerValue(existingHeaders, "x-session-affinity"),
    headerValue(existingHeaders, "X-Session-Id")
  );
}

function srdCloudBaseHeaders(options, modelName, existingHeaders = {}) {
  const sessionId = srdCloudSessionId(options, existingHeaders);
  return {
    ...forwardedRequestHeaders(existingHeaders),
    Accept: "application/json",
    "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
    subService: options.subService || DEFAULT_SUB_SERVICE,
    modelName,
    clientType: options.clientType || DEFAULT_CLIENT_TYPE,
    clientVersion: options.clientVersion || DEFAULT_CLIENT_VERSION,
    ...(sessionId ? { sessionId } : {})
  };
}

function srdCloudLegacyHeaders(options, providerConfig, modelName, existingHeaders = {}) {
  const baseHeaders = srdCloudBaseHeaders(options, modelName, existingHeaders);
  return {
    ...baseHeaders,
    apiKey: options.apiKey || providerApiKey(providerConfig),
    authorization: options.authHeader || DEFAULT_AUTH_HEADER,
    userId: options.userId || null
  };
}

function endpointKindFromUrl(url) {
  try {
    const pathname = new URL(url).pathname;
    if (pathname.endsWith("/embeddings")) {
      return "embeddings";
    }
  } catch {
    return "chat";
  }
  return "chat";
}

function normalizeEmbeddingRequestBody(body) {
  if (!isRecord(body)) {
    return body;
  }
  const normalized = { ...body };
  if (typeof normalized.model === "string") {
    normalized.model = stripProviderPrefix(normalized.model);
  }
  return normalized;
}

function modelManagerUrl(baseUrl = DEFAULT_BASE_URL, clientVersion = DEFAULT_CLIENT_VERSION) {
  return new URL(`${MODEL_MANAGER_PATH}${encodeURIComponent(clientVersion)}`, baseUrl).toString();
}

async function fetchJson(url, init, fetchImpl) {
  const requestFetch = fetchImpl || globalThis.fetch;
  if (typeof requestFetch !== "function") {
    throw new Error("No fetch implementation available for SRDCloud model discovery");
  }
  const response = await requestFetch(url, init);
  if (!response.ok) {
    throw new Error(`CodeFree model discovery failed: ${response.status} ${response.statusText || ""}`.trim());
  }
  return response.json();
}

async function discoverModelLimits(options = {}) {
  const clientVersion = options.clientVersion || DEFAULT_CLIENT_VERSION;
  const url = modelManagerUrl(options.baseUrl || DEFAULT_BASE_URL, clientVersion);
  const modern = typeof options.authenticatedFetch === "function";
  const response = await fetchJson(
    url,
    {
      method: "GET",
      headers: modern ? {
        clientType: options.clientType || DEFAULT_CLIENT_TYPE,
        clientVersion
      } : {
        apiKey: options.apiKey,
        clientType: options.clientType || DEFAULT_CLIENT_TYPE,
        clientVersion,
        userId: options.userId
      }
    },
    modern ? options.authenticatedFetch : options.fetch
  );
  if (response.optResult !== 0) {
    throw new Error(`CodeFree model discovery failed: ${response.msg || response.optResult}`);
  }

  const limits = {};
  for (const item of Array.isArray(response.data) ? response.data : []) {
    if (!isRecord(item) || typeof item.modelName !== "string") {
      continue;
    }
    const maxTokens = parsePositiveInteger(item.maxTokens) || 80000;
    const maxOutputTokens = parsePositiveInteger(item.maxOutputTokens) || 8000;
    limits[item.modelName] = { maxOutputTokens, maxTokens };
  }
  return limits;
}

function createModelLimitsCache(options = {}) {
  let cached = null;
  let cachedAt = 0;
  let consecutiveFailures = 0;
  let inFlight = null;
  let nextRetryAt = 0;
  const discover = options.discover || discoverModelLimits;
  const now = typeof options.now === "function" ? options.now : Date.now;
  const ttlMs = normalizePositiveInteger(options.modelLimitsTtlMs, MODEL_LIMITS_TTL_MS);

  function startDiscovery(discoveryOptions) {
    const promise = (async () => {
      try {
        const limits = await discover(discoveryOptions);
        cached = limits;
        cachedAt = now();
        consecutiveFailures = 0;
        nextRetryAt = 0;
        return { limits, ok: true };
      } catch (error) {
        consecutiveFailures += 1;
        const retryAfterMs = Math.min(
          MODEL_LIMITS_RETRY_BASE_MS * (2 ** (consecutiveFailures - 1)),
          MODEL_LIMITS_RETRY_MAX_MS
        );
        nextRetryAt = now() + retryAfterMs;
        return { error, limits: {}, ok: false, retryAfterMs };
      }
    })();
    inFlight = promise;
    promise.finally(() => {
      if (inFlight === promise) {
        inFlight = null;
      }
    });
    return promise;
  }

  return {
    async get(discoveryOptions) {
      const currentTime = now();
      if (cached && currentTime - cachedAt < ttlMs) {
        return { limits: cached, state: "fresh" };
      }

      const shared = Boolean(inFlight);
      if (!shared && currentTime < nextRetryAt) {
        return { limits: {}, state: "backoff" };
      }

      const result = await (inFlight || startDiscovery(discoveryOptions));
      if (result.ok) {
        return { limits: result.limits, state: shared ? "shared" : "miss" };
      }
      return {
        ...(shared ? {} : { error: result.error, retryAfterMs: result.retryAfterMs }),
        limits: {},
        state: shared ? "shared-failed" : "failed"
      };
    }
  };
}

function configuredModelLimit(options = {}, modelName) {
  if (!modelName || !isRecord(options.modelMaxOutputTokens)) {
    return undefined;
  }
  return parsePositiveInteger(options.modelMaxOutputTokens[modelName]);
}

function maxTokenDecision(body, modelName, options = {}, discoveredLimits = {}) {
  if (!isRecord(body) || !hasOwn(body, "max_tokens")) {
    return {
      body,
      incomingMaxTokens: undefined,
      maxTokenLimitSources: [],
      outgoingMaxTokens: undefined
    };
  }
  const incomingMaxTokens = parsePositiveInteger(body.max_tokens);
  const candidates = [
    ["incoming", incomingMaxTokens],
    ["maxTokensCap", parsePositiveInteger(options.maxTokensCap)],
    ["modelOverride", configuredModelLimit(options, modelName)],
    ["discovered", parsePositiveInteger(discoveredLimits?.[modelName]?.maxOutputTokens)]
  ].filter(([, value]) => value !== undefined);
  if (candidates.length === 0) {
    return {
      body,
      incomingMaxTokens,
      maxTokenLimitSources: [],
      outgoingMaxTokens: undefined
    };
  }
  const outgoingMaxTokens = Math.min(...candidates.map(([, value]) => value));
  return {
    body: { ...body, max_tokens: outgoingMaxTokens },
    incomingMaxTokens,
    maxTokenLimitSources: candidates
      .filter(([, value]) => value === outgoingMaxTokens)
      .map(([source]) => source),
    outgoingMaxTokens
  };
}

function clampMaxTokens(body, modelName, options = {}, discoveredLimits = {}) {
  return maxTokenDecision(body, modelName, options, discoveredLimits).body;
}

function contentBlockTypes(content) {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.map((block) => isRecord(block) && typeof block.type === "string" ? block.type : typeof block);
}

function bodyMetadata(body, serializedBody) {
  if (!isRecord(body)) {
    return { bodyType: typeof body };
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const messageRoles = messages.map((message) => isRecord(message) ? message.role : undefined);
  const contentTypes = messages.flatMap((message) => isRecord(message) ? contentBlockTypes(message.content) : []);

  return {
    bodySizeBytes: Buffer.byteLength(serializedBody),
    hasAssistantToolUse: contentTypes.includes("tool_use"),
    hasCacheControl: serializedBody.includes('"cache_control"'),
    hasImage: contentTypes.includes("image") || contentTypes.includes("image_url") || contentTypes.includes("input_image"),
    hasToolResult: contentTypes.includes("tool_result"),
    messageCount: messages.length,
    messageRoles,
    model: typeof body.model === "string" ? body.model : undefined,
    maxTokens: parsePositiveInteger(body.max_tokens),
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
    systemType: Array.isArray(body.system) ? "array" : typeof body.system,
    toolCount: Array.isArray(body.tools) ? body.tools.length : 0
  };
}

function createSRDCloudProviderPlugin(options = {}) {
  const modernConfigured = typeof options.codefreeAuthFile === "string" &&
    Boolean(options.codefreeAuthFile.trim());
  const credentials = modernConfigured
    ? null
    : hasOwn(options, "credentials")
      ? options.credentials
      : readCredentials(options.credentialsPath);
  const pluginOptions = {
    ...options,
    apiKey: options.apiKey || credentials?.apiKey || null,
    userId: options.userId || credentials?.userId || null
  };
  const logger = createControlledLogger(options);
  const tokenAuth = modernConfigured
    ? options.codefreeTokenAuth || createCodeFreeTokenAuth({
      authFilePath: options.codefreeAuthFile,
      fetch: options.tokenAuthFetch,
      fs: options.tokenAuthFs,
      getuid: options.tokenAuthGetuid,
      logger,
      nonce: options.tokenAuthNonce,
      now: options.tokenAuthNow,
      randomBytes: options.tokenAuthRandomBytes
    })
    : null;
  const modelLimitsCache = createModelLimitsCache(options);
  const debugEnabled = isLogLevelEnabled(options, "debug");
  let legacyWarningEmitted = false;
  let fingerprintKey;
  if (debugEnabled) {
    try {
      fingerprintKey = crypto.randomBytes(32);
    } catch {
      // Fingerprinting is diagnostic-only and must not block requests.
    }
  }

  function authModeFor(targetProviderConfig) {
    if (tokenAuth) {
      return "token";
    }
    return pluginOptions.apiKey || providerApiKey(targetProviderConfig)
      ? "legacy"
      : "missing";
  }

  function warnLegacyAuth() {
    if (legacyWarningEmitted) {
      return;
    }
    legacyWarningEmitted = true;
    logger.warn(
      "[SRDCloudTransformer] API-key authentication is deprecated; configure CodeFree token authentication."
    );
  }

  async function loadModelLimits(targetProviderConfig) {
    if (pluginOptions.discoverModelLimits !== true) {
      return { limits: {}, state: "disabled" };
    }
    const authMode = authModeFor(targetProviderConfig);
    if (
      authMode === "missing" ||
      (authMode === "legacy" && !pluginOptions.userId)
    ) {
      return { limits: {}, state: "disabled" };
    }

    const result = await modelLimitsCache.get({
      ...(authMode === "token"
        ? { authenticatedFetch: tokenAuth.authenticatedFetch }
        : {
          apiKey: pluginOptions.apiKey || providerApiKey(targetProviderConfig),
          fetch: pluginOptions.modelLimitsFetch,
          userId: pluginOptions.userId
        }),
      baseUrl: providerBaseUrl(targetProviderConfig),
      clientType: pluginOptions.clientType || DEFAULT_CLIENT_TYPE,
      clientVersion: pluginOptions.clientVersion || DEFAULT_CLIENT_VERSION
    });
    if (result.state === "failed") {
      logger.warn("[SRDCloudTransformer] model discovery failed", {
        message: result.error.message,
        retryAfterMs: result.retryAfterMs
      });
    }
    return { limits: result.limits, state: result.state };
  }

  return {
    key: options.key || "srdcloud-target-adapter",
    ...(options.providerName ? { providerName: options.providerName } : { provider: options.provider || "openai" }),
    authenticate({ targetProviderConfig, upstreamRequest }) {
      const authMode = authModeFor(targetProviderConfig);
      if (authMode === "missing") {
        return {
          error: "SRDCloud authentication is not configured.",
          ok: false
        };
      }
      if (authMode === "token") {
        return {
          ok: true,
          value: upstreamRequest
        };
      }
      warnLegacyAuth();
      return {
        ok: true,
        value: {
          ...upstreamRequest,
          headers: srdCloudLegacyHeaders(
            pluginOptions,
            targetProviderConfig,
            undefined,
            upstreamRequest.headers
          )
        }
      };
    },
    async transformRequest({
      config,
      model,
      request,
      sourceAdapterKey,
      standardRequest,
      targetProviderConfig,
      upstreamRequest
    }) {
      const requestBody = isRecord(request?.body) ? request.body : upstreamRequest.body;
      const endpointKind = endpointKindFromUrl(upstreamRequest.url);
      const baseUrl = providerBaseUrl(targetProviderConfig);
      const selected = endpointKind === "chat"
        ? selectSRDCloudChatBody({
          config,
          requestBody,
          sourceAdapterKey,
          standardRequest,
          upstreamBody: upstreamRequest.body
        })
        : {
          ok: true,
          body: requestBody,
          diagnostics: {
            requestMode: "direct",
            virtualProfileMatched: false,
            ...(typeof sourceAdapterKey === "string" ? { sourceAdapterKey } : {})
          }
        };
      if (!selected.ok) {
        return selected;
      }
      if (selected.diagnostics.requestMode === "fusion-legacy-fallback") {
        logger.warn("[SRDCloudTransformer] Fusion canonical request unavailable", {
          requestMode: selected.diagnostics.requestMode,
          ...(selected.diagnostics.sourceAdapterKey
            ? { sourceAdapterKey: selected.diagnostics.sourceAdapterKey }
            : {})
        });
      }
      const body = endpointKind === "embeddings"
        ? normalizeEmbeddingRequestBody(selected.body)
        : normalizeSRDCloudRequestBody(selected.body, {
          flattenToolMessages: pluginOptions.flattenToolMessages !== false
        });
      const modelName = pluginOptions.modelName ||
        (isRecord(body) ? body.model || body.modelName : undefined) ||
        model ||
        (isRecord(upstreamRequest.body) ? upstreamRequest.body.model || upstreamRequest.body.modelName : undefined);
      const modelLimits = endpointKind === "chat"
        ? await loadModelLimits(targetProviderConfig)
        : { limits: {}, state: "disabled" };
      const limitDecision = endpointKind === "chat"
        ? maxTokenDecision(body, modelName, pluginOptions, modelLimits.limits)
        : {
          body,
          incomingMaxTokens: undefined,
          maxTokenLimitSources: [],
          outgoingMaxTokens: undefined
        };
      const transformedBody = limitDecision.body;
      const endpointPath = endpointKind === "embeddings" ? EMBEDDINGS_ENDPOINT_PATH : ENDPOINT_PATH;
      const url = new URL(endpointPath, baseUrl).toString();
      const authMode = authModeFor(targetProviderConfig);
      if (debugEnabled) {
        const discoveredModelLimits = modelLimits.limits?.[modelName] || {};
        let body;
        let requestFingerprint;
        try {
          const serializedBody = JSON.stringify(transformedBody);
          body = bodyMetadata(transformedBody, serializedBody);
          if (fingerprintKey) {
            requestFingerprint = crypto
              .createHmac("sha256", fingerprintKey)
              .update(serializedBody)
              .digest("hex")
              .slice(0, 16);
          }
        } catch {
          // Diagnostic serialization must not break request handling.
        }
        logger.debug("[SRDCloudTransformer] provider hook transformed request", {
          ...(body === undefined ? {} : { body }),
          discoveredMaxInputTokens: parsePositiveInteger(discoveredModelLimits.maxTokens),
          discoveredMaxOutputTokens: parsePositiveInteger(discoveredModelLimits.maxOutputTokens),
          authMode,
          endpointKind,
          hasApiKey: Boolean(pluginOptions.apiKey || providerApiKey(targetProviderConfig)),
          hasUserId: Boolean(pluginOptions.userId),
          incomingMaxTokens: limitDecision.incomingMaxTokens,
          maxTokenLimitSources: limitDecision.maxTokenLimitSources,
          modelLimitsCache: modelLimits.state,
          modelName,
          outgoingMaxTokens: limitDecision.outgoingMaxTokens,
          ...(requestFingerprint === undefined ? {} : { requestFingerprint }),
          ...selected.diagnostics,
          url
        });
      }
      const baseHeaders = srdCloudBaseHeaders(
        pluginOptions,
        modelName,
        upstreamRequest.headers
      );
      let headers = baseHeaders;
      if (authMode === "token") {
        headers = await tokenAuth.applyHeaders({ method: "POST", headers: baseHeaders });
      } else if (authMode === "legacy") {
        headers = srdCloudLegacyHeaders(
          pluginOptions,
          targetProviderConfig,
          modelName,
          upstreamRequest.headers
        );
      }
      return {
        ok: true,
        value: {
          ...upstreamRequest,
          body: transformedBody,
          bodyEncoding: "json",
          method: "POST",
          url,
          headers
        }
      };
    }
  };
}

class SRDCloudTransformer {
  constructor(options = {}) {
    this.logLevel = normalizeLogLevel(options);
    this.logger = createControlledLogger(options);
    const modernConfigured = typeof options.codefreeAuthFile === "string" &&
      Boolean(options.codefreeAuthFile.trim());
    const credentials = modernConfigured
      ? null
      : hasOwn(options, "credentials")
        ? options.credentials
        : readCredentials(options.credentialsPath);
    this.tokenAuth = modernConfigured
      ? options.codefreeTokenAuth || createCodeFreeTokenAuth({
        authFilePath: options.codefreeAuthFile,
        fetch: options.tokenAuthFetch,
        fs: options.tokenAuthFs,
        getuid: options.tokenAuthGetuid,
        logger: this.logger,
        nonce: options.tokenAuthNonce,
        now: options.tokenAuthNow,
        randomBytes: options.tokenAuthRandomBytes
      })
      : null;

    this.name = "srdcloud";
    this.endPoint = ENDPOINT_PATH;
    this.userId = options.userId || credentials?.userId || null;
    this.apiKey = this.tokenAuth ? null : options.apiKey || credentials?.apiKey || null;
    this.authHeader = options.authHeader || DEFAULT_AUTH_HEADER;
    this.clientType = options.clientType || DEFAULT_CLIENT_TYPE;
    this.clientVersion = options.clientVersion || DEFAULT_CLIENT_VERSION;
    this.subService = options.subService || DEFAULT_SUB_SERVICE;
    this.sessionId = options.sessionId;
    this._versionUpdatePromise = options.skipVersionUpdate
      ? null
      : this._updateClientVersion(options.versionPackageName || DEFAULT_PACKAGE_NAME, options.cacheFile);
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.modelName = options.modelName;

    if (!this.tokenAuth && !this.userId) {
      this.logger.warn?.(
        '[SRDCloudTransformer] Warning: userId not found. Please run "cfh" to generate credentials, or provide them via options.'
      );
    }
  }

  async _updateClientVersion(packageName = DEFAULT_PACKAGE_NAME, cacheFile = VERSION_CACHE_FILE) {
    try {
      this.clientVersion = await getLatestVersionWithCache(packageName, cacheFile);
    } catch (error) {
      this.logger.warn?.(
        `[SRDCloudTransformer] Warning: Failed to fetch latest version: ${error.message}. Using fallback version.`
      );
      this.clientVersion = DEFAULT_CLIENT_VERSION;
    }
  }

  async _ensureVersionUpdated() {
    if (this._versionUpdatePromise) {
      await this._versionUpdatePromise;
      this._versionUpdatePromise = null;
    }
  }

  async transformRequestIn(body, requestConfig = {}) {
    await this._ensureVersionUpdated();

    const apiKey = this.tokenAuth
      ? undefined
      : hasOwn(requestConfig, "apiKey")
        ? requestConfig.apiKey
        : this.apiKey;
    const modelName = this.modelName || body.model || body.modelName;
    const url = new URL(this.endPoint, requestConfig.baseUrl || DEFAULT_BASE_URL);
    this.logger.debug?.("[SRDCloudTransformer] request transformed", {
      authMode: this.tokenAuth ? "token" : "legacy",
      hasApiKey: Boolean(apiKey),
      hasUserId: Boolean(this.userId),
      modelName,
      url: String(url)
    });

    const legacyHeaders = {
      Accept: "application/json",
      "User-Agent": this.userAgent,
      apiKey,
      authorization: this.authHeader,
      userId: this.userId,
      subService: this.subService,
      modelName,
      clientType: this.clientType,
      clientVersion: this.clientVersion,
      ...(this.sessionId ? { sessionId: this.sessionId } : {})
    };
    const headers = this.tokenAuth
      ? await this.tokenAuth.applyHeaders({
        method: "POST",
        headers: srdCloudBaseHeaders(this, modelName)
      })
      : legacyHeaders;

    return {
      body,
      config: {
        url,
        headers
      }
    };
  }

  async transformResponseOut(response) {
    return response;
  }
}

module.exports = {
  CREDENTIALS_PATH,
  DEFAULT_AUTH_HEADER,
  DEFAULT_BASE_URL,
  DEFAULT_CLIENT_TYPE,
  DEFAULT_CLIENT_VERSION,
  DEFAULT_LOG_MAX_BYTES,
  DEFAULT_LOG_MAX_FILES,
  DEFAULT_PACKAGE_NAME,
  DEFAULT_SUB_SERVICE,
  DEFAULT_USER_AGENT,
  EMBEDDINGS_ENDPOINT_PATH,
  ENDPOINT_PATH,
  MODEL_LIMITS_TTL_MS,
  MODEL_MANAGER_PATH,
  SRDCloudTransformer,
  VERSION_CACHE_FILE,
  createLevelLogger,
  createModelLimitsCache,
  createSRDCloudProviderPlugin,
  createControlledLogger,
  decryptApiKey,
  discoverModelLimits,
  getCachedVersion,
  getLatestVersion,
  getLatestVersionWithCache,
  normalizeSRDCloudRequestBody,
  readCredentials,
  setCachedVersion,
  stripProviderPrefix
};

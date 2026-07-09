"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const https = require("node:https");
const os = require("node:os");
const path = require("node:path");

const DEFAULT_BASE_URL = "https://www.srdcloud.cn";
const DEFAULT_AUTH_HEADER = "Bearer codefree";
const DEFAULT_CLIENT_VERSION = "0.3.6";
const DEFAULT_PACKAGE_NAME = "@srdcloud/codefree-cli";
const DEFAULT_USER_AGENT = "OpenAI/JS 5.11.0";
const ENDPOINT_PATH = "/api/acbackend/codechat/v1/completions";
const CREDENTIALS_PATH = path.join(os.homedir(), ".codefree-cli/oauth_creds.json");
const VERSION_CACHE_FILE = path.join(os.homedir(), ".codefree-cli/.version_cache.json");
const VERSION_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

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

function flattenToolBlock(block) {
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
    return null;
  }

  if (block.type === "tool_result") {
    return {
      type: "text",
      text: [
        "Observation from previous internal operation:",
        blockTextContent(block.content)
      ].filter((line) => line !== "").join("\n")
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
    const content = message.content.map(flattenToolBlock).filter((block) => block !== null);
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
  if (options.flattenToolMessages) {
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

function srdCloudHeaders(options, providerConfig, modelName, existingHeaders = {}) {
  return {
    ...existingHeaders,
    Accept: "application/json",
    "User-Agent": options.userAgent || DEFAULT_USER_AGENT,
    apiKey: options.apiKey || providerApiKey(providerConfig),
    authorization: options.authHeader || DEFAULT_AUTH_HEADER,
    userId: options.userId || null,
    subService: "cli_chat",
    modelName,
    clientType: "codefree-cli",
    clientVersion: options.clientVersion || DEFAULT_CLIENT_VERSION
  };
}

function contentBlockTypes(content) {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.map((block) => isRecord(block) && typeof block.type === "string" ? block.type : typeof block);
}

function bodyMetadata(body) {
  if (!isRecord(body)) {
    return { bodyType: typeof body };
  }

  const messages = Array.isArray(body.messages) ? body.messages : [];
  const messageRoles = messages.map((message) => isRecord(message) ? message.role : undefined);
  const contentTypes = messages.flatMap((message) => isRecord(message) ? contentBlockTypes(message.content) : []);

  return {
    bodySizeBytes: Buffer.byteLength(JSON.stringify(body)),
    hasAssistantToolUse: contentTypes.includes("tool_use"),
    hasCacheControl: JSON.stringify(body).includes('"cache_control"'),
    hasImage: contentTypes.includes("image") || contentTypes.includes("image_url") || contentTypes.includes("input_image"),
    hasToolResult: contentTypes.includes("tool_result"),
    messageCount: messages.length,
    messageRoles,
    model: typeof body.model === "string" ? body.model : undefined,
    stream: typeof body.stream === "boolean" ? body.stream : undefined,
    systemType: Array.isArray(body.system) ? "array" : typeof body.system,
    toolCount: Array.isArray(body.tools) ? body.tools.length : 0
  };
}

function createSRDCloudProviderPlugin(options = {}) {
  const credentials = hasOwn(options, "credentials")
    ? options.credentials
    : readCredentials(options.credentialsPath);
  const pluginOptions = {
    ...options,
    apiKey: options.apiKey || credentials?.apiKey || null,
    userId: options.userId || credentials?.userId || null
  };
  const logger = createControlledLogger(options);

  return {
    key: options.key || "srdcloud-target-adapter",
    ...(options.providerName ? { providerName: options.providerName } : { provider: options.provider || "openai" }),
    authenticate({ targetProviderConfig, upstreamRequest }) {
      return {
        ok: true,
        value: {
          ...upstreamRequest,
          headers: srdCloudHeaders(pluginOptions, targetProviderConfig, undefined, upstreamRequest.headers)
        }
      };
    },
    transformRequest({ request, targetProviderConfig, upstreamRequest }) {
      const sourceBody = isRecord(request?.body) ? request.body : upstreamRequest.body;
      const body = normalizeSRDCloudRequestBody(sourceBody, {
        flattenToolMessages: pluginOptions.flattenToolMessages === true
      });
      const modelName = pluginOptions.modelName ||
        (isRecord(body) ? body.model || body.modelName : undefined) ||
        (isRecord(upstreamRequest.body) ? upstreamRequest.body.model || upstreamRequest.body.modelName : undefined);
      const url = new URL(ENDPOINT_PATH, providerBaseUrl(targetProviderConfig)).toString();
      logger.debug("[SRDCloudTransformer] provider hook transformed request", {
        body: bodyMetadata(body),
        hasApiKey: Boolean(pluginOptions.apiKey || providerApiKey(targetProviderConfig)),
        hasUserId: Boolean(pluginOptions.userId),
        modelName,
        url
      });
      return {
        ok: true,
        value: {
          ...upstreamRequest,
          body,
          bodyEncoding: "json",
          method: "POST",
          url,
          headers: srdCloudHeaders(pluginOptions, targetProviderConfig, modelName, upstreamRequest.headers)
        }
      };
    }
  };
}

class SRDCloudTransformer {
  constructor(options = {}) {
    this.logLevel = normalizeLogLevel(options);
    this.logger = createControlledLogger(options);
    const credentials = hasOwn(options, "credentials")
      ? options.credentials
      : readCredentials(options.credentialsPath);

    this.name = "srdcloud";
    this.endPoint = ENDPOINT_PATH;
    this.userId = options.userId || credentials?.userId || null;
    this.apiKey = options.apiKey || credentials?.apiKey || null;
    this.authHeader = options.authHeader || DEFAULT_AUTH_HEADER;
    this.clientVersion = options.clientVersion || DEFAULT_CLIENT_VERSION;
    this._versionUpdatePromise = options.skipVersionUpdate
      ? null
      : this._updateClientVersion(options.versionPackageName || DEFAULT_PACKAGE_NAME, options.cacheFile);
    this.userAgent = options.userAgent || DEFAULT_USER_AGENT;
    this.modelName = options.modelName;

    if (!this.userId) {
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

    const apiKey = hasOwn(requestConfig, "apiKey") ? requestConfig.apiKey : this.apiKey;
    const modelName = this.modelName || body.model || body.modelName;
    const url = new URL(this.endPoint, requestConfig.baseUrl || DEFAULT_BASE_URL);
    this.logger.debug?.("[SRDCloudTransformer] request transformed", {
      hasApiKey: Boolean(apiKey),
      hasUserId: Boolean(this.userId),
      modelName,
      url: String(url)
    });

    return {
      body,
      config: {
        url,
        headers: {
          Accept: "application/json",
          "User-Agent": this.userAgent,
          apiKey,
          authorization: this.authHeader,
          userId: this.userId,
          subService: "cli_chat",
          modelName,
          clientType: "codefree-cli",
          clientVersion: this.clientVersion
        }
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
  DEFAULT_CLIENT_VERSION,
  DEFAULT_LOG_MAX_BYTES,
  DEFAULT_LOG_MAX_FILES,
  DEFAULT_PACKAGE_NAME,
  DEFAULT_USER_AGENT,
  ENDPOINT_PATH,
  SRDCloudTransformer,
  VERSION_CACHE_FILE,
  createLevelLogger,
  createSRDCloudProviderPlugin,
  createControlledLogger,
  decryptApiKey,
  getCachedVersion,
  getLatestVersion,
  getLatestVersionWithCache,
  normalizeSRDCloudRequestBody,
  readCredentials,
  setCachedVersion,
  stripProviderPrefix
};

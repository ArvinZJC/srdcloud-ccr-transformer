"use strict";

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value) {
  return Array.isArray(value)
    ? value.filter((item) => typeof item === "string" && item.length > 0)
    : [];
}

function providerMatchesHint(provider, hint) {
  if (!isRecord(provider)) {
    return false;
  }
  return [provider.name, provider.type, provider.provider]
    .some((value) => typeof value === "string" && value === hint);
}

function parseModelReference(value, config = {}) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }
  const raw = value.trim();
  const slash = raw.indexOf("/");
  if (slash <= 0 || slash >= raw.length - 1) {
    return { model: raw, raw };
  }
  const providerHint = raw.slice(0, slash).trim();
  const model = raw.slice(slash + 1).trim();
  const providers = Array.isArray(config.providers) ? config.providers : [];
  return providers.some((provider) => providerMatchesHint(provider, providerHint))
    ? { model, raw }
    : { model: raw, raw };
}

function enabledProfiles(config = {}) {
  return (Array.isArray(config.virtualModelProfiles) ? config.virtualModelProfiles : [])
    .filter((profile) => isRecord(profile) && profile.enabled !== false && isRecord(profile.match));
}

function profileTokens(profile, field) {
  return stringList(profile.match[field]);
}

function buildMatch(profile, matchedBy, matchedToken) {
  return { matchedBy, matchedToken, profile };
}

function longestTokenMatch(profiles, field, model, matchedBy, predicate) {
  const matches = profiles.flatMap((profile) => profileTokens(profile, field)
    .filter((token) => predicate(model, token))
    .map((token) => buildMatch(profile, matchedBy, token)));
  matches.sort((left, right) => right.matchedToken.length - left.matchedToken.length);
  return matches[0] || null;
}

function matchVirtualModelProfile(model, config = {}) {
  const reference = parseModelReference(model, config);
  if (!reference) {
    return null;
  }
  const profiles = enabledProfiles(config);
  for (const profile of profiles) {
    for (const alias of profileTokens(profile, "exactAliases")) {
      if (alias === reference.raw || alias === reference.model) {
        return buildMatch(profile, "exact", alias);
      }
    }
  }
  const suffix = longestTokenMatch(
    profiles,
    "suffixes",
    reference.model,
    "suffix",
    (value, token) => value.endsWith(token) && value.length > token.length
  );
  if (suffix) {
    return suffix;
  }
  return longestTokenMatch(
    profiles,
    "prefixes",
    reference.model,
    "prefix",
    (value, token) => value.startsWith(token) && value.length > token.length
  );
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function anthropicReasoningSignature(item) {
  if (!Array.isArray(item.reasoning_details)) {
    return undefined;
  }
  const detail = item.reasoning_details.find((candidate) =>
    isRecord(candidate) &&
    candidate.format === "anthropic-claude-v1" &&
    typeof candidate.signature === "string" &&
    candidate.signature.length > 0
  );
  return detail?.signature;
}

function canonicalReasoningBlocks(item) {
  const blocks = [];
  const thinking = [item.text, item.summary]
    .filter((value) => typeof value === "string" && value.length > 0)
    .join("\n");
  if (thinking) {
    const signature = anthropicReasoningSignature(item);
    blocks.push({
      type: "thinking",
      thinking,
      ...(signature ? { signature } : {})
    });
  }
  if (typeof item.encrypted_content === "string" && item.encrypted_content) {
    blocks.push({ type: "redacted_thinking", data: item.encrypted_content });
  }
  return blocks;
}

function safeTextSerialization(value) {
  try {
    const serialized = JSON.stringify(value);
    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
    // Fall through to a non-throwing string representation.
  }
  try {
    return String(value);
  } catch {
    return "";
  }
}

function canonicalToolResultContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (content === null || content === undefined) {
    return "";
  }
  if (!Array.isArray(content)) {
    return safeTextSerialization(content);
  }
  return content.map((item) => {
    if (typeof item === "string") {
      return item;
    }
    if (
      isRecord(item) &&
      ["text", "input_text", "output_text"].includes(item.type) &&
      typeof item.text === "string"
    ) {
      return item.text;
    }
    return item === null || item === undefined ? "" : safeTextSerialization(item);
  }).join("\n");
}

function canonicalContentBlocks(content) {
  if (!Array.isArray(content)) {
    return [];
  }
  return content.flatMap((item) => {
    if (!isRecord(item)) {
      return [];
    }
    if (item.type === "input_text" && typeof item.text === "string") {
      return [{ type: "text", text: item.text }];
    }
    if (
      item.type === "tool_use" &&
      typeof item.id === "string" &&
      typeof item.name === "string"
    ) {
      return [{
        type: "tool_use",
        id: item.id,
        name: item.name,
        input: item.input ?? {},
        ...(typeof item.thought_signature === "string"
          ? { thought_signature: item.thought_signature }
          : {})
      }];
    }
    if (item.type === "tool_result" && typeof item.tool_use_id === "string") {
      return [{
        type: "tool_result",
        tool_use_id: item.tool_use_id,
        content: canonicalToolResultContent(item.content),
        ...(item.is_error === true ? { is_error: true } : {})
      }];
    }
    if (item.type === "reasoning") {
      return canonicalReasoningBlocks(item);
    }
    return [];
  });
}

function canonicalMessages(input) {
  if (typeof input === "string") {
    return input.length > 0
      ? [{ role: "user", content: [{ type: "text", text: input }] }]
      : [];
  }
  if (!Array.isArray(input)) {
    return [];
  }
  return input.flatMap((message) => {
    if (
      !isRecord(message) ||
      (message.role !== "user" && message.role !== "assistant")
    ) {
      return [];
    }
    const content = canonicalContentBlocks(message.content);
    return content.length > 0 ? [{ role: message.role, content }] : [];
  });
}

function setOrDelete(target, key, value) {
  if (value === undefined) {
    delete target[key];
  } else {
    target[key] = value;
  }
}

function buildAnthropicBodyFromStandardRequest(requestBody, standardRequest) {
  if (!isRecord(requestBody) || !isRecord(standardRequest) || !hasOwn(standardRequest, "input")) {
    throw new TypeError("CCR Fusion canonical request is malformed.");
  }
  if (typeof standardRequest.model !== "string" || !standardRequest.model.trim()) {
    throw new TypeError("CCR Fusion canonical request requires a resolved base model.");
  }
  const messages = canonicalMessages(standardRequest.input);
  const instructions = typeof standardRequest.instructions === "string"
    ? standardRequest.instructions
    : undefined;
  if (messages.length === 0 && !instructions) {
    throw new TypeError("CCR Fusion canonical request requires non-empty input or instructions.");
  }
  const body = { ...requestBody, messages };
  delete body.input;
  delete body.instructions;
  delete body.max_output_tokens;
  delete body.stop;
  setOrDelete(body, "model", standardRequest.model);
  setOrDelete(body, "system", instructions);
  setOrDelete(
    body,
    "tools",
    Array.isArray(standardRequest.tools) && standardRequest.tools.length > 0
      ? standardRequest.tools
      : undefined
  );
  setOrDelete(body, "tool_choice", standardRequest.tool_choice);
  setOrDelete(body, "temperature", standardRequest.temperature);
  setOrDelete(body, "top_p", standardRequest.top_p);
  setOrDelete(body, "max_tokens", standardRequest.max_output_tokens);
  setOrDelete(body, "stop_sequences", standardRequest.stop);
  setOrDelete(body, "stream", standardRequest.stream);
  setOrDelete(body, "reasoning_split", standardRequest.reasoning_split);
  setOrDelete(body, "reasoning", standardRequest.reasoning);
  setOrDelete(body, "thinking", standardRequest.thinking);
  setOrDelete(body, "output_config", standardRequest.output_config);
  return body;
}

function firstString(...values) {
  return values.find((value) => typeof value === "string" && value.trim())?.trim();
}

function canonicalMessageCount(standardRequest) {
  if (typeof standardRequest?.input === "string") {
    return standardRequest.input.length > 0 ? 1 : 0;
  }
  return Array.isArray(standardRequest?.input)
    ? standardRequest.input.filter((message) => isRecord(message)).length
    : 0;
}

function canonicalHasToolResult(standardRequest) {
  return Array.isArray(standardRequest?.input) && standardRequest.input.some((message) =>
    isRecord(message) && Array.isArray(message.content) && message.content.some((item) =>
      isRecord(item) && item.type === "tool_result"
    )
  );
}

function fusionDiagnostics(requestMode, match, standardRequest, sourceAdapterKey) {
  const execution = isRecord(match?.profile?.execution) ? match.profile.execution : {};
  const metadata = isRecord(match?.profile?.metadata) ? match.profile.metadata : {};
  return {
    requestMode,
    virtualProfileMatched: Boolean(match),
    ...(typeof sourceAdapterKey === "string" ? { sourceAdapterKey } : {}),
    ...(isRecord(standardRequest)
      ? {
          canonicalMessageCount: canonicalMessageCount(standardRequest),
          canonicalToolCount: Array.isArray(standardRequest.tools) ? standardRequest.tools.length : 0,
          hasCanonicalToolResult: canonicalHasToolResult(standardRequest)
        }
      : {}),
    hasFusionVision: execution.matchMultimodal === true || isRecord(metadata.fusionVision),
    hasFusionWebSearch: execution.matchWebSearch === true || isRecord(metadata.fusionWebSearch)
  };
}

function selectSRDCloudChatBody({
  config = {},
  requestBody,
  sourceAdapterKey,
  standardRequest,
  upstreamBody
} = {}) {
  const match = matchVirtualModelProfile(
    firstString(requestBody?.model, requestBody?.modelName),
    config
  );
  if (!match) {
    return {
      ok: true,
      body: requestBody,
      diagnostics: fusionDiagnostics("direct", null, undefined, sourceAdapterKey)
    };
  }
  if (!isRecord(standardRequest) || !hasOwn(standardRequest, "input")) {
    return {
      ok: true,
      body: requestBody,
      diagnostics: fusionDiagnostics(
        "fusion-legacy-fallback",
        match,
        undefined,
        sourceAdapterKey
      )
    };
  }
  try {
    const body = sourceAdapterKey === "anthropic_messages"
      ? buildAnthropicBodyFromStandardRequest(requestBody, standardRequest)
      : upstreamBody;
    if (!isRecord(body)) {
      throw new TypeError("CCR Fusion upstream request body is malformed.");
    }
    return {
      ok: true,
      body,
      diagnostics: fusionDiagnostics(
        "fusion-canonical",
        match,
        standardRequest,
        sourceAdapterKey
      )
    };
  } catch {
    return {
      ok: false,
      error: "CCR Fusion canonical request could not be projected for SRDCloud."
    };
  }
}

module.exports = {
  buildAnthropicBodyFromStandardRequest,
  matchVirtualModelProfile,
  selectSRDCloudChatBody
};

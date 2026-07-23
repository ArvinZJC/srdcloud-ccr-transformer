"use strict";

const IDENTIFIER = "[A-Za-z_$][\\w$]*";
const SEMANTIC_PROFILE_ID = "codefree-token-auth-v1";
const MAX_AUTH_REGION_BYTES = 96 * 1024;
const REGION_ANCHOR = 'grant_type:"refresh_x_cf_token"';

function extractionError(code, label) {
  const error = new Error(
    code === "EXTRACTION_AMBIGUOUS"
      ? `CodeFree-O authentication evidence is ambiguous (${label}).`
      : `This CodeFree-O build does not match the required authentication contract (${label}).`
  );
  error.code = code;
  return error;
}

function escapeIdentifier(identifier) {
  return identifier.replace(/[$]/g, "\\$&");
}

function uniqueMatch(text, pattern, label, captureIndex = 1) {
  const matches = [...text.matchAll(pattern)];
  if (matches.length > 1) {
    throw extractionError("EXTRACTION_AMBIGUOUS", label);
  }
  if (matches.length !== 1 || !matches[0][captureIndex]) {
    throw extractionError("SEMANTIC_CONTRACT", label);
  }
  return matches[0];
}

function anchorPositions(text) {
  const positions = [];
  let index = text.indexOf(REGION_ANCHOR);
  while (index >= 0) {
    positions.push(index);
    index = text.indexOf(REGION_ANCHOR, index + REGION_ANCHOR.length);
  }
  return positions;
}

function candidateRegions(binaryText) {
  const positions = anchorPositions(binaryText);
  const cipherAnchor = '"aes-256-gcm"';
  const headerAnchor = "X-Cf-Signature";
  const regions = [];
  for (const position of positions) {
    const cipher = binaryText.lastIndexOf(cipherAnchor, position);
    const header = binaryText.indexOf(headerAnchor, position);
    if (
      cipher < 0 ||
      header < 0 ||
      position - cipher > MAX_AUTH_REGION_BYTES ||
      header - position > MAX_AUTH_REGION_BYTES
    ) {
      continue;
    }
    const previousHeader = binaryText.lastIndexOf(headerAnchor, cipher);
    const start = Math.max(
      0,
      cipher - 16 * 1024,
      previousHeader < 0 ? 0 : previousHeader + headerAnchor.length
    );
    const nextCryptoModule = binaryText.indexOf(
      "createCipheriv as",
      header + headerAnchor.length
    );
    const end = Math.min(
      binaryText.length,
      header + headerAnchor.length + 8 * 1024,
      nextCryptoModule < 0 ? binaryText.length : nextCryptoModule
    );
    regions.push(binaryText.slice(start, end));
  }
  return regions;
}

function requireText(region, text, label) {
  if (!region.includes(text)) {
    throw extractionError("SEMANTIC_CONTRACT", label);
  }
}

function extractRefreshMaterial(region) {
  const derivePattern = new RegExp(
    `function\\s+(${IDENTIFIER})\\(\\)\\{return\\s+` +
      `(?:${IDENTIFIER}\\.)?(${IDENTIFIER})\\("sha256"\\)` +
      `\\.update\\((${IDENTIFIER})\\)\\.digest\\(\\)\\}`,
    "g"
  );
  const derive = uniqueMatch(region, derivePattern, "refresh key derivation");
  const deriveFunction = derive[1];
  const refreshVariable = derive[3];
  const assignment = uniqueMatch(
    region,
    new RegExp(`${escapeIdentifier(refreshVariable)}="([^"]+)"`, "g"),
    "refresh encryption material"
  );
  const cipherUse = new RegExp(
    `"aes-256-gcm",${escapeIdentifier(deriveFunction)}\\(\\)`,
    "g"
  );
  if ([...region.matchAll(cipherUse)].length !== 2) {
    throw extractionError("SEMANTIC_CONTRACT", "AES-256-GCM encryption");
  }
  requireText(region, ".getAuthTag()", "AES-GCM authentication tag");
  requireText(region, ".setAuthTag(", "AES-GCM authentication tag");
  return assignment[1];
}

function extractSigningMaterial(region) {
  const hmac = uniqueMatch(
    region,
    new RegExp(
      `(${IDENTIFIER})\\("sha256",Buffer\\.from\\((${IDENTIFIER})\\(\\),"base64"\\)\\)` +
        `\\.update\\((${IDENTIFIER})\\)\\.digest\\("base64"\\)`,
      "g"
    ),
    "HMAC-SHA-256 signing"
  );
  const accessor = hmac[2];
  const canonicalVariable = hmac[3];
  const accessorDefinition = uniqueMatch(
    region,
    new RegExp(
      `function\\s+${escapeIdentifier(accessor)}\\(\\)\\{return"([A-Za-z0-9+/=]+)"\\}`,
      "g"
    ),
    "request signing material"
  );
  const normalized = region.split("`\n`").join('"\\n"');
  const canonical = uniqueMatch(
    normalized,
    new RegExp(
      `(${IDENTIFIER})=\\[(${IDENTIFIER})\\.method\\.toUpperCase\\(\\),` +
        `\\2\\.appId,(${IDENTIFIER}),(${IDENTIFIER})\\]\\.join\\("\\\\n"\\)`,
      "g"
    ),
    "signature canonical input"
  );
  if (canonical[1] !== canonicalVariable) {
    throw extractionError("SEMANTIC_CONTRACT", "signature canonical input");
  }
  return accessorDefinition[1];
}

function environmentSelectors(region) {
  const pattern = new RegExp(
    `function\\s+(${IDENTIFIER})\\((${IDENTIFIER})\\)\\{` +
      `([^{}]{0,400}?)if\\(\\2\\.includes\\("dev"\\)\\)return"[^"]+";` +
      `if\\(\\2\\.includes\\("test"\\)\\)return"[^"]+";return"([^"]+)"\\}`,
    "g"
  );
  return [...region.matchAll(pattern)].map((match) => ({
    functionName: match[1],
    productionValue: match[4]
  }));
}

function extractClientMaterial(region) {
  const selectors = environmentSelectors(region);
  let secretSelector;
  if (region.includes('"client_secret"')) {
    const secretUse = uniqueMatch(
      region,
      new RegExp(
        `(?:^|[;,])(?:let |const |var )?(${IDENTIFIER})=(${IDENTIFIER})\\([^)]*\\);` +
          `if\\(\\1\\)${IDENTIFIER}\\.set\\("client_secret",\\1\\)`,
        "g"
      ),
      "refresh client secret use",
      2
    );
    const secretSelectors = selectors.filter((selector) =>
      selector.functionName === secretUse[2]
    );
    if (secretSelectors.length !== 1) {
      throw extractionError(
        secretSelectors.length > 1 ? "EXTRACTION_AMBIGUOUS" : "SEMANTIC_CONTRACT",
        "refresh client secret"
      );
    }
    [secretSelector] = secretSelectors;
  }
  const clientSelectors = selectors.filter((selector) =>
    selector !== secretSelector
  );
  if (clientSelectors.length !== 1) {
    throw extractionError(
      clientSelectors.length > 1 ? "EXTRACTION_AMBIGUOUS" : "SEMANTIC_CONTRACT",
      "refresh client identifier"
    );
  }
  requireText(region, "client_id:", "refresh client identifier");
  requireText(region, "x_cf_refresh_token:", "refresh credential");
  return {
    clientId: clientSelectors[0].productionValue,
    ...(secretSelector
      ? { clientSecret: secretSelector.productionValue }
      : {})
  };
}

function validateRefreshAndExpiry(region) {
  requireText(region, 'Accept:"application/json"', "refresh response negotiation");
  requireText(region, '.headers.get("content-type")', "refresh response content type");
  requireText(region, '.includes("json")', "JSON refresh response");
  requireText(region, "new URLSearchParams(await ", "form refresh response");
  requireText(region, "Object.fromEntries(", "form refresh response");
  uniqueMatch(
    region,
    new RegExp(
      `client_id:(${IDENTIFIER})\\.clientId,` +
        `x_cf_refresh_token:\\1\\.refreshCfToken`,
      "g"
    ),
    "refresh credential relationship"
  );
  for (const field of [
    "cfToken",
    "expiresIn",
    "refreshCfToken",
    "refreshCfTokenExpiresIn",
    "cfTokenExpiresAt",
    "refreshCfTokenExpiresAt",
    "userId",
    "clientId"
  ]) {
    requireText(region, field, `refresh ${field}`);
  }

  const expiry = uniqueMatch(
    region,
    new RegExp(
      `function\\s+(${IDENTIFIER})\\((${IDENTIFIER})\\)\\{` +
        `return Date\\.now\\(\\)\\+\\2\\*1000\\}`,
      "g"
    ),
    "token expiry conversion"
  );
  const expiryFunction = escapeIdentifier(expiry[1]);
  if (
    !new RegExp(`${expiryFunction}\\(${IDENTIFIER}\\.expiresIn\\)`).test(region) ||
    !new RegExp(
      `${expiryFunction}\\(${IDENTIFIER}\\.refreshCfTokenExpiresIn\\)`
    ).test(region)
  ) {
    throw extractionError("SEMANTIC_CONTRACT", "token expiry projection");
  }

  const rotation = uniqueMatch(
    region,
    new RegExp(
      `(${IDENTIFIER})=(?:${IDENTIFIER}\\()?\\{` +
        `cfToken:(${IDENTIFIER})\\.cfToken,` +
        `cfTokenExpiresAt:${expiryFunction}\\(\\2\\.expiresIn\\),` +
        `refreshCfToken:\\2\\.refreshCfToken,` +
        `refreshCfTokenExpiresAt:${expiryFunction}` +
        `\\(\\2\\.refreshCfTokenExpiresIn\\)`,
      "g"
    ),
    "refresh rotation projection"
  );
  if (!new RegExp(
    `await ${IDENTIFIER}\\(${escapeIdentifier(rotation[1])}\\)`
  ).test(region)) {
    throw extractionError("SEMANTIC_CONTRACT", "refresh rotation persistence");
  }

  const skew = uniqueMatch(
    region,
    new RegExp(`(${IDENTIFIER})=60000`, "g"),
    "token refresh skew"
  );
  if (!new RegExp(
    `\\.cfTokenExpiresAt-Date\\.now\\(\\)>${escapeIdentifier(skew[1])}`
  ).test(region)) {
    throw extractionError("SEMANTIC_CONTRACT", "token refresh skew");
  }
}

function validateHeaders(region) {
  for (const header of [
    "X-Cf-Token",
    "userId",
    "projectId",
    "X-Cf-AppId",
    "X-Cf-Timestamp",
    "X-Cf-Nonce",
    "X-Cf-Signature"
  ]) {
    requireText(region, header, `signed header ${header}`);
  }
  const tokenProjection = new RegExp(
    `(?:\\.set\\("X-Cf-Token",${IDENTIFIER}\\.cfToken\\)|` +
      `"X-Cf-Token":${IDENTIFIER}\\.cfToken)`
  );
  const userProjection = new RegExp(
    `(?:\\.set\\("userId",${IDENTIFIER}\\.userId\\)|` +
      `"?userId"?:${IDENTIFIER}\\.userId)`
  );
  const projectProjection =
    /(?:\.set\("projectId","0"\)|"?projectId"?:"0")/;
  if (
    !tokenProjection.test(region) ||
    !userProjection.test(region) ||
    !projectProjection.test(region)
  ) {
    throw extractionError("SEMANTIC_CONTRACT", "token identity headers");
  }
}

function validateRegion(region) {
  requireText(region, REGION_ANCHOR, "refresh grant");
  const refreshEncryptionKey = extractRefreshMaterial(region);
  const signingSecret = extractSigningMaterial(region);
  const client = extractClientMaterial(region);
  validateRefreshAndExpiry(region);
  validateHeaders(region);
  return {
    clientId: client.clientId,
    ...(client.clientSecret ? { clientSecret: client.clientSecret } : {}),
    refreshEncryptionKey,
    signingSecret
  };
}

function validateAndExtractCodeFreeAuthMaterial(binaryText, semanticProfile) {
  if (
    semanticProfile?.id !== SEMANTIC_PROFILE_ID ||
    typeof binaryText !== "string"
  ) {
    throw extractionError("SEMANTIC_CONTRACT", "semantic profile");
  }

  const regions = candidateRegions(binaryText);
  const matches = [];
  let firstError;
  for (const region of regions) {
    try {
      matches.push(validateRegion(region));
    } catch (error) {
      firstError ||= error;
    }
  }
  if (matches.length > 1) {
    throw extractionError("EXTRACTION_AMBIGUOUS", "authentication region");
  }
  if (matches.length !== 1) {
    throw firstError || extractionError("SEMANTIC_CONTRACT", "authentication region");
  }
  return matches[0];
}

module.exports = {
  validateAndExtractCodeFreeAuthMaterial
};

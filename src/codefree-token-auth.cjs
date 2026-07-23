"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const AUTH_FILE_SCHEMA_VERSION = 2;
const TOKEN_REFRESH_SKEW_MS = 60_000;
const TOKEN_ENDPOINT_PATH = "/api/usercenterbackend/oauth/access_token";

class CodeFreeAuthError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "CodeFreeAuthError";
    this.code = code;
  }
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readPrivateRegularFile(filePath, options = {}) {
  const fileSystem = options.fs || fs;
  const getuid = options.getuid || (typeof process.getuid === "function" ? () => process.getuid() : null);
  let stat;
  try {
    stat = fileSystem.lstatSync(filePath);
  } catch {
    throw new CodeFreeAuthError(options.readCode, options.readMessage);
  }
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new CodeFreeAuthError(options.typeCode, options.typeMessage);
  }
  if (getuid && stat.uid !== getuid()) {
    throw new CodeFreeAuthError(options.ownerCode, options.ownerMessage);
  }
  if ((stat.mode & 0o077) !== 0) {
    throw new CodeFreeAuthError(options.permissionsCode, options.permissionsMessage);
  }
  try {
    return fileSystem.readFileSync(filePath);
  } catch {
    throw new CodeFreeAuthError(options.readCode, options.readMessage);
  }
}

function isBase64(value) {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return false;
  }
  return Buffer.from(value, "base64").toString("base64") === value;
}

function validateAuthConfig(value) {
  const source = value && typeof value.source === "object" ? value.source : {};
  const config = {
    schemaVersion: value?.schemaVersion,
    source: {
      binarySha256: nonEmptyString(source.binarySha256),
      codefreeVersion: nonEmptyString(source.codefreeVersion),
      semanticProfile: nonEmptyString(source.semanticProfile),
      verificationMode: nonEmptyString(source.verificationMode)
    },
    baseUrl: nonEmptyString(value?.baseUrl),
    clientId: nonEmptyString(value?.clientId),
    ...(nonEmptyString(value?.clientSecret) ? { clientSecret: nonEmptyString(value.clientSecret) } : {}),
    credentialFile: nonEmptyString(value?.credentialFile),
    refreshEncryptionKey: nonEmptyString(value?.refreshEncryptionKey),
    signingSecret: nonEmptyString(value?.signingSecret)
  };
  const required = [
    config.source.binarySha256,
    config.source.codefreeVersion,
    config.source.semanticProfile,
    config.source.verificationMode,
    config.baseUrl,
    config.clientId,
    config.credentialFile,
    config.refreshEncryptionKey,
    config.signingSecret
  ];
  if (
    config.schemaVersion !== AUTH_FILE_SCHEMA_VERSION ||
    required.some((item) => !item) ||
    !/^[a-f0-9]{64}$/i.test(config.source.binarySha256) ||
    config.source.semanticProfile !== "codefree-token-auth-v1" ||
    !["known-artifact", "semantic-contract"].includes(
      config.source.verificationMode
    ) ||
    !isBase64(config.signingSecret)
  ) {
    throw new CodeFreeAuthError("AUTH_FILE_SCHEMA", "CodeFree token authentication setup is invalid.");
  }
  try {
    new URL(config.baseUrl);
  } catch {
    throw new CodeFreeAuthError("AUTH_FILE_SCHEMA", "CodeFree token authentication setup is invalid.");
  }
  return config;
}

function loadCodeFreeAuthFile(filePath, dependencies = {}) {
  const content = readPrivateRegularFile(filePath, {
    ...dependencies,
    ownerCode: "AUTH_FILE_OWNER",
    ownerMessage: "CodeFree token authentication setup has an invalid owner.",
    permissionsCode: "AUTH_FILE_PERMISSIONS",
    permissionsMessage: "CodeFree token authentication setup must be owner-only.",
    readCode: "AUTH_FILE_READ",
    readMessage: "CodeFree token authentication setup is unavailable.",
    typeCode: "AUTH_FILE_TYPE",
    typeMessage: "CodeFree token authentication setup is unsafe."
  });
  try {
    return validateAuthConfig(JSON.parse(content.toString("utf8")));
  } catch (error) {
    if (error instanceof CodeFreeAuthError) {
      throw error;
    }
    throw new CodeFreeAuthError("AUTH_FILE_SCHEMA", "CodeFree token authentication setup is invalid.");
  }
}

function refreshEncryptionKey(keyMaterial) {
  return crypto.createHash("sha256").update(keyMaterial, "utf8").digest();
}

function encryptRefreshCfToken(value, keyMaterial, dependencies = {}) {
  const randomBytes = dependencies.randomBytes || crypto.randomBytes;
  const iv = randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", refreshEncryptionKey(keyMaterial), iv);
  const ciphertext = Buffer.concat([
    cipher.update(value, "utf8"),
    cipher.final()
  ]);
  return [
    "v1",
    iv.toString("base64"),
    ciphertext.toString("base64"),
    cipher.getAuthTag().toString("base64")
  ].join(":");
}

function decryptRefreshCfToken(envelope, keyMaterial) {
  try {
    const [version, ivValue, ciphertextValue, tagValue, extra] = String(envelope).split(":");
    if (
      version !== "v1" ||
      !ivValue ||
      !ciphertextValue ||
      !tagValue ||
      extra !== undefined
    ) {
      throw new Error("invalid envelope");
    }
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      refreshEncryptionKey(keyMaterial),
      Buffer.from(ivValue, "base64")
    );
    decipher.setAuthTag(Buffer.from(tagValue, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertextValue, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    throw new CodeFreeAuthError(
      "CREDENTIAL_DECRYPT",
      "CodeFree refresh credentials could not be decrypted."
    );
  }
}

function fingerprint(content) {
  return crypto.createHash("sha256").update(content).digest("hex");
}

function readCodeFreeCredentialState(authConfig, dependencies = {}) {
  const content = readPrivateRegularFile(authConfig.credentialFile, {
    ...dependencies,
    ownerCode: "CREDENTIAL_OWNER",
    ownerMessage: "CodeFree refresh credentials have an invalid owner.",
    permissionsCode: "CREDENTIAL_PERMISSIONS",
    permissionsMessage: "CodeFree refresh credentials must be owner-only.",
    readCode: "CREDENTIAL_READ",
    readMessage: "CodeFree refresh credentials are unavailable.",
    typeCode: "CREDENTIAL_TYPE",
    typeMessage: "CodeFree refresh credentials are unsafe."
  });
  let value;
  try {
    value = JSON.parse(content.toString("utf8"));
  } catch {
    throw new CodeFreeAuthError(
      "CREDENTIAL_SCHEMA",
      "CodeFree refresh credentials are invalid."
    );
  }
  const encryptedRefreshCfToken = nonEmptyString(value?.encryptedRefreshCfToken);
  const refreshCfTokenExpiresAt = Number(value?.refreshCfTokenExpiresAt);
  if (
    value?.version !== 2 ||
    !encryptedRefreshCfToken ||
    !Number.isFinite(refreshCfTokenExpiresAt)
  ) {
    throw new CodeFreeAuthError(
      "CREDENTIAL_SCHEMA",
      "CodeFree refresh credentials are invalid."
    );
  }
  const refreshCfToken = decryptRefreshCfToken(
    encryptedRefreshCfToken,
    authConfig.refreshEncryptionKey
  );
  if (!nonEmptyString(refreshCfToken)) {
    throw new CodeFreeAuthError(
      "CREDENTIAL_SCHEMA",
      "CodeFree refresh credentials are invalid."
    );
  }
  return {
    version: 2,
    refreshCfToken,
    refreshCfTokenExpiresAt,
    userId: nonEmptyString(value.userId),
    clientId: nonEmptyString(value.clientId) || authConfig.clientId,
    baseUrlSnapshot: nonEmptyString(value.baseUrlSnapshot) || authConfig.baseUrl,
    fingerprint: fingerprint(content)
  };
}

function writeCodeFreeCredentialState(
  authConfig,
  state,
  expectedFingerprint,
  dependencies = {}
) {
  const fileSystem = dependencies.fs || fs;
  const randomBytes = dependencies.randomBytes || crypto.randomBytes;
  let current;
  try {
    current = fileSystem.readFileSync(authConfig.credentialFile);
  } catch {
    throw new CodeFreeAuthError(
      "CREDENTIAL_WRITE",
      "CodeFree refresh credentials could not be updated."
    );
  }
  if (fingerprint(current) !== expectedFingerprint) {
    return { written: false, reason: "changed" };
  }

  const payload = {
    version: 2,
    encryptedRefreshCfToken: encryptRefreshCfToken(
      state.refreshCfToken,
      authConfig.refreshEncryptionKey,
      { randomBytes }
    ),
    refreshCfTokenExpiresAt: state.refreshCfTokenExpiresAt,
    ...(state.userId ? { userId: state.userId } : {}),
    ...(state.baseUrlSnapshot ? { baseUrlSnapshot: state.baseUrlSnapshot } : {})
  };
  const temporaryPath = path.join(
    path.dirname(authConfig.credentialFile),
    `.${path.basename(authConfig.credentialFile)}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`
  );
  try {
    fileSystem.writeFileSync(temporaryPath, `${JSON.stringify(payload, null, 2)}\n`, {
      flag: "wx",
      mode: 0o600
    });
    const latest = fileSystem.readFileSync(authConfig.credentialFile);
    if (fingerprint(latest) !== expectedFingerprint) {
      fileSystem.rmSync(temporaryPath, { force: true });
      return { written: false, reason: "changed" };
    }
    fileSystem.renameSync(temporaryPath, authConfig.credentialFile);
    fileSystem.chmodSync(authConfig.credentialFile, 0o600);
    return { written: true };
  } catch {
    try {
      fileSystem.rmSync(temporaryPath, { force: true });
    } catch {
      // Preserve the original write error category.
    }
    throw new CodeFreeAuthError(
      "CREDENTIAL_WRITE",
      "CodeFree refresh credentials could not be updated."
    );
  }
}

function withoutHeader(headers, name) {
  const target = name.toLowerCase();
  const entries = headers && typeof headers.entries === "function"
    ? Array.from(headers.entries())
    : Object.entries(headers || {});
  return Object.fromEntries(
    entries.filter(([key]) => key.toLowerCase() !== target)
  );
}

function signedHeaders({ method, clientId, signingSecret, timestamp, nonce }) {
  const canonical = [method.toUpperCase(), clientId, String(timestamp), nonce].join("\n");
  const signature = crypto
    .createHmac("sha256", Buffer.from(signingSecret, "base64"))
    .update(canonical)
    .digest("base64");
  return {
    "X-Cf-AppId": clientId,
    "X-Cf-Timestamp": String(timestamp),
    "X-Cf-Nonce": nonce,
    "X-Cf-Signature": signature
  };
}

function positiveSeconds(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseRefreshResponse(value) {
  const cfToken = nonEmptyString(value?.x_cf_token) ||
    nonEmptyString(value?.cf_token) ||
    (value?.token_type === "cf_token" ? nonEmptyString(value?.access_token) : undefined);
  const refreshCfToken = nonEmptyString(value?.x_cf_refresh_token) ||
    nonEmptyString(value?.refresh_token) ||
    nonEmptyString(value?.refresh_cf_token) ||
    nonEmptyString(value?.cf_token_refresh_token);
  if (!cfToken || !refreshCfToken) {
    throw new CodeFreeAuthError(
      "REFRESH_RESPONSE",
      "CodeFree token refresh returned an invalid result."
    );
  }
  return {
    cfToken,
    cfTokenExpiresIn: positiveSeconds(
      value.x_cf_token_expires_in ?? value.cf_token_expires_in ?? value.expires_in,
      7200
    ),
    refreshCfToken,
    refreshCfTokenExpiresIn: positiveSeconds(
      value.x_cf_refresh_token_expires_in ??
        value.refresh_token_expires_in ??
        value.refresh_cf_token_expires_in ??
        value.cf_token_refresh_token_expires_in,
      604800
    ),
    userId: nonEmptyString(value.userId) ||
      nonEmptyString(value.user_id) ||
      nonEmptyString(value.id)
  };
}

async function readRefreshResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("json")) {
    return response.json();
  }
  return Object.fromEntries(new URLSearchParams(await response.text()).entries());
}

function createCodeFreeTokenAuth(options = {}) {
  const authConfig = loadCodeFreeAuthFile(options.authFilePath, options);
  const requestFetch = options.fetch || globalThis.fetch;
  const now = options.now || Date.now;
  const randomBytes = options.randomBytes || crypto.randomBytes;
  const nonce = options.nonce || (() => randomBytes(16).toString("hex"));
  let cachedToken;
  let inFlightRefresh;
  let lastCacheState;

  async function refresh(attempt = 0) {
    const credential = readCodeFreeCredentialState(authConfig, options);
    const parameters = new URLSearchParams({
      grant_type: "refresh_x_cf_token",
      client_id: credential.clientId,
      x_cf_refresh_token: credential.refreshCfToken
    });
    if (authConfig.clientSecret) {
      parameters.set("client_secret", authConfig.clientSecret);
    }

    let response;
    try {
      response = await requestFetch(new URL(TOKEN_ENDPOINT_PATH, authConfig.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded",
          Accept: "application/json"
        },
        body: parameters
      });
    } catch {
      throw new CodeFreeAuthError(
        "REFRESH_REQUEST",
        "CodeFree token refresh could not be completed."
      );
    }
    if (!response.ok) {
      if (response.status === 400 || response.status === 401) {
        const newer = readCodeFreeCredentialState(authConfig, options);
        if (
          attempt === 0 &&
          newer.fingerprint !== credential.fingerprint &&
          newer.refreshCfToken !== credential.refreshCfToken
        ) {
          return refresh(1);
        }
      }
      throw new CodeFreeAuthError(
        response.status === 400 || response.status === 401
          ? "REFRESH_REJECTED"
          : "REFRESH_REQUEST",
        "CodeFree token refresh was rejected."
      );
    }

    let refreshed;
    try {
      refreshed = parseRefreshResponse(await readRefreshResponse(response));
    } catch (error) {
      if (error instanceof CodeFreeAuthError) {
        throw error;
      }
      throw new CodeFreeAuthError(
        "REFRESH_RESPONSE",
        "CodeFree token refresh returned an invalid result."
      );
    }
    const refreshedAt = now();
    const userId = refreshed.userId || credential.userId;
    const persisted = writeCodeFreeCredentialState(
      authConfig,
      {
        refreshCfToken: refreshed.refreshCfToken,
        refreshCfTokenExpiresAt:
          refreshedAt + refreshed.refreshCfTokenExpiresIn * 1000,
        userId,
        baseUrlSnapshot: authConfig.baseUrl
      },
      credential.fingerprint,
      { ...options, randomBytes }
    );
    if (!persisted.written) {
      const newer = readCodeFreeCredentialState(authConfig, options);
      if (attempt === 0 && newer.refreshCfToken !== credential.refreshCfToken) {
        return refresh(1);
      }
      throw new CodeFreeAuthError(
        "REFRESH_CONFLICT",
        "CodeFree credentials changed during token refresh; retry after CodeFree-O becomes idle."
      );
    }
    return {
      cfToken: refreshed.cfToken,
      cfTokenExpiresAt: refreshedAt + refreshed.cfTokenExpiresIn * 1000,
      userId,
      clientId: credential.clientId
    };
  }

  async function getValidToken() {
    if (cachedToken && cachedToken.cfTokenExpiresAt - now() > TOKEN_REFRESH_SKEW_MS) {
      lastCacheState = "reused";
      return cachedToken;
    }
    if (!inFlightRefresh) {
      inFlightRefresh = refresh()
        .then((token) => {
          cachedToken = token;
          lastCacheState = "refreshed";
          return token;
        })
        .catch((error) => {
          lastCacheState = "refresh-failed";
          throw error;
        })
        .finally(() => {
          inFlightRefresh = undefined;
        });
    }
    return inFlightRefresh;
  }

  async function applyHeaders({ method, headers, token }) {
    const current = token || await getValidToken();
    if (!current.userId) {
      throw new CodeFreeAuthError(
        "USER_ID_MISSING",
        "CodeFree user identity is unavailable."
      );
    }
    const cleaned = [
      "apiKey",
      "Authorization",
      "X-Cf-Token",
      "userId",
      "projectId",
      "X-Cf-AppId",
      "X-Cf-Timestamp",
      "X-Cf-Nonce",
      "X-Cf-Signature"
    ].reduce((current, name) => withoutHeader(current, name), headers || {});
    const timestamp = Math.floor(now() / 1000);
    const requestNonce = nonce();
    return {
      ...cleaned,
      "X-Cf-Token": current.cfToken,
      userId: current.userId,
      projectId: "0",
      ...signedHeaders({
        method,
        clientId: current.clientId,
        signingSecret: authConfig.signingSecret,
        timestamp,
        nonce: requestNonce
      })
    };
  }

  async function authenticatedFetch(url, init = {}) {
    const method = init.method || "GET";
    const token = await getValidToken();
    let response = await requestFetch(url, {
      ...init,
      method,
      headers: await applyHeaders({ method, headers: init.headers, token })
    });
    if (response.status !== 401) {
      return response;
    }

    cachedToken = undefined;
    let refreshed;
    try {
      refreshed = await refresh();
      cachedToken = refreshed;
      lastCacheState = "refreshed";
    } catch (error) {
      lastCacheState = "refresh-failed";
      throw error;
    }
    response = await requestFetch(url, {
      ...init,
      method,
      headers: await applyHeaders({ method, headers: init.headers, token: refreshed })
    });
    return response;
  }

  return {
    applyHeaders,
    authenticatedFetch,
    cacheState: () => lastCacheState,
    getValidToken
  };
}

module.exports = {
  AUTH_FILE_SCHEMA_VERSION,
  CodeFreeAuthError,
  TOKEN_REFRESH_SKEW_MS,
  createCodeFreeTokenAuth,
  decryptRefreshCfToken,
  encryptRefreshCfToken,
  readCodeFreeCredentialState,
  loadCodeFreeAuthFile,
  writeCodeFreeCredentialState
};

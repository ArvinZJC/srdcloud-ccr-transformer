"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  AUTH_FILE_SCHEMA_VERSION,
  CodeFreeAuthError,
  createCodeFreeTokenAuth,
  decryptRefreshCfToken,
  encryptRefreshCfToken,
  readCodeFreeCredentialState,
  loadCodeFreeAuthFile,
  writeCodeFreeCredentialState
} = require("../src/codefree-token-auth.cjs");

function temporaryDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "codefree-token-auth-"));
}

function fixtureAuthConfig(directory) {
  return {
    schemaVersion: AUTH_FILE_SCHEMA_VERSION,
    source: {
      binarySha256: "a".repeat(64),
      codefreeVersion: "1.5.1",
      semanticProfile: "codefree-token-auth-v1",
      verificationMode: "known-artifact"
    },
    baseUrl: "https://service.example",
    clientId: "client-fixture",
    clientSecret: "client-secret-fixture",
    credentialFile: path.join(directory, "codefree.json"),
    refreshEncryptionKey: "refresh-key-fixture",
    signingSecret: Buffer.from("fixture-signing-secret").toString("base64")
  };
}

function refreshResponse(overrides = {}) {
  return new Response(JSON.stringify({
    x_cf_token: "token-fixture",
    x_cf_token_expires_in: 7200,
    x_cf_refresh_token: "rotated-refresh-fixture",
    x_cf_refresh_token_expires_in: 604800,
    userId: "user-fixture",
    ...overrides
  }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

function createFixtureTokenAuth(options = {}) {
  const directory = temporaryDirectory();
  const authConfig = fixtureAuthConfig(directory);
  const authFilePath = path.join(directory, "auth.json");
  fs.writeFileSync(authConfig.credentialFile, JSON.stringify({
    version: 2,
    encryptedRefreshCfToken: encryptRefreshCfToken(
      "refresh-fixture",
      authConfig.refreshEncryptionKey,
      { randomBytes: () => Buffer.alloc(12, 4) }
    ),
    refreshCfTokenExpiresAt: 1_900_000_000_000,
    userId: "user-fixture"
  }), { mode: 0o600 });
  fs.writeFileSync(authFilePath, JSON.stringify(authConfig), { mode: 0o600 });
  const fixture = { authConfig, authFilePath, directory };
  const auth = createCodeFreeTokenAuth({
    authFilePath,
    fetch: options.fetchFactory
      ? options.fetchFactory(fixture)
      : options.fetch || (async () => refreshResponse()),
    fs: options.fsFactory ? options.fsFactory(fixture) : options.fs,
    now: options.now || (() => 1_721_720_000_000),
    nonce: options.nonce || (() => "nonce-fixture"),
    randomBytes: options.randomBytes || (() => Buffer.alloc(12, 5))
  });
  auth.fixture = fixture;
  return auth;
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

test("loadCodeFreeAuthFile accepts a private regular file", () => {
  const directory = temporaryDirectory();
  const filePath = path.join(directory, "auth.json");
  const expected = fixtureAuthConfig(directory);
  fs.writeFileSync(filePath, JSON.stringify(expected), { mode: 0o600 });

  assert.deepEqual(loadCodeFreeAuthFile(filePath), expected);
});

test("loadCodeFreeAuthFile rejects pre-semantic private setup", () => {
  const directory = temporaryDirectory();
  const filePath = path.join(directory, "auth.json");
  const value = fixtureAuthConfig(directory);
  value.schemaVersion = 1;
  delete value.source.semanticProfile;
  delete value.source.verificationMode;
  fs.writeFileSync(filePath, JSON.stringify(value), { mode: 0o600 });

  assert.throws(
    () => loadCodeFreeAuthFile(filePath),
    (error) => error.code === "AUTH_FILE_SCHEMA"
  );
});

test("loadCodeFreeAuthFile rejects permissive files without exposing the path", () => {
  const directory = temporaryDirectory();
  const filePath = path.join(directory, "auth.json");
  fs.writeFileSync(filePath, JSON.stringify(fixtureAuthConfig(directory)), { mode: 0o644 });

  assert.throws(
    () => loadCodeFreeAuthFile(filePath),
    (error) => {
      assert.equal(error instanceof CodeFreeAuthError, true);
      assert.equal(error.code, "AUTH_FILE_PERMISSIONS");
      assert.equal(error.message.includes(filePath), false);
      return true;
    }
  );
});

test("loadCodeFreeAuthFile rejects a symbolic link", () => {
  const directory = temporaryDirectory();
  const target = path.join(directory, "target.json");
  const link = path.join(directory, "auth.json");
  fs.writeFileSync(target, JSON.stringify(fixtureAuthConfig(directory)), { mode: 0o600 });
  fs.symlinkSync(target, link);

  assert.throws(
    () => loadCodeFreeAuthFile(link),
    (error) => error.code === "AUTH_FILE_TYPE"
  );
});

test("refresh credentials round-trip through the CodeFree v1 AES-GCM envelope", () => {
  const encrypted = encryptRefreshCfToken("refresh-fixture", "refresh-key-fixture", {
    randomBytes: () => Buffer.alloc(12, 7)
  });

  assert.match(encrypted, /^v1:[^:]+:[^:]+:[^:]+$/);
  assert.equal(
    decryptRefreshCfToken(encrypted, "refresh-key-fixture"),
    "refresh-fixture"
  );
});

test("readCodeFreeCredentialState normalizes version 2 encrypted state", () => {
  const directory = temporaryDirectory();
  const authConfig = fixtureAuthConfig(directory);
  const encrypted = encryptRefreshCfToken("refresh-fixture", authConfig.refreshEncryptionKey, {
    randomBytes: () => Buffer.alloc(12, 9)
  });
  fs.writeFileSync(
    authConfig.credentialFile,
    JSON.stringify({
      version: 2,
      encryptedRefreshCfToken: encrypted,
      refreshCfTokenExpiresAt: 1_800_000_000_000,
      userId: "user-fixture",
      baseUrlSnapshot: authConfig.baseUrl
    }),
    { mode: 0o600 }
  );

  const state = readCodeFreeCredentialState(authConfig);
  assert.equal(state.refreshCfToken, "refresh-fixture");
  assert.equal(state.clientId, "client-fixture");
  assert.equal(state.userId, "user-fixture");
  assert.match(state.fingerprint, /^[a-f0-9]{64}$/);
});

test("writeCodeFreeCredentialState atomically persists rotated state", () => {
  const directory = temporaryDirectory();
  const authConfig = fixtureAuthConfig(directory);
  fs.writeFileSync(authConfig.credentialFile, JSON.stringify({
    version: 2,
    encryptedRefreshCfToken: encryptRefreshCfToken(
      "old-refresh",
      authConfig.refreshEncryptionKey,
      { randomBytes: () => Buffer.alloc(12, 1) }
    ),
    refreshCfTokenExpiresAt: 1_800_000_000_000,
    userId: "user-fixture"
  }), { mode: 0o600 });
  const current = readCodeFreeCredentialState(authConfig);

  const result = writeCodeFreeCredentialState(
    authConfig,
    {
      refreshCfToken: "new-refresh",
      refreshCfTokenExpiresAt: 1_900_000_000_000,
      userId: "user-fixture",
      baseUrlSnapshot: authConfig.baseUrl
    },
    current.fingerprint,
    { randomBytes: () => Buffer.alloc(12, 2) }
  );

  assert.equal(result.written, true);
  assert.equal(readCodeFreeCredentialState(authConfig).refreshCfToken, "new-refresh");
  assert.equal(fs.statSync(authConfig.credentialFile).mode & 0o777, 0o600);
});

test("writeCodeFreeCredentialState preserves concurrently changed state", () => {
  const directory = temporaryDirectory();
  const authConfig = fixtureAuthConfig(directory);
  fs.writeFileSync(authConfig.credentialFile, JSON.stringify({
    version: 2,
    encryptedRefreshCfToken: encryptRefreshCfToken(
      "newer-refresh",
      authConfig.refreshEncryptionKey,
      { randomBytes: () => Buffer.alloc(12, 3) }
    ),
    refreshCfTokenExpiresAt: 1_900_000_000_000,
    userId: "user-fixture"
  }), { mode: 0o600 });

  const result = writeCodeFreeCredentialState(
    authConfig,
    {
      refreshCfToken: "stale-refresh",
      refreshCfTokenExpiresAt: 2_000_000_000_000,
      userId: "user-fixture"
    },
    "0".repeat(64)
  );

  assert.equal(result.written, false);
  assert.equal(result.reason, "changed");
  assert.equal(readCodeFreeCredentialState(authConfig).refreshCfToken, "newer-refresh");
});

test("applyHeaders reproduces the CodeFree-O method-only signature", async () => {
  const auth = createFixtureTokenAuth({
    now: () => 1_721_720_000_000,
    nonce: () => "nonce-fixture"
  });

  const headers = await auth.applyHeaders({
    method: "post",
    headers: {
      apiKey: "legacy-key",
      Authorization: "Bearer legacy",
      "x-cf-signature": "stale-signature",
      "x-cf-token": "stale-token",
      "x-session-affinity": "session-fixture"
    }
  });

  assert.deepEqual(headers, {
    "x-session-affinity": "session-fixture",
    "X-Cf-Token": "token-fixture",
    userId: "user-fixture",
    projectId: "0",
    "X-Cf-AppId": "client-fixture",
    "X-Cf-Timestamp": "1721720000",
    "X-Cf-Nonce": "nonce-fixture",
    "X-Cf-Signature": "pu7X73mwlNe9r0WM91AMAzKCSgeMkLK0MSLwX8prSaQ="
  });
});

test("signature is independent of URL and body", async () => {
  const first = createFixtureTokenAuth({
    now: () => 1_721_720_000_000,
    nonce: () => "nonce-fixture"
  });
  const second = createFixtureTokenAuth({
    now: () => 1_721_720_000_000,
    nonce: () => "nonce-fixture"
  });

  const firstHeaders = await first.applyHeaders({ method: "POST", headers: {} });
  const secondHeaders = await second.applyHeaders({ method: "POST", headers: {} });
  assert.equal(firstHeaders["X-Cf-Signature"], secondHeaders["X-Cf-Signature"]);
});

test("getValidToken reuses a token while more than the refresh skew remains", async () => {
  let refreshCalls = 0;
  const auth = createFixtureTokenAuth({
    fetch: async () => {
      refreshCalls += 1;
      return refreshResponse();
    }
  });

  assert.equal((await auth.getValidToken()).cfToken, "token-fixture");
  assert.equal((await auth.getValidToken()).cfToken, "token-fixture");
  assert.equal(refreshCalls, 1);
  assert.equal(auth.cacheState(), "reused");
});

test("token refresh requests a JSON response", async () => {
  let acceptHeader;
  const auth = createFixtureTokenAuth({
    fetch: async (_url, init) => {
      acceptHeader = init.headers.Accept;
      return refreshResponse();
    }
  });

  await auth.getValidToken();

  assert.equal(acceptHeader, "application/json");
});

test("token refresh accepts a form-encoded success response", async () => {
  const auth = createFixtureTokenAuth({
    fetch: async () => new Response(new URLSearchParams({
      x_cf_token: "token-fixture",
      x_cf_token_expires_in: "7200",
      x_cf_refresh_token: "rotated-refresh-fixture",
      x_cf_refresh_token_expires_in: "604800",
      userId: "user-fixture"
    }), {
      status: 200,
      headers: { "content-type": "application/x-www-form-urlencoded" }
    })
  });

  assert.equal((await auth.getValidToken()).cfToken, "token-fixture");
});

test("getValidToken refreshes at exactly the refresh skew boundary", async () => {
  let currentTime = 1_721_720_000_000;
  let refreshCalls = 0;
  const auth = createFixtureTokenAuth({
    now: () => currentTime,
    fetch: async () => {
      refreshCalls += 1;
      return refreshResponse({ x_cf_token: `token-${refreshCalls}` });
    }
  });

  const first = await auth.getValidToken();
  currentTime = first.cfTokenExpiresAt - 60_000;
  assert.equal((await auth.getValidToken()).cfToken, "token-2");
  assert.equal(refreshCalls, 2);
  assert.equal(auth.cacheState(), "refreshed");
});

test("getValidToken shares one in-flight refresh", async () => {
  const pending = deferred();
  let refreshCalls = 0;
  const auth = createFixtureTokenAuth({
    fetch: async () => {
      refreshCalls += 1;
      return pending.promise;
    }
  });

  const first = auth.getValidToken();
  const second = auth.getValidToken();
  assert.equal(refreshCalls, 1);
  pending.resolve(refreshResponse());
  assert.equal((await first).cfToken, "token-fixture");
  assert.equal((await second).cfToken, "token-fixture");
  assert.equal(refreshCalls, 1);
  assert.equal(auth.cacheState(), "refreshed");
});

test("refresh retries once when another process rotates the credential before persistence", async () => {
  const submittedRefreshTokens = [];
  let calls = 0;
  const auth = createFixtureTokenAuth({
    fetchFactory: ({ authConfig }) => async (_url, init) => {
      calls += 1;
      submittedRefreshTokens.push(init.body.get("x_cf_refresh_token"));
      if (calls === 1) {
        fs.writeFileSync(authConfig.credentialFile, JSON.stringify({
          version: 2,
          encryptedRefreshCfToken: encryptRefreshCfToken(
            "newer-refresh",
            authConfig.refreshEncryptionKey,
            { randomBytes: () => Buffer.alloc(12, 6) }
          ),
          refreshCfTokenExpiresAt: 1_900_000_000_000,
          userId: "user-fixture"
        }), { mode: 0o600 });
      }
      return refreshResponse({
        x_cf_token: `token-${calls}`,
        x_cf_refresh_token: `rotated-${calls}`
      });
    }
  });

  assert.equal((await auth.getValidToken()).cfToken, "token-2");
  assert.deepEqual(submittedRefreshTokens, ["refresh-fixture", "newer-refresh"]);
});

test("refresh fails without retry when the credential changes but its token does not", async () => {
  let calls = 0;
  const auth = createFixtureTokenAuth({
    fetchFactory: ({ authConfig }) => async () => {
      calls += 1;
      const current = readCodeFreeCredentialState(authConfig);
      fs.writeFileSync(authConfig.credentialFile, `${JSON.stringify({
        version: 2,
        encryptedRefreshCfToken: encryptRefreshCfToken(
          current.refreshCfToken,
          authConfig.refreshEncryptionKey,
          { randomBytes: () => Buffer.alloc(12, 7) }
        ),
        refreshCfTokenExpiresAt: current.refreshCfTokenExpiresAt,
        userId: current.userId
      }, null, 2)}\n`, { mode: 0o600 });
      return refreshResponse();
    }
  });

  await assert.rejects(auth.getValidToken(), (error) => error.code === "REFRESH_CONFLICT");
  assert.equal(calls, 1);
  assert.equal(fs.existsSync(auth.fixture.authConfig.credentialFile), true);
});

test("persistence failure does not cache the uncommitted access token", async () => {
  let calls = 0;
  const auth = createFixtureTokenAuth({
    fetch: async () => {
      calls += 1;
      return refreshResponse({ x_cf_token: `token-${calls}` });
    },
    fsFactory: () => {
      const fileSystem = Object.create(fs);
      fileSystem.renameSync = () => {
        throw new Error("synthetic persistence failure");
      };
      return fileSystem;
    }
  });

  await assert.rejects(auth.getValidToken(), (error) => error.code === "CREDENTIAL_WRITE");
  await assert.rejects(auth.getValidToken(), (error) => error.code === "CREDENTIAL_WRITE");
  assert.equal(calls, 2);
  assert.equal(auth.cacheState(), "refresh-failed");
  assert.equal(fs.existsSync(auth.fixture.authConfig.credentialFile), true);
});

test("rejected refresh retries once after another process rotates the credential", async () => {
  const submittedRefreshTokens = [];
  let calls = 0;
  const auth = createFixtureTokenAuth({
    fetchFactory: ({ authConfig }) => async (_url, init) => {
      calls += 1;
      submittedRefreshTokens.push(init.body.get("x_cf_refresh_token"));
      if (calls === 1) {
        fs.writeFileSync(authConfig.credentialFile, JSON.stringify({
          version: 2,
          encryptedRefreshCfToken: encryptRefreshCfToken(
            "newer-refresh",
            authConfig.refreshEncryptionKey,
            { randomBytes: () => Buffer.alloc(12, 8) }
          ),
          refreshCfTokenExpiresAt: 1_900_000_000_000,
          userId: "user-fixture"
        }), { mode: 0o600 });
        return new Response("", { status: 401 });
      }
      return refreshResponse({ x_cf_token: "recovered-token" });
    }
  });

  assert.equal((await auth.getValidToken()).cfToken, "recovered-token");
  assert.deepEqual(submittedRefreshTokens, ["refresh-fixture", "newer-refresh"]);
});

test("rejected refresh with unchanged credentials fails safely without retry", async () => {
  let calls = 0;
  const auth = createFixtureTokenAuth({
    fetch: async () => {
      calls += 1;
      return new Response("", { status: 400 });
    }
  });

  await assert.rejects(
    auth.getValidToken(),
    (error) => {
      assert.equal(error.code, "REFRESH_REJECTED");
      const forbidden = [
        "refresh-fixture",
        "refresh-key-fixture",
        "client-secret-fixture",
        "user-fixture",
        auth.fixture.authConfig.credentialFile
      ];
      assert.equal(forbidden.some((value) => error.message.includes(value)), false);
      return true;
    }
  );
  assert.equal(calls, 1);
  assert.equal(fs.existsSync(auth.fixture.authConfig.credentialFile), true);
});

test("authenticatedFetch refreshes and retries an internal request once after 401", async () => {
  let refreshCalls = 0;
  const upstreamTokens = [];
  const auth = createFixtureTokenAuth({
    fetch: async (url, init) => {
      if (new URL(url).pathname.endsWith("/oauth/access_token")) {
        refreshCalls += 1;
        return refreshResponse({
          x_cf_token: `token-${refreshCalls}`,
          x_cf_refresh_token: `refresh-${refreshCalls}`
        });
      }
      upstreamTokens.push(init.headers["X-Cf-Token"]);
      return new Response("", { status: upstreamTokens.length === 1 ? 401 : 200 });
    }
  });

  const response = await auth.authenticatedFetch(
    "https://service.example/internal/models",
    {
      method: "GET",
      headers: { "x-request-id": "request-fixture" }
    }
  );

  assert.equal(response.status, 200);
  assert.equal(refreshCalls, 2);
  assert.deepEqual(upstreamTokens, ["token-1", "token-2"]);
});

test("authenticatedFetch does not make a third request after a second 401", async () => {
  let refreshCalls = 0;
  let upstreamCalls = 0;
  const auth = createFixtureTokenAuth({
    fetch: async (url) => {
      if (new URL(url).pathname.endsWith("/oauth/access_token")) {
        refreshCalls += 1;
        return refreshResponse({
          x_cf_token: `token-${refreshCalls}`,
          x_cf_refresh_token: `refresh-${refreshCalls}`
        });
      }
      upstreamCalls += 1;
      return new Response("", { status: 401 });
    }
  });

  const response = await auth.authenticatedFetch(
    "https://service.example/internal/models",
    { method: "GET" }
  );

  assert.equal(response.status, 401);
  assert.equal(refreshCalls, 2);
  assert.equal(upstreamCalls, 2);
});

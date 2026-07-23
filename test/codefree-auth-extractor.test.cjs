"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  validateAndExtractCodeFreeAuthMaterial
} = require("../src/codefree-auth-extractor.cjs");

const PROFILE = {
  id: "codefree-token-auth-v1",
  minimumVersion: "1.4.0"
};

function semanticFixture(names = {}, changes = {}) {
  const n = {
    cipher: "cipherFn",
    decipher: "decipherFn",
    hash: "hashFn",
    hmac: "hmacFn",
    skew: "refreshSkew",
    refreshKey: "refreshMaterial",
    deriveKey: "deriveRefreshKey",
    clientId: "selectClientId",
    clientSecret: "selectClientSecret",
    signingSecret: "readSigningSecret",
    ...names
  };
  const signatureFields = changes.signatureOrder === "app-method-time-nonce"
    ? "y.appId,y.method.toUpperCase(),timestamp,nonce"
    : "y.method.toUpperCase(),y.appId,timestamp,nonce";
  const signatureHeader = changes.omitSignatureHeader
    ? ""
    : ',"X-Cf-Signature":signature';
  const skewCheck = changes.omitSkew
    ? "if(cached)return cached"
    : `if(cached&&cached.cfTokenExpiresAt-Date.now()>${n.skew})return cached`;
  const cipherName = changes.wrongCipher ? "aes-256-cbc" : "aes-256-gcm";
  const refreshClientId = changes.disconnectClientId
    ? "y.otherClientId"
    : "y.clientId";
  const persistence = changes.omitRotationPersistence
    ? ""
    : "await persist(next);";
  const tokenHeaderValue = changes.disconnectTokenHeader
    ? "y.otherToken"
    : "y.cfToken";
  const identityHeaders = changes.lateTokenProjection
    ? ""
    : `"X-Cf-Token":${tokenHeaderValue},"userId":y.userId,"projectId":"0",`;
  const lateIdentityProjection = changes.lateTokenProjection
    ? `;const padding="${"x".repeat(600)}";` +
      `headers.set("X-Cf-Token",${tokenHeaderValue});` +
      'headers.set("userId",y.userId);headers.set("projectId","0")'
    : "";
  const clientSecretFunction = changes.omitClientSecret
    ? ""
    : `function ${n.clientSecret}(url){if(url.includes("dev"))return"dev-secret";` +
      'if(url.includes("test"))return"test-secret";return"client-secret-fixture"}';
  const clientSecretUse = changes.omitClientSecret
    ? ""
    : `,secret=${n.clientSecret}(I);if(secret)form.set("client_secret",secret)`;
  const acceptHeader = changes.omitRefreshAccept
    ? ""
    : ',Accept:"application/json"';
  const responseFallback = changes.omitFormResponseFallback
    ? "return await response.json()"
    : 'if((response.headers.get("content-type")??"").includes("json"))return await response.json();' +
      "let fields=new URLSearchParams(await response.text());return Object.fromEntries(fields.entries())";

  return [
    `import{createCipheriv as ${n.cipher},createDecipheriv as ${n.decipher},` +
      `createHash as ${n.hash},createHmac as ${n.hmac}}from"node:crypto"`,
    `var ${n.skew}=60000,${n.refreshKey}="fixture-refresh-material"`,
    `function ${n.deriveKey}(){return ${n.hash}("sha256").update(${n.refreshKey}).digest()}`,
    `function seal(value,iv){let c=${n.cipher}("${cipherName}",${n.deriveKey}(),iv);` +
      'let body=c.update(value,"utf8");return[body,c.getAuthTag()]}',
    `function open(value,iv,tag){let d=${n.decipher}("${cipherName}",` +
      `${n.deriveKey}(),iv);d.setAuthTag(tag);return d.update(value)}`,
    `function ${n.clientId}(url){if(url.includes("dev"))return"dev-id";` +
      'if(url.includes("test"))return"test-id";return"client-fixture"}',
    clientSecretFunction,
    `function normalizeClient(value){return{clientId:value.clientId??` +
      `${n.clientId}(value.baseUrlSnapshot)}}`,
    `function ${n.signingSecret}(){return"Zml4dHVyZS1zaWduaW5nLW1hdGVyaWFs"}`,
    "function expiresAt(value){return Date.now()+value*1000}",
    `async function parseTokenResponse(response){${responseFallback}}`,
    `async function requestToken(url,form){let response=await fetch(url,{method:"POST",` +
      `headers:{"Content-Type":"application/x-www-form-urlencoded"${acceptHeader}},body:form});` +
      "return parseTokenResponse(response)}",
    `async function refresh(y,I){let form=new URLSearchParams({` +
      `grant_type:"refresh_x_cf_token",client_id:${refreshClientId},` +
      `x_cf_refresh_token:y.refreshCfToken})${clientSecretUse};` +
      "let response={cfToken:y.nextToken,expiresIn:300," +
      "refreshCfToken:y.nextRefresh,refreshCfTokenExpiresIn:600,userId:y.userId}," +
      "next={cfToken:response.cfToken,cfTokenExpiresAt:expiresAt(response.expiresIn)," +
      "refreshCfToken:response.refreshCfToken," +
      "refreshCfTokenExpiresAt:expiresAt(response.refreshCfTokenExpiresIn)," +
      "userId:response.userId,clientId:y.clientId};await persist(next);return next}",
    `async function getValidToken(){let cached=readCache();${skewCheck};` +
      "return refresh(await readCredential())}",
    `async function signRequest(y){let timestamp=Math.floor(Date.now()/1000),` +
      `nonce=randomUUID(),canonical=[${signatureFields}].join(\`\n\`),` +
      `signature=${n.hmac}("sha256",Buffer.from(${n.signingSecret}(),"base64"))` +
      `.update(canonical).digest("base64");return{${identityHeaders}` +
      '"X-Cf-AppId":y.appId,' +
      '"X-Cf-Timestamp":timestamp,"X-Cf-Nonce":nonce' +
      `${signatureHeader}}}${lateIdentityProjection}`
  ].filter(Boolean).join(";").replace("await persist(next);", persistence);
}

test("extracts one complete contract after arbitrary identifier renaming", () => {
  const first = validateAndExtractCodeFreeAuthMaterial(
    semanticFixture(),
    PROFILE
  );
  const renamed = validateAndExtractCodeFreeAuthMaterial(
    semanticFixture({
      cipher: "a",
      decipher: "$b",
      hash: "_c",
      hmac: "d9",
      skew: "e0",
      refreshKey: "f1",
      deriveKey: "$g",
      clientId: "h2",
      clientSecret: "_i",
      signingSecret: "j3"
    }),
    PROFILE
  );

  assert.deepEqual(renamed, first);
  assert.deepEqual(first, {
    clientId: "client-fixture",
    clientSecret: "client-secret-fixture",
    refreshEncryptionKey: "fixture-refresh-material",
    signingSecret: "Zml4dHVyZS1zaWduaW5nLW1hdGVyaWFs"
  });
});

test("rejects changed signature order and missing expiry skew", () => {
  for (const changes of [
    { signatureOrder: "app-method-time-nonce" },
    { omitSkew: true }
  ]) {
    assert.throws(
      () => validateAndExtractCodeFreeAuthMaterial(
        semanticFixture({}, changes),
        PROFILE
      ),
      (error) => error.code === "SEMANTIC_CONTRACT"
    );
  }
});

test("rejects altered crypto and incomplete signed headers", () => {
  for (const changes of [
    { wrongCipher: true },
    { omitSignatureHeader: true }
  ]) {
    assert.throws(
      () => validateAndExtractCodeFreeAuthMaterial(
        semanticFixture({}, changes),
        PROFILE
      ),
      (error) => error.code === "SEMANTIC_CONTRACT"
    );
  }
});

test("rejects missing refresh response negotiation and form fallback", () => {
  for (const changes of [
    { omitRefreshAccept: true },
    { omitFormResponseFallback: true }
  ]) {
    assert.throws(
      () => validateAndExtractCodeFreeAuthMaterial(
        semanticFixture({}, changes),
        PROFILE
      ),
      (error) => error.code === "SEMANTIC_CONTRACT"
    );
  }
});

test("rejects disconnected refresh, rotation, and token header relationships", () => {
  for (const changes of [
    { disconnectClientId: true },
    { omitRotationPersistence: true },
    { disconnectTokenHeader: true }
  ]) {
    assert.throws(
      () => validateAndExtractCodeFreeAuthMaterial(
        semanticFixture({}, changes),
        PROFILE
      ),
      (error) => error.code === "SEMANTIC_CONTRACT"
    );
  }
});

test("accepts a compatible refresh contract without an optional client secret", () => {
  assert.deepEqual(
    validateAndExtractCodeFreeAuthMaterial(
      semanticFixture({}, { omitClientSecret: true }),
      PROFILE
    ),
    {
      clientId: "client-fixture",
      refreshEncryptionKey: "fixture-refresh-material",
      signingSecret: "Zml4dHVyZS1zaWduaW5nLW1hdGVyaWFs"
    }
  );
});

test("rejects duplicate complete authentication regions", () => {
  const complete = semanticFixture();

  assert.throws(
    () => validateAndExtractCodeFreeAuthMaterial(
      `${complete};${complete}`,
      PROFILE
    ),
    (error) => error.code === "EXTRACTION_AMBIGUOUS"
  );
});

test("ignores an unrelated refresh-grant string outside the auth region", () => {
  assert.deepEqual(
    validateAndExtractCodeFreeAuthMaterial(
      `${semanticFixture()};const documentation='grant_type:"refresh_x_cf_token"'`,
      PROFILE
    ),
    {
      clientId: "client-fixture",
      clientSecret: "client-secret-fixture",
      refreshEncryptionKey: "fixture-refresh-material",
      signingSecret: "Zml4dHVyZS1zaWduaW5nLW1hdGVyaWFs"
    }
  );
});

test("keeps later token projection inside the bounded auth region", () => {
  assert.equal(
    validateAndExtractCodeFreeAuthMaterial(
      semanticFixture({}, { lateTokenProjection: true }),
      PROFILE
    ).clientId,
    "client-fixture"
  );
});

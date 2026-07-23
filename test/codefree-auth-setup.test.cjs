"use strict";

const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  setupCodeFreeAuth
} = require("../src/codefree-auth-setup.cjs");

function semanticBinary() {
  return Buffer.from([
    'import{createCipheriv as a,createDecipheriv as b,createHash as c,' +
      'createHmac as d}from"node:crypto"',
    'var e=60000,f="fixture-refresh-material"',
    'function g(){return c("sha256").update(f).digest()}',
    'function seal(v,i){let x=a("aes-256-gcm",g(),i);return[x.update(v),x.getAuthTag()]}',
    'function open(v,i,t){let x=b("aes-256-gcm",g(),i);x.setAuthTag(t);return x.update(v)}',
    'function h(y){if(y.includes("dev"))return"dev-id";' +
      'if(y.includes("test"))return"test-id";return"client-fixture"}',
    'function j(y){if(y.includes("dev"))return"dev-secret";' +
      'if(y.includes("test"))return"test-secret";return"client-secret-fixture"}',
    'function normalize(v){return{clientId:v.clientId??h(v.baseUrlSnapshot)}}',
    'function k(){return"Zml4dHVyZS1zaWduaW5nLW1hdGVyaWFs"}',
    'function expiry(v){return Date.now()+v*1000}',
    'async function parseResponse(response){' +
      'if((response.headers.get("content-type")??"").includes("json"))' +
      'return await response.json();let fields=new URLSearchParams(await response.text());' +
      'return Object.fromEntries(fields.entries())}',
    'async function requestToken(url,form){return parseResponse(await fetch(url,{' +
      'method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded",' +
      'Accept:"application/json"},body:form}))}',
    'async function refresh(y,I){let form=new URLSearchParams({' +
      'grant_type:"refresh_x_cf_token",client_id:y.clientId,' +
      'x_cf_refresh_token:y.refreshCfToken}),secret=j(I);' +
      'if(secret)form.set("client_secret",secret);let V={cfToken:y.token,' +
      'expiresIn:300,refreshCfToken:y.refresh,refreshCfTokenExpiresIn:600,' +
      'userId:y.userId},N={cfToken:V.cfToken,cfTokenExpiresAt:expiry(V.expiresIn),' +
      'refreshCfToken:V.refreshCfToken,' +
      'refreshCfTokenExpiresAt:expiry(V.refreshCfTokenExpiresIn),' +
      'userId:V.userId,clientId:y.clientId};await persist(N);return N}',
    'async function valid(){let x=cache();' +
      'if(x&&x.cfTokenExpiresAt-Date.now()>e)return x;return refresh(await state())}',
    'async function sign(y){let I=Math.floor(Date.now()/1000),T=randomUUID(),' +
      '$=[y.method.toUpperCase(),y.appId,I,T].join(`\n`),' +
      'N=d("sha256",Buffer.from(k(),"base64")).update($).digest("base64");' +
      'return{"X-Cf-Token":y.cfToken,userId:y.userId,projectId:"0",' +
      '"X-Cf-AppId":y.appId,"X-Cf-Timestamp":I,"X-Cf-Nonce":T,' +
      '"X-Cf-Signature":N}}'
  ].join(";"));
}

function provenance(binary, known = true, platform = "darwin-arm64") {
  const actualHash = crypto.createHash("sha256").update(binary).digest("hex");
  return {
    schemaVersion: 2,
    wrapper: {
      packageName: "@srdcloud/codefree-o",
      version: "1.5.1",
      integrity: "sha512-Zml4dHVyZQ=="
    },
    semanticProfile: {
      id: "codefree-token-auth-v1",
      minimumVersion: "1.4.0"
    },
    artifacts: [{
      codefreeVersion: "1.5.1",
      platform,
      binaryPath: platform.startsWith("win32")
        ? "bin/codefree-o.exe"
        : "bin/codefree-o",
      binaryBytes: binary.length,
      binarySha256: known ? actualHash : "a".repeat(64),
      packages: [{
        packageName: "@srdcloud/codefree-darwin-arm64",
        integrity: "sha512-Zml4dHVyZQ=="
      }]
    }]
  };
}

function runSetup(options = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codefree-semantic-setup-"));
  const outputFile = path.join(directory, "private", "auth.json");
  const binary = options.binary || semanticBinary();
  let configuredPath;
  const result = setupCodeFreeAuth({
    commandPath: "/fixture/codefree-o",
    configureCcr(filePath) {
      configuredPath = filePath;
    },
    execFileSync(_command, args) {
      return args[0] === "--version"
        ? `${options.version || "1.5.1"}\n`
        : "data       /fixture/data\n";
    },
    outputFile,
    platform: "darwin-arm64",
    provenance: provenance(binary, options.known !== false),
    readBinary: options.readBinary || (() => binary)
  });
  return {
    configuredPath,
    outputFile,
    result,
    stored: JSON.parse(fs.readFileSync(outputFile, "utf8"))
  };
}

test("known artifact records known-artifact after semantic validation", () => {
  const setup = runSetup();

  assert.equal(setup.result.verificationMode, "known-artifact");
  assert.equal(setup.stored.source.semanticProfile, "codefree-token-auth-v1");
  assert.equal(setup.stored.source.verificationMode, "known-artifact");
  assert.equal(setup.configuredPath, setup.outputFile);
});

test("unknown compatible artifact records semantic-contract", () => {
  const setup = runSetup({ known: false });

  assert.equal(setup.result.verificationMode, "semantic-contract");
  assert.equal(setup.stored.source.verificationMode, "semantic-contract");
});

test("versions before 1.4.0 fail before reading or writing", () => {
  let readBinaryCalled = false;

  assert.throws(
    () => runSetup({
      version: "1.3.9",
      readBinary() {
        readBinaryCalled = true;
        return semanticBinary();
      }
    }),
    (error) => error.code === "VERSION_UNSUPPORTED"
  );
  assert.equal(readBinaryCalled, false);
});

test("semantic failure does not write private setup", () => {
  const invalid = Buffer.from('grant_type:"refresh_x_cf_token"');
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codefree-semantic-fail-"));
  const outputFile = path.join(directory, "auth.json");
  let configured = false;

  assert.throws(
    () => setupCodeFreeAuth({
      commandPath: "/fixture/codefree-o",
      configureCcr() {
        configured = true;
      },
      execFileSync(_command, args) {
        return args[0] === "--version"
          ? "1.5.2\n"
          : "data       /fixture/data\n";
      },
      outputFile,
      platform: "darwin-arm64",
      provenance: provenance(invalid, false),
      readBinary() {
        return invalid;
      }
    }),
    (error) => error.code === "SEMANTIC_CONTRACT"
  );
  assert.equal(configured, false);
  assert.equal(fs.existsSync(outputFile), false);
});

test("Windows discovery inspects the platform executable behind the npm shim", () => {
  const binary = semanticBinary();
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "codefree-win-setup-"));
  const outputFile = path.join(directory, "auth.json");
  const commandPath = "C:\\npm\\codefree-o.cmd";
  const binaryPath =
    "C:\\npm\\node_modules\\@srdcloud\\codefree-o\\bin\\codefree-o.exe";
  let inspectedPath;

  const result = setupCodeFreeAuth({
    configureCcr() {},
    execFileSync(command, args) {
      if (command === "where.exe") {
        return `${commandPath}\r\nC:\\npm\\codefree-o.ps1\r\n`;
      }
      if (command === commandPath && args[0] === "--version") {
        return "1.5.1\r\n";
      }
      if (command === commandPath && args[0] === "debug") {
        return "data       C:\\fixture\\data\r\n";
      }
      throw new Error("unexpected command");
    },
    outputFile,
    platform: "win32-x64",
    provenance: provenance(binary, true, "win32-x64"),
    readBinary(filePath) {
      inspectedPath = filePath;
      return binary;
    },
    runtimePlatform: "win32"
  });

  assert.equal(inspectedPath, binaryPath);
  assert.equal(result.verificationMode, "known-artifact");
});

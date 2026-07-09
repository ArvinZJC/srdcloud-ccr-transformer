"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PACKAGE_LOCK_PATH = path.join(PROJECT_ROOT, "package-lock.json");
const LEGACY_TRANSFORMER_PATH = path.join(
  PROJECT_ROOT,
  "node_modules/codefree-helper/dist/ccr/transformer/srdcloud.transformer.js"
);

const EXPECTED = {
  packageName: "codefree-helper",
  packageVersion: "1.2.2",
  lockfileIntegrity: "sha512-BRF1PvuYfY5w7FLdD8txSr6u/b2DDSUX1nxlsehwkKuGB2ZSsH4ZOXi8T9VlD2sC2UFfN19ILZKBRe2FrdnqOw==",
  transformerBytes: 23765,
  transformerSha256: "edeea6bbeabedac331bc7a1045a55df3d37487f7a25957110e1931a84e858a7a"
};

function fail(message) {
  console.error(`[provenance] ${message}`);
  process.exitCode = 1;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function sha256(buffer) {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function checkPackageLock() {
  const lock = readJson(PACKAGE_LOCK_PATH);
  const entry = lock.packages?.["node_modules/codefree-helper"];
  if (!entry) {
    fail("package-lock.json does not contain node_modules/codefree-helper.");
    return;
  }
  if (entry.version !== EXPECTED.packageVersion) {
    fail(`codefree-helper version changed: expected ${EXPECTED.packageVersion}, got ${entry.version}.`);
  }
  if (entry.integrity !== EXPECTED.lockfileIntegrity) {
    fail("codefree-helper lockfile integrity changed.");
  }
}

function checkTransformerFile() {
  if (!fs.existsSync(LEGACY_TRANSFORMER_PATH)) {
    fail(`legacy transformer file is missing: ${path.relative(PROJECT_ROOT, LEGACY_TRANSFORMER_PATH)}`);
    return;
  }

  const content = fs.readFileSync(LEGACY_TRANSFORMER_PATH);
  if (content.byteLength !== EXPECTED.transformerBytes) {
    fail(`legacy transformer size changed: expected ${EXPECTED.transformerBytes}, got ${content.byteLength}.`);
  }

  const actualSha256 = sha256(content);
  if (actualSha256 !== EXPECTED.transformerSha256) {
    fail(`legacy transformer SHA-256 changed: expected ${EXPECTED.transformerSha256}, got ${actualSha256}.`);
  }
}

checkPackageLock();
checkTransformerFile();

if (!process.exitCode) {
  console.log("[provenance] SRDCloud legacy transformer evidence matches recorded metadata.");
}

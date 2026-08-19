"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const {
  validateCodeFreeAuthProvenance
} = require("../src/codefree-auth-provenance.cjs");

const PROJECT_ROOT = path.resolve(__dirname, "..");
const PACKAGE_LOCK_PATH = path.join(PROJECT_ROOT, "package-lock.json");
const CODEFREE_AUTH_PROVENANCE_PATH = path.join(
  PROJECT_ROOT,
  "docs/provenance/codefree-o-auth.json"
);
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
const EXPECTED_CODEFREE_AUTH = {
  artifactCount: 8,
  codefreeVersion: "1.6.1",
  packageCount: 12,
  profileId: "codefree-token-auth-v1",
  wrapperIntegrity: "sha512-qAF+QwjUyvINkjOHiJJt2KVYSMBmUUkwMCTGochzEZWFM2shhJkcSVfKWBjPMO4LQwdfpZQDXoJ3gR6GuV78Ug=="
};
const FORBIDDEN_CODEFREE_AUTH_KEYS = new Set([
  "refreshEncryptionKey",
  "signingSecret",
  "clientId",
  "clientSecret",
  "credentialFile",
  "userId",
  "token"
]);

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

function objectKeys(value) {
  if (Array.isArray(value)) {
    return value.flatMap(objectKeys);
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return [
    ...Object.keys(value),
    ...Object.values(value).flatMap(objectKeys)
  ];
}

function checkCodeFreeAuthProvenance() {
  let provenance;
  try {
    provenance = validateCodeFreeAuthProvenance(
      readJson(CODEFREE_AUTH_PROVENANCE_PATH)
    );
  } catch {
    fail("CodeFree-O authentication provenance is missing or invalid.");
    return;
  }
  if (provenance.artifacts.length !== EXPECTED_CODEFREE_AUTH.artifactCount) {
    fail("CodeFree-O authentication provenance artifact count changed.");
  }
  if (
    provenance.artifacts.some((artifact) =>
      artifact.codefreeVersion !== EXPECTED_CODEFREE_AUTH.codefreeVersion
    )
  ) {
    fail("CodeFree-O authentication provenance version changed.");
  }
  const packages = provenance.artifacts.flatMap((artifact) => artifact.packages);
  if (packages.length !== EXPECTED_CODEFREE_AUTH.packageCount) {
    fail("CodeFree-O authentication provenance package count changed.");
  }
  if (provenance.semanticProfile.id !== EXPECTED_CODEFREE_AUTH.profileId) {
    fail("CodeFree-O authentication semantic profile changed.");
  }
  if (provenance.wrapper.integrity !== EXPECTED_CODEFREE_AUTH.wrapperIntegrity) {
    fail("CodeFree-O authentication wrapper integrity changed.");
  }
  const forbidden = objectKeys(provenance).filter((key) =>
    FORBIDDEN_CODEFREE_AUTH_KEYS.has(key)
  );
  if (forbidden.length > 0) {
    fail("CodeFree-O authentication provenance contains private authentication fields.");
  }
}

checkPackageLock();
checkTransformerFile();
checkCodeFreeAuthProvenance();

if (!process.exitCode) {
  console.log("[provenance] SRDCloud dependency evidence matches recorded metadata.");
}

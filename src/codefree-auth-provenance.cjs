"use strict";

const fs = require("node:fs");
const path = require("node:path");

const CODEFREE_AUTH_PROVENANCE_PATH = path.resolve(
  __dirname,
  "../docs/provenance/codefree-o-auth.json"
);
const PROVENANCE_SCHEMA_VERSION = 2;
const SUPPORTED_PROFILE = Object.freeze({
  id: "codefree-token-auth-v1",
  minimumVersion: "1.4.0"
});
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const INTEGRITY_PATTERN = /^sha512-[A-Za-z0-9+/]+={0,2}$/;
const PACKAGE_PATTERN = /^@srdcloud\/codefree-[a-z0-9-]+$/;
const VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const FORBIDDEN_PROVENANCE_KEYS = new Set([
  "refreshEncryptionKey",
  "signingSecret",
  "clientId",
  "clientSecret",
  "credentialFile",
  "userId",
  "token",
  "cfToken",
  "refreshCfToken"
]);

function provenanceError() {
  const error = new Error(
    "CodeFree-O authentication provenance is unavailable or invalid."
  );
  error.code = "PROVENANCE_INVALID";
  return error;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasForbiddenKey(value) {
  if (Array.isArray(value)) {
    return value.some(hasForbiddenKey);
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).some(([key, child]) =>
    FORBIDDEN_PROVENANCE_KEYS.has(key) || hasForbiddenKey(child)
  );
}

function validatePackage(value) {
  return isRecord(value) &&
    Object.keys(value).length === 2 &&
    PACKAGE_PATTERN.test(value.packageName) &&
    INTEGRITY_PATTERN.test(value.integrity);
}

function validateArtifact(value) {
  return isRecord(value) &&
    Object.keys(value).length === 6 &&
    VERSION_PATTERN.test(value.codefreeVersion) &&
    typeof value.platform === "string" &&
    /^(darwin|linux|win32)-(arm64|x64)$/.test(value.platform) &&
    typeof value.binaryPath === "string" &&
    /^(?:bin\/codefree-o|bin\/codefree-o\.exe)$/.test(value.binaryPath) &&
    Number.isSafeInteger(value.binaryBytes) &&
    value.binaryBytes > 0 &&
    SHA256_PATTERN.test(value.binarySha256) &&
    Array.isArray(value.packages) &&
    value.packages.length > 0 &&
    value.packages.every(validatePackage);
}

function validateCodeFreeAuthProvenance(value) {
  if (
    !isRecord(value) ||
    hasForbiddenKey(value) ||
    value.schemaVersion !== PROVENANCE_SCHEMA_VERSION ||
    !isRecord(value.wrapper) ||
    Object.keys(value.wrapper).length !== 3 ||
    value.wrapper.packageName !== "@srdcloud/codefree-o" ||
    !VERSION_PATTERN.test(value.wrapper.version) ||
    !INTEGRITY_PATTERN.test(value.wrapper.integrity) ||
    !isRecord(value.semanticProfile) ||
    Object.keys(value.semanticProfile).length !== 2 ||
    value.semanticProfile.id !== SUPPORTED_PROFILE.id ||
    value.semanticProfile.minimumVersion !== SUPPORTED_PROFILE.minimumVersion ||
    !Array.isArray(value.artifacts) ||
    value.artifacts.length === 0 ||
    !value.artifacts.every(validateArtifact)
  ) {
    throw provenanceError();
  }

  const identities = new Set();
  const packageNames = new Set();
  for (const artifact of value.artifacts) {
    const identity = [
      artifact.codefreeVersion,
      artifact.platform,
      artifact.binaryBytes,
      artifact.binarySha256
    ].join("|");
    if (identities.has(identity)) {
      throw provenanceError();
    }
    identities.add(identity);

    for (const packageRecord of artifact.packages) {
      if (packageNames.has(packageRecord.packageName)) {
        throw provenanceError();
      }
      packageNames.add(packageRecord.packageName);
    }
  }

  return value;
}

function loadCodeFreeAuthProvenance(filePath = CODEFREE_AUTH_PROVENANCE_PATH) {
  try {
    return validateCodeFreeAuthProvenance(
      JSON.parse(fs.readFileSync(filePath, "utf8"))
    );
  } catch (error) {
    if (error?.code === "PROVENANCE_INVALID") {
      throw error;
    }
    throw provenanceError();
  }
}

function matchKnownCodeFreeArtifact(provenance, identity) {
  const matches = provenance.artifacts.filter((artifact) =>
    artifact.codefreeVersion === identity.codefreeVersion &&
    artifact.platform === identity.platform &&
    artifact.binaryBytes === identity.binaryBytes &&
    artifact.binarySha256 === identity.binarySha256
  );
  if (matches.length > 1) {
    throw provenanceError();
  }
  return matches[0] || null;
}

module.exports = {
  CODEFREE_AUTH_PROVENANCE_PATH,
  FORBIDDEN_PROVENANCE_KEYS,
  loadCodeFreeAuthProvenance,
  matchKnownCodeFreeArtifact,
  validateCodeFreeAuthProvenance
};

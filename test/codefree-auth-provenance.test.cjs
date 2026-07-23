"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  loadCodeFreeAuthProvenance,
  matchKnownCodeFreeArtifact,
  validateCodeFreeAuthProvenance
} = require("../src/codefree-auth-provenance.cjs");

test("tracked provenance covers eight binaries and twelve official packages", () => {
  const provenance = loadCodeFreeAuthProvenance();

  assert.equal(provenance.schemaVersion, 2);
  assert.equal(provenance.wrapper.packageName, "@srdcloud/codefree-o");
  assert.equal(provenance.wrapper.version, "1.5.1");
  assert.equal(provenance.semanticProfile.id, "codefree-token-auth-v1");
  assert.equal(provenance.semanticProfile.minimumVersion, "1.4.0");
  assert.equal(provenance.artifacts.length, 8);
  assert.equal(
    provenance.artifacts.flatMap((artifact) => artifact.packages).length,
    12
  );
});

test("known lookup returns null instead of rejecting an unknown identity", () => {
  const provenance = loadCodeFreeAuthProvenance();
  const reviewed = provenance.artifacts[0];

  assert.equal(matchKnownCodeFreeArtifact(provenance, reviewed), reviewed);
  assert.equal(matchKnownCodeFreeArtifact(provenance, {
    ...reviewed,
    binarySha256: "f".repeat(64)
  }), null);
});

test("schema rejects duplicate packages and private fields", () => {
  const duplicate = structuredClone(loadCodeFreeAuthProvenance());
  duplicate.artifacts[1].packages.push(duplicate.artifacts[0].packages[0]);
  assert.throws(
    () => validateCodeFreeAuthProvenance(duplicate),
    (error) => error.code === "PROVENANCE_INVALID"
  );

  const privateValue = structuredClone(loadCodeFreeAuthProvenance());
  privateValue.refreshEncryptionKey = "fixture";
  assert.throws(
    () => validateCodeFreeAuthProvenance(privateValue),
    (error) => error.code === "PROVENANCE_INVALID"
  );
});

test("schema rejects malformed or duplicate public artifact metadata", () => {
  const mutations = [
    (value) => {
      value.artifacts[0].binarySha256 = "not-a-digest";
    },
    (value) => {
      value.artifacts[0].binaryBytes = 0;
    },
    (value) => {
      value.artifacts[0].packages[0].integrity = "sha256-invalid";
    },
    (value) => {
      value.artifacts.push(structuredClone(value.artifacts[0]));
    },
    (value) => {
      value.artifacts[0].packages = [];
    },
    (value) => {
      value.semanticProfile.id = "unknown-profile";
    }
  ];

  for (const mutate of mutations) {
    const value = structuredClone(loadCodeFreeAuthProvenance());
    mutate(value);
    assert.throws(
      () => validateCodeFreeAuthProvenance(value),
      (error) => error.code === "PROVENANCE_INVALID"
    );
  }
});

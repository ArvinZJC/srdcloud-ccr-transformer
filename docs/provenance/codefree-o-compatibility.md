# CodeFree-O Compatibility

This is the current contributor reference for the CodeFree-O contracts mirrored by the SRDCloud extension. User setup and troubleshooting remain in [README.md](../../README.md). CodeFree-O is not imported by this extension and is not the restored transformer source; that source remains `codefree-helper` 1.2.2, with independent evidence in [srdcloud-transformer.md](srdcloud-transformer.md).

## Current Review

| Item | Status |
| --- | --- |
| Latest reviewed release | CodeFree-O **1.9.0**, reviewed 2026-10-16 |
| Artifact coverage | All 12 official platform packages; eight unique executables |
| Installed artifact | macOS ARM64 executable and wrapper matched the published artifacts |
| Required extension changes | Client identity and request marker updated; auth extraction adapted to signing order and generation-aware persistence |
| Active machine-readable baseline | [codefree-o-auth.json](codefree-o-auth.json), schema v2, semantic profile `codefree-token-auth-v1` |
| Verification | 157 tests, syntax and provenance checks passed; restarted CCR gateway reported the project extension healthy |

The [1.9.0 review](codefree-reviews/1.x.md#190-review-evidence) records exact identities, changes, and verification scope. Authenticated chat, model discovery, and Fusion requests remain unverified; gateway startup does not establish their success. Auxiliary MCP executable semantics are outside this review.

## Contract Boundary

The extension tracks these observable CodeFree-O properties:

- the client identifies itself with `clientType: codefree-o`, the package version in `clientVersion`, and `User-Agent: opencode/<version>`;
- chat and embedding requests retain the same service routing boundary and, from 1.9.0, include `codefreeClient: codefreeo`;
- the incoming session-affinity header is projected to `sessionId`, the selected model is projected to `modelName`, and the internal subservice override is consumed before the request is sent;
- model discovery retains the versioned CodeFree-O route and the response fields used for `modelName`, `maxTokens`, `maxOutputTokens`, and model type.
- version-2 refresh credentials use an AES-256-GCM envelope with version, IV, ciphertext, and authentication-tag components;
- access tokens are acquired lazily, reused while more than 60 seconds remain, and never persisted by this extension;
- refresh-token rotation is persisted owner-only and atomically before an access token becomes reusable, with bounded recovery from concurrent CodeFree-O updates;
- token refresh requests negotiate JSON and accept either JSON or form-encoded success responses before normalizing the returned token fields;
- modern requests use `X-Cf-Token`, `userId`, `projectId`, `X-Cf-AppId`, `X-Cf-Timestamp`, `X-Cf-Nonce`, and `X-Cf-Signature`;
- the HMAC-SHA256 signing input is only the uppercase HTTP method, app/client ID, Unix timestamp, and nonce joined by newlines. The URL, body, and other headers are not signed;
- model discovery retries once after a 401 with a forced refresh. Normal CCR chat, embedding, and Fusion requests cannot use that retry because the CCR provider-hook boundary does not receive the upstream response.

API-key authentication from the restored `codefree-helper` behavior remains a deprecated compatibility fallback only when modern configuration is absent. Modern configuration takes precedence and fails closed when invalid.

## Verification Boundary

`npm run check:provenance` verifies `codefree-helper` because it is a locked repository dependency and the source of the restored transformer. It also validates the non-secret schema-v2 [codefree-o-auth.json](codefree-o-auth.json), its eight artifact groups and 12 package records, and rejects private authentication-field names.

CodeFree-O remains a global, platform-specific executable rather than a repository dependency. Normal provenance verification does not require the executable or network access. Local setup always validates the tracked semantic profile; exact identity matching determines only whether the result is reviewed or locally compatible.

An exact identity in the active baseline is labelled `known-artifact`. An unknown fingerprint at CodeFree-O 1.4.0 or later is labelled `semantic-contract` only after the same encryption, refresh, expiry, signing, and header relationships pass. This confirms local compatibility, not publication by the reviewed npm account. Historical snapshots are evidence only and do not expand runtime matching.

The setup helper validates the full contract before extracting required material and writing private local configuration. Never record recovered protocol values, user-specific credentials, identities, tokens, signatures, or local paths in the public artifact register or snapshots.

## Upgrade Review

1. Record exact wrapper and platform versions, tarball URLs and integrities, extracted binary sizes, and SHA-256 values for the complete official matrix. Confirm the installed executable and wrapper match their published artifacts.
2. Compare client version, `User-Agent`, provider routing, header projection, subservice behavior, and model discovery. Re-review encryption, refresh request/response behavior, cache skew, rotation, modern headers, and the exact signing input.
3. Update runtime behavior only for observed contract changes and add focused regression coverage. Validate every unique executable before recording reviewed fingerprints; compatible unknown fingerprints may pass the semantic profile but do not establish publisher provenance. Never record recovered values.
4. Preserve the outgoing active artifact matrix as an exact versioned snapshot if it is not already archived. Update the active [codefree-o-auth.json](codefree-o-auth.json) and its expected checks, save the new reviewed snapshot, and add its source to the [artifact register](codefree-reviews/artifacts.md#snapshot-sources).
5. Run `npm test`, `npm run check`, `npm run check:provenance`, and `git diff --check`. Validate snapshot schema, version consistency, relative links and anchors, and exact preservation of historical identities after moving records. Normal provenance checks cover the active baseline only.
6. After config or extension changes, restart CCR Desktop and verify the live app. Exercise ordinary chat, model discovery when enabled, and relevant Fusion paths; record their outcomes separately and mark anything not exercised as unverified.
7. Update this summary and the [review archive](codefree-reviews/1.x.md). Update README and the existing Unreleased entry when warranted; do not add a changelog entry merely to repeat an unchanged conclusion.

## Review History and Maintenance

- [CodeFree-O 1.x reviews](codefree-reviews/1.x.md): identity and authentication baselines from 1.4.0, followed by version-specific review evidence through 1.9.0.
- [Artifact register](codefree-reviews/artifacts.md): published tarballs, historical integrity values, and fixed per-version JSON snapshots with source commits.

Keep this page focused on the current decision, shared contracts, and workflow. Add future entries in ascending version order using **Identity**, **Relevant changes**, **Decision**, and **Validation and limits**. Record differences from the preceding reviewed release; link to shared contracts and fixed artifact snapshots instead of repeating them or pointing historical reviews at the moving active baseline. Preserve exact hashes, integrities, material fixes, and verification limits. If the archive becomes unwieldy, split it into version ranges without splitting a review, and update links. Historical records are not current guarantees.

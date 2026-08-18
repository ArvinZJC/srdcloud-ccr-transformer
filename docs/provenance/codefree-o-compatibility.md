# CodeFree-O Compatibility Provenance

The extension mirrors selected CodeFree-O client contracts without importing the CodeFree-O executable. This record identifies the published artifacts used to review those contracts and the boundary that must be rechecked when CodeFree-O changes.

CodeFree-O is not the restored transformer source. The readable transformer in this repository remains derived from `codefree-helper` 1.2.2, whose independent provenance and automated drift check are recorded in `srdcloud-transformer.md`.

## Compatibility Baseline

| Review | CodeFree-O | Result |
| --- | --- | --- |
| Client-identity baseline, 2026-07-17 | `1.4.0` | Default `clientVersion` and `User-Agent` aligned with the published client. |
| Structural compatibility review, 2026-07-23 | `1.5.1` | Default client identity updated; request normalization, model-limit, and Fusion behavior remained compatible. |
| Token-authentication review, 2026-07-23 | `1.5.1` | Preferred token caching, refresh rotation, and request signing reproduced with all 12 official platform packages reviewed. |
| Maintenance compatibility review, 2026-07-27 | `1.5.2` | Default client identity and reviewed artifact matrix updated; the tracked request and token-authentication contracts remained compatible. |
| Maintenance compatibility review, 2026-08-18 | `1.6.0` | Default client identity and reviewed artifact matrix updated; all 12 official packages retain the tracked request and token-authentication contracts. |

## Published Artifacts

The current review compared the npm wrapper and every optional 1.6.0 platform package. The platform artifacts are recorded because the wrapper contains installation logic, not the compiled runtime whose embedded contracts were inspected.

| Package | Version | Tarball integrity |
| --- | --- | --- |
| `@srdcloud/codefree-o` | `1.4.0` | `sha512-WrQCdHgToUVw7vVSLeNMMFX/Y9rFau8ZGUoR/fYbeiwUN9ofvXZjAOK9NQjtxz03Q4zvtIfowBncy7Avs7YmMQ==` |
| `@srdcloud/codefree-o` | `1.5.1` | `sha512-HUyCu1khWtt7Er8N9Ni8tplGpELBX/ZJP4c0cdAdZCV6wiU0PKDHgPRlFcOS82xPVVPFqDCneRWc7fqr9eZqjw==` |
| `@srdcloud/codefree-o` | `1.5.2` | `sha512-/oD6m3rNTe5pt/jxOyQ6DB6jXIfHIi85KMoVAZxzJRgqZoHwgrmMje90p1xE2P/MI/bbUS/9/uTltQzdfMKMYw==` |
| `@srdcloud/codefree-o` | `1.6.0` | `sha512-mNWFlLlwZq196WanqxiNFOFJBM5r3dgFkgkANZRFWO8+FLM88FASU97HWtXOck01Xq1l2C76gVdvrdipZwVT9w==` |
| `@srdcloud/codefree-darwin-arm64` | `1.4.0` | `sha512-XB7RnBbbGa67AiUrtNzjE9c7q0Dm3Lk5FMQrzndQVLWmUB4hTuKGvSAPWqCp32KweCUvCbz3tYMc0ep2xU8CPg==` |
| All 12 official platform packages | `1.6.0` | Individual npm integrities are recorded in `codefree-o-auth.json`. |

Published tarballs:

- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.4.0.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.5.1.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.5.2.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.6.0.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-darwin-arm64/-/codefree-darwin-arm64-1.4.0.tgz`
- The 12 version-1.6.0 platform tarballs named in `codefree-o-auth.json`

Extracted platform binaries:

| Version | Published path | Size | SHA-256 |
| --- | --- | ---: | --- |
| `1.4.0` | `bin/opencode` | `98451554` bytes | `3be1c45958a5fcb50e9f116fd85356a8b30c7988fc93dcffbbd69e32d984d58e` |
| `1.5.1` | Eight unique platform binaries | Historical review | Eight reviewed SHA-256 identities |
| `1.5.2` | Eight unique platform binaries | See `codefree-o-auth.json` | Eight reviewed SHA-256 identities |
| `1.6.0` | Eight unique platform binaries | See `codefree-o-auth.json` | Eight reviewed SHA-256 identities |

## Contract Boundary

The extension tracks these observable CodeFree-O properties:

- the client identifies itself with `clientType: codefree-o`, the package version in `clientVersion`, and `User-Agent: opencode/<version>`;
- chat and embedding requests retain the same service routing boundary;
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

## 1.5.2 Review Evidence

The 1.5.1 macOS ARM64 baseline and the complete 1.5.2 package matrix were compared. The 12 official 1.5.2 packages reduce to eight unique executables: macOS ARM64/x64, Windows ARM64/x64, Linux ARM64/x64 glibc, and Linux ARM64/x64 musl. Every executable passed the same semantic authentication validator, and the locally installed macOS ARM64 executable exactly matched its published artifact.

The CodeFree provider still uses the same chat and embedding routing, client type, session and model header projection, subservice handling, signed request transport, model-response mapping, and model-limit request and response contract used by this extension. The reviewed 1.5.2 anchors match the 1.5.1 structure and occurrence counts; the published client identity is the only tracked request-contract value that changed.

The token-authentication review additionally verified the lazy access-token cache, 60-second refresh skew, flexible refresh response fields, refresh-token rotation, version-2 encrypted credential envelope, modern request header set, and method-only HMAC input. The machine-readable artifact identity and extraction profile are recorded in `codefree-o-auth.json`.

Recovered protocol values and all user-specific credentials, identities, tokens, signatures, and local paths are intentionally excluded from tracked provenance. The setup helper validates the full authentication contract before extracting required material and writes it directly to private local configuration.

An exact reviewed identity is labeled `known-artifact`. An unknown fingerprint at CodeFree-O 1.4.0 or later can be labeled `semantic-contract` only after the same encryption, refresh, expiry, signing, and header relationships pass. `semantic-contract` demonstrates local compatibility; it is not a claim that an unknown binary was published by the reviewed npm account.

The npm wrapper continues to install the selected executable as `bin/codefree-o.exe` and verify that it reports the wrapper version. Its post-install implementation is unchanged from 1.5.1; only wrapper and optional-dependency version metadata changed.

This was a structural artifact comparison, not a substitute for a live request through CCR Desktop and the installed CodeFree service account.

## 1.6.0 Review Evidence

The complete 1.6.0 package matrix was reviewed. Its 12 official platform packages reduce to eight unique executables across macOS ARM64/x64, Windows ARM64/x64, Linux ARM64/x64 glibc, and Linux ARM64/x64 musl. Every executable passed the existing semantic authentication validator, and the installed macOS ARM64 executable exactly matches the published 1.6.0 artifact at `106525922` bytes with SHA-256 `9d1da2581a1da8b03758b2b40cecc05f0e0808a09fa47af5a692dd4f9fcc3d93`.

Comparing the 1.5.2 and 1.6.0 macOS ARM64 executables confirms that the tracked chat, embedding, and model-discovery routes remain present, as do the client type, session and model projection, subservice, model-limit fields, and result handling used by this extension. The existing validator confirms the encryption, refresh, expiry, signing, and modern-header relationships in all eight unique 1.6.0 executables. The published client identity changed from 1.5.2 to 1.6.0, which is the observed request-contract change reflected in the runtime default.

The 1.6.0 npm wrapper retains the same executable installation and version check. Its post-install implementation is byte-for-byte identical to 1.5.2; the wrapper package version and optional-dependency versions are the only wrapper changes.

Recovered protocol values and all user-specific credentials, identities, tokens, signatures, and local paths remain excluded from tracked provenance. This was a structural artifact comparison, not a live request through CCR Desktop or the installed CodeFree service account.

## Verification Boundary

`npm run check:provenance` verifies `codefree-helper` because it is a locked repository dependency and the source of the restored transformer. It also validates the non-secret schema-v2 `codefree-o-auth.json`, its eight artifact groups and 12 package records, and rejects private authentication-field names.

CodeFree-O remains a global, platform-specific executable rather than a repository dependency. Normal provenance verification does not require the executable or network access. Local setup always validates the tracked semantic profile; exact identity matching determines only whether the result is reviewed or locally compatible.

## Upgrade Review Checklist

When CodeFree-O is upgraded:

1. Record the exact wrapper and platform package versions, tarballs, integrity, extracted binary size, and SHA-256.
2. Confirm the installed executable matches the published platform artifact.
3. Compare the client version, `User-Agent`, provider routing, header projection, subservice behavior, and model discovery contract.
4. Re-review credential encryption, refresh request/response behavior, cache skew, rotation, modern header names, and the exact signing input.
5. Record new reviewed fingerprints when published artifacts are audited. Compatible unknown fingerprints may pass the existing semantic profile, but never record recovered values.
6. Update runtime defaults only for observed contract changes and add focused regression coverage.
7. Run `npm test`, `npm run check`, `npm run check:provenance`, and `git diff --check`.
8. Restart CCR Desktop and manually verify one ordinary chat request, model discovery when enabled, and the relevant Fusion paths.

# CodeFree-O Artifact Register

See the [current reference](../codefree-o-compatibility.md) for active contracts and the [review archive](1.x.md) for version-specific conclusions. These are recorded review identities, not a fresh download or revalidation of older releases.

## Snapshot Sources

The JSON snapshots preserve complete wrapper integrities, semantic profiles, platform package integrities, binary paths, sizes, and SHA-256 values. Versions 1.5.1–1.8.0 were recovered byte-for-byte from the commits below; 1.9.0 was copied from the reviewed working-tree baseline. Each snapshot contains eight artifact groups and 12 platform package records. Version 1.4.0 has only the wrapper and macOS ARM64 evidence recorded below; no complete platform matrix is claimed.

| Version | Immutable review snapshot | Source commit or review |
| --- | --- | --- |
| 1.5.1 | [1.5.1.json](artifacts/1.5.1.json) | `8917c96a6e9a4f3fe36f186e3108270941b4bd32` |
| 1.5.2 | [1.5.2.json](artifacts/1.5.2.json) | `30db2608610a589ebb0af29766b88ff07ebc2874` |
| 1.6.0 | [1.6.0.json](artifacts/1.6.0.json) | `ea1250cc9c8cd8a005e8e4644b71e28a4ee7a756` |
| 1.6.1 | [1.6.1.json](artifacts/1.6.1.json) | `bf25792814a36701705a169a5821ff673261c79a` |
| 1.6.2 | [1.6.2.json](artifacts/1.6.2.json) | `9c720e244afd43e2f39febd272e392d1e88513a2` |
| 1.7.0 | [1.7.0.json](artifacts/1.7.0.json) | `47d92a99f8727c74221f47a4202af23302fecdf5` |
| 1.8.0 | [1.8.0.json](artifacts/1.8.0.json) | `1285eb5e8dd296ac53d6699026671dec36a5fefe` |
| 1.9.0 | [1.9.0.json](artifacts/1.9.0.json) | 1.9.0 review (2026-10-16) |

The active [codefree-o-auth.json](../codefree-o-auth.json) remains the only baseline consumed by setup and normal provenance checks. Archive snapshots do not extend runtime `known-artifact` matching. Preserve an existing snapshot when advancing that baseline; record corrections explicitly instead of silently replacing historical evidence.

## Published Artifacts

The 1.9.0 review compared the npm wrapper and every optional 1.9.0 platform package. The platform artifacts are recorded because the wrapper contains installation logic, not the compiled runtime whose embedded contracts were inspected.

| Package | Version | Tarball integrity |
| --- | --- | --- |
| `@srdcloud/codefree-o` | `1.4.0` | `sha512-WrQCdHgToUVw7vVSLeNMMFX/Y9rFau8ZGUoR/fYbeiwUN9ofvXZjAOK9NQjtxz03Q4zvtIfowBncy7Avs7YmMQ==` |
| `@srdcloud/codefree-o` | `1.5.1` | `sha512-HUyCu1khWtt7Er8N9Ni8tplGpELBX/ZJP4c0cdAdZCV6wiU0PKDHgPRlFcOS82xPVVPFqDCneRWc7fqr9eZqjw==` |
| `@srdcloud/codefree-o` | `1.5.2` | `sha512-/oD6m3rNTe5pt/jxOyQ6DB6jXIfHIi85KMoVAZxzJRgqZoHwgrmMje90p1xE2P/MI/bbUS/9/uTltQzdfMKMYw==` |
| `@srdcloud/codefree-o` | `1.6.0` | `sha512-mNWFlLlwZq196WanqxiNFOFJBM5r3dgFkgkANZRFWO8+FLM88FASU97HWtXOck01Xq1l2C76gVdvrdipZwVT9w==` |
| `@srdcloud/codefree-o` | `1.6.1` | `sha512-qAF+QwjUyvINkjOHiJJt2KVYSMBmUUkwMCTGochzEZWFM2shhJkcSVfKWBjPMO4LQwdfpZQDXoJ3gR6GuV78Ug==` |
| `@srdcloud/codefree-o` | `1.6.2` | `sha512-BJMNuOJUX2NCdFev6Njphu4JGX6yZry70yhk4rS+ouATbEqDE+1h/jQAtFbU4QpGsUKE8pT3lkJCIZLS5Z1ZPA==` |
| `@srdcloud/codefree-o` | `1.7.0` | `sha512-urY+1LpzPsGj9W7zMAihHH0QQbSXeMkg40yU8nUrBswWAvlfLvPlRVQ0TNXw/CFUXLiiz6Z/rLSXE7K7FpS9iw==` |
| `@srdcloud/codefree-o` | `1.8.0` | `sha512-ms0kQLJkqqIBtT1Rsaccoy+2nZNukr8LxPe0Vg2+g7MaZe6GM7lwF3aBOMm/ONBfWF8DdaoTE/OQM15HxHIszg==` |
| `@srdcloud/codefree-darwin-arm64` | `1.4.0` | `sha512-XB7RnBbbGa67AiUrtNzjE9c7q0Dm3Lk5FMQrzndQVLWmUB4hTuKGvSAPWqCp32KweCUvCbz3tYMc0ep2xU8CPg==` |
| `@srdcloud/codefree-o` | `1.9.0` | `sha512-lx9aa3z4dCOc/mC/EzsjkJGD0gGza+ct7APF0czKP3c3p646ElwNJiYWs1yMJCv6or3AT5240arFwp/hwQZyKQ==` |
| All 12 official platform packages | `1.9.0` | Individual npm integrities are recorded in [1.9.0 snapshot](artifacts/1.9.0.json). |

Published tarballs:

- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.4.0.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.5.1.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.5.2.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.6.0.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.6.1.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.6.2.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.7.0.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.8.0.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-darwin-arm64/-/codefree-darwin-arm64-1.4.0.tgz`
- `https://registry.npmjs.org/@srdcloud/codefree-o/-/codefree-o-1.9.0.tgz`
- The 12 version-1.9.0 platform tarballs named in [1.9.0 snapshot](artifacts/1.9.0.json)

Extracted platform binaries:

| Version | Published path | Size | SHA-256 |
| --- | --- | ---: | --- |
| `1.4.0` | `bin/opencode` | `98451554` bytes | `3be1c45958a5fcb50e9f116fd85356a8b30c7988fc93dcffbbd69e32d984d58e` |
| `1.5.1` | Eight unique platform binaries | [Snapshot](artifacts/1.5.1.json) | Eight reviewed SHA-256 identities |
| `1.5.2` | Eight unique platform binaries | [Snapshot](artifacts/1.5.2.json) | Eight reviewed SHA-256 identities |
| `1.6.0` | Eight unique platform binaries | [Snapshot](artifacts/1.6.0.json) | Eight reviewed SHA-256 identities |
| `1.6.1` | Eight unique platform binaries | [Snapshot](artifacts/1.6.1.json) | Eight reviewed SHA-256 identities |
| `1.6.2` | Eight unique platform binaries | [Snapshot](artifacts/1.6.2.json) | Eight reviewed SHA-256 identities |
| `1.7.0` | Eight unique platform binaries | [Snapshot](artifacts/1.7.0.json) | Eight reviewed SHA-256 identities |
| `1.8.0` | Eight unique platform binaries | [Snapshot](artifacts/1.8.0.json) | Eight reviewed SHA-256 identities |
| `1.9.0` | Eight unique platform binaries | See [1.9.0 snapshot](artifacts/1.9.0.json) | Eight reviewed SHA-256 identities |

## Tarball Resolution

For each snapshot package record, the published tarball URL is `https://registry.npmjs.org/<packageName>/-/<unscopedPackageName>-<version>.tgz`; use the wrapper version for the wrapper and `codefreeVersion` for platform packages. Verify the recorded SHA-512 integrity before extracting a binary. The snapshots describe the CodeFree-O executable only, not the semantics of the auxiliary MCP executable.

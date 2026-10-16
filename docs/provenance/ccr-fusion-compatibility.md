# CCR Fusion Compatibility

This is the current contributor reference for the SRDCloud extension's integration with Claude Code Router (CCR) and `@the-next-ai/ai-gateway`. User setup and troubleshooting remain in [README.md](../../README.md).

## Current Review

| Item | Status |
| --- | --- |
| Latest reviewed release | CCR **3.1.3**, reviewed 2026-10-10 |
| Documented compatibility range | CCR Desktop 3.0.11–3.1.3; individual review points are listed in the archives |
| Required extension changes for 3.1.3 | None |
| Fusion vision shim | Still required for affected Responses-backed SRDCloud profiles |
| Release gateway | Pinned upstream source without CCR patches; exact identity in the linked review |
| Verification | 153 project tests, syntax and provenance checks, and five isolated installed-gateway smoke cases passed |

The [3.1.3 review](ccr-reviews/3.1.md#313-review-evidence) records the release commit, installed-bundle digest, relevant upstream changes, and exact verification scope. The loopback smoke cases cover direct requests, the derived vision hook, and exact/prefix/suffix Fusion matches. They do not verify real CodeFree authentication, model discovery, image analysis, hosted search, custom MCP execution, live streaming, or the complete desktop wrapper routing/recovery stack.

## Contract Boundary

The extension does not import CCR or gateway internals. Compatibility depends on these structural contracts:

| Boundary | Required behavior |
| --- | --- |
| Registration | The wrapper contributes a serializable `modulePath` descriptor through `coreGateway.config.plugins`; the gateway process invokes `createGatewayPlugin()` to create executable provider hooks. Manifest permissions and surfaces must cover the wrapper APIs actually used. |
| Provider hooks | Inputs include the original request, `sourceAdapterKey`, resolved model, canonical `standardRequest`, target provider configuration, and target-protocol `upstreamRequest`. Primary and derived vision hooks use distinct keys and capability-qualified provider names. |
| Source adapters | Relevant keys are `anthropic_messages`, `openai_chat`, and `openai_responses`. |
| Fusion projection | Preserve canonical resolved model, input, instructions, function tools, tool results, tool choice, generation options, and reasoning fields. Anthropic sources use the extension's canonical projection; other sources use CCR's materialised target body. Ordinary non-Fusion requests retain their original-body path. |
| Profile matching | Preserve exact aliases, prefixes, suffixes, execution flags, and Fusion capability metadata. Tool count alone does not identify Fusion. |
| Vision | Built-in primary and fallback vision selectors without a direct base URL use Chat Completions, including when the provider's primary capability is Responses. |

The removable vision shim adds the required Chat Completions capability while preserving Responses. Keep it idempotent, respect explicit opt-out, and avoid compatibility-only writes to saved or generated gateway configuration. Remove it only after verifying that upstream routes affected profiles correctly without it.

## Upgrade Review

1. Identify the release tag and peeled commit, local checkout differences, installed version, and gateway artifact. Check registry integrity plus release build overrides, pinned source, and patches; a package version alone may not identify the shipped gateway.
2. Compare the contracts above, including registration permissions, provider-name matching, canonical request fields, adapters, profile matching, and vision routing. Make only evidence-backed extension changes.
3. Run `npm test` and `npm run check`; run `npm run check:provenance` when dependency evidence, restored behavior, or provenance metadata changes. Exercise the installed gateway in isolation where practical.
4. After config or extension changes, restart CCR Desktop and verify the live app. Record authenticated chat, model discovery, vision/fallback, search, custom MCP, canonical tool-result, direct-request, and streaming outcomes separately. Mark anything not exercised as unverified.
5. Update this current summary and the appropriate review archive. Update the README range and existing Unreleased compatibility entry when warranted; do not add a changelog entry merely to repeat an unchanged conclusion.

## Review History and Maintenance

- [CCR 3.0 reviews](ccr-reviews/3.0.md): baseline identities and reviews through 3.0.22, including permission declarations, the serializable module migration, and vision fallback support.
- [CCR 3.1 reviews](ccr-reviews/3.1.md): reviews from 3.1.0 onward, including pinned release gateway identities and isolated bundle checks.
- [Gateway artifact register](ccr-reviews/gateway-artifacts.md): published tarball URLs and integrity values shared by the reviews.

Keep this page focused on the current decision, shared contracts, and workflow. Add future review entries in ascending version order under the relevant minor-version archive, using four short parts: **Identity**, **Relevant changes**, **Decision**, and **Validation and limits**. Record only differences from the preceding reviewed release and link to shared contracts or artifact identities instead of repeating them. Preserve exact commits, hashes, material fixes, and verification limits. If an archive becomes unwieldy, split it into version ranges without splitting an individual review, and update these links. Historical reviews may be condensed without changing their conclusions or verification scope; do not present them as current guarantees. Validate relative links and anchors after moving records.

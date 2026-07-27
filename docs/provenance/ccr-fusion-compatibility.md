# CCR Fusion Compatibility Provenance

The Fusion bridge and removable vision compatibility shim depend on structural
contracts supplied by Claude Code Router (CCR) and
`@the-next-ai/ai-gateway`. This record identifies the versions reviewed and the
contract boundary that must be rechecked when either project changes.

The extension does not import CCR or gateway internals. Runtime compatibility
is determined through structural checks and regression tests so ordinary
non-Fusion traffic can retain its existing path.

## Compatibility Baseline

| Review | CCR | `@the-next-ai/ai-gateway` | Result |
| --- | --- | --- | --- |
| Implementation baseline | `v3.0.11` (`9cd0aab309c696e2e080112bfa0c82031de3d832`) | `1.0.7` | Fusion bridge and vision shim designed and implemented against these contracts. |
| Structural compatibility review, 2026-07-15 | `v3.0.13` (`ae265ec934b63a92d2135bfdc9ac3cb52783c42a`) | `1.0.9` | No runtime transformer change required. |
| Structural compatibility review, 2026-07-21 | `v3.0.15` (`f22f2a4c79b2ad51b2b947377f285769470f6e09`) | `1.0.12` | No runtime transformer change required; the vision shim remains necessary. |
| Structural compatibility review, 2026-07-27 | `v3.0.16` (`ef4efe6a9d967f4bb627c8ef549de35f0b129cf7`) | `1.0.12` | Explicit plugin access declarations required; no request-transformer change required and the vision shim remains necessary. |

Published gateway packages used for the comparison:

- `@the-next-ai/ai-gateway` 1.0.7: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.7.tgz`
  with lockfile integrity
  `sha512-HJtfjpBgjFEPQ6ub7nFTtEyxzzbrz6V5vQZfJOoHi3Jhpjob3W4h0UenTW6loHanJYucFIEh01SvB//Qj3ulcw==`.
- `@the-next-ai/ai-gateway` 1.0.9: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.9.tgz`
  with lockfile integrity
  `sha512-/nt/1ZciUgarfyJW6itfDIgKMa8HOgmt0RyPyvmUCDcbJGEEl0BNmd85Zz5boSwT70xcjNojds9DPsQXG7N+sQ==`.
- `@the-next-ai/ai-gateway` 1.0.12: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.12.tgz`
  with lockfile integrity
  `sha512-o092FXo18NwXyetqeS192jBH0dmrklpsFyU3LlOUloXOHODVraniYOUAVXzrhTYzD6pPqvVxAjI/6K2PY6hBQQ==`.

## Contract Boundary

The transformer relies on these provider-hook and virtual-model properties:

- provider hooks receive the original request, `sourceAdapterKey`, resolved
  model, canonical `standardRequest`, target provider configuration, and
  target-protocol `upstreamRequest`;
- the relevant source-adapter keys are `anthropic_messages`, `openai_chat`, and
  `openai_responses`;
- canonical Fusion state preserves the resolved base model, input,
  instructions, function tools, tool results, tool choice, generation options,
  and reasoning fields;
- virtual-model profiles expose exact aliases, prefixes, suffixes, execution
  flags, and Fusion capability metadata;
- built-in Fusion vision without a direct base URL is routed through the OpenAI
  Chat Completions capability, even when the provider's primary protocol is
  OpenAI Responses.

The last property is why the isolated vision compatibility shim remains needed
for affected SRDCloud profiles through CCR 3.0.16.

## 3.0.13 Review Evidence

The review compared CCR tags `v3.0.11` and `v3.0.13`, then compared the
published gateway packages at versions 1.0.7 and 1.0.9, including their source
maps. The provider-plugin contract, standard request parsing, source and target
adapters, virtual-model matching, and request materialisation used by this
extension did not change incompatibly.

Relevant CCR 3.0.13 changes were internal gateway extraction and refactoring,
proxy propagation for Fusion MCP processes, Fusion vision usage reporting,
hosted web-search improvements, provider routing work, and OpenAI Responses
stream metadata. None changes the transformer boundary above. CCR 3.0.13 still
normalises Fusion vision selectors for `openai_chat_completions`, and its
bundled vision MCP still sends an OpenAI Chat Completions request.

This was a structural source and package comparison, not a substitute for a
live request through an installed CCR Desktop build.

## 3.0.15 Review Evidence

The review compared CCR tags `v3.0.13` and `v3.0.15`, then compared the
published gateway packages at versions 1.0.9 and 1.0.12, including their source
maps. Provider-hook inputs and execution, source-adapter keys, virtual-model
matching, and the request and response plugin paths used by this extension did
not change incompatibly.

Gateway 1.0.12 adds a canonical `standardRequest.text` field for OpenAI
Responses requests. The extension already uses CCR's materialised
`upstreamRequest` for OpenAI Chat Completions and Responses sources, while its
own canonical projection is limited to Anthropic Messages sources. The new
field therefore requires no transformer projection change.

Relevant CCR 3.0.15 changes include router and configuration refactoring,
capability-specific aliases for provider plugins, effectively unlimited Fusion
tool-loop limits for non-decorative profiles, media tooling, and expanded
request logging. These changes preserve the contract boundary above. CCR
3.0.15 still normalises Fusion vision selectors for
`openai_chat_completions`, and its bundled vision MCP still sends an OpenAI
Chat Completions request, so the compatibility shim remains necessary.

This was a structural source and package comparison, not a substitute for a
live request through an installed CCR Desktop build.

## 3.0.16 Review Evidence

The review compared CCR tags `v3.0.15` and `v3.0.16`, then checked the single README-only commit on `main` after the release tag. The installed desktop bundle reported version 3.0.16. CCR still resolves `@the-next-ai/ai-gateway` 1.0.12 with the recorded integrity, so the provider-hook inputs, source adapters, canonical `standardRequest`, and target request materialisation used by the transformer did not change at that package boundary.

CCR 3.0.16 normalises configured provider-plugin names to compiled runtime or capability identities. The extension already targets the stable capability identity derived from the provider ID and protocol, so this correction requires no provider-hook change. CCR also continues to rewrite built-in Fusion vision selectors without a direct base URL to the `openai_chat_completions` capability, so the isolated vision compatibility shim remains necessary.

The material extension boundary change is CCR's new explicit plugin permission and surface enforcement. An enabled third-party JavaScript plugin without declared permissions is disabled during startup before its provider hook can register. The extension manifest now declares only the access exercised by its current implementation: trusted code loading, its app entry, its status route, core gateway configuration, and core provider plugins across the apps, gateway, and provider surfaces. The advanced config installer writes the same declarations when repairing an existing saved plugin entry.

This was a structural source, installed-version, and saved-config comparison. After the saved access declarations were repaired and the gateway restarted, fresh wrapper and gateway-plugin markers plus the extension status route confirmed successful startup. Authenticated Fusion vision, web search, custom MCP tools, canonical tool results, and ordinary non-Fusion traffic were not exercised and still require separate live verification.

## Upgrade Review Checklist

When CCR or `@the-next-ai/ai-gateway` is upgraded:

1. Record the CCR tag and commit plus the exact gateway version, tarball, and lockfile integrity.
2. Compare plugin manifest permissions and surfaces with every registration API the extension exercises.
3. Compare provider-plugin input fields and provider-name matching.
4. Compare `standardRequest` fields, source-adapter keys, parsers, and target request materialisation.
5. Compare virtual-model profile matching and Fusion capability metadata.
6. Confirm whether built-in vision still requires Chat Completions. Remove the shim only after CCR routes the affected Responses-backed selector without it.
7. Run `npm test` and `npm run check`.
8. Restart the installed CCR Desktop version and manually verify Fusion vision, web search, custom MCP tool execution, canonical tool results, and ordinary non-Fusion requests.

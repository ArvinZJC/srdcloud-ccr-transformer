# CCR Fusion Compatibility Provenance

The Fusion bridge and removable vision compatibility shim depend on structural contracts supplied by Claude Code Router (CCR) and `@the-next-ai/ai-gateway`. This record identifies the versions reviewed and the contract boundary that must be rechecked when either project changes.

The extension does not import CCR or gateway internals. Runtime compatibility is determined through structural checks and regression tests so ordinary non-Fusion traffic can retain its existing path.

## Compatibility Baseline

| Review | CCR | `@the-next-ai/ai-gateway` | Result |
| --- | --- | --- | --- |
| Implementation baseline | `v3.0.11` (`9cd0aab309c696e2e080112bfa0c82031de3d832`) | `1.0.7` | Fusion bridge and vision shim designed and implemented against these contracts. |
| Structural compatibility review, 2026-07-15 | `v3.0.13` (`ae265ec934b63a92d2135bfdc9ac3cb52783c42a`) | `1.0.9` | No runtime transformer change required. |
| Structural compatibility review, 2026-07-21 | `v3.0.15` (`f22f2a4c79b2ad51b2b947377f285769470f6e09`) | `1.0.12` | No runtime transformer change required; the vision shim remains necessary. |
| Structural compatibility review, 2026-07-27 | `v3.0.16` (`ef4efe6a9d967f4bb627c8ef549de35f0b129cf7`) | `1.0.12` | Explicit plugin access declarations required; no request-transformer change required and the vision shim remains necessary. |
| Structural compatibility review, 2026-07-29 | `v3.0.17` (`3b99fa239b581a787034cc4e3caf35640e32b35b`) | `1.0.14` | Gateway IPC requires a serializable module descriptor instead of executable wrapper registrations; no request-transformer change required and the vision shim remains necessary. |
| Structural compatibility review, 2026-08-03 | `v3.0.18` (`4a152d959c016b476220339e856c9f4f94624c42`) | `1.0.15` | No runtime transformer change required; the serializable module bridge remains compatible and the vision shim remains necessary. |
| Structural compatibility review, 2026-08-10 | `v3.0.19` (`b41890610cb3e4f40172e72b70211c5e4ff480e5`) | `1.0.16` | No runtime transformer change required; per-attempt capability routing preserves the provider-hook boundary and the vision shim remains necessary. |
| Structural compatibility review, 2026-08-10 | `v3.0.20` (`065be3bf991302a7b68bee1c3442efe303829d51`) | `1.0.16` | No runtime transformer change required; provider-context discovery and slash-model routing preserve the serializable module bridge and Fusion contracts. |
| Structural compatibility review, 2026-08-18 | `v3.0.21` (`f2860e165aa582c51e54487cb853f5177e78ead3`) | `1.0.17` | No runtime transformer change required; provider model refresh, gateway lifecycle changes, and the gateway package update preserve the module bridge and canonical Fusion boundary, while the vision shim remains necessary. |
| Structural compatibility review, 2026-08-27 | `v3.0.22` (`829298cf8bdcc6ddb9120a5a7c790c30227a1937`) | `1.0.18` | The module bridge and canonical Fusion boundary remain compatible; the vision shim remains necessary and now covers SRDCloud fallback models introduced by this release. |

Published gateway packages used for the comparison:

- `@the-next-ai/ai-gateway` 1.0.7: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.7.tgz` with lockfile integrity `sha512-HJtfjpBgjFEPQ6ub7nFTtEyxzzbrz6V5vQZfJOoHi3Jhpjob3W4h0UenTW6loHanJYucFIEh01SvB//Qj3ulcw==`.
- `@the-next-ai/ai-gateway` 1.0.9: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.9.tgz` with lockfile integrity `sha512-/nt/1ZciUgarfyJW6itfDIgKMa8HOgmt0RyPyvmUCDcbJGEEl0BNmd85Zz5boSwT70xcjNojds9DPsQXG7N+sQ==`.
- `@the-next-ai/ai-gateway` 1.0.12: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.12.tgz` with lockfile integrity `sha512-o092FXo18NwXyetqeS192jBH0dmrklpsFyU3LlOUloXOHODVraniYOUAVXzrhTYzD6pPqvVxAjI/6K2PY6hBQQ==`.
- `@the-next-ai/ai-gateway` 1.0.14: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.14.tgz` with lockfile integrity `sha512-ZVilhuxEoMxvMdPlVI55q6wm6JfWJyKLh9fS5uIAMZtc6Zzc0vf21coLYoP/hsqoNIQCchzkFgD5I2rHDG1QNA==`.
- `@the-next-ai/ai-gateway` 1.0.15: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.15.tgz` with lockfile integrity `sha512-U5SnIBGXHVq0uzzljpUb/hvND5cGehzMZegtvnB8+pRsRTM19yrAsPSaUocolB7JYun7TlKhi+BdOWp5Az17gA==`.
- `@the-next-ai/ai-gateway` 1.0.16: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.16.tgz` with lockfile integrity `sha512-9umpJ3gGROlXXGBHXHwOdhO9TEcQeG6AlnNmbccaUY5v64czQNFEod23mR31UfqLkv+TpHbKrcDtmuZ5//6S6w==`.
- `@the-next-ai/ai-gateway` 1.0.17: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.17.tgz` with lockfile integrity `sha512-KwHiWqBGVSQnbQlxZ41jCKqrOrZdzAMlgRB61AJyjenH9M8hMx/dGsRr0I+vNiU+jBvOvyih64eQRPMgO9QHsQ==`.
- `@the-next-ai/ai-gateway` 1.0.18: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.18.tgz` with lockfile integrity `sha512-KM9tMXQesW7V8URab97BhFpfABwLPhc6h/ybjaNGcCIg1Yoelu/wB9OjovbIjZO114h/hHvd7c50BSsbv/TdsA==`.

## Contract Boundary

The transformer relies on these provider-hook and virtual-model properties:

- provider hooks receive the original request, `sourceAdapterKey`, resolved model, canonical `standardRequest`, target provider configuration, and target-protocol `upstreamRequest`;
- the relevant source-adapter keys are `anthropic_messages`, `openai_chat`, and `openai_responses`;
- canonical Fusion state preserves the resolved base model, input, instructions, function tools, tool results, tool choice, generation options, and reasoning fields;
- virtual-model profiles expose exact aliases, prefixes, suffixes, execution flags, and Fusion capability metadata;
- built-in Fusion vision without a direct base URL is routed through the OpenAI Chat Completions capability, even when the provider's primary protocol is OpenAI Responses.

The last property is why the isolated vision compatibility shim remains needed for affected SRDCloud profiles through CCR 3.0.22.

## 3.0.13 Review Evidence

The review compared CCR tags `v3.0.11` and `v3.0.13`, then compared the published gateway packages at versions 1.0.7 and 1.0.9, including their source maps. The provider-plugin contract, standard request parsing, source and target adapters, virtual-model matching, and request materialisation used by this extension did not change incompatibly.

Relevant CCR 3.0.13 changes were internal gateway extraction and refactoring, proxy propagation for Fusion MCP processes, Fusion vision usage reporting, hosted web-search improvements, provider routing work, and OpenAI Responses stream metadata. None changes the transformer boundary above. CCR 3.0.13 still normalises Fusion vision selectors for `openai_chat_completions`, and its bundled vision MCP still sends an OpenAI Chat Completions request.

This was a structural source and package comparison, not a substitute for a live request through an installed CCR Desktop build.

## 3.0.15 Review Evidence

The review compared CCR tags `v3.0.13` and `v3.0.15`, then compared the published gateway packages at versions 1.0.9 and 1.0.12, including their source maps. Provider-hook inputs and execution, source-adapter keys, virtual-model matching, and the request and response plugin paths used by this extension did not change incompatibly.

Gateway 1.0.12 adds a canonical `standardRequest.text` field for OpenAI Responses requests. The extension already uses CCR's materialised `upstreamRequest` for OpenAI Chat Completions and Responses sources, while its own canonical projection is limited to Anthropic Messages sources. The new field therefore requires no transformer projection change.

Relevant CCR 3.0.15 changes include router and configuration refactoring, capability-specific aliases for provider plugins, effectively unlimited Fusion tool-loop limits for non-decorative profiles, media tooling, and expanded request logging. These changes preserve the contract boundary above. CCR 3.0.15 still normalises Fusion vision selectors for `openai_chat_completions`, and its bundled vision MCP still sends an OpenAI Chat Completions request, so the compatibility shim remains necessary.

This was a structural source and package comparison, not a substitute for a live request through an installed CCR Desktop build.

## 3.0.16 Review Evidence

The review compared CCR tags `v3.0.15` and `v3.0.16`, then checked the single README-only commit on `main` after the release tag. The installed desktop bundle reported version 3.0.16. CCR still resolves `@the-next-ai/ai-gateway` 1.0.12 with the recorded integrity, so the provider-hook inputs, source adapters, canonical `standardRequest`, and target request materialisation used by the transformer did not change at that package boundary.

CCR 3.0.16 normalises configured provider-plugin names to compiled runtime or capability identities. The extension already targets the stable capability identity derived from the provider ID and protocol, so this correction requires no provider-hook change. CCR also continues to rewrite built-in Fusion vision selectors without a direct base URL to the `openai_chat_completions` capability, so the isolated vision compatibility shim remains necessary.

The material extension boundary change was CCR's new explicit plugin permission and surface enforcement. An enabled third-party JavaScript plugin without declared permissions is disabled during startup before its provider hook can register. At that review point, the extension declared trusted code loading, its app entry, its status route, core gateway configuration, and direct core provider plugins across the apps, gateway, and provider surfaces. The 3.0.17 review below narrows those grants after removing the redundant direct provider-plugin registration.

This was a structural source, installed-version, and saved-config comparison. After the saved access declarations were repaired and the gateway restarted, fresh wrapper and gateway-plugin markers plus the extension status route confirmed successful startup. Authenticated Fusion vision, web search, custom MCP tools, canonical tool results, and ordinary non-Fusion traffic were not exercised and still require separate live verification.

## 3.0.17 Review Evidence

The review compared CCR tags `v3.0.16` and `v3.0.17`, verified that the local `main` checkout matches the release tag, and inspected the installed CCR Desktop 3.0.17 bundle. CCR now compiles the gateway configuration in the desktop process and sends it to a child process over an advanced-serialization IPC channel. Direct wrapper registrations containing `authenticate` or `transformRequest` functions therefore fail structured cloning before the gateway can start.

The extension's existing `modulePath` bridge is the correct process boundary. The wrapper now contributes only the serializable gateway module descriptor, and bundled `@the-next-ai/ai-gateway` 1.0.14 imports that module and calls `createGatewayPlugin()` inside the gateway process before registering its returned provider hooks. The wrapper no longer exercises CCR's direct core-provider-plugin API, so its provider surface and `core-provider-plugins` permission were removed from both the manifest and saved-config repair helper.

This change preserves the reviewed CCR 3.0.11–3.0.16 path. Those releases write the compiled gateway configuration as JSON, while gateway versions 1.0.7, 1.0.9, and 1.0.12 all load `createGatewayPlugin()` from the serializable `modulePath` descriptor. JSON transport discarded the redundant function-valued direct registrations before the gateway could use them, so removing those registrations does not change the effective provider-hook loading path on earlier reviewed releases.

CCR 3.0.17 retains the canonical provider-hook inputs used by the transformer and still rewrites Fusion vision selectors without a direct base URL to the `openai_chat_completions` capability. The request transformer and isolated vision compatibility shim therefore require no change.

This was a structural source and installed-bundle comparison plus a local structured-clone regression reproduction. A restarted CCR Desktop 3.0.17 instance reported healthy service and extension status, and fresh wrapper and gateway-module markers confirmed the current module path loaded. Authenticated chat and Fusion traffic still require separate live verification.

## 3.0.18 Review Evidence

The review compared CCR tags `v3.0.17` and `v3.0.18`, confirmed that the local `dev/3.1` tree matches the release tag, and verified that the installed CCR Desktop bundle reports version 3.0.18. The plugin service, desktop plugin import path, core gateway config compiler, and Fusion configuration sources used by this extension are unchanged. CCR still sends the compiled gateway configuration over advanced-serialization IPC, loads the extension through its serializable `modulePath`, and rewrites built-in Fusion vision selectors without a direct base URL to the `openai_chat_completions` capability.

The bundled `@the-next-ai/ai-gateway` update from 1.0.14 to 1.0.15 changes only `gateway/handler.ts` and `gateway/streaming-conversion.ts` in the published source maps. Those changes add retry handling for empty model output and extend optimistic virtual-model streaming, including native Anthropic and client-visible tool calls. The plugin loader, provider-plugin definitions, source and target adapters, canonical request types, and request-hook invocation remain unchanged. The SRDCloud hook does not define a response transformer, so these response-path changes require no extension code change.

This was a structural source, published-package, and installed-version comparison plus the existing 150-test extension suite. CCR Desktop was not running during the review, so restarted service status, authenticated chat, Fusion vision, web search, custom MCP tools, and canonical tool results still require separate live verification.

## 3.0.19–3.0.20 Review Evidence

The review compared CCR tags `v3.0.18`, `v3.0.19`, and `v3.0.20`, verified that the installed desktop bundle reports version 3.0.20, and inspected the local `main` checkout at `186fa619d24b8198515cf9e43acc1e6a13c94c17`. That checkout is five commits ahead of `v3.0.20`; the post-release changes affect documentation CI, a provider preset, and Windows raw-trace persistence rather than this extension's compatibility boundary.

CCR's plugin service is unchanged across the three release tags. It continues to collect the wrapper's serializable core-gateway plugin descriptor, while the gateway process loads `createGatewayPlugin()` from `modulePath` and registers the returned provider hooks. CCR 3.0.19 adds its own optional module-loaded authentication hook and moves provider capability routing into each upstream attempt, but it preserves third-party module descriptors, compiled provider-plugin aliases, and the provider-hook request boundary used by this extension. CCR 3.0.20 adds provider-context model discovery, capability-routing corrections, and exact slash-namespaced model handling without changing plugin loading or the canonical Fusion request contract.

The core gateway config compiler still rewrites built-in Fusion vision selectors without a direct base URL to `openai_chat_completions`. Fusion configuration parsing and virtual-model matching are unchanged, so the isolated vision compatibility shim remains necessary for affected Responses-backed SRDCloud profiles.

CCR 3.0.19 updates the bundled `@the-next-ai/ai-gateway` from 1.0.15 to 1.0.16, which CCR 3.0.20 retains. Comparing both published source maps shows only `upstream/client.ts` changed. Gateway 1.0.16 adds an Undici dispatcher so headers and response-body reads obey the configured upstream timeout; the plugin loader, provider-hook input and invocation, source and target adapters, canonical request types, virtual-model matching, and request materialisation are unchanged.

This was a structural source, published-package, installed-version, and local-test comparison. Restarted service status, authenticated chat, Fusion vision, web search, custom MCP tools, canonical tool results, and ordinary non-Fusion traffic were not exercised and still require separate live verification.

## 3.0.21 Review Evidence

The review compared CCR tags `v3.0.20` and `v3.0.21`, verified that the installed desktop bundle reports version 3.0.21, and inspected the local `main` checkout at `fcf3d85da1d6184666a5c6f73cb6e25653484cab`. That checkout is four commits ahead of `v3.0.21`; the post-release changes affect a Docker release workflow and usage-cache accounting rather than this extension's request compatibility boundary.

CCR 3.0.21 preserves the plugin service, serializable `modulePath` descriptor, gateway-process `createGatewayPlugin()` loading, and provider-hook request context used by this extension. Provider model auto-refresh, profile model allowlists, externally managed gateway reuse, and runtime configuration reload change provider and gateway lifecycle management without changing canonical `standardRequest`, virtual-model matching, source-adapter keys, or target request materialisation. The core gateway config compiler still rewrites built-in Fusion vision selectors without a direct base URL to `openai_chat_completions`, so the isolated vision compatibility shim remains necessary.

CCR updates the bundled `@the-next-ai/ai-gateway` from 1.0.16 to 1.0.17. Comparing the published source maps shows changes to cached-token usage accounting, Gemini schema conversion, upstream proxy-environment dispatch, timeout validation, and related response handling. The plugin loader, provider-hook input and invocation, canonical request types, source adapters used by this extension, virtual-model matching, and request materialisation remain compatible.

This was a structural source, published-package, installed-bundle, and local-test comparison. CCR Desktop was not restarted, so authenticated chat, model discovery, Fusion vision, web search, custom MCP tools, canonical tool results, and ordinary non-Fusion traffic still require separate live verification.

## 3.0.22 Review Evidence

The review compared CCR tags `v3.0.21` and `v3.0.22`, verified that the installed desktop bundle reports version 3.0.22, and inspected the local `main` checkout at `99f24806c6a2c660b16e53e95211c517448a6c90`. That checkout is one commit ahead of `v3.0.22`; the post-release changes affect sponsor links and an unrelated provider preset rather than this extension's compatibility boundary.

CCR 3.0.22 preserves the plugin service path used by this extension, the serializable `modulePath` descriptor, gateway-process `createGatewayPlugin()` loading, provider-hook request inputs, source-adapter keys, and canonical `standardRequest`. The new gateway request-transform registration surface is independent of the wrapper's core-gateway configuration and requires no additional permission or surface declaration here.

Fusion vision now accepts fallback models and a retry count, injects more explicit media-reference tool instructions, validates image payloads before forwarding, and can retry across configured vision models. CCR still rewrites built-in primary and fallback vision selectors without a direct base URL to `openai_chat_completions`, and the vision MCP still sends Chat Completions requests. The compatibility shim therefore remains necessary. It now examines both the primary selector and `fallbackModels`, deduplicates matching SRDCloud models, and fails closed before adding the capability if any matching model is absent from the provider model list.

CCR updates the bundled `@the-next-ai/ai-gateway` from 1.0.17 to 1.0.18. Comparing the published source maps shows changes to Anthropic-compatible authorization headers, optional internal-tool result folding, content-addressed multimodal references, optimistic-stream tool-result delivery and keepalives, and Undici dispatcher handling. The plugin loader is unchanged, and the provider-hook input and invocation still include the original request, `sourceAdapterKey`, resolved model, target provider state, `upstreamRequest`, and canonical `standardRequest`.

This was a structural source, published-package, installed-bundle, saved-config, and local-test comparison. CCR Desktop was not running during the review, so restarted service status, authenticated chat, model discovery, Fusion vision fallback execution, web search, custom MCP tools, canonical tool results, and ordinary non-Fusion traffic still require separate live verification.

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

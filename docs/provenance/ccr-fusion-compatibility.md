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

Published gateway packages used for the comparison:

- `@the-next-ai/ai-gateway` 1.0.7: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.7.tgz`
  with lockfile integrity
  `sha512-HJtfjpBgjFEPQ6ub7nFTtEyxzzbrz6V5vQZfJOoHi3Jhpjob3W4h0UenTW6loHanJYucFIEh01SvB//Qj3ulcw==`.
- `@the-next-ai/ai-gateway` 1.0.9: `https://registry.npmjs.org/@the-next-ai/ai-gateway/-/ai-gateway-1.0.9.tgz`
  with lockfile integrity
  `sha512-/nt/1ZciUgarfyJW6itfDIgKMa8HOgmt0RyPyvmUCDcbJGEEl0BNmd85Zz5boSwT70xcjNojds9DPsQXG7N+sQ==`.

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
for affected SRDCloud profiles in CCR 3.0.13.

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

## Upgrade Review Checklist

When CCR or `@the-next-ai/ai-gateway` is upgraded:

1. Record the CCR tag and commit plus the exact gateway version, tarball, and
   lockfile integrity.
2. Compare provider-plugin input fields and provider-name matching.
3. Compare `standardRequest` fields, source-adapter keys, parsers, and target
   request materialisation.
4. Compare virtual-model profile matching and Fusion capability metadata.
5. Confirm whether built-in vision still requires Chat Completions. Remove the
   shim only after CCR routes the affected Responses-backed selector without it.
6. Run `npm test` and `npm run check`.
7. Restart the installed CCR Desktop version and manually verify Fusion vision,
   web search, custom MCP tool execution, canonical tool results, and ordinary
   non-Fusion requests.

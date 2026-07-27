# srdcloud-ccr-transformer

[![GitHub Release](https://img.shields.io/github/v/release/ArvinZJC/srdcloud-ccr-transformer?include_prereleases)](../../releases) ![GitHub commit activity](https://img.shields.io/github/commit-activity/m/ArvinZJC/srdcloud-ccr-transformer) [![GitHub License](https://img.shields.io/github/license/ArvinZJC/srdcloud-ccr-transformer?label=licence)](./LICENCE)

`srdcloud-ccr-transformer` is a local [Claude Code Router (CCR) Desktop 3.x](https://github.com/musistudio/claude-code-router) extension for routing Claude Code requests to SRDCloud CodeFree.

## What It Does

- Rewrites CCR chat traffic to the SRDCloud CodeFree chat service.
- Rewrites embedding requests to the SRDCloud CodeFree embedding service.
- Uses CodeFree-O token authentication by default when modern local auth setup is configured, including signed request headers and refresh-token rotation.
- Keeps API-key authentication as a deprecated compatibility fallback.
- Strips CCR provider prefixes from model names before sending upstream.
- Can discover CodeFree-O model limits from SRDCloud and clamp chat `max_tokens` to the discovered `maxOutputTokens`.
- Converts Anthropic-style tool definitions from `input_schema` to OpenAI-style `function.parameters`.
- Preserves CCR Fusion model composition for built-in vision, built-in web search, and custom MCP tools by forwarding CCR's resolved base model, capability instructions, function tools, and internal tool results to SRDCloud.
- Converts Anthropic-style image blocks to SRDCloud-compatible `image_url` blocks and keeps system messages ahead of image messages for image-capable model requests.
- Flattens historical tool messages by default because SRDCloud cannot replay Anthropic `tool_use` / `tool_result` blocks in later turns.
- Writes controlled JSONL diagnostics without logging API keys or prompt bodies.

## Requirements

- CCR Desktop 3.x installed and configured with an SRDCloud provider.
- CodeFree-O 1.4.0 or later installed and signed in for the preferred token authentication flow. The complete official 1.5.2 platform matrix is reviewed.
- Existing legacy CodeFree credentials, or `userId` and `apiKey` supplied directly through plugin config, can still be used temporarily.

Node.js is only needed if you run the optional npm helper scripts or local tests.

## Authentication Setup

Set up the preferred token authentication from the installed CodeFree-O binary:

```bash
npm run setup:codefree-auth
```

The helper inspects CodeFree-O locally, validates its complete authentication contract, writes owner-only authentication setup, and updates this extension's CCR configuration. Official 1.5.2 binaries are reported as `known-artifact`. A later or repackaged binary can be used when the same strict semantic validation succeeds; it is reported as `semantic-contract`, which confirms local compatibility rather than publisher provenance.

Setup remains offline. Its output contains artifact identity, verification mode, and restart status only; it does not print recovered authentication material or private file locations. An incompatible build fails before private setup is written and reports only non-secret investigation guidance.

Restart CCR Desktop after setup. The presence of `codefreeAuthFile` automatically selects token authentication. When both modern setup and an API key are present, token authentication wins. An invalid modern setup fails closed instead of silently downgrading to the API key.

Access tokens are reused while valid and refreshed when they are within 60 seconds of expiry; the extension does not call the refresh service for every request. Internal model discovery can refresh and retry once after a 401. Normal chat, embedding, and Fusion traffic cannot be retried after an upstream 401 because CCR Desktop's current provider hook does not own the response boundary.

If token refresh is reported as invalid or rejected, start `codefree-o` and complete its CodeFree sign-in flow to obtain a fresh local credential, rerun `npm run setup:codefree-auth`, and restart CCR Desktop. Do not copy credentials into this repository or the CCR plugin configuration.

API-key authentication remains supported for compatibility but is deprecated. It is selected only when modern setup is absent and emits one warning per provider runtime.

## Install in CCR Desktop

1. Open CCR Desktop.
2. Go to Extensions.
3. Add a local extension and select this project directory.
4. Save the configuration.
5. Restart the gateway from the Server page.

For a normal UI install, stop here. The extension writes its runtime bridge and default log configuration when CCR Desktop loads it.

CCR Desktop 3.0.16 requires explicit permissions and surfaces for local JavaScript extensions. After upgrading an existing CCR installation, add this local extension directory again and save it so CCR imports the updated manifest declarations, then restart the gateway. If the extension remains disabled or stale, the advanced installer below repairs the same declarations in the saved plugin entry.

Use the npm installer only as an advanced fallback when the UI-installed extension is present but CCR Desktop still appears to use stale code, misses the gateway fallback entry, or keeps routing SRDCloud traffic to the wrong upstream service:

```bash
npm run install:ccr-config:dry-run
npm run install:ccr-config
```

The installer edits CCR Desktop's saved app config for this plugin and writes `.ccr-gateway-plugin.config.json`. Restart CCR Desktop after running it.

## Useful Configuration

Enable debug request-shape logging:

```bash
npm run install:ccr-config -- --log-level debug
```

Compatibility flattening for historical tool messages is enabled by default. It preserves the operation name, a bounded parameter summary, outcome, and result as neutral text while avoiding structured historical `tool_use` / `tool_result` blocks that SRDCloud rejects in follow-up requests. Set `flattenToolMessages` to `false` only when diagnosing a future upstream that supports structured replay.

The extension applies compatibility automatically only when it can identify an enabled SRDCloud Fusion vision profile unambiguously and no direct base URL is configured. This advertises the Chat Completions capability required by affected CCR releases while preserving the primary Responses capability. Use this advanced opt-out only when validating a CCR release that resolves Responses-backed Fusion vision selectors itself:

```json
{
  "fusionVisionCompatibility": false
}
```

These commands are conveniences for updating plugin options from the terminal. If you already manage the same options in CCR Desktop's UI, use the UI and restart CCR Desktop instead.

Supported plugin options include `providerName`, `codefreeAuthFile`, `userId`, `apiKey`, `authHeader`, `clientType`, `clientVersion`, `subService`, `sessionId`, `userAgent`, `modelName`, `maxTokensCap`, `modelMaxOutputTokens`, `discoverModelLimits`, `modelLimitsTtlMs`, `logLevel`, `logMaxBytes`, `logMaxFiles`, `flattenToolMessages`, and `fusionVisionCompatibility`. `userId`, `apiKey`, and `authHeader` belong to the deprecated legacy flow.

Default option content:

```json
{
  "authHeader": "Bearer codefree",
  "clientType": "codefree-o",
  "clientVersion": "1.5.2",
  "discoverModelLimits": false,
  "flattenToolMessages": true,
  "logLevel": "warn",
  "logMaxBytes": 5242880,
  "logMaxFiles": 3,
  "logToFile": true,
  "modelLimitsTtlMs": 3600000,
  "subService": "codefree_o_chat",
  "userAgent": "opencode/1.5.2"
}
```

If `discoverModelLimits` is enabled, the transformer queries SRDCloud model metadata using the selected authentication mechanism. When the requested chat model is found, the outgoing `max_tokens` is clamped to the minimum of the incoming value, `maxTokensCap` if set, any `modelMaxOutputTokens` override, and the discovered `maxOutputTokens`. If discovery fails or the model is absent, the request continues with the configured limits that are available.

## Logs and Troubleshooting

On a healthy restart with debug logging, the log should contain:

- `wrapper registered provider hook`
- `gateway plugin created`
- `provider hook transformed request`

Debug request metadata includes the selected `authMode`, a runtime-local `requestFingerprint`, the incoming and outgoing `max_tokens` values, the discovered model limits, the active limit sources, and the model-limit cache state. It never includes tokens, signatures, user identities, full headers, or private auth-file locations. Matching fingerprints within one CCR runtime identify identical transformed request bodies without logging their content. Fingerprints change after CCR restarts.

Fusion requests also report a structural `requestMode` of `fusion-canonical` or `fusion-legacy-fallback`, the source adapter, canonical message/tool counts, and capability booleans. A healthy current CCR Desktop Fusion request should use `fusion-canonical`; `fusion-legacy-fallback` means the gateway did not provide canonical virtual-model state and should be upgraded or reloaded before investigating the upstream service.

For request failures, compare the CCR Desktop request log with this extension log by timestamp. A transformed request usually means the extension ran and the remaining failure is likely upstream or provider-side. For image requests, debug metadata should include `hasImage:true`; if it does not, restart CCR Desktop and confirm the local extension was reloaded.

Logs rotate automatically. Defaults are `logMaxBytes: 5242880` and `logMaxFiles: 3`.

## Development

Run local verification before changing the extension:

```bash
npm test
npm run check
```

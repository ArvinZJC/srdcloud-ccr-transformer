# srdcloud-ccr-transformer

[![GitHub Release](https://img.shields.io/github/v/release/ArvinZJC/srdcloud-ccr-transformer?include_prereleases)](../../releases)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/ArvinZJC/srdcloud-ccr-transformer)
[![GitHub License](https://img.shields.io/github/license/ArvinZJC/srdcloud-ccr-transformer?label=licence)](./LICENCE)

`srdcloud-ccr-transformer` is a local [Claude Code Router (CCR) Desktop 3.x](https://github.com/musistudio/claude-code-router) extension for routing Claude Code requests to SRDCloud CodeFree.

## What It Does

- Rewrites CCR chat traffic to the SRDCloud CodeFree chat service.
- Rewrites embedding requests to the SRDCloud CodeFree embedding service.
- Adds the SRDCloud headers expected by CodeFree, including `apiKey`, `authorization`, `userId`, `subService`, `modelName`, `clientType`, and `clientVersion`.
- Strips CCR provider prefixes from model names before sending upstream.
- Can discover CodeFree-O model limits from SRDCloud and clamp chat `max_tokens` to the discovered `maxOutputTokens`.
- Converts Anthropic-style tool definitions from `input_schema` to OpenAI-style `function.parameters`.
- Converts Anthropic-style image blocks to SRDCloud-compatible `image_url` blocks and keeps system messages ahead of image messages for image-capable model requests.
- Flattens historical tool messages by default because SRDCloud cannot replay Anthropic `tool_use` / `tool_result` blocks in later turns.
- Writes controlled JSONL diagnostics without logging API keys or prompt bodies.

## Requirements

- CCR Desktop 3.x installed and configured with an SRDCloud provider.
- Existing CodeFree CLI credentials available to the local CodeFree CLI toolchain, or `userId` and `apiKey` provided directly through plugin config.

Node.js is only needed if you run the optional npm helper scripts or local tests.

## Install in CCR Desktop

1. Open CCR Desktop.
2. Go to Extensions.
3. Add a local extension and select this project directory.
4. Save the configuration.
5. Restart the gateway from the Server page.

For a normal UI install, stop here. The extension writes its runtime bridge and default log configuration when CCR Desktop loads it.

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

Compatibility flattening for historical tool messages is enabled by default. It
preserves the operation name, a bounded parameter summary, outcome, and result
as neutral text while avoiding structured historical `tool_use` / `tool_result`
blocks that SRDCloud rejects in follow-up requests. Set `flattenToolMessages` to
`false` only when diagnosing a future upstream that supports structured replay.

These commands are conveniences for updating plugin options from the terminal. If you already manage the same options in CCR Desktop's UI, use the UI and restart CCR Desktop instead.

Supported plugin options include `providerName`, `userId`, `apiKey`, `authHeader`, `clientType`, `clientVersion`, `subService`, `sessionId`, `userAgent`, `modelName`, `maxTokensCap`, `modelMaxOutputTokens`, `discoverModelLimits`, `modelLimitsTtlMs`, `logLevel`, `logMaxBytes`, `logMaxFiles`, and `flattenToolMessages`.

Default option content:

```json
{
  "authHeader": "Bearer codefree",
  "clientType": "codefree-o",
  "clientVersion": "1.4.0",
  "discoverModelLimits": false,
  "flattenToolMessages": true,
  "logLevel": "warn",
  "logMaxBytes": 5242880,
  "logMaxFiles": 3,
  "logToFile": true,
  "modelLimitsTtlMs": 3600000,
  "subService": "codefree_o_chat",
  "userAgent": "OpenAI/JS 5.11.0"
}
```

If `discoverModelLimits` is enabled, the transformer queries SRDCloud model metadata using the same `userId` and `apiKey` credentials as chat requests. When the requested chat model is found, the outgoing `max_tokens` is clamped to the minimum of the incoming value, `maxTokensCap` if set, any `modelMaxOutputTokens` override, and the discovered `maxOutputTokens`. If discovery fails or the model is absent, the request continues with the configured limits that are available.

## Logs and Troubleshooting

On a healthy restart with debug logging, the log should contain:

- `wrapper registered provider hook`
- `gateway plugin created`
- `provider hook transformed request`

Debug request metadata includes a runtime-local `requestFingerprint`, the incoming and outgoing `max_tokens` values, the discovered model limits, the active limit sources, and the model-limit cache state. Matching fingerprints within one CCR runtime identify identical transformed request bodies without logging their content. Fingerprints change after CCR restarts.

For request failures, compare the CCR Desktop request log with this extension log by timestamp. A transformed request usually means the extension ran and the remaining failure is likely upstream or provider-side. For image requests, debug metadata should include `hasImage:true`; if it does not, restart CCR Desktop and confirm the local extension was reloaded.

Logs rotate automatically. Defaults are `logMaxBytes: 5242880` and `logMaxFiles: 3`.

## Development

Run local verification before changing the extension:

```bash
npm test
npm run check
```

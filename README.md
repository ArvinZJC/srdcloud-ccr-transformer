# srdcloud-ccr-transformer

[![GitHub Release](https://img.shields.io/github/v/release/ArvinZJC/srdcloud-ccr-transformer?include_prereleases)](../../releases)
![GitHub commit activity](https://img.shields.io/github/commit-activity/m/ArvinZJC/srdcloud-ccr-transformer)
[![GitHub License](https://img.shields.io/github/license/ArvinZJC/srdcloud-ccr-transformer?label=licence)](./LICENCE)

`srdcloud-ccr-transformer` is a local [Claude Code Router (CCR) Desktop 3.x](https://github.com/musistudio/claude-code-router) extension for routing Claude Code requests to SRDCloud CodeFree.

Use this project when you previously relied on the CCR 2.x [`codefree-helper`](https://www.npmjs.com/package/codefree-helper) transformer and now need the same SRDCloud behavior in CCR Desktop 3.x. The restored transformer is kept as readable source and wrapped as a local CCR extension.

Restoration provenance is recorded in `docs/provenance/srdcloud-transformer.md`. The original dependency file remains under ignored `node_modules` and should not be force-added.

## What It Does

- Rewrites CCR traffic to the SRDCloud endpoint:
  `/api/acbackend/codechat/v1/completions`
- Adds the SRDCloud headers expected by CodeFree, including `apiKey`, `authorization`, `userId`, `subService`, `modelName`, `clientType`, and `clientVersion`.
- Strips CCR provider prefixes from model names before sending upstream.
- Converts Anthropic-style tool definitions from `input_schema` to OpenAI-style `function.parameters`.
- Converts Anthropic-style image blocks to SRDCloud-compatible `image_url` blocks and keeps system messages ahead of image messages for image-capable model requests.
- Optionally flattens historical tool messages for upstreams that cannot handle Anthropic `tool_use` / `tool_result` blocks in later turns.
- Writes controlled JSONL diagnostics without logging API keys or prompt bodies.

## Requirements

- CCR Desktop 3.x installed and configured with an SRDCloud provider.
- Existing CodeFree credentials at:

```text
~/.codefree-cli/oauth_creds.json
```

You can also provide `userId` and `apiKey` directly through plugin config.

Node.js is only needed if you run the optional npm helper scripts or local tests.

## Install in CCR Desktop

1. Open CCR Desktop.
2. Go to Extensions.
3. Add a local extension and select this project directory.
4. Save the configuration.
5. Restart the gateway from the Server page.

After restart, check the extension status route:

```bash
curl http://127.0.0.1:3456/plugins/srdcloud-transformer
```

For a normal UI install, stop here. The extension writes its runtime bridge and default log path when CCR Desktop loads it.

Use the npm installer only as an advanced fallback when the UI-installed extension is present but CCR Desktop still appears to use stale code, misses the gateway fallback entry, or keeps routing SRDCloud traffic to the wrong upstream endpoint:

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

Enable compatibility flattening for historical tool messages:

```bash
npm run install:ccr-config -- --log-level debug --flatten-tool-messages
```

Use `--flatten-tool-messages` if you see upstream failures or loops caused by replayed historical `tool_use` / `tool_result` content. It preserves prior tool observations as text while avoiding structured historical tool blocks in follow-up requests.

These commands are conveniences for updating plugin options from the terminal. If you already manage the same options in CCR Desktop's UI, use the UI and restart CCR Desktop instead.

Supported plugin options include `providerName`, `userId`, `apiKey`, `authHeader`, `clientVersion`, `userAgent`, `modelName`, `logLevel`, `logMaxBytes`, `logMaxFiles`, and `flattenToolMessages`.

## Logs and Troubleshooting

The extension uses this log file when file logging is enabled:

```text
~/.claude-code-router/app-data/plugins/srdcloud-transformer/srdcloud-transformer.log
```

On a healthy restart with debug logging, the log should contain:

- `wrapper registered provider hook`
- `gateway plugin created`
- `provider hook transformed request`

For request failures, compare the CCR Desktop request log with this extension log by timestamp. A transformed request with the SRDCloud URL usually means the extension ran and the remaining failure is likely upstream or provider-side. For image requests, debug metadata should include `hasImage:true`; if it does not, restart CCR Desktop and confirm the local extension was reloaded.

Logs rotate automatically. Defaults are `logMaxBytes: 5242880` and `logMaxFiles: 3`.

## Development

Run local verification before changing the extension:

```bash
npm test
npm run check
```

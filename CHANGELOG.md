# Changelog

## 0.1.0 - 2026-07-09

### Added

- Added the CCR Desktop 3.x local extension wrapper for routing SRDCloud
  CodeFree traffic through Claude Code Router.
- Restored the SRDCloud transformer behavior from `codefree-helper` with tracked
  provenance metadata and a drift-check command.
- Added the core gateway module-plugin fallback so CCR can load the transformer
  through a serializable `modulePath` bridge.
- Added request normalization for SRDCloud endpoint routing, required CodeFree
  headers, provider-prefix model cleanup, Anthropic tool schema conversion, and
  image request compatibility.
- Added optional historical tool-message flattening for upstreams that cannot
  replay Anthropic `tool_use` or `tool_result` blocks in later turns.
- Added controlled JSONL diagnostics, log rotation, and the extension status
  route without logging API keys or prompt bodies.
- Added CCR Desktop config helpers and an advanced installer fallback for stale
  local extension or gateway-plugin configuration.
- Added Node test coverage for transformer compatibility, gateway plugin
  loading, extension behavior, and CCR config generation.

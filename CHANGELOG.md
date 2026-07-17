# Changelog

## Unreleased

### Changed

- Aligned the default `User-Agent` header with CodeFree-O 1.4.0 by sending
  `opencode/1.4.0` while preserving explicit plugin overrides.

## 0.3.0 - 2026-07-11

### Added

- Added comprehensive CCR Fusion model compatibility for built-in vision,
  built-in web search, and custom MCP tools by preserving CCR's canonical
  virtual-model request state at the SRDCloud provider boundary.
- Added privacy-safe Fusion request-mode and capability diagnostics, with a
  compatibility fallback marker for older CCR 3.x provider-hook contexts.

### Changed

- Automatically advertised the narrowly scoped Chat Completions capability
  required for affected CCR Desktop 3.x built-in Fusion vision routing while
  preserving the primary Responses capability.
- Hardened model-limit discovery with single-flight refreshes, bounded retry
  cooldowns, and safe fallback to configured output limits when discovery fails.
- Improved debug diagnostics with privacy-safe runtime-local request
  fingerprints, explicit limit-source and cache-state metadata, and isolation so
  diagnostic failures cannot block request forwarding.
- Enabled historical tool-message flattening by default because SRDCloud rejects
  follow-up requests that replay structured tool calls and results.
- Preserved operation names, bounded parameter summaries, outcomes, and results
  in flattened history to reduce repeated tool calls without restoring the
  unsupported structured protocol.

## 0.2.0 - 2026-07-09

### Added

- Added CodeFree-O model manager discovery for chat model context and output
  limits, with cached `maxOutputTokens` clamping for outgoing `max_tokens`.
- Added SRDCloud embedding endpoint routing for OpenAI-compatible embedding
  requests.
- Added CodeFree-O default request headers, optional `sessionId` forwarding from
  CCR session affinity, and configuration flags for model discovery and
  `maxTokensCap`.

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

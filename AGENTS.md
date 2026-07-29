# Repository Guidelines

## Project Structure & Module Organization

This repository contains a CCR Desktop 3.x local extension for the SRDCloud CodeFree transformer.

- `index.cjs`: CCR wrapper extension entrypoint. Configures the serializable gateway module and registers the status route.
- `gateway-plugin.cjs`: core gateway module loaded by CCR at runtime to create executable provider hooks after gateway-process startup.
- `src/srdcloud-transformer.cjs`: readable restoration of the transformer, request normalization, logging, and provider-hook logic.
- `src/ccr-fusion.cjs`: CCR virtual-model matching and canonical Fusion request projection for built-in vision, web search, and custom MCP tools.
- `src/ccr-vision-compat.cjs`: removable CCR 3.x Fusion vision compatibility shim that advertises Chat Completions without replacing Responses.
- `src/ccr-config.cjs`: helpers for generating/installing CCR Desktop config.
- `src/codefree-token-auth.cjs`: private CodeFree token loading, signing, caching, and refresh rotation.
- `src/codefree-auth-setup.cjs`: semantic-contract-validated local CodeFree-O inspection and private auth-file setup.
- `src/codefree-auth-provenance.cjs`: reviewed public artifact identities and optional exact-fingerprint lookup.
- `src/codefree-auth-extractor.cjs`: bounded, minifier-name-independent authentication contract validation.
- `scripts/install-ccr-config.cjs`: installer for updating CCR Desktop app config.
- `scripts/setup-codefree-auth.cjs`: credential-safe token-auth setup command.
- `test/*.test.cjs`: Node test-runner coverage for compatibility, config, gateway, and extension behavior.
- `docs/provenance/`: tracked evidence for restored dependency behavior and reviewed CodeFree-O artifacts. Keep restoration and provenance details contributor-facing rather than adding them to `README.md`.
- `plugin.json` and `package.json`: local extension metadata.

Runtime bridge files such as `.ccr-gateway-plugin.config.json` are local generated state and must stay untracked.

## Build, Test, and Development Commands

- `npm test`: runs all tests with Node's built-in test runner.
- `npm run check`: syntax-checks all CommonJS entrypoints and source files with `node --check`.
- `npm run check:provenance`: verifies the installed legacy transformer and machine-readable CodeFree-O auth provenance metadata.
- `npm run setup:codefree-auth`: semantically validates a local CodeFree-O build and configures preferred token authentication without printing secrets.

For CCR Desktop install, logging, and runtime troubleshooting commands, refer to `README.md`. After config or extension changes, restart CCR Desktop and verify the live app, not only local tests.

## Coding Style & Naming Conventions

Use CommonJS (`.cjs`) and Node core modules where possible. Keep two-space indentation, semicolons, and `"use strict";` in executable modules. Prefer small pure helpers for request-body transformations and explicit option names such as `flattenToolMessages`, `logMaxBytes`, and `providerName`.

Do not log secrets, prompt bodies, API keys, or full request payloads. Debug logs should contain metadata only.

## Testing Guidelines

Use `node:test` and `node:assert/strict`. Place tests in `test/*.test.cjs`, named after the unit or integration surface, for example `gateway-plugin.test.cjs`.

When changing request normalization, add regression tests for transformed body shape and the affected compatibility surface. This includes historical tool-call contamination, image conversion and message ordering, embedding routing, and model-limit discovery or `max_tokens` clamping when relevant. Run both `npm test` and `npm run check` before handoff. Run `npm run check:provenance` when changing the reference dependency, restored behavior, or provenance metadata.

When changing Fusion handling, preserve CCR's canonical `standardRequest` boundary instead of rebuilding capability state from the untouched client body. Add regression tests for exact, prefix, and suffix virtual-model matches; built-in web search and vision; custom MCP tools; canonical tool results; and non-Fusion direct-image isolation. Do not infer Fusion from tool count alone.

Treat the Fusion vision compatibility shim as removable. Compatibility changes must preserve the primary Responses capability, remain idempotent, avoid compatibility-only direct writes to CCR saved configuration or generated gateway configuration, and include regression coverage for the explicit opt-out and complete shim removal. The existing ignored runtime bridge may carry derived compatibility-hook metadata needed by the gateway module when CCR normalises module-plugin configuration away.

## Commit & Pull Request Guidelines

Commit subjects must start with exactly one of these prefixes: `feat:`, `fix:`, `docs:`, `style:`, `build:`, `refactor:`, `revert:`, `test:`, `perf:`, `ci:`, or `chore:`. Keep the rest concise, non-sentence style, and without trailing punctuation, for example `fix: sanitize historical tool-call text`. Keep commits scoped to one behavior change.

Pull requests should describe the CCR runtime scenario tested, list local commands run, and note any manual app verification such as request-log checks or extension log markers.

## Changelog Lifecycle

During active development, collect changes under `## Unreleased` without a version or date. When preparing a release, replace that heading with the release version and date; do not retain an empty Unreleased section, and add a new one only when subsequent development begins.

Each `Unreleased` or version section must describe only changes relative to the immediately preceding release. Do not restate cumulative capabilities, unchanged behaviour, or compatibility-review conclusions that produced no change.

When the active changelog becomes unwieldy, move complete older release sections into versioned archive files such as `changelogs/1.x.md` and link each archive from `CHANGELOG.md`. Preserve chronological ordering and do not split a release section across files.

## Documentation Boundaries

Keep user-facing setup, configuration, and troubleshooting details in `README.md`. If the same topic needs to be mentioned here for contributors, link or refer to `README.md` instead of duplicating the content.

Do not hard wrap prose in Markdown files; keep each paragraph or list item on one source line unless Markdown syntax requires separate lines.

Do not expose SRDCloud API route paths, credential file locations, log file locations, or machine-specific local paths in public-facing docs. Keep those details in implementation code, tests, or provenance records only when they are needed for maintainability.

## Security & Configuration Tips

Never commit credentials, generated runtime config, or local CCR logs. For credential configuration and log troubleshooting, refer to `README.md`.

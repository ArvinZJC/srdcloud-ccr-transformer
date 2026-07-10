# Repository Guidelines

## Project Structure & Module Organization

This repository contains a CCR Desktop 3.x local extension for the SRDCloud CodeFree transformer.

- `index.cjs`: CCR wrapper extension entrypoint. Registers the provider hook and status route.
- `gateway-plugin.cjs`: core gateway module-plugin fallback loaded by CCR at runtime.
- `src/srdcloud-transformer.cjs`: readable restoration of the transformer, request normalization, logging, and provider-hook logic.
- `src/ccr-config.cjs`: helpers for generating/installing CCR Desktop config.
- `scripts/install-ccr-config.cjs`: installer for updating CCR Desktop app config.
- `test/*.test.cjs`: Node test-runner coverage for compatibility, config, gateway, and extension behavior.
- `docs/provenance/`: tracked evidence for the restored dependency-derived behavior. Keep restoration and provenance details contributor-facing rather than adding them to `README.md`.
- `plugin.json` and `package.json`: local extension metadata.

Runtime bridge files such as `.ccr-gateway-plugin.config.json` are local generated state and must stay untracked.

## Build, Test, and Development Commands

- `npm test`: runs all tests with Node's built-in test runner.
- `npm run check`: syntax-checks all CommonJS entrypoints and source files with `node --check`.
- `npm run check:provenance`: verifies the installed legacy transformer still matches the recorded provenance metadata.

For CCR Desktop install, logging, and runtime troubleshooting commands, refer to `README.md`. After config or extension changes, restart CCR Desktop and verify the live app, not only local tests.

## Coding Style & Naming Conventions

Use CommonJS (`.cjs`) and Node core modules where possible. Keep two-space indentation, semicolons, and `"use strict";` in executable modules. Prefer small pure helpers for request-body transformations and explicit option names such as `flattenToolMessages`, `logMaxBytes`, and `providerName`.

Do not log secrets, prompt bodies, API keys, or full request payloads. Debug logs should contain metadata only.

## Testing Guidelines

Use `node:test` and `node:assert/strict`. Place tests in `test/*.test.cjs`, named after the unit or integration surface, for example `gateway-plugin.test.cjs`.

When changing request normalization, add regression tests for transformed body shape and the affected compatibility surface. This includes historical tool-call contamination, image conversion and message ordering, embedding routing, and model-limit discovery or `max_tokens` clamping when relevant. Run both `npm test` and `npm run check` before handoff. Run `npm run check:provenance` when changing the reference dependency, restored behavior, or provenance metadata.

## Commit & Pull Request Guidelines

Commit subjects must start with exactly one of these prefixes: `feat:`, `fix:`, `docs:`, `style:`, `build:`, `refactor:`, `revert:`, `test:`, `perf:`, `ci:`, or `chore:`. Keep the rest concise, non-sentence style, and without trailing punctuation, for example `fix: sanitize historical tool-call text`. Keep commits scoped to one behavior change.

Pull requests should describe the CCR runtime scenario tested, list local commands run, and note any manual app verification such as request-log checks or extension log markers.

## Documentation Boundaries

Keep user-facing setup, configuration, and troubleshooting details in `README.md`. If the same topic needs to be mentioned here for contributors, link or refer to `README.md` instead of duplicating the content.

Do not expose SRDCloud API route paths, credential file locations, log file locations, or machine-specific local paths in public-facing docs. Keep those details in implementation code, tests, or provenance records only when they are needed for maintainability.

## Security & Configuration Tips

Never commit credentials, generated runtime config, or local CCR logs. For credential configuration and log troubleshooting, refer to `README.md`.

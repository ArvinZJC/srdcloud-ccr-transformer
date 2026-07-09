# SRDCloud Transformer Provenance

This project restores the SRDCloud transformer that previously shipped inside the `codefree-helper` npm package.

The original file is intentionally not committed because it lives under ignored dependency state:

```text
node_modules/codefree-helper/dist/ccr/transformer/srdcloud.transformer.js
```

## Source Package

- Package: `codefree-helper`
- Version: `1.2.2`
- Tarball: `https://registry.npmjs.org/codefree-helper/-/codefree-helper-1.2.2.tgz`
- Lockfile integrity: `sha512-BRF1PvuYfY5w7FLdD8txSr6u/b2DDSUX1nxlsehwkKuGB2ZSsH4ZOXi8T9VlD2sC2UFfN19ILZKBRe2FrdnqOw==`
- Transformer file size: `23765` bytes
- Transformer SHA-256: `edeea6bbeabedac331bc7a1045a55df3d37487f7a25957110e1931a84e858a7a`

## Verification

After `npm install`, verify the recorded package metadata and local dependency file with:

```bash
npm run check:provenance
```

For manual inspection, use:

```bash
shasum -a 256 node_modules/codefree-helper/dist/ccr/transformer/srdcloud.transformer.js
wc -c node_modules/codefree-helper/dist/ccr/transformer/srdcloud.transformer.js
```

Then compare restored behavior with:

```bash
npm test -- test/legacy-compatibility.test.cjs
```

If `codefree-helper` is updated later and `npm run check:provenance` fails, treat that as a review gate. Inspect the new upstream transformer, update `src/srdcloud-transformer.cjs` and compatibility tests if behavior changed, then update the metadata in this file and `scripts/check-provenance.cjs` in the same commit.

Do not force-add `node_modules` or the original transformer file. Keep reproducible metadata here and behavioral coverage in `test/legacy-compatibility.test.cjs`.

# Third-Party Notices

Skills Sync is licensed under GPL-3.0-or-later (see `LICENSE`). It includes third-party code under the licenses below.

## Copied source: vercel-labs/skills

The files in `src/vendor/skills/` are copied and adapted from [vercel-labs/skills](https://github.com/vercel-labs/skills) at tag `v1.7.0` (commit `5b1b4fe90fa9b5809d6db1e0ce97f5d2e3715fdc`):

- `src/prompts/search-multiselect.ts` → `src/vendor/skills/search-multiselect.ts`
- `src/agents.ts` and `src/types.ts` (static agent fields only) → `src/vendor/skills/agents.ts`

This code is compiled into `dist/cli.js`. Each file's header lists its changes.

```text
MIT License

Copyright (c) 2026 Vercel, Inc.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Bundled packages

`@clack/prompts`, `@clack/core`, `picocolors`, and their dependencies are bundled into `dist/`. The build writes their license texts to `dist/THIRD-PARTY-LICENSES.md`, which ships with the package.

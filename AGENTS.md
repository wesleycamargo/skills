# Repository guidance

## Project scope

- This repository contains the `@wesleycamargo/skills-sync` TypeScript CLI and existing skills.
- Keep the CLI changes focused on the approved v1 behavior. Automating the sync CLI itself via GitHub Actions is out of scope for v1 and tracked separately in `sdlc/skills-sync-github-actions/`.
- The CLI is still under validation. Do not describe it as generally available or ready for important repositories until the release checks are complete.
- `.github/workflows/publish-package.yml` is release/build infrastructure: it tests, builds, and publishes the package to npmjs only (`beta` prereleases from `feature/*`, `latest` from `main` and manual runs). It is separate from, and does not fulfill, the out-of-scope sync-automation item above.

## Build and test

- Use Node.js 20 or later and npm.
- Install the locked dependencies with `npm ci`.
- Run `npm test` after changes to CLI behavior. It builds the production code, compiles tests to `dist-test/`, and runs the Node test suite.
- Run `npm run build` to build production output in `dist/`.
- Run `npm pack --dry-run` when changing package metadata or build output. Confirm the package contains production files and excludes tests.
- Tests use disposable local Git repositories. Keep automated tests self-contained; do not require live GitHub credentials or modify real repositories.

## Code layout

- `src/cli.ts` implements the command-line wizard and commands.
- `src/config.ts` validates and loads project configuration.
- `src/git.ts` wraps Git operations and temporary checkouts.
- `src/sync.ts` inventories skill files, compares them with the saved baseline, previews changes, merges compatible text edits, and writes selected changes.
- Tests are colocated in `src/*.test.ts` and `src/*.integration.test.ts`.
- `dist/` and `dist-test/` are generated output; do not edit them by hand.

## Safety and synchronization behavior

- Preserve the explicit review and confirmation flow for adopting existing skills, deleting files, publishing project-side edits, and overriding source content.
- Keep path validation and symlink protections in place. Do not follow symlinks while reading or writing managed skills.
- Preserve the saved baseline and pending-publication recovery behavior. Add or update tests when changing synchronization state transitions.
- Publication must use normal Git commits and pushes; do not add force-push behavior.
- For pull-request mode, retain the authenticated `gh` CLI requirement and the check that the source branch has not advanced before publishing.
- Do not weaken conflict handling: incompatible or binary edits must remain visible for manual resolution.

## Versioning

- Mark every commit subject with `[major]`, `[minor]`, or `[patch]`; an unmarked commit counts as minor, and merge and `[skip ci]` commits do not count. `npm run release:preview` shows the next version. The workflow computes and applies it; keep the committed `version` at `0.0.0-development` and never bump it by hand.

## Dependencies and package metadata

- Keep `skills` pinned to the tested upstream CLI version unless an intentional upgrade is validated and its lockfile is updated.
- Prefer Node.js built-ins over new runtime dependencies. Explain and test any added dependency.
- Keep test-only files out of the published package; package contents are controlled by `package.json`.

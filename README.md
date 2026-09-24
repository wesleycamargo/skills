# Skills Sync (development branch)

This repository contains an early implementation of `@wesleycamargo/skills-sync` alongside the existing `skills/write-for-me` skill. The CLI is not yet ready for general use or npm publication. See `sdlc/skills-sync/spec.md` and `plan.md` for the v1 contract.

## Try it with disposable Git repositories

```sh
npm ci
npm test
npm run build
node dist/cli.js init
node dist/cli.js status
```

The wizard saves `.agents/skills-sync.json`, imports the selected skills, and installs selected agent copies through the pinned upstream `skills` CLI. `status` summarizes changes; `diff` shows text diffs without writing. `sync --yes` applies source-only changes. To publish project edits, review `diff`, then run `sync --yes --publish` with a publication mode configured in the wizard. Publishing uses your existing Git credentials. Pull request mode also requires the `gh` CLI to be authenticated.

The current implementation refuses conflicting edits and deletion proposals by default. To adopt a pre-existing skill, choose `--adopt-source=skill` or `--adopt-project=skill`; review the preview before confirming. An individual deletion may be selected with `--delete=skill/file`. `override-main` additionally requires `--yes --override-main --override-target=<source repository>@<branch>` on each run. It uses a normal Git commit and never force-pushes. `local-commit` requires `source.repository` to be a local checkout on the configured branch.

**Work still required before v1 release:** verify pull request creation and updates against GitHub, test all publication modes and failure recovery more broadly, run the workflow on Windows and macOS, and finish configuration, recovery, and onboarding documentation. The current three-way merge handles compatible UTF-8 text and refuses binary or overlapping edits. Do not use this branch to synchronize important repositories yet.

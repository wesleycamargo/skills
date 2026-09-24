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

The wizard saves `.agents/skills-sync.json`. `status` and `diff` show file states without writing. `sync --yes` applies source-only changes. To publish project edits, review `status`, then run `sync --yes --publish` with a publication mode configured in the wizard. Publishing uses your existing Git credentials. Pull request mode also requires the `gh` CLI to be authenticated.

The current implementation refuses conflicting edits and deletion proposals by default. An individual deletion may be selected with `--delete=skill/file`. `override-main` additionally requires `--yes --override-main --override-target=<source repository>@<branch>` on each run. It uses a normal Git commit and never force-pushes.

**Work still required before v1 release:** reliable three-way merges within one file; safe adoption of existing skills; supported agent installation through the upstream `skills` CLI; pending PR and branch state handling; comprehensive integration tests; and full documentation. Do not use this branch to synchronize important repositories yet.

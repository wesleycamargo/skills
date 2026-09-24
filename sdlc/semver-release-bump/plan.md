# Implementation Plan: Bump the Version Automatically on Every Publish

## Approach

Keep the version logic apart from the release workflow, so that nearly all of it can be tested offline:

1. **Pure calculation.** `scripts/release-version.mjs` exports pure functions: marker parsing, the release bump, the stable and beta version, and the tag-recovery decision. It takes plain data (tag names, commit subjects and parents, npmjs versions) and returns a result. It uses only Node.js built-ins, and the release tooling stays out of the published package because `files` lists only `dist`, `README.md`, and `THIRD-PARTY-NOTICES.md`.
2. **Thin command.** The same file doubles as a command. It gathers the data with `git` and `npm view`, calls the pure functions, and has three modes:
   - `preview` (default): prints the plan without changing anything;
   - `apply`: runs tag recovery, then sets the version with `npm version --no-git-tag-version`;
   - `tag <version>`: creates and pushes the annotated release tag.

   It writes the computed version to `GITHUB_OUTPUT` when running in Actions.
3. **Workflow last.** The workflow changes land on top of the `npm-default-publication` implementation, which rewrites the same file. That work has an approved spec but no implementation yet, in `.worktrees/npm-default-publication`. Tasks 1–2 and 4 do not depend on it, and Task 3 does.

The tests use `node:test` in `.mjs` files under `scripts/`, run with `node --test scripts/*.test.mjs` from `npm test`. The command tests build disposable Git repositories and put a mock `npm` on `PATH`, the same way `scripts/publish-npm.test.sh` does.

## Affected Components

- `scripts/release-version.mjs` (new) and `scripts/release-version.test.mjs` (new).
- `package.json`: the `test` script, a `release:preview` script, and `version` set to `0.0.0-development`. `package-lock.json` gets the same version.
- `.github/workflows/publish-package.yml`: checkout depth and tags, permissions, concurrency, the version step, and the tag step. This builds on `npm-default-publication`.
- `scripts/publish-npm.sh`: unchanged apart from anything the `npm-default-publication` channel work adds. The uncertain-result path already does not retry.
- `README.md` and `AGENTS.md`: the release and versioning rules.

## Implementation Tasks

### Task 1 — Pure version calculation
Status: completed

- [x] Write failing tests first for each spec rule: marker parsing (case, position, several markers, no marker), and exclusion of merge and `[skip ci]` commits.
- [x] Test the release bump and SemVer increments, including `[major]` below `1.0.0`, nothing to release, and baseline selection that ignores prerelease and malformed tags.
- [x] Test beta numbering against npmjs versions, and the tag-recovery decision: npmjs ahead with `gitHead` known, unknown, or missing, and npmjs equal to or behind the tags.
- [x] Implement the pure functions until every test passes. Cover every row of the spec's Interfaces table.

Validation:
- `node --test scripts/release-version.test.mjs` passes, and each Interfaces row maps to a named test.
- Completed 2026-09-24: `scripts/release-version.test.mjs` has 11 tests, written first, covering every row of the spec's Interfaces table.

### Task 2 — Preview, apply, and tag command
Status: completed
Depends on: Task 1

- [x] Gather tags with `git tag --list 'v*'`, and commits with `git log --format=%H%x00%P%x00%s <baseline>..HEAD`. Merges are detected from their parents.
- [x] Gather npmjs versions with `npm view <name> versions --json`, and `gitHead` with `npm view <name>@<v> gitHead`. A 404 means no versions. Any other failure stops the run.
- [x] Implement `preview`. The first line is the version or `none`. Then print the baseline, the counted commits with their bumps, and whether recovery would run.
- [x] Implement `apply`. It performs recovery tagging (annotated tag on `gitHead`, pushed with `git push origin refs/tags/v<x>`, no force), then runs `npm version <v> --no-git-tag-version`. It writes `version=<v>` to `GITHUB_OUTPUT` when that is set, and exits `0` with `none` when there is nothing to release.
- [x] Implement `tag <version>`: it creates an annotated tag on `HEAD` and pushes only that tag. It refuses if the tag already exists.
- [x] Add command tests against disposable repositories with a bare remote and a mock `npm`. They cover preview output, apply editing only the two files, recovery pushing the tag to the remote, tag refusal on an existing tag, and nothing to release.
- [x] Add `node --test scripts/*.test.mjs` to `npm test`, and a `release:preview` script.

Validation:
- `npm test` passes offline.
- `npm run release:preview` on `feature/skills-sync-v1` prints `0.3.2` (spec acceptance criterion 2), and `-- --channel beta` prints `0.3.2-beta.0`. This holds while every counted commit since `v0.3.1` is `[patch]`.
- Completed 2026-09-24: `scripts/release-version.command.test.mjs` has 9 tests against disposable repositories with a bare origin and a mock `npm`. They cover preview, beta numbering, apply editing only the two files and writing `GITHUB_OUTPUT`, nothing to release, recovery tagging and pushing, preview-only recovery, a missing `gitHead`, registry failure versus 404, and tag creation and refusal. `npm test` runs them (`test:release-version`). Deviation: the version is written by editing the JSON files directly instead of running `npm version`, which keeps the command independent of npm and easy to test. Against the real repository, `npm run release:preview` printed `0.3.2`, and `--channel beta` printed `0.3.2-beta.0` (spec acceptance criterion 2).

### Task 3 — Workflow integration
Status: pending
Depends on: Task 2, and the `npm-default-publication` workflow implementation

- [ ] Set `version` to `0.0.0-development` in `package.json` and `package-lock.json`, and update the README tarball example (moved here from Task 4). This must land together with the version step and the channel/version check.
- [ ] Rebase onto, or merge, the finished `npm-default-publication` branch. Do not edit its channel logic.
- [ ] Checkout with `fetch-depth: 0` and `fetch-tags: true`. Set job permissions to `contents: write` and `id-token: write`. Add `concurrency: { group: release, cancel-in-progress: false }`.
- [ ] Configure the tag author for Git (`github-actions[bot]`), and run `node scripts/release-version.mjs apply --channel <channel>` before the build. Skip the build, publish, and tag steps when the output is `none`.
- [ ] After `publish-npm.sh` succeeds on the `latest` channel, run the `tag` mode with the computed version. Prereleases are never tagged.
- [ ] Extend the workflow configuration tests (the `npm-default-publication` spec already requires them): check the permissions, the history and tag fetch, the concurrency setting, that `apply` comes before the build, that tagging only happens for `latest`, and that no `--force` appears.

Validation:
- The workflow tests pass. A review confirms spec acceptance criterion 3.

### Task 4 — Committed version and documentation
Status: in-progress
Depends on: Task 2

- [ ] Set `version` to `0.0.0-development` in `package.json` and `package-lock.json`. Update the README tarball example to match, and make sure `npm pack --dry-run` lists the same files.
- [x] Document in the README and `AGENTS.md`:
  - the markers and their precedence;
  - the minor default;
  - that `[skip ci]` and merge commits are ignored;
  - that tags and npmjs show the released version;
  - `npm run release:preview`;
  - applying the computed version before a local OTP publication.
- [x] Replace the `AGENTS.md` rule "Bump `version` in `package.json` and `package-lock.json` to publish a change" with the marker rule.

Validation:
- Spec acceptance criterion 4 holds, and `npm test` passes.
- Documentation completed 2026-09-24: the README has a Versioning section, and a Versioning rule was added to the repository `AGENTS.md`. The bump rule in the workspace-level `/workspaces/skills/AGENTS.md`, which is outside Git, was replaced too. Deviation: the `0.0.0-development` version change is **deferred to Task 3**. The current workflow still publishes the committed version, and there is no channel/version check yet, so committing `0.0.0-development` now could publish it as `latest`. Until then, the documented interim process is a `[skip ci]` commit with the previewed version, a publish, and `release-version.mjs tag`.

### Task 5 — First automated release
Status: pending
Depends on: Tasks 3–4

- [ ] Push the integrated branch without `[skip ci]`, and let the workflow publish. For `feature/*`, this is a beta release, such as `0.3.2-beta.0`, with no tag. For `main` or a manual run, it is a stable release with tag `v0.3.2`.
- [ ] Confirm the published version matches the preview, the tag exists on the release commit (stable only), and a rerun with no new commits reports nothing to release.

Validation:
- Spec acceptance criterion 6, recorded with the run URL and the npmjs version.

## Risks and Dependencies

- **Sequencing with `npm-default-publication`:** both change `publish-package.yml`. Task 3 waits for that implementation. If it stalls, the two can be combined in one branch, but that branch must satisfy both specifications.
- **Permission change:** `contents: write` lets the job push. The job only pushes `refs/tags/v*` through the release command, with no force option. Branch protection is unaffected because branches are never pushed.
- **Tag author:** annotated tags need a committer identity in Actions. It is configured in the workflow, not the repository.
- **npm read delay:** stable releases have taken about a minute to become readable. Those runs fail as uncertain and are tagged by the next run through recovery (FR-12). A follow-up could make `publish-npm.sh` wait longer, but that is outside this spec.
- **Commit discipline:** an unmarked commit silently makes the release minor. This is intended (minor default), but it should be highlighted in the documentation.

## Final Validation

- `npm ci && npm test` passes: CLI tests, publish tests, release-version tests, and workflow tests.
- `npm run release:preview` matches the version the first automated release publishes.
- Each spec acceptance criterion (1–6) maps to a test or recorded evidence.
- Hand off to `sdlc-validate-implementation`.

## Handover

Current: Tasks 1–2 completed. Task 4 documentation is done, and its version change moved to Task 3.
Next: Task 3, once the `npm-default-publication` workflow implementation lands.
Blockers: Task 3 waits for `npm-default-publication`, which has an intent and spec but no workflow changes yet.
Remaining validation: spec acceptance criteria 3, 4, and 6. Criteria 1, 2, and 5 are met.

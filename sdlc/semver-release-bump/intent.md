# Intent: Bump the Version Automatically on Every Publish

## Problem

Every release of `@wesleycamargo/skills-sync` needs a manual edit of `version` in `package.json` and `package-lock.json`. The release workflow skips any version that is already published, so a change that is pushed without a bump does not get released. Recent history shows the cost: the releases from `0.1.3` to `0.2.0` each needed a hand-made "Prepare npmjs release" commit. The size of each bump is also chosen by hand, so the version number does not reliably say whether a release breaks, adds, or fixes behavior.

The repository has no Git tags, and there is no agreed signal for how large each bump should be.

## Desired Outcome

Each publish computes the next version with semantic versioning, based on the last release, and publishes that version. No manual version edit is needed. The bump size comes from labels on the pull request that brought the change:

- by default, a release is a **minor** bump;
- a pull request labeled `major` gives a major bump;
- a pull request labeled `patch` gives a patch bump.

Commit messages do not affect the bump size.

## Scope

- Work out the next version from the last released version and the pull-request labels, following the rules above.
- Find the pull request for the change being released. For a push to `main`, this is the merged pull request that contains the pushed commit. For a `feature/*` push, it is the open pull request for that branch. With no pull request (a direct push or a manual run), use the minor default.
- Apply the computed version to the published package, and record the release in Git (for example with a version tag) so the next run knows where to start.
- Handle the first run: there are no tags, so `0.2.0`, the current published version, must be the starting point.
- Fail before publishing, with a clear message, when a pull request has both the `major` and the `patch` label.
- Document the labels for contributors, and make sure the `major` and `patch` labels exist in the repository.
- Keep the existing release safety: test and build gates, never republishing or overwriting a version, and never retrying an uncertain publication.
- Update the release documentation and add tests for the version calculation.

## Non-Goals

- Choosing the registry, removing GitHub Packages, or defining the prerelease channel and the `beta` dist-tag. These belong to `sdlc/npm-default-publication/`, which is in progress in `.worktrees/npm-default-publication`.
- Conventional Commits or any other commit-message convention.
- Backfilling tags for earlier versions.
- Changing CLI behavior, the package name, or npm trusted publishing.
- Generating changelogs or GitHub releases, unless the specification finds them necessary to record the release.

## Constraints

- **Coordination:** this work changes the same release workflow as `npm-default-publication`, and it must build on that work. The version calculation must fit its model: feature-branch pushes publish prerelease versions under `beta`, while `main` and manual runs publish stable versions under `latest`. The prerelease version should be derived from the same next-version calculation. For example, `0.3.0-beta.N` for the default minor bump from `0.2.0`. Its specification (`sdlc/npm-default-publication/spec.md`, FR-3) requires a release to already carry a matching version form, such as `0.1.6-beta.0` for `beta`. This work would supply that version automatically, and FR-3's check would then validate it.
- **Safety:** publication must never force-push. If the workflow records the version by committing back to a branch, it must use normal commits and respect branch protection. Recording the release without a bot commit (a tag only) is preferred if it keeps `package.json` meaningful.
- **Credentials:** no npm credentials in the repository. Reading pull-request labels must use the workflow's own `GITHUB_TOKEN` with the minimum read permission (`pull-requests: read`). Any other extra permission, such as `contents: write` for tags, must also be the minimum needed.
- **Label timing:** a label added or changed after the publishing run has started does not change that run's version.
- **Uncertain results:** a publication that npm accepted but has not yet made readable must not lead to a second bump and publish of the same change.
- **Dependencies:** prefer Node.js built-ins or a small, pinned development tool over new runtime dependencies. The published package must not gain runtime dependencies.
- **Tests:** they stay self-contained and do not need npm or GitHub credentials.

## Success Criteria

- A release run publishes without any manual version edit, and the published version is exactly one bump above the previous release: minor by default, or major or patch according to the pull-request label.
- Given example inputs, the version calculation produces the expected versions: no label, `major`, `patch`, both labels (fails), no pull request, the first-run baseline of `0.2.0`, repeated prereleases on one branch, and no changes since the last release.
- A run with no new commits since the last release does not publish a duplicate.
- Each released version can be traced to its commit through Git.
- The existing release safety checks still pass.

## Open Questions

- Where is the released version recorded: in a bot commit that updates `package.json` and `package-lock.json`, or only in a Git tag, with the version applied at build time? A bot commit keeps the repository files accurate but needs write access to the branch. A tag only is simpler, but `package.json` then lags behind.
- **Assumption:** because the bump comes from labels, the automation is a small script using Node.js built-ins and the GitHub REST API. Tools such as `semantic-release` and `release-please` derive bumps from commit messages instead.
- **Assumption:** the labels are named exactly `major` and `patch`.

## Handoff

Review this intent and resolve the open questions. `npm-default-publication` has an approved intent and specification but no workflow implementation yet. Create `sdlc/semver-release-bump/spec.md` with `sdlc-create-spec`, and implement it after, or together with, the `npm-default-publication` workflow changes.

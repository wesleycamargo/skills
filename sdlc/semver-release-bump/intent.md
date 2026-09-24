# Intent: Bump the Version Automatically on Every Publish

## Problem

Every release of `@wesleycamargo/skills-sync` needs a manual edit of `version` in `package.json` and `package-lock.json`. The release workflow skips any version that is already published, so a change that is pushed without a bump does not get released. Recent history shows the cost: the releases from `0.1.3` to `0.2.0` each needed a hand-made "Prepare npmjs release" commit. The size of each bump is also chosen by hand, so the version number does not reliably say whether a release breaks, adds, or fixes behavior.

The repository has no Git tags, and there is no agreed signal for how large each bump should be.

## Desired Outcome

Each publish computes the next version with semantic versioning, based on the last release, and publishes that version. No manual version edit is needed. The bump size comes from labels on the pull request that brought the change:

- a pull request labeled `major` gives a major bump;
- a pull request labeled `minor` gives a minor bump;
- a pull request labeled `patch` gives a patch bump;
- with none of these labels, the release is a **minor** bump.

When several of these labels apply, including labels from more than one pull request in the same release, the largest wins: `major` over `minor`, and `minor` over `patch`.

Commit messages do not affect the bump size.

## Scope

- Work out the next version from the last released version and the pull-request labels, following the rules above.
- Find the pull request for the change being released. For a push to `main`, this is the merged pull request that contains the pushed commit. For a `feature/*` push, it is the open pull request for that branch. With no pull request (a direct push or a manual run), use the minor default.
- Record each release only as a Git tag, `v<version>`, on the released commit. The next run starts from the highest stable tag. No bot commit is made, so `package.json` in the repository is not updated.
- Apply the computed version to `package.json` and `package-lock.json` inside the release run only, before the build and publish.
- Handle the first run: there are no tags, so `0.2.0`, the current published version, must be the starting point.
- Document the labels and their order for contributors, and make sure the `major`, `minor`, and `patch` labels exist in the repository.
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
- **Safety:** publication must never force-push, move, or delete an existing tag. The workflow makes no commits to any branch.
- **Repository version:** `version` in `package.json` no longer tells you what was released; the tags and npmjs do. The specification must say what the committed value is (for example, left at `0.2.0`) and make sure local builds and `npm pack` still work.
- **Credentials:** no npm credentials in the repository. Reading pull-request labels must use the workflow's own `GITHUB_TOKEN` with the minimum read permission (`pull-requests: read`). Pushing tags needs `contents: write`. No other new permission may be added.
- **Label timing:** a label added or changed after the publishing run has started does not change that run's version.
- **Uncertain results:** a publication that npm accepted but has not yet made readable must not lead to a second bump and publish of the same change.
- **Dependencies:** prefer Node.js built-ins or a small, pinned development tool over new runtime dependencies. The published package must not gain runtime dependencies.
- **Tests:** they stay self-contained and do not need npm or GitHub credentials.

## Success Criteria

- A release run publishes without any manual version edit, and the published version is exactly one bump above the previous release: minor by default, or the largest labeled bump.
- Given example inputs, the version calculation produces the expected versions: no label, each single label, combined labels (the largest wins), several pull requests in one release, no pull request, the first-run baseline of `0.2.0` with no tags, repeated prereleases on one branch, and no changes since the last release.
- A run with no new commits since the last release does not publish a duplicate.
- Each stable version published to npmjs has a matching `v<version>` tag on the released commit.
- The existing release safety checks still pass.

## Open Questions

- Are prereleases tagged too, or does the prerelease number `N` come from the `beta` versions already on npmjs? The specification decides; stable releases are always tagged.
- If the tag push fails after npm has published, how does the next run avoid bumping again from the old tag? The specification must define this recovery, for example by also checking the latest version on npmjs.
- **Assumption:** because the bump comes from labels, the automation is a small script using Node.js built-ins and the GitHub REST API. Tools such as `semantic-release` and `release-please` derive bumps from commit messages instead.
- **Decided 2026-09-24:** the release is recorded as a Git tag only. The labels are `major`, `minor`, and `patch`, with `major` over `minor` over `patch`. No label means a minor bump.

## Handoff

Review this intent and resolve the open questions. `npm-default-publication` has an approved intent and specification but no workflow implementation yet. Create `sdlc/semver-release-bump/spec.md` with `sdlc-create-spec`, and implement it after, or together with, the `npm-default-publication` workflow changes.

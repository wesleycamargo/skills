# Intent: Bump the Version Automatically on Every Publish

## Problem

Every release of `@wesleycamargo/skills-sync` needs a manual edit of `version` in `package.json` and `package-lock.json`. The release workflow skips any version that is already published, so a change that is pushed without a bump does not get released. Recent history shows the cost: the releases from `0.1.3` to `0.2.0` each needed a hand-made "Prepare npmjs release" commit. The size of each bump is also chosen by hand, so the version number does not reliably say whether a release breaks, adds, or fixes behavior.

The repository has no Git tags, and past commit messages do not follow a convention that could decide the bump size.

## Desired Outcome

Each publish computes the next version with semantic versioning, based on the changes since the last release, and publishes that version. No manual version edit is needed. The bump size comes from commit messages that follow Conventional Commits:

- a breaking change (`!` after the type, or a `BREAKING CHANGE:` footer) gives a major bump;
- a `feat` commit gives a minor bump;
- any other change gives a patch bump.

## Scope

- Work out the next version from the last released version and the commits since that release, following the rules above.
- Apply the computed version to the published package, and record the release in Git (for example with a version tag) so the next run knows where to start.
- Handle the first run: there are no tags and the history is not conventional, so `0.2.0`, the current published version, must be the starting point.
- Validate commit messages, or document the convention, so that the bump size is predictable. Decide what happens to a commit that does not follow the convention.
- Keep the existing release safety: test and build gates, never republishing or overwriting a version, and never retrying an uncertain publication.
- Update the release documentation and add tests for the version calculation.

## Non-Goals

- Choosing the registry, removing GitHub Packages, or defining the prerelease channel and the `beta` dist-tag. These belong to `sdlc/npm-default-publication/`, which is in progress in `.worktrees/npm-default-publication`.
- Rewriting past commit messages or backfilling tags for earlier versions.
- Changing CLI behavior, the package name, or npm trusted publishing.
- Generating changelogs or GitHub releases, unless the specification finds them necessary to record the release.

## Constraints

- **Coordination:** this work changes the same release workflow as `npm-default-publication`, and it must build on that work. The version calculation must fit its model: feature-branch pushes publish prerelease versions under `beta`, while `main` and manual runs publish stable versions under `latest`. The prerelease version should be derived from the same next-version calculation. For example, `0.3.0-beta.N` after a `feat` commit. Its specification (`sdlc/npm-default-publication/spec.md`, FR-3) requires a release to already carry a matching version form, such as `0.1.6-beta.0` for `beta`. This work would supply that version automatically, and FR-3's check would then validate it.
- **Safety:** publication must never force-push. If the workflow records the version by committing back to a branch, it must use normal commits and respect branch protection. Recording the release without a bot commit (a tag only) is preferred if it keeps `package.json` meaningful.
- **Credentials:** no npm credentials in the repository. Any extra GitHub permission, such as `contents: write` for tags, must be the minimum needed.
- **Uncertain results:** a publication that npm accepted but has not yet made readable must not lead to a second bump and publish of the same change.
- **Dependencies:** prefer Node.js built-ins or a small, pinned development tool over new runtime dependencies. The published package must not gain runtime dependencies.
- **Tests:** they stay self-contained and do not need npm or GitHub credentials.

## Success Criteria

- A release run publishes without any manual version edit, and the published version is exactly one bump above the previous release: major, minor, or patch, according to the commits since then.
- Given example commit histories, the version calculation produces the expected versions. This includes the first-run baseline of `0.2.0`, prereleases, and a history with no commits since the last release.
- A run with no new commits since the last release does not publish a duplicate.
- Each released version can be traced to its commit through Git.
- The existing release safety checks still pass.

## Open Questions

- Where is the released version recorded: in a bot commit that updates `package.json` and `package-lock.json`, or only in a Git tag, with the version applied at build time? A bot commit keeps the repository files accurate but needs write access to the branch. A tag only is simpler, but `package.json` then lags behind.
- What happens to a commit that doesn't follow Conventional Commits: a patch bump, or should the workflow or a commit hook reject it?
- Should the automation be a hand-written script using Node.js built-ins, or an established pinned tool such as `semantic-release`, `release-please`, or `changesets`? Those tools differ in whether they commit, tag, or open release pull requests.

## Handoff

Review this intent and resolve the open questions. `npm-default-publication` has an approved intent and specification but no workflow implementation yet. Create `sdlc/semver-release-bump/spec.md` with `sdlc-create-spec`, and implement it after, or together with, the `npm-default-publication` workflow changes.

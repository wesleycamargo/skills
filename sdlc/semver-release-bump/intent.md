# Intent: Bump the Version Automatically on Every Publish

## Problem

Every release of `@wesleycamargo/skills-sync` needs a manual edit of `version` in `package.json` and `package-lock.json`. The release workflow skips any version that is already published, so a change that is pushed without a bump does not get released. Recent history shows the cost: every release from `0.1.3` to `0.3.1` needed a hand-made "Prepare npmjs release" commit. The size of each bump is also chosen by hand, so the version number does not reliably say whether a release breaks, adds, or fixes behavior.

## Desired Outcome

Each publish computes the next version with semantic versioning, based on the last release, and publishes that version. No manual version edit is needed. The bump size comes from a marker in square brackets in each commit's subject line:

- `[major]` means a major bump;
- `[minor]` means a minor bump;
- `[patch]` means a patch bump;
- a commit with no marker counts as **minor**.

A release takes the largest bump among the commits since the last release: `major` over `minor`, and `minor` over `patch`. Merge commits are ignored, so merging a branch does not turn a patch release into a minor one.

For example, `[patch] Replace wizard text defaults instead of appending to them` gives a patch bump.

## Scope

- Read the subjects of the non-merge commits since the last release tag, and work out the next version following the rules above.
- Find markers anywhere in a commit subject, case-insensitively. If one subject has more than one marker, the largest wins.
- Record each release only as a Git tag, `v<version>`, on the released commit. The next run starts from the highest stable tag. No bot commit is made, so `package.json` in the repository is not updated.
- Apply the computed version to `package.json` and `package-lock.json` inside the release run only, before the build and publish.
- Start from the existing tags. `v0.3.0` and `v0.3.1` were tagged by hand, so the first automated release starts from `v0.3.1`.
- Document the markers and their order for contributors, for example in the README and `AGENTS.md`.
- Keep the existing release safety: test and build gates, never republishing or overwriting a version, and never retrying an uncertain publication.
- Update the release documentation and add tests for the version calculation.

## Non-Goals

- Choosing the registry, removing GitHub Packages, or defining the prerelease channel and the `beta` dist-tag. These belong to `sdlc/npm-default-publication/`.
- Pull requests or pull-request labels. Pull requests are not part of the workflow yet. The `major`, `minor`, and `patch` labels created on 2026-09-24 are not used.
- Conventional Commits prefixes (`feat:`, `fix:`) or commit-message linting hooks.
- Rewriting past commit messages or backfilling tags for versions before `0.3.0`.
- Changing CLI behavior, the package name, or npm trusted publishing.
- Generating changelogs or GitHub releases.

## Constraints

- **Coordination:** this work changes the same release workflow as `npm-default-publication`, and it must build on that work. The version calculation must fit its model: feature-branch pushes publish prerelease versions under `beta`, while `main` and manual runs publish stable versions under `latest`. The prerelease version should be derived from the same next-version calculation. For example, `0.4.0-beta.N` for the default minor bump from `0.3.1`. Its specification (`sdlc/npm-default-publication/spec.md`, FR-3) requires a release to already carry a matching version form, such as `0.1.6-beta.0` for `beta`. This work would supply that version automatically, and FR-3's check would then validate it.
- **Safety:** publication must never force-push, move, or delete an existing tag. The workflow makes no commits to any branch.
- **Repository version:** `version` in `package.json` no longer tells you what was released; the tags and npmjs do. The specification must say what the committed value is and make sure local builds and `npm pack` still work.
- **Credentials:** no npm credentials in the repository. Pushing tags needs `contents: write`. No other new permission may be added.
- **Full history:** the release run needs the commits and tags since the last release, so the checkout must fetch enough history and all tags.
- **Uncertain results:** a publication that npm accepted but has not yet made readable must not lead to a second bump and publish of the same change.
- **Dependencies:** prefer Node.js built-ins and Git over new tools. The published package must not gain runtime dependencies.
- **Tests:** they stay self-contained and do not need npm or GitHub credentials.

## Success Criteria

- A release run publishes without any manual version edit, and the published version is exactly one bump above the previous release: the largest marker among the new commits, where a commit with no marker counts as minor.
- Given example commit histories, the version calculation produces the expected versions:
  - only `[patch]` commits;
  - a `[patch]` commit and a commit with no marker;
  - one `[major]` commit among others;
  - several markers in one subject;
  - merge commits only;
  - `[skip ci]` release commits only;
  - npmjs ahead of the highest tag (tag recovery);
  - repeated prereleases on one branch;
  - no commits since the last release.
- A run with no new commits since the last release does not publish a duplicate.
- Each stable version published to npmjs has a matching `v<version>` tag on the released commit.
- The existing release safety checks still pass.

## Open Questions

None.

## Decisions

- **2026-09-24:** releases are recorded as Git tags only.
- **2026-09-24:** the bump comes from `[major]`, `[minor]`, and `[patch]` markers in commit subjects. `major` beats `minor`, and `minor` beats `patch`. A commit with no marker counts as minor, and merge commits are ignored. Pull requests are not used yet.
- **Assumption:** the automation is a small script using Node.js built-ins and `git log`.
- **2026-09-24, prereleases are not tagged:** only stable releases get `v<version>` tags, so the starting point for the next stable release is always the highest tag. The prerelease number `N` in `<next>-beta.N` is one more than the highest `beta` number already on npmjs for that base version, starting at `0`. For example, if npmjs has `0.4.0-beta.0` and `0.4.0-beta.1`, the next prerelease is `0.4.0-beta.2`. npmjs is where prereleases are published, so it is the reliable source of their numbers.
- **2026-09-24, recovery when the tag is missing:** before computing a version, the run compares the highest stable tag with the highest stable version on npmjs. If npmjs is ahead, the tag push failed on an earlier run. The run then tags the commit that npmjs records in that version's `gitHead` field, and starts from that version. This means a failed tag push never causes the same change to be bumped and published twice. If `gitHead` is missing or not in the repository, the run fails without publishing and explains how to add the tag by hand.
- **2026-09-24, `[skip ci]` commits are ignored:** like merge commits, commits whose subject contains `[skip ci]` do not count toward the bump. These are the hand-made "Prepare npmjs release" commits. A push that only has ignored commits since the last tag does not publish.

## Handoff

The intent is ready for approval. `npm-default-publication` has an approved intent and specification but no workflow implementation yet. Create `sdlc/semver-release-bump/spec.md` with `sdlc-create-spec`, and implement it after, or together with, the `npm-default-publication` workflow changes.

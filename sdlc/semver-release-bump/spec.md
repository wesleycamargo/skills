# Specification: Bump the Version Automatically on Every Publish

## Context

The approved intent is `sdlc/semver-release-bump/intent.md`.

Today a release publishes whatever `version` is committed in `package.json`, and every release needs a hand-made version commit. Releases `0.3.0` and `0.3.1` were tagged by hand as `v0.3.0` (`841e27c`) and `v0.3.1` (`e259f74`). npmjs records the source commit of each version in its `gitHead` metadata.

This work builds on `sdlc/npm-default-publication/spec.md`, which makes npmjs the only target and defines the channels:

- a push to `feature/*` publishes a prerelease under the `beta` dist-tag;
- a push to `main`, or a manual run, publishes a stable version under `latest`;
- before publishing, the version is checked against the channel (its FR-3).

That specification leaves the version itself to `package.json`. This specification replaces that source with a computed version. It also amends that specification's least-privilege rule (see FR-10).

## Goals

- Every publish computes its version from the last release and the commit markers, with no manual edit.
- Stable releases are recorded as Git tags. The same change is never bumped and published twice.
- The calculation is testable offline and can be previewed locally.

## Non-Goals

- Channel selection, dist-tags, removal of GitHub Packages, and the channel/version check. These stay as specified in `npm-default-publication`.
- Pull requests, pull-request labels, changelogs, GitHub releases, and commit-message linting.
- Tags for versions before `0.3.0`.
- Changes to the CLI or to the published package contents.

## Functional Requirements

### Bump rules

- **FR-1 — Markers:** a commit subject may contain `[major]`, `[minor]`, or `[patch]`, matched case-insensitively anywhere in the subject. A subject with several markers counts as its largest. A subject with no marker counts as `minor`.
- **FR-2 — Commits that count:** the counted commits are those reachable from the release commit and not from the baseline tag (`git log <baseline-tag>..<release-commit>`). The following MUST NOT count:
  - merge commits;
  - commits whose subject contains `[skip ci]`, case-insensitively.
- **FR-3 — Release bump:** the release bump is the largest among the counted commits, where `major` beats `minor` and `minor` beats `patch`. Standard SemVer increments apply: a major bump resets minor and patch, and a minor bump resets patch. Versions below `1.0.0` follow the same rule; `[major]` on `0.3.1` gives `1.0.0`.
- **FR-4 — Nothing to release:** when no commits count, the run MUST NOT publish or tag. It MUST report `Nothing to release since v<baseline>` and succeed.

### Baseline and recovery

- **FR-5 — Baseline:** the baseline is the highest stable version among tags of the form `v<major>.<minor>.<patch>`. Other tags are ignored. The checkout MUST fetch all tags and enough history to evaluate FR-2.
- **FR-6 — Tag recovery:** before computing a version, the run MUST read the highest stable version published on npmjs. If it is higher than the highest tag, the run MUST:
  1. read that version's `gitHead` from npmjs;
  2. if the commit exists in the repository, create and push the tag `v<that version>` on it, then use that version as the baseline;
  3. otherwise, fail before publishing, naming the version and explaining how to add the tag by hand.
- **FR-7 — No stable tags at all:** if neither tags nor npmjs provide a stable baseline, the run MUST fail before publishing and ask for an initial tag. This does not apply to the current repository, which has `v0.3.1`.

### Versions per channel

- **FR-8 — Stable (`latest`):** the release version is the baseline with the FR-3 bump applied. From `v0.3.1` with only `[patch]` commits, this is `0.3.2`.
- **FR-9 — Prerelease (`beta`):**
  - The release version is `<next>-beta.<N>`, where `<next>` is the FR-8 version for the same commits.
  - `N` is one more than the highest `N` among npmjs versions of the form `<next>-beta.<N>`, or `0` when there are none.
  - Prereleases MUST NOT be tagged.

  Example: from `v0.3.1` with an unmarked commit, and with `0.4.0-beta.0` already on npmjs, the version is `0.4.0-beta.1`.

### Applying and recording the release

- **FR-10 — Apply the version:** the run MUST set the computed version in `package.json` and `package-lock.json` inside the run, before the build and publish, without committing. The `npm-default-publication` channel/version check (its FR-3) then validates the computed version. The workflow needs `contents: write` to push tags. This amends that specification's `contents: read` rule, and no other permission is added.
- **FR-11 — Tag stable releases:** after npmjs confirms a stable publication, the run MUST create an annotated tag `v<version>` on the release commit and push only that tag. It MUST NOT use a force option, move or delete tags, or push branches. If the tag push fails, the run MUST fail with a message saying that the next run recovers the tag (FR-6).
- **FR-12 — Uncertain publication:** if npm accepted the publication but the version is not yet readable, the run MUST NOT tag and MUST NOT retry. A later run recovers the tag through FR-6 once the version is readable.
- **FR-13 — Serialized releases:** release runs MUST NOT overlap. A second run waits for the first to finish, and is not cancelled. This way it computes its version from the first run's tag.
- **FR-14 — Committed version:** `version` in the committed `package.json` and `package-lock.json` MUST be `0.0.0-development`. It is never a release version, so a publish that skipped the computation would fail the channel/version check.

### Local preview

- **FR-15 — Preview:** a local command MUST print the version a release from the current commit would get, for a given channel (`latest` by default, or `beta`). It MUST show the baseline, the counted commits with their bumps, and whether tag recovery would run. It MUST change nothing: no tags, no file edits, and no publishing.

### Documentation

- **FR-16 — Documentation:** the README and `AGENTS.md` MUST explain:
  - the markers, their precedence, and the minor default;
  - that `[skip ci]` and merge commits do not count;
  - that tags and npmjs, not `package.json`, show the released version;
  - how to preview the next version.

  The local OTP publication path MUST document applying the computed version first.

## Interfaces and Contracts

| Input | Result |
| --- | --- |
| Baseline `v0.3.1`; commits `[patch] A`, `[patch] B`; channel `latest` | `0.3.2`, tag `v0.3.2` |
| Baseline `v0.3.1`; commits `[patch] A`, `B`; `latest` | `0.4.0` |
| Baseline `v0.3.1`; commits `[minor] A`, `[major] B`, `[patch] C`; `latest` | `1.0.0` |
| Subject `[patch] Fix [major] edge`; `latest` | major |
| Baseline `v0.3.1`; only merge and `[skip ci]` commits | nothing to release |
| Baseline `v0.3.1`; `B`; channel `beta`; npmjs has no `0.4.0-beta.*` | `0.4.0-beta.0`, no tag |
| Same, with npmjs `0.4.0-beta.0`, `0.4.0-beta.1` | `0.4.0-beta.2` |
| Highest tag `v0.3.1`; npmjs latest stable `0.3.2` with `gitHead` present | tag `v0.3.2` on `gitHead`, baseline `0.3.2` |
| npmjs ahead and `gitHead` missing | fail before publishing |

The preview command's first output line is the computed version, or `none`. It exits `0` when a version or `none` is computed, and non-zero on failure.

## Error and Failure Behavior

- Failing Git or npm registry reads MUST fail the run before publishing. A missing package (npm 404) counts as "no published versions".
- An unparseable tag or npmjs version is ignored with a warning. It never becomes the baseline.
- The existing publish safeguards stay unchanged: existing version, conflict, OTP, trusted publisher, and uncertain result.
- No token is printed. Tag pushing uses the workflow's `GITHUB_TOKEN`.

## Nonfunctional Requirements

- **Tooling:** the calculation uses Node.js built-ins, `git`, and `npm` only, with no new dependencies. The published package contents do not change.
- **Tests:** the tests run offline. They use disposable Git repositories and a mocked `npm`, and they run under `npm test`.
- **Speed:** release runs add at most a few seconds for the calculation, apart from the time to fetch history.

## Acceptance Criteria

1. Every row of the Interfaces table is covered by an automated test.
2. The preview command on the current `feature/skills-sync-v1`, whose counted commits since `v0.3.1` are all `[patch]`, prints `0.3.2` for `latest` and `0.3.2-beta.0` for `beta`.
3. The workflow fetches all tags and history, serializes runs, and grants only `contents: write` and `id-token: write`. It applies the version before building. It tags only stable releases after a confirmed publication, without a force option.
4. The committed version is `0.0.0-development`, and `npm pack --dry-run` still produces the same file list.
5. `npm test` passes, including the existing publish and CLI tests.
6. The first automated stable release publishes the previewed version and pushes its tag.

## Assumptions and Open Questions

- **Assumption:** release commits are the commits the workflow was triggered for (`GITHUB_SHA`).
- **Assumption:** `[skip ci]` is the only skip marker ignored. `[ci skip]` and similar variants count as ordinary commits.
- **Assumption:** until `npm-default-publication` is implemented, this work cannot be released through the workflow. The plan sequences the two.
- No open questions remain.

## Handoff

After review and approval, create `sdlc/semver-release-bump/plan.md` with `sdlc-create-plan`.

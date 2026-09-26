# Specification: npm-Only Stable and Prerelease Publication

## Context

The existing release workflow publishes GitHub Packages on every push to `main` and `feature/*`, while npmjs publication is manual and selected through a registry input. The approved release policy replaces GitHub Packages with npmjs and separates prereleases from stable releases by branch/channel.

## Goals

- Publish only `@wesleycamargo/skills-sync` to npmjs.
- Publish `feature/*` release versions as npm prereleases under `beta` without changing `latest`.
- Publish stable versions from `main` and manual dispatch under `latest`.
- Preserve npm trusted publishing, provenance, and no-retry safety.

## Non-Goals

- Change package identity, the already-public `0.1.5` version, or the CLI.
- Create a version automatically; a release version remains an intentional package metadata change.
- Support GitHub Packages publication for new releases.
- Add a staged-release flow.

## Functional Requirements

### FR-1 — npmjs is the sole publication target

The release workflow MUST remove the GitHub Packages job, registry URL, version lookup, and package-write permission. It MUST not set an npm credential or `NODE_AUTH_TOKEN` for the npmjs publication job.

### FR-2 — Release triggers and channel selection

The workflow MUST run the npmjs release job for pushes to `main` and `feature/*`, and for manual dispatch without a registry-selection input.

- A `feature/*` push MUST use the `beta` dist-tag.
- A `main` push or manual dispatch MUST use the `latest` dist-tag.

### FR-3 — Version/channel compatibility

Before npm is asked to publish:

- A `beta` release MUST have a valid SemVer prerelease version (for example, `0.1.6-beta.0`).
- A `latest` release MUST have a valid stable SemVer version without a prerelease suffix.
- An incompatible version/channel combination MUST fail before the publish request and explain the required version form.

The publisher MUST pass the selected dist-tag explicitly to npm. A `beta` publication MUST NOT update `latest`.

### FR-4 — Release safeguards

The npmjs job MUST retain checkout, dependency installation, tests, build, npm 11.5.1 or later, `id-token: write`, trusted publishing, provenance, and exact-version safe-skip behavior. It MUST not retry a conflict, a staged state, an uncertain result, or an already-published version.

### FR-5 — Documentation

The README MUST identify npmjs as the default and supported release path. It MAY retain a clearly labelled legacy GitHub Packages installation note for consumers of already-published versions, but it MUST state that no future releases are published there.

## Interfaces and Contracts

- The publisher accepts a release channel through an environment variable supplied by the workflow. Accepted values are `beta` and `latest`; an absent local value preserves the current local stable-release default of `latest`.
- Consumer prerelease testing uses `npx --yes @wesleycamargo/skills-sync@beta <command>`.
- Consumer stable installation without a version continues to resolve `latest`.

## Error and Failure Behavior

- An unknown release channel, invalid SemVer version, or incompatible channel/version MUST fail without invoking `npm publish`.
- Existing public versions retain the current safe skip behavior regardless of channel.
- A failed npm trusted-publishing request MUST remain redacted and actionable; no token or OTP may be printed or written.

## Nonfunctional Requirements

- Automated tests MUST remain self-contained and mock npm; no test may publish a real version.
- Workflow configuration tests MUST assert the absence of GitHub Packages publication and the selected channel policy.
- The release workflow uses only the least permissions required: `contents: read` and `id-token: write`.

## Acceptance Criteria

1. The workflow has one npmjs publication job, no GitHub Packages URL/job, no registry selector, and no `packages: write` permission.
2. A mocked `feature/*` release with `0.1.6-beta.0` invokes npm publish with `--tag beta` and provenance.
3. A mocked stable release with `0.1.6` invokes npm publish with `--tag latest` and provenance.
4. A stable version in the beta channel and a prerelease version in the latest channel fail before npm publish.
5. The existing-version skip, conflict, OTP, trusted-publisher, and uncertain-result safeguards continue to pass.
6. README documentation makes npmjs the default path and accurately marks GitHub Packages as legacy/no-future-release.

## Assumptions and Open Questions

- Manual dispatch is a stable-release operation even when dispatched from a feature branch; prereleases are created by `feature/*` pushes.
- Each prerelease bump is intentional and uses a new SemVer prerelease version; npm versions are immutable.
- No open questions remain.

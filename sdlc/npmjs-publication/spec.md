# Specification: Publish Skills Sync to npmjs

## Context

The CLI package is currently named `@wesleycamargo/skills-sync` at version `0.1.1`. Its package metadata and release workflow target GitHub Packages, which requires a scoped-registry mapping and a package-read token for installation. The requested outcome is a public npmjs distribution that works with the normal npm registry.

This specification preserves the existing scoped package identity. Consumers invoke the npmjs package as `@wesleycamargo/skills-sync`; an unscoped `skills-sync` package is not part of this work item.

## Goals

- Make a public version of `@wesleycamargo/skills-sync` available from npmjs.
- Let a clean npm environment install and execute the published CLI without a GitHub Packages registry mapping or GitHub package-read token.
- Make release behavior safe, repeatable, and observable without exposing npm credentials.
- Preserve the package’s current runtime, contents, and synchronization behavior.

## Non-Goals

- Claiming, publishing, or documenting the unscoped `skills-sync` name.
- Changes to CLI commands, synchronization semantics, source-publication modes, or agent installation.
- Publishing secrets, adding a token to a repository `.npmrc`, or displaying authentication values in workflow logs.
- Removing GitHub Packages distribution. Its future role is a separate transition decision.
- Declaring the CLI generally available, or releasing a stable public version before the existing v1 release-validation work is complete and reviewed.

## Functional Requirements

- **FR-1:** The npmjs package name MUST remain `@wesleycamargo/skills-sync` and it MUST be publicly installable from `https://registry.npmjs.org`.
- **FR-2:** The published package MUST expose the existing `skills-sync` executable. A consumer that installs `@wesleycamargo/skills-sync` from npmjs MUST be able to run `npx --no-install skills-sync <command>` from that installation.
- **FR-3:** Consumer documentation MUST use the scoped package name for npmjs installation and MUST distinguish npmjs from the existing GitHub Packages installation path. It MUST NOT direct consumers to run `npx skills-sync` before the package is installed.
- **FR-4:** A release path MUST build and test the package before npmjs publication. It MUST use the package version in `package.json` and MUST not overwrite or republish a version that already exists on npmjs.
- **FR-5:** The npmjs release MUST publish the same intended production package contents: built CLI output and documented package files only. Test source, generated test output, SDLC artifacts, local configuration, and credentials MUST remain excluded according to package metadata.
- **FR-6:** The npmjs package MUST retain the declared Node.js compatibility requirement of `>=22.20.0`.
- **FR-7:** npm authentication MUST be supplied only by the operator or the release environment. Repository files, built tarballs, command output, and workflow logs MUST NOT contain an npm token, npm password, or authentication header.
- **FR-8:** The existing GitHub Packages workflow and package availability MUST not be silently broken or removed. Any release automation that publishes to both registries MUST independently check the version state and report the registry-specific result.
- **FR-9:** Until the existing `skills-sync-release-validation` specification has been completed and reviewed, the project MUST continue to describe the CLI as under validation. The npmjs distribution documentation MUST not make a general-availability or important-repository suitability claim.

## Interfaces and Contracts

| Consumer action | Required contract |
| --- | --- |
| Install from npmjs | `npm install --save-dev @wesleycamargo/skills-sync` resolves through the default npm registry without an `@wesleycamargo` GitHub Packages mapping. |
| Run after local install | `npx --no-install skills-sync status` resolves the package-provided executable. |
| One-off execution | Documentation MAY show `npx --package=@wesleycamargo/skills-sync skills-sync <command>`; it MUST use the scoped package identifier. |
| Publish an already-existing npmjs version | The release exits without attempting to overwrite the version and reports that the version is already available. |
| Publish a new npmjs version | The release publishes the validated package publicly, then exposes its version through npmjs metadata. |

## Error and Failure Behavior

- If npmjs authentication or authorization is unavailable, publication MUST fail with an actionable authentication or permission result and MUST not write credentials to tracked files.
- If the scoped package name cannot be published because of npm ownership, organization policy, or name restrictions, publication MUST stop without changing package identity; any identity change requires a revised intent and specification.
- If build, tests, package-content validation, or registry version checks fail, npmjs publication MUST not be attempted.
- If a network or npmjs service failure leaves publication status uncertain, the release MUST report the uncertainty and require an explicit registry version check before retrying. It MUST not assume failure and publish the same version again.
- A registry-specific failure in a dual-registry release MUST identify the affected registry and MUST not claim success for that registry.

## Nonfunctional Requirements

- Automated tests remain self-contained and do not require an npm account, npm token, or live npmjs publication.
- Release validation MUST include an inspection equivalent to `npm pack --dry-run` and a clean install/execution check against the npmjs artifact.
- The release workflow MUST use least-privilege publishing credentials or npm trusted publishing, subject to the account configuration selected by the release owner.
- Documentation and errors MUST be concise enough for a consumer to distinguish a missing local installation from an npm registry-resolution problem.

## Acceptance Criteria

1. A release candidate passes `npm test`, `npm run build`, and package-content validation before an npmjs publication is attempted.
2. `@wesleycamargo/skills-sync@<new-version>` is visible on npmjs as a public package, and its metadata declares Node.js `>=22.20.0`.
3. In a clean temporary consumer directory with default npm registry settings, installing the published package succeeds and `npx --no-install skills-sync --help` succeeds.
4. The packed/published package includes the executable’s production output and excludes test and credential material.
5. Re-running the release for an existing npmjs version does not attempt a second publish and reports the existing-version outcome.
6. An invalid or absent npm publishing credential fails without committing, printing, or persisting the credential in the project.
7. GitHub Packages remains operable or any separate failure is clearly reported; it is not silently removed as a side effect of npmjs support.
8. User-facing documentation refers to `@wesleycamargo/skills-sync` for npmjs and continues to state that the CLI is under validation until the existing release-validation gate is complete.

## Assumptions and Open Questions

- **Assumption:** The package will retain the scoped identity `@wesleycamargo/skills-sync`; this preserves the current namespace and avoids claiming an unrelated unscoped name.
- **Assumption:** npmjs publication is public and is in addition to, rather than a replacement for, GitHub Packages availability.
- **Decision:** GitHub Actions publishes directly through npm trusted publishing with provenance; it uses no npm token. Configure the npm trusted publisher outside the repository for this workflow before enabling that path.
- **Decision:** A local bootstrap release requires `NPM_OTP` from an interactive maintainer. The OTP is passed to npm through its process environment, never a command-line argument or repository file.
- **Decision:** Version `0.1.4` is an under-validation evaluation release. Versions `0.1.2` and `0.1.3` were reserved by npm without becoming installable after interrupted approval flows, so neither can be reused. npmjs documentation MUST retain the validation warning. A stable or general-availability release remains gated on completion and review of `skills-sync-release-validation`.

## Handoff

Review and approve this specification. Then create an executable implementation plan at `sdlc/npmjs-publication/plan.md` using `sdlc-create-plan`; do not change package metadata, workflow configuration, or publish before that approval.

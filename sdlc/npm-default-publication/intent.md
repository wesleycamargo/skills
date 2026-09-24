# Intent: Make npmjs the Only Release Target

## Problem

The release workflow currently treats GitHub Packages as its automatic/default target: pushes to `main` and `feature/*` publish there, and manual dispatch defaults to the GitHub registry. npmjs publication is separately available only through manual dispatch. This creates an unwanted GitHub Packages release and leaves npmjs non-default despite it being the consumer-facing registry.

## Desired Outcome

Release automation publishes `@wesleycamargo/skills-sync` to the public npm registry as the sole supported package-distribution target. Manual releases should select npmjs without requiring a registry choice, and no workflow path should publish to GitHub Packages.

## Scope

- Remove GitHub Packages publishing behavior, its version check, and its package-write credential use from the release workflow.
- Make npmjs the sole release target for manual workflow dispatches.
- Preserve npm trusted publishing, provenance, test/build gates, exact-version safe skip behavior, and the current npm 11.5.1+ toolchain requirement.
- Update release documentation and validation artifacts that state GitHub Packages remains supported.

## Non-Goals

- Change the package name, published version, npm public-access policy, or CLI behavior.
- Republish `0.1.5` or alter the already-published artifact.
- Add GitHub Actions automation beyond selecting the package release target.
- Change consumer synchronization behavior.

## Constraints

- No npm credential may be stored in the repository or workflow.
- Publishing must retain explicit test and build gates and must not retry an uncertain version.
- The work must remain isolated in `.worktrees/` at the repository root.
- A decision about whether pushes should publish npmjs is required before specifying or changing workflow triggers, because it controls irreversible releases.

## Success Criteria

- The release workflow contains no GitHub Packages registry URL, GitHub Packages publish step, or `NODE_AUTH_TOKEN` publishing configuration.
- A manual dispatch runs the npmjs release path without a registry-selection input.
- The workflow continues to use npm trusted publishing and provenance after test/build gates.
- Documentation identifies npmjs as the supported release target and does not present GitHub Packages as an alternative installation or publication channel.

## Open Questions

- Should pushes to `main` and `feature/*` automatically publish to npmjs, replacing the prior GitHub Packages behavior, or should npmjs publication remain manual-only?

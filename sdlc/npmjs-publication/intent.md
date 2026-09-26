# Intent: Publish Skills Sync to npmjs

## Problem

`@wesleycamargo/skills-sync` is configured to publish only to GitHub Packages. A user running `npx skills-sync` receives an npmjs.org 404, and consumer installation requires GitHub Packages registry configuration and a package-read token. This makes the CLI harder to install for the intended test and evaluation workflow.

## Desired Outcome

Make a reviewed release of Skills Sync installable from npmjs with a documented invocation and a safe, repeatable publication process, while preserving the package contents, runtime contract, and synchronization safety behavior.

## Scope

- Decide the npmjs package identity and public-access setting.
- Update package metadata, documentation, and release automation as required for npmjs publication.
- Preserve version checks so an already-published version is not overwritten.
- Validate the packed artifact and a clean npmjs installation before declaring the release available.
- Document the npmjs installation and invocation path, including any relationship to GitHub Packages during a transition.

## Non-Goals

- Changes to skills synchronization behavior or publication modes.
- Publishing credentials in source control or a project `.npmrc`.
- Removing GitHub Packages support without an explicit transition decision.
- Declaring the CLI generally available or suitable for important repositories before the existing v1 release-validation work is complete.

## Constraints

- The current package is named `@wesleycamargo/skills-sync`, version `0.1.1`, and targets GitHub Packages through `publishConfig` and the release workflow.
- npmjs currently reports both `skills-sync` and `@wesleycamargo/skills-sync` unavailable; availability alone does not establish ownership or publication authorization.
- Use npm authentication and publishing permissions supplied outside the repository. Never log or commit tokens.
- Preserve the existing build, test, package-content, Node.js 22.20.0-or-later, and normal-versioning checks.
- Follow the workspace rule that changes to approved v1 behavior or release distribution are specified and planned before implementation.

## Success Criteria

- A clean consumer can install the chosen package from npmjs and invoke the documented CLI command without a GitHub Packages registry mapping.
- The published tarball contains only the approved production files and declares the supported Node.js version.
- Release automation verifies tests and avoids republishing an existing version.
- npm credentials remain absent from the repository, generated artifacts, and command output.

## Open Questions

- Should npmjs use the existing scoped identity `@wesleycamargo/skills-sync`, or should it claim the unscoped `skills-sync` name? The answer changes every consumer command and the ownership/release setup.
- Is the desired transition dual publication to GitHub Packages and npmjs, or npmjs as the sole supported registry?
- Which npm organization/account has authority to publish the selected package, and should publication be automated with npm trusted publishing or performed manually?
- Must the existing v1 release-validation work be completed before the first public npmjs release, or is this intended only as an evaluation prerelease?

## Handoff

Review this intent and resolve the package identity and registry-transition choices. Once approved, create a specification at `sdlc/npmjs-publication/spec.md` before changing package metadata, workflow configuration, or publishing anything.

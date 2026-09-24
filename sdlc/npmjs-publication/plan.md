# Implementation Plan: Publish Skills Sync to npmjs

## Approach

Keep `@wesleycamargo/skills-sync` as the public package identity and add npmjs as a second distribution target. Make publication explicit per registry so GitHub Packages remains supported and each registry can independently determine whether its version already exists. Treat npm account authorization and release trust configuration as operational prerequisites, never repository configuration or source-controlled credentials.

Update consumer documentation to make npmjs the simple default installation path while retaining accurate GitHub Packages guidance for existing consumers. Validate the same packed artifact that would be released, then publish version `0.1.4` as an under-validation evaluation release. A stable or general-availability release remains gated on review of the existing v1 release-validation work.

## Affected Components

- `package.json` and `package-lock.json` for registry-neutral package metadata and any version change authorized for release.
- `.github/workflows/publish-package.yml` for independent GitHub Packages and npmjs checks/publication.
- `README.md` and `scripts/setup-skills-sync.sh` for npmjs installation, invocation, and transition guidance.
- Package validation tests or scripts, if needed to keep package contents and executable contracts deterministic.
- `sdlc/npmjs-publication/` for plan progress and release handover only.
- npm organization/account settings and repository release-environment configuration, managed outside the repository.

## Implementation Tasks

### Task 1 — Confirm npmjs release authority and channel
Status: completed

- [x] Confirm that the release owner controls the `@wesleycamargo` npm scope and can publish public packages.
- [x] Use the operator's existing npm login for the first manual evaluation release; the workflow is prepared for npm trusted publishing and must not store a credential in the repository.
- [x] Confirm version `0.1.4` as an under-validation evaluation release, not a stable or general-availability release.
- [x] Confirm that `@wesleycamargo/skills-sync` remains the consumer-facing npmjs identity and that GitHub Packages remains a supported distribution target.

Validation:
- Completed 2026-09-24: `npm whoami --registry=https://registry.npmjs.org` returned `wesleycamargo` without exposing a credential. Documentation retains the under-validation warning.

### Task 2 — Make package metadata safe for two registries
Status: completed
Depends on: Task 1

- [ ] Remove or revise the single-registry publication default so a release target is selected explicitly and cannot accidentally send every publish to the wrong registry.
- [ ] Preserve `name`, `bin`, `engines`, and the production-file allowlist unless a separately reviewed package-contract change is required.
- [ ] Bump the package version only when required by the selected release channel and ensure `package-lock.json` matches.
- [ ] Add or update deterministic validation of the packed file list and executable entry point if current checks do not protect the npmjs artifact contract.

Validation:
- Completed 2026-09-24: removed the single-registry `publishConfig`, retained the scoped name, executable, engine, and production-file allowlist, and bumped the release to `0.1.2`. `npm test` passed and `npm pack --dry-run --json` listed only `README.md`, `package.json`, and production `dist/` files.

### Task 3 — Implement registry-specific release automation
Status: pending
Depends on: Tasks 1–2

- [ ] Update the release workflow to authenticate and address GitHub Packages and npmjs independently, using the selected external credential/trust configuration.
- [ ] Before each registry-specific publish, query that registry for the exact package version and skip only that registry when the version already exists.
- [ ] Preserve test and build gates before either publication attempt.
- [ ] Report registry-specific success, skip, or failure outcomes without printing credentials.
- [ ] Retain least-privilege workflow permissions and avoid adding tokens to repository files, workflow output, caches, or artifacts.

Validation:
- Workflow review confirms that publishing to npmjs cannot overwrite an existing version, GitHub Packages remains independently publishable, and a failure message identifies the affected registry.

### Task 4 — Update installation and transition documentation
Status: completed
Depends on: Task 2

- [ ] Document npmjs installation with `npm install --save-dev @wesleycamargo/skills-sync` and post-install invocation with `npx --no-install skills-sync <command>`.
- [ ] Explain a one-off scoped npmjs invocation where useful, without suggesting that unscoped `npx skills-sync` resolves an uninstalled package.
- [ ] Retain a clearly separated GitHub Packages path for existing users, including its registry mapping and token requirement.
- [ ] Update or scope `setup-skills-sync.sh` so its behavior and name accurately communicate whether it configures GitHub Packages, npmjs, or both; it must never store tokens in the project.
- [ ] Keep the existing under-validation warning and do not describe the package as generally available.

Validation:
- Completed 2026-09-24: README documents scoped npmjs installation and `npx --no-install` invocation, retains the GitHub Packages path, and states the validation limit. The setup script now installs from npmjs without modifying `.npmrc` or accepting credentials. Clean-install execution remains Task 5 evidence.

### Task 5 — Validate npmjs consumer installation and first publication
Status: in_progress
Depends on: Tasks 1, 2, and 4

- The first publication is the authorized under-validation evaluation release `0.1.4`; a stable/general-availability release still depends on completed review of `sdlc/skills-sync-release-validation`.

- [ ] Run final local package checks with the supported Node.js version: `npm ci`, `npm test`, `npm run build`, and `npm pack --dry-run`.
- [ ] Publish the approved new version to npmjs through the configured release path; do not use an ad hoc token-bearing command line.
- [ ] In a new temporary consumer directory with default npm registry settings, install the exact published version and run `npx --no-install skills-sync --help`.
- [ ] Query npmjs for the exact published version and inspect its public metadata without exposing credentials.
- [ ] Run the release path a second time or its equivalent version check to prove that the existing npmjs version is skipped rather than republished.

Validation:
- `npm test` passed and `npm pack --dry-run --json` listed the 10 intended production files. On 2026-09-24, npmjs initially rejected direct publication because the current login did not satisfy its 2FA policy. Browser-approval flows reserved `0.1.2` and `0.1.3`, but npm's read endpoint and clean installation returned 404 for both; package access reports the package as public with read-write access. npm will not permit either version to be reused, so this task continues with `0.1.4`. `npm pkg fix` normalized the repository field and follow-up commit `3499c44` was pushed. A clean consumer installation and existing-version skip check remain pending successful `0.1.4` publication.

### Task 6 — Record outcomes and hand off for independent validation
Status: pending
Depends on: Task 5

- [ ] Record actual commands, versions, registry-specific outcomes, and any release-environment constraints in this plan’s task validation and handover sections, redacting all sensitive values.
- [ ] Reconcile every acceptance criterion in `spec.md` with automated checks, workflow review, and clean-consumer evidence.
- [ ] Hand the completed item to `sdlc-validate-implementation` for independent verification.

Validation:
- The handover identifies a verifiable npmjs version and shows each acceptance criterion as met, deferred with approval, or blocked; it contains no secrets.

## Risks and Dependencies

- npm scope ownership, public-package policy, and trusted-publishing configuration are external prerequisites. A 404 name check is not proof of publishing authority.
- npm registry publication is irreversible for a version. Version and artifact checks must happen before publishing.
- The current v1 release-validation item still has external evidence gaps; this plan must not bypass its review gate or change the CLI’s validation status.
- A single `publishConfig.registry` is incompatible with an unambiguous dual-registry workflow unless each target is deliberately selected. Review package-manager behavior carefully before changing that contract.
- Existing GitHub Packages consumers may rely on their current installation script and registry mapping; retain that documented path unless a later approved transition supersedes it.

## Final Validation

With Node.js 22.20.0 or later, run `npm ci`, `npm test`, `npm run build`, and `npm pack --dry-run`. Confirm the packed artifact exposes `skills-sync`, includes only approved production files, and declares the required engine. After an approved npmjs release, perform a clean default-registry install of the exact scoped version in a disposable directory and run `npx --no-install skills-sync --help`. Verify npmjs metadata, repeat-version safe-skip behavior, documentation accuracy, registry-specific workflow behavior, absence of credentials from tracked files/logs, continued GitHub Packages support, and completion/review of the existing v1 release-validation gate.

## Handover

Current: Task 5 — versions `0.1.2` and `0.1.3` are reserved but not installable; preparing `0.1.4` for user-terminal publication.
Next: Run final checks, commit and push `0.1.4`; in a user TTY, run one publish command, complete its 2FA prompt, and wait for its success result before any retry; then run a clean consumer install.
Blockers: npm's noninteractive browser-approval flows left `0.1.2` and `0.1.3` non-reusable. The existing `skills-sync-release-validation` work item still blocks a stable/general-availability release, not the approved `0.1.4` evaluation release.

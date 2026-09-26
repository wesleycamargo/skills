# Specification: Skills Sync v1 release validation

## Context

`@wesleycamargo/skills-sync` v1 has completed local automated tests, package checks, a real GitHub pull-request lifecycle check, and alignment of its declared Node.js version with pinned `skills@1.7.0`. This work item defines the remaining release evidence. It verifies approved v1 safety behavior and user operability; it does not introduce new synchronization capabilities.

## Goals

- Demonstrate that rejected publication and concurrent source movement do not lose data or falsely mark content synchronized.
- Demonstrate installation and bidirectional use of the built package against isolated real repository copies.
- Make supported setup, operation, recovery, and v1 boundaries understandable without source-code inspection.
- Obtain Windows evidence or record a concrete, actionable limitation.

## Non-Goals

- GitHub Actions workflows, hosted distribution, multi-source synchronization, or changes to approved v1 publication modes.
- Bypassing branch protection, force-pushing, storing credentials, or changing a named repository's default branch during validation.
- Treating successful local tests as a substitute for the required remote, cross-repository, and platform evidence.
- Declaring the CLI ready for important repositories or general release before final human review.

## Functional Requirements

### Publication failure and recovery

- **FR-1:** Validation MUST exercise a direct source-branch publication that GitHub rejects because of branch protection or insufficient write permission. The configured source branch MUST be a disposable or non-default validation branch; validation MUST NOT alter a named repository's main branch.
- **FR-2:** After the rejection, the CLI MUST return nonzero with an actionable message. It MUST NOT force-push, bypass the policy, or report publication success.
- **FR-3:** The project skill files and saved synchronization baseline MUST remain recoverable after the rejected publication. The validation MUST compare their pre-run and post-run contents and show that no unverified source publication was added to the baseline.

### Concurrent source movement

- **FR-4:** Validation MUST cause the configured source branch to advance after the CLI has recorded its comparison revision and before it attempts publication.
- **FR-5:** In that scenario, the CLI MUST stop before publication with an actionable source-advanced result. It MUST NOT overwrite the newer source content, create a publication commit or branch from stale comparison data, force-push, or advance the baseline as if publication succeeded.
- **FR-6:** The validation MUST demonstrate a safe recovery path: after the operator reviews the changed source, a new comparison may be run and normal synchronization can proceed only from the refreshed state.

### Built-package and repository walkthroughs

- **FR-7:** Validation MUST install the built package into disposable project environments using the package artifact, not the repository's source path. The package artifact MUST declare Node.js `>=22.20.0` and include only production package files.
- **FR-8:** Isolated walkthroughs MUST use a clone of `wesleycamargo/skills` as a skill source and separate clones of `wesleycamargo/devcontainer-template` and one unrelated repository as project environments. They MUST use temporary branches, local checkouts, or disposable remotes so none of the repositories' main branches are modified.
- **FR-9:** Each walkthrough MUST demonstrate selected-skill configuration, a source-to-project update, a project-to-source update using an approved publication mode, and an unchanged repeat run that creates no file changes, commits, branches, or pull requests.
- **FR-10:** Walkthroughs MUST preserve excluded skills and unrelated project files. They MUST use normal commits and pushes only where publication is exercised.

### Documentation and platform evidence

- **FR-11:** User documentation MUST state the Node.js 22.20.0 minimum, built-package installation, wizard and noninteractive configuration, all commands and publication modes, credential expectations, conflict and deletion confirmation, pending-publication recovery, and the exclusion of GitHub Actions from v1.
- **FR-12:** Documentation MUST continue to state that the CLI is under validation and is not ready for important repositories until release checks complete.
- **FR-13:** The build, test suite, and a representative local walkthrough MUST run on a supported Windows environment with Node.js 22.20.0 or later. If the environment is unavailable, the missing environment and the exact checks it still requires MUST be recorded as a release-review gap rather than treated as a pass.

## Interfaces and Contracts

- The public CLI remains `skills-sync` with `init`, `configure`, `status`, `diff`, `pull`, `push`, and `sync`; this work MUST preserve their existing confirmation, exit-status, and conflict behavior.
- Project configuration remains `.agents/skills-sync.json`; state remains the versioned project-local synchronization state file. Validation snapshots of these files MUST not contain credentials.
- Authenticated remote validation MUST use the operator's existing Git and `gh` authentication. Automated tests MUST remain self-contained and MUST NOT require a live GitHub account.
- Validation-only remote branches and pull requests MUST have unambiguous temporary names and be removed after evidence is captured when repository policy permits. A merged or closed pull-request record may remain as auditable evidence.

## Error and Failure Behavior

- A rejected push, branch-protection policy, unavailable write permission, unavailable authenticated account, or unavailable test repository MUST produce a concise failure or blocked result; none may be worked around through force-push, policy changes, or default-branch writes.
- A concurrent source update MUST remain visible to the operator. A failed run MUST leave the project content and synchronization state in a state that can be inspected and retried safely.
- If the package cannot be installed or run on Windows, validation MUST identify the platform, Node.js version, command, and observed failure. It MUST NOT claim Windows support based only on Linux results.

## Nonfunctional Requirements

- Validation must not expose authentication secrets in configuration, state, logs, or committed evidence.
- Temporary remote validation must be scoped to repositories and accounts explicitly authorized by the operator.
- Tests and walkthroughs must be reproducible with Node.js 22.20.0 or later, npm, Git, and—where pull-request behavior is tested—an authenticated `gh` CLI.
- Existing safety controls for symlinks, conflict handling, deletion confirmation, pending-publication recovery, and normal Git history MUST remain intact.

## Acceptance Criteria

1. A real or equivalently enforced permission/branch-protection rejection returns nonzero, provides a next action, and leaves the project content and baseline recoverable with no policy bypass.
2. A source advance during publication is detected before stale content is published; the newer source content, project content, and baseline are verified after the failure, and a refreshed retry path is demonstrated.
3. The built package installs and operates in isolated walkthroughs using `wesleycamargo/skills`, `wesleycamargo/devcontainer-template`, and an unrelated repository; no named main branch is changed.
4. Those walkthroughs demonstrate both directions of synchronization, preserve excluded and unrelated content, and show a no-op repeat without a new commit, branch, or pull request.
5. Documentation covers all required user operations, safety/recovery behavior, runtime requirement, credentials, and v1 boundary while retaining the under-validation warning.
6. Windows results are available for the required checks, or the unavailable environment is an explicit, actionable release-review gap.
7. Final validation can report a clear pass, fail, or blocked release-review recommendation based on the above evidence without expanding v1 scope.

## Assumptions and Open Questions

- **Assumption:** A disposable non-default branch or a repository with intentionally limited credentials can be made available to test an actual publication rejection without changing shared branch policy.
- **Assumption:** The unrelated repository may be a disposable repository owned by the operator, provided it has no account-specific configuration and its default branch remains untouched.
- **Open question:** Which Windows runner or machine will execute the platform checks? Until identified, this requirement remains a release-review gap.
- **Open question:** If a validation check exposes a v1 defect, should its narrow corrective implementation be handled as a follow-up work item or should this validation work be paused for a revised intent and specification?

## Handoff

Review and approve this specification. Then use `sdlc-create-plan` to create `sdlc/skills-sync-release-validation/plan.md`.

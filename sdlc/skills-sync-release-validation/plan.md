# Implementation Plan: Skills Sync v1 release validation

## Approach

Treat release validation as evidence work, not a feature expansion. First add or confirm deterministic, credential-free regression coverage for source movement and rejected publication using disposable local Git fixtures. Then perform bounded authenticated checks on explicitly authorized temporary remote branches, preserving snapshots of project content and synchronization state before each failure scenario. Validate the built package in isolated repository clones, complete user documentation from the observable CLI contract, and obtain or explicitly record Windows evidence. Keep `main` and existing feature branches untouched; use normal commits, pushes, and temporary branches only.

## Affected Components

- `src/cli.integration.test.ts` and related self-contained fixtures for publication rejection, source advancement, recovery, and no-op behavior.
- Package build and contents (`package.json`, `package-lock.json`, `dist/`) for artifact-based installation checks.
- `README.md` for v1 setup, operating, recovery, credential, runtime, and scope documentation.
- `sdlc/skills-sync-release-validation/` for task progress and final handover only; do not create separate validation-report artifacts.
- Authorized disposable GitHub branches, pull requests, and isolated local clones used only during manual validation.

## Implementation Tasks

### Task 1 — Establish validation baseline and disposable fixtures
Status: completed

- [x] Run `npm ci`, `npm test`, `npm run build`, and `npm pack --dry-run` with Node.js 22.20.0 or later; confirm the packed file list excludes tests and the declared engine matches `skills@1.7.0`.
- [x] Inventory the existing integration fixtures and define disposable source/project repositories for failure-path tests without live credentials.
- [x] Record the exact project-skill and state snapshots required to prove recoverability after each rejected or interrupted publication.

Validation:
- Completed 2026-09-24: `npm ci`, `npm test` (18 passing), and production build passed; `npm pack --dry-run` listed 10 production files and excluded tests. The fixture uses a disposable bare source, seed checkout, and project directory. Failure-path tests snapshot the selected project skill, `.agents/skills-sync-state.json`, source ref/content, and source ref list before the attempted publication, then compare them after failure and clean the fixture through its test teardown.

### Task 2 — Verify rejected direct publication and recovery
Status: in_progress
Depends on: Task 1

- [x] Add or extend a self-contained integration test that makes a direct source publication fail through an equivalent enforced Git rejection, without force-push or source-history rewrite.
- [x] Assert nonzero exit status, actionable output, unchanged protected source content, and preserved project/state snapshots after the rejection.
- [ ] Perform one bounded authenticated GitHub check against an explicitly authorized temporary non-default branch or limited-permission repository; do not change any main branch or branch-protection policy.
- [x] Remove temporary remote branches and local test artifacts after evidence is captured, retaining only unavoidable GitHub audit records.

Validation:
- The deterministic bare-repository `pre-receive` rejection regression passes and preserves project content, state, source content, and refs. A live GitHub credential-free push to a temporary non-default branch also returned nonzero and preserved those snapshots, but GitHub rejected the attempt before identifying a write permission because branch protection cannot be enabled for this private repository on the current plan (HTTP 403: GitHub Pro required). A real protected-branch or limited-permission target remains required.

### Task 3 — Verify concurrent source advancement and safe retry
Status: completed
Depends on: Task 1

- [x] Add or extend a deterministic integration test that advances the configured source after comparison revision capture and before publication.
- [x] Assert that publication stops before writing stale content, that the newer source content remains intact, and that project content and baseline retain their recoverable pre-publication state.
- [x] Exercise a refreshed comparison and successful retry after the source change is reviewed.

Validation:
- Completed 2026-09-24: the integration test advances the disposable source during the CLI's freshness fetch. It receives the actionable source-advanced failure, verifies that the project skill and state are unchanged, verifies the remote-only source note remains, then performs a fresh successful sync that preserves both sides. The compiled suite has 20 passing tests.

### Task 4 — Run built-package cross-repository walkthroughs
Status: completed
Depends on: Tasks 1–3

- [x] Build a package artifact and install it into disposable project environments rather than invoking the source checkout directly.
- [x] Use an isolated clone of `wesleycamargo/skills` as source and isolated clones of `wesleycamargo/devcontainer-template` and one unrelated repository as projects.
- [x] For each project, configure a selected skill, demonstrate source-to-project and project-to-source changes using an approved publication mode, and verify an unchanged repeat produces no file or Git changes.
- [x] Verify excluded skills and unrelated project files remain unchanged; use only temporary branches, local checkouts, or disposable remotes and clean them up afterward.

Validation:
- Completed 2026-09-24: a tarball produced by `npm pack` installed `@wesleycamargo/skills-sync` with Node.js >=22.20.0 into isolated clones of `wesleycamargo/devcontainer-template` and `octocat/Hello-World`; each used an isolated `wesleycamargo/skills` source clone. Both walkthroughs pulled a source-only selected-skill file, published a project-only file through a local source commit, reported `No changes.` on repeat with unchanged commit count, preserved an excluded skill and a tracked unrelated project file, and made no remote writes. All temporary clones and tarballs were removed.

### Task 5 — Complete v1 user documentation
Status: completed
Depends on: Task 4

- [x] Document Node.js 22.20.0 minimum, installation from the built package, wizard flow, saved noninteractive configuration, and all CLI commands.
- [x] Document each publication mode, existing Git and `gh` credential expectations, preview/confirmation behavior, conflict and deletion choices, pending-publication recovery, and override safeguards.
- [x] State the GitHub Actions boundary and retain the under-validation warning until final release review passes.
- [x] Verify commands and recovery guidance against the completed walkthroughs.

Validation:
- Completed 2026-09-24: README now covers the built-package tarball installation, Node.js requirement, wizard and noninteractive configuration, commands, all publication modes, Git and `gh` credentials, previews and confirmations, conflict/adoption/deletion/pending recovery, override safeguards, GitHub Actions exclusion, and under-validation warning. `npm pack --dry-run` includes the revised README and only 10 production package files; command and recovery guidance matches the completed built-package walkthroughs.

### Task 6 — Obtain Windows evidence
Status: in_progress
Depends on: Tasks 1, 4, and 5

- [ ] Run the package build, automated tests, and a representative local walkthrough on Windows with Node.js 22.20.0 or later.
- [x] Record the Windows runtime version, commands, outcomes, and actionable failures or unavailable-environment gaps in this plan's handover.

Validation:
- No Windows runtime is available in the current workspace: it is Debian Linux on WSL2, and the available `pwsh` is the Linux PowerShell binary with no mounted Windows filesystem. A separate Windows runner or machine with Node.js 22.20.0 or later must run `npm ci`, `npm test`, `npm run build`, and one representative local walkthrough before Windows validation can pass.

### Task 7 — Consolidate release-review evidence
Status: pending
Depends on: Tasks 2–6

- [ ] Re-run required package checks after any validation-driven code or documentation change.
- [ ] Compare all acceptance criteria in `spec.md` with automated, authenticated, walkthrough, documentation, and platform evidence.
- [ ] Update this plan's task statuses and handover with remaining gaps; hand off to `sdlc-validate-implementation` only when all required evidence is available.

Validation:
- The work item has a clear pass, fail, or blocked recommendation grounded in the specification, with no v1 scope expansion.

## Risks and Dependencies

- Authenticated rejection testing requires an explicitly authorized non-default branch with enforced policy or limited credentials. Do not change an existing shared branch policy merely to create the test.
- Remote validation depends on GitHub availability, Git credentials, and an authenticated `gh` CLI. A missing account or suitable repository is a blocker for that check, not a reason to weaken it.
- Windows execution requires an external environment not available in the current Linux workspace; record this truthfully if it cannot be obtained.
- Cross-repository walkthroughs may encounter repository-specific layouts or credential policies. Preserve the v1 contract and record incompatibilities rather than special-casing repository code.
- If validation identifies a product defect, stop and create or revise the appropriate SDLC artifact before implementing a substantive fix.

## Final Validation

Run `npm ci`, `npm test`, `npm run build`, and `npm pack --dry-run` on the final Linux state. Confirm the self-contained rejected-publication and source-advance tests pass. Confirm authenticated rejection evidence, installed-package walkthroughs for all required repositories, documentation coverage, and Windows outcomes against every acceptance criterion in `spec.md`. Verify no test changed a named repository's main branch, no force-push occurred, no credentials entered tracked files, and `skills/write-for-me` remains unchanged.

## Handover

Current: Task 6 environment discovery completed. The current Debian-on-WSL2 workspace cannot supply Windows evidence; the packaged README and local validation tasks remain complete.
Next: Obtain a protected-branch or limited-permission GitHub target to complete Task 2, and run the prescribed checks on a separate Windows environment to complete Task 6.
Blockers: GitHub branch protection cannot be enabled on this private repository under the current plan (HTTP 403); a suitable protected or limited-permission target and a Windows runner or machine have not yet been identified.
Remaining validation: Task 2 authenticated policy check and Tasks 6–7.

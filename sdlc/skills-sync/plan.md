# Implementation Plan: Skills synchronization CLI (v1)

## Approach

Build a generic npm CLI in `wesleycamargo/skills`, keeping the existing `skills/write-for-me` intact. Use the existing `skills` package only for agent installation and discovery where its supported interface is suitable; keep the comparison, baseline, conflict, and publication logic in this package. Separate a pure planning step (read source, project, and baseline; produce a proposed change set) from an apply step (verify freshness, write selected content, publish, then advance verified state). Use Git working copies and ordinary commits; never force-push. Avoid assuming a GitHub account or source URL.

The v1 implementation provides local CLI behavior and noninteractive commands. The separate [GitHub Actions specification](../skills-sync-github-actions/spec.md) is outside this plan. The current repository has one existing skill and no npm tool scaffold, so the package structure, tests, and user docs are new additions.

## Affected components

- npm package metadata, command entry point, dependencies, build and test scripts.
- Wizard and versioned `.agents/skills-sync.json` schema.
- Skill discovery and optional agent installation adapter to the upstream `skills` CLI.
- Source Git access, portable synchronization state, three-way file comparison, preview, and apply logic.
- Git publication modes: local commit, pushed branch, pull request, direct main, and explicit main override.
- CLI usage documentation and test fixtures. Existing `skills/write-for-me` stays unchanged.

## Implementation tasks

### Task 1 — Scaffold and configuration contract
Status: completed

- [x] Add a TypeScript npm CLI with a pinned supported Node.js version range and executable `skills-sync`.
- [x] Define and validate versioned configuration and state schemas, safe relative paths, source identity, selection, direction, agents, and publication mode.
- [x] Establish deterministic errors and noninteractive behavior without reading secrets from stored files.

Validation: Package builds; config round-trips, unsupported versions, unsafe paths, and missing settings produce clear results.

### Task 2 — Discovery and wizard
Status: completed
Depends on: Task 1

- [x] Discover skills with `SKILL.md` from remote or local Git sources, including the current `skills/` layout.
- [x] Implement init and reconfigure prompts for repository, branch, paths, selected skills, direction, agents, publication mode, and final review.
- [x] Connect supported agent installation through the upstream `skills` interface without bypassing conflict checks; expose unsupported agent errors.

Validation: An interactive setup against a fixture repository produces a reviewable config and installs chosen skills without changing unselected content; reconfiguration prefills prior answers.

### Task 3 — Read-only change planner
Status: completed
Depends on: Tasks 1 and 2

- [x] Inventory all files under selected skill directories, identify source/local/baseline changes including first adoption, missing files, name collisions, and exclusions.
- [x] Produce a deterministic per-file change set and human-readable status/diff; handle compatible independent changes and report overlapping conflicts without touching affected files.
- [x] Track deletion proposals separately and require explicit choice before they can be applied.

Validation: Fixture cases cover new and unchanged skills, both change directions, disjoint changes, conflicts, missing baseline, deletes, exclusions, and unrelated files; status/diff cause no writes.

### Task 4 — Safe local apply and recovery
Status: completed
Depends on: Task 3

- [x] Implement pull, push, and sync direction rules and change previews, including explicit noninteractive confirmation.
- [x] Recheck source revision and local file content before writes; apply only the approved change set.
- [x] Persist baselines only after verified outcomes, and record/report partial outcomes so an interrupted or failed run can be resumed safely.

Validation: Pull-only and push-only cannot write the opposite side; conflict and interrupted-run fixtures preserve existing edits; repeated successful sync makes no changes.

### Task 5 — Publication modes
Status: in_progress
Depends on: Task 4

- [ ] Implement local-commit staging of managed files only, and branch publication without force-push.
- [ ] Implement pull-request publication via the hosting API for GitHub remotes while keeping Git-only modes generic; reuse an existing matching PR.
- [ ] Implement direct main with freshness checks and protected-branch failures.
- [ ] Implement override-main with exact replacement preview, per-run target confirmation, explicit noninteractive flag, and ordinary commit semantics; revalidate if upstream moves.

Validation: Local Git and remote fixtures exercise every mode, concurrent source advancement, conflicts, permissions, no-op reruns, and override refusal when confirmation or policy is missing.

### Task 6 — End-to-end verification and documentation
Status: pending
Depends on: Tasks 2–5

- [ ] Document install, configuration, wizard, commands, modes, credentials, conflict resolution, deletion handling, and the boundary with the separate GitHub Actions work item.
- [ ] Validate with isolated clones of `wesleycamargo/skills` and `wesleycamargo/devcontainer-template`, without publishing test changes to their main branches.
- [ ] Verify installation from the package build and bidirectional changes from both sides, plus a second unrelated repository URL to catch account-specific assumptions.

Validation: Package build and relevant automated tests pass; local isolated two-repository walkthrough succeeds and its no-op repeat produces no change.

## Risks and dependencies

- The upstream `skills` CLI may not expose a stable programmatic discovery or installation API. Limit the adapter to supported commands, pin a compatible version, and keep sync safety independent of it. If necessary, discover `SKILL.md` directly while still using `skills` for agent installation.
- PR publication depends on hosting integration; initial v1 PR mode targets GitHub. Other Git hosts remain usable with local-commit, branch, and direct Git modes; unsupported PR hosts fail clearly.
- Authentication and branch protection are controlled by repository owners. Tests use disposable repositories or mocks and never require permanent credentials.
- A portable state file may be edited concurrently in the project. Verify its revision with the rest of the plan before applying; never infer a successful publication from a merely pending PR.
- The default local source checkout and its cleanup must be explicit so failed runs do not alter unrelated project files.

## Final validation

Run the package build and focused unit/integration tests. Exercise wizard setup, status/diff, one-sided and independent two-sided edits, same-content conflicts, deletion choice, each publication mode, source movement, no-op reruns, and recoverable failure. Confirm existing `skills/write-for-me` is unchanged. Do not create a GitHub Actions workflow as part of v1.

## Handover

Current: Draft PR #1 includes the v1 CLI, wizard, upstream agent installation adapter, per-skill state, conflict and deletion handling, all publication modes, and pending branch/PR recovery. Eighteen automated tests pass after a clean `npm ci`; a real GitHub pull-request lifecycle created, updated, merged, and recovered a pending publication without touching main. The package now requires Node.js 22.20.0 or later, matching pinned `skills@1.7.0`.
Next: Test protected-branch and concurrent-main failures, then run the isolated two-repository walkthrough and complete platform documentation.
Blockers: Windows/macOS execution is not available in this validation run. Keep the PR in draft until those checks pass.

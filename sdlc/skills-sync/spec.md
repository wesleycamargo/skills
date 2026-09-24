# Specification: Skills synchronization CLI

## Context

The approved [intent](intent.md) defines a generic npm tool that configures selected skills from a Git repository and synchronizes changes between that repository and one project. The existing `skills` CLI provides skill discovery and agent installation. This tool must keep one canonical project copy for synchronization and may use the existing CLI for installation, provided it does not overwrite unsynchronized edits. The current tool repository contains `skills/write-for-me`, which must remain intact.

## Goals

- Guide a developer through setup without requiring hand-written configuration.
- Synchronize selected skills safely in either direction, with visible status, conflict handling, and idempotent results.
- Support configurable publication: local commit, pushed branch, pull request, direct main update, or explicit main content override.
- Work with any configured Git repository accessible to the user, locally and in unattended environments.

## Non-goals

A hosted registry, cross-project distribution service, multiple skill sources in one project, CI workflow generation, or npm publication in this initial version.

## Functional requirements

### Configuration and setup

- **FR-1:** Provide an interactive `init` or `configure` wizard that accepts a Git repository URL or local path, source branch and skills directory, project skills directory, skills selection, synchronization direction, agent installation targets, and publication mode. Show a review screen before writing files. Existing choices must be prefilled when reconfiguring.
- **FR-2:** Discover skill directories containing `SKILL.md` at the configured source path. The user may select all skills or named skills. Persist selections in a versioned, project-local configuration that can be reviewed and edited. Reject duplicate names and invalid paths.
- **FR-3:** Support bidirectional, pull-only, and push-only synchronization. A pull-only source must never be written; a push-only run must never replace local skill content with remote content. Source and target paths may differ.
- **FR-4:** On a noninteractive terminal, use saved configuration without prompts; if absent or invalid, fail with an actionable error. Never print authentication secrets.
- **FR-5:** Provide `status` and `diff` as read-only previews and `pull`, `push`, and `sync` actions. An action must preview intended content changes and publication destination before applying them, unless the caller explicitly opts into a noninteractive confirmed run.
- **FR-6:** Preserve all excluded or unselected skills and unrelated files. Do not claim ownership of a skill whose name collides with an unrelated locally managed directory without explicit adoption.
- **FR-7:** Installation to supported agents may use the existing `skills` CLI, but synchronization must operate on the canonical configured project copy. Installing or updating agent copies must not bypass conflict checks or discard unsynchronized local edits.

### Comparison and conflict handling

- **FR-8:** Record a per-skill synchronization baseline sufficient to distinguish a new skill, unchanged skill, local-only edit, source-only edit, both-side edit, and deletion. Track content of all files belonging to a selected skill, not only `SKILL.md`. Store the baseline without machine-specific credentials or absolute temporary paths.
- **FR-9:** Carry a change from one side to the other if only one side changed since the baseline. When both sides changed different files or compatible parts, preserve both changes. If changes overlap or cannot be safely merged, report each conflict and leave affected existing files untouched.
- **FR-10:** Treat missing content as a potential deletion only if the baseline proves it previously existed. Never propagate a deletion by default. Require an explicit deletion choice for the affected skill or file and show its effect in the preview. Unselected directories must never be deleted.
- **FR-11:** After a successful synchronization, advance the baseline only for content that actually reached both intended sides or has a verified pending publication outcome. An interrupted run must not make later changes appear synchronized. Repeating an unchanged run produces no file changes, commits, branches, or pull requests.
- **FR-12:** If source main advances after comparison, revalidate before publishing. Do not replace newer content or force-push. Report a conflict or retry a safe comparison against the new tip.

### Publication

- **FR-13:** Persist one publication mode per project: `local-commit`, `branch`, `pull-request`, `main`, or `override-main`. The wizard explains the effects and required access. A run can inspect status without publishing. Publishing a remote change requires an explicit `--publish` choice or a separately configured unattended publication setting.
- **FR-14:** `local-commit` stages only managed skill content in a local checkout of the source repository, creates a commit only when it has a diff, and never pushes. `branch` pushes changes on a named non-main branch. `pull-request` pushes a branch and opens or updates a PR targeting the configured source branch, without creating duplicates for the same pending change.
- **FR-15:** `main` publishes a normal commit directly to the configured main branch only when comparison has no unresolved conflicts. Branch protection, missing write permission, or concurrent changes must yield an actionable failure without bypassing policy.
- **FR-16:** `override-main` is a separate, explicitly selected mode that can replace conflicting content **only within selected managed skills** by a normal commit. Before the override, list the exact files and versions to be replaced and require per-run confirmation identifying the source repository and branch. For unattended execution, require an explicit override flag in addition to saved configuration; missing confirmation fails without writes. It must never force-push, rewrite history, bypass branch protection, or affect unrelated files. Concurrent upstream movement requires revalidation and fresh confirmation if the replacement set changes.
- **FR-17:** Remote publication works through the user's existing Git authentication. Read-only operations must work without write credentials where access allows. Publication failures must leave local skill files and baseline in a recoverable state and must report what was already changed.

## Interfaces and contracts

- npm executable: `skills-sync`; commands `init`, `configure`, `status`, `diff`, `pull`, `push`, `sync`. Interactive setup is offered when configuration is absent in an interactive session.
- Per-project configuration: `.agents/skills-sync.json` with explicit version, source repository/ref/path, target path, selection, direction, agent targets, and publication mode. Reject unsupported versions with migration guidance.
- Synchronization state: a versioned project-local file identifying source and per-skill baselines. It should be reviewable and portable with the project. A lost or mismatched baseline triggers explicit adoption or a safe initial comparison rather than guessing which side should win.
- The source repository may be public, private, remote, or a local Git checkout. The package contains no hardcoded account or repository name; initial testing with Wesley's repositories is an example only.

## Error and failure behavior

Invalid configuration, inaccessible repository, missing credentials, unavailable branch, unsupported agent, name collision, conflict, permission rejection, and partial publication return nonzero with a concise next action. An interrupted operation must never report success or silently mark a pending push/PR as accepted on main. No action removes unrelated data.

## Nonfunctional requirements

- Cross-platform behavior on supported Node.js runtimes for Windows, macOS, Linux, and CI.
- No credential storage in config, logs, or baseline.
- Stable machine-readable exit status for automation and clear human output; no prompts in CI.
- Respect existing Git working changes and branch policies; stage only intended managed files.
- Pin or constrain integration with the upstream `skills` package so changes to that CLI do not silently change synchronization safety.

## Acceptance criteria

1. A user with a different account initializes against their own repository, selects skills and agents, reviews the setup, and runs synchronization without editing source code.
2. A local-only change reaches the source and a source-only change reaches the project in bidirectional mode. Pull-only and push-only modes refuse reverse writes.
3. Different-file edits on each side are preserved; overlapping edits are reported without overwriting either version.
4. An unchanged repeated run creates no new commit, branch, or PR. A source branch advancing during publication cannot silently discard its new content.
5. Excluded and unrelated skill files remain unchanged, including when a selected skill was deleted on one side. Deletion requires an explicit choice.
6. Each selected publication mode produces its specified destination; a protected branch or missing permission fails clearly.
7. Override main previews exact replacements and requires fresh explicit confirmation. It replaces only selected skill content with a normal commit and cannot force-push.
8. Noninteractive runs with missing configuration, credentials, or override confirmation fail promptly. Failed remote publication does not falsely advance the shared baseline.

## Assumptions and open questions

- **Assumption:** “Main” refers to the configured source branch, typically named `main`.
- **Assumption:** A local Git checkout is needed for `local-commit`; for a remote URL, the tool may maintain a dedicated checkout but must show its location and avoid editing the project's unrelated repository.
- **Specification choice:** The first version supports one source per project. Multi-source ownership and CI automation can follow validation of the local tool.

# Specification: GitHub Actions integration for Skills Sync (v2)

## Context

This is a follow-up to the [v1 CLI specification](../skills-sync/spec.md). It uses the same project configuration, synchronization baseline, conflict checks, and publication modes. GitHub Actions integration is excluded from v1 and begins only after the CLI behavior is validated.

## Goals

Allow any participating GitHub repository to run its own synchronization on local changes, manually, and on a schedule; propose remote changes for review without depending on a central coordinator.

## Non-goals

Changing the core comparison engine, adding multiple sources, requiring a central registry, or mandating access to `wesleycamargo/skills`.

## Functional requirements

- **GA-1:** Provide a documented or generated workflow for each participating repository, using its committed `.agents/skills-sync.json` and a pinned version of the npm CLI. The setup process explains permissions and credentials before enabling automated publication.
- **GA-2:** Support `workflow_dispatch`, relevant skill or configuration changes on the configured branch, and an optional schedule so a project can receive source changes even when no local files change. Allow users to disable any automatic trigger.
- **GA-3:** Run without prompts; fail clearly for missing or invalid configuration, inadequate token scope, inaccessible source, protected branches, ambiguous skill ownership, conflicts, or a missing baseline. Never expose tokens in logs or artifacts.
- **GA-4:** Use the same CLI engine as local execution. Save proposed project-side updates to a branch and create or update a pull request targeting the project branch. Do not commit directly to the project's protected main unless the user has explicitly selected and enabled that publication behavior.
- **GA-5:** Apply the configured source publication mode. Source-side PR mode creates or updates one pending PR for the same change; branch and direct-main modes honor their explicit configuration and GitHub permissions. Unattended `override-main` requires a separate explicit workflow setting and CLI override flag, and must record the exact affected managed files in the run output. No workflow may force-push or bypass protections.
- **GA-6:** Use narrowly scoped repository credentials. Document when the built-in `GITHUB_TOKEN` is sufficient and when a GitHub App installation or user-provided token is required for a second repository. Read-only use never requires write credentials.
- **GA-7:** Idempotent runs with unchanged content create no branch, commit, or PR. Workflow triggers caused by sync output must not create a recurring change cycle; failures and conflicts remain visible for human resolution.
- **GA-8:** Do not advance the synchronization baseline as accepted when a PR is merely opened. Baseline handling must remain consistent across reruns and after PR merge, rejection, or branch deletion.
- **GA-9:** One repository's workflow knows only its configured source and target; onboarding another project does not require a central list or a change to other projects.

## Interfaces and failure behavior

- Workflow inputs permit a dry-run preview and a publish run. A run summary lists selected skills, direction, pending changes, publication targets, PR links when present, and exact conflicts without displaying secrets.
- A failed publication leaves proposed changes reviewable or clearly reports where they were applied; it never reports a completed sync when the required source or target update is pending.
- A workflow may require manual approval via repository environment rules, but no setting can silently infer consent to destructive overrides from the absence of a terminal.

## Acceptance criteria

1. Configure two independent projects against their respective source repositories; both use the same published tool without account-specific source code.
2. A project-side skill edit results in exactly one source PR or branch update according to configuration. A source-side edit is picked up on the next scheduled or manual run and proposed in a project PR.
3. Rerunning before or after the PR merge creates no duplicate PR or unnecessary commit; no endless trigger loop occurs.
4. Conflict, missing permission, or protected branch produces a failed run with actionable output and preserves both versions.
5. A workflow with only read access can preview changes; write actions require matching permissions. Tokens are absent from configuration and logs.
6. Override main without the dedicated unattended setting and CLI flag fails before writes; with both set, the workflow previews exact managed files and obeys all v1 override rules.

## Dependencies and assumptions

- Requires a released and validated v1 CLI with deterministic noninteractive behavior and stable configuration and baseline formats.
- GitHub is the automation host for this follow-up. The CLI remains usable locally and by other CI systems.

# Intent: Automate Skills Sync with GitHub Actions

## Problem
The v1 CLI synchronizes skills when a developer runs it. Projects using GitHub still need a consistent way to run the same checks and propose updates without relying on a developer's machine or bypassing review.

## Desired outcome
A project can configure GitHub Actions to invoke the existing Skills Sync CLI in an unattended run, review changes in pull requests, and report conflicts or missing permissions clearly. Each project controls its own automation and configured skills repository.

## Scope
- Generate or document a project-local GitHub Actions workflow that runs the existing CLI on relevant skill changes, on demand, and on a configurable schedule to receive upstream changes.
- Publish changes using project-configured permissions and review flow, with idempotent pull requests and no synchronization loops.
- Support each repository independently without a service or registry that knows all participants.

## Non-goals
- Reimplementing synchronization in workflow scripts.
- Automatically distributing changes to every project from a central service.
- Publishing the npm package or implementing multiple sources.

## Constraints
- Depend on the behavior and configuration specified in [the v1 CLI specification](../skills-sync/spec.md).
- Keep credentials in GitHub secrets or permitted token mechanisms, not committed configuration.
- Respect branch protection and the configured publication mode. Never enable override-main unattended merely because it is configured.

## Success indicators
- A participating repository can run its own workflow and obtain or propose changes using the CLI.
- Repeated runs with unchanged content generate no new commit or PR.
- Failures and conflicts are visible in the workflow without losing edits or triggering endless workflow cycles.

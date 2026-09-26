---
name: sdlc-create-pull-request
description: Open an Azure DevOps pull request for an SDLC work item, publishing the reviewer-facing summary held in sdlc/<work-item>/pr-summary.md. Use when the user wants to create, open, or raise a PR for an SDLC story or work item, or to ship completed/validated work. When invoked directly it always previews the resolved PR title and description and waits for confirmation before creating. Generates pr-summary.md on demand when it was not maintained during execution (post-implementation mode).
---

# Create pull request

## Position

Final delivery stage of the SDLC pipeline, after sdlc-execute-plan and normally after sdlc-validate-implementation. It consumes `sdlc/<work-item>/pr-summary.md` (kept current during execution) plus the branch's committed state, and produces one opened Azure DevOps pull request into the target branch. It does not implement, change requirements, or edit intent/spec/plan except to record the resulting PR link.

## The pr-summary.md artifact

Each work item carries a reviewer-facing `sdlc/<work-item>/pr-summary.md`. It is distinct from plan.md's `## Handover` (working state for resuming work): pr-summary.md is the narrative a reviewer reads on the PR. Its first line is the PR title; the rest is the PR description body. The source and target branches are not stored here — the workflow resolves them at creation time. The work item is linked through the create/update API call (`--work-items`, resolved from the `<work-item>` folder), not written as description text — an `AB#<id>` line in the body does not create the association.

```markdown
# PR: <imperative title, ~50 chars, e.g. "Wire phoenix-one CI and integration tests">

## Summary
<1-3 sentences: what this delivers and why, tied to the intent's outcome>

## Changes
- <notable change, appended as tasks complete>

## Testing
- <validation performed and evidence>

## Notes for reviewers
- <risks, follow-ups, deliberately out-of-scope items>
```

## Workflow (direct invocation)

1. Resolve the work item: its `sdlc/<work-item>/` directory, the `AB#<id>`, and the feature branch (`feature/wcamargo/<...>` per repo convention).
2. Ensure pr-summary.md is present and current:
   - Present and consistent with plan.md progress: use it.
   - Present but stale (plan.md shows completed work the summary omits): offer to refresh the Changes/Testing sections before continuing.
   - **Absent (post-implementation mode):** generate it from intent.md / spec.md / plan.md plus the branch's diff and commits against the target branch, write it to the directory, and show it for review.
3. Preflight (see [REFERENCE.md](REFERENCE.md)): confirm the branch exists on origin and that no active PR already targets it; if one exists, report its URL and stop.
4. Build the PR title (first line, minus the `# PR:` prefix) and description (the remaining body) from pr-summary.md.
5. **Preview and confirm — required.** Print the resolved title and the full description, then stop and ask the user to confirm, choose draft vs ready, and confirm the target branch. Never create the PR before showing this preview.
6. On confirmation, create the PR with `az repos pr create` (see [REFERENCE.md](REFERENCE.md) for the exact command and the cross-platform gotchas). Print the returned PR URL.
7. Record the PR URL in pr-summary.md and in plan.md's Links/Handover.

When another skill hands off to this one, still build the same preview; only skip the interactive stop when the caller has explicitly authorized non-interactive creation.

## Maintained vs post-implementation

Maintained mode is the default and cheapest: sdlc-execute-plan keeps pr-summary.md current as tasks complete, so this skill mostly previews and opens. Post-implementation mode is the fallback for work done without a maintained summary — reconstruct it from the SDLC artifacts and the actual branch diff/commits rather than inventing scope.

## Companion tooling

`scripts/New-AdoWorktreePullRequests.ps1` is the batch/multi-branch companion and the working reference for the Azure DevOps mechanics (branch discovery, existing-PR check, diff/commit enrichment, PR creation). Reuse its command patterns; do not duplicate its allow-list logic here — this skill is per-work-item and interactive.

See [REFERENCE.md](REFERENCE.md) for the Azure DevOps commands, authentication, and the Windows/PowerShell gotchas.

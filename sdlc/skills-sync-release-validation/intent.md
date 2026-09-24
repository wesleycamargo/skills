# Intent: Skills Sync v1 release validation

## Problem

The v1 CLI has passing automated coverage, a verified real GitHub pull-request lifecycle, and a corrected Node.js runtime contract. However, the remaining negative-path, cross-repository, platform, installation, and user-documentation evidence is incomplete. Releasing without that evidence could leave users unable to recover safely from permission rejections, concurrent source changes, or unfamiliar setup and recovery scenarios.

## Desired Outcome

Establish sufficient, reproducible evidence to decide whether `@wesleycamargo/skills-sync` v1 is ready for final human release review, while preserving its explicit safety guarantees and keeping it clearly in validation until those checks succeed.

## Scope

- Verify that direct publication rejected by branch protection or insufficient write permission fails clearly, leaves project content and synchronization state recoverable, and never bypasses repository policy.
- Verify that source advancement between comparison and publication is detected before publication, does not overwrite newer source content, and does not falsely advance the shared baseline.
- Run isolated end-to-end walkthroughs using `wesleycamargo/skills`, `wesleycamargo/devcontainer-template`, and one unrelated repository, without publishing test changes to their main branches.
- Verify installation from the built package and bidirectional synchronization of selected skills in those walkthroughs, including an unchanged repeat run.
- Complete user-facing documentation for installation, configuration, wizard use, modes, credentials, conflict and deletion handling, recovery, runtime requirements, and the v1 boundary excluding GitHub Actions.
- Run the relevant workflow on Windows, recording any platform-specific limitation or defect found.

## Non-Goals

- GitHub Actions workflow generation, automation, or any work described by the separate `skills-sync-github-actions` item.
- New synchronization modes, multiple source repositories, hosted services, or changes to the approved v1 behavior.
- Bypassing branch protection, force-pushing, storing credentials, or publishing test changes to a protected or default branch.
- Declaring the CLI generally available or suitable for important repositories before the release evidence is reviewed.

## Constraints

- Use disposable local repositories, isolated clones, and temporary remote branches or pull requests for validation; do not modify the main branches of the named repositories.
- Preserve normal Git commit and push semantics, explicit confirmation flows, conflict visibility, symlink protections, baselines, and pending-publication recovery.
- Automated tests remain self-contained and must not require live GitHub credentials. Any authenticated GitHub check is a bounded manual validation step using the operator's existing credentials.
- Keep the pinned `skills@1.7.0` dependency and its Node.js 22.20.0 runtime requirement unless an intentional, separately validated dependency change is approved.

## Success Criteria

- A permission or branch-protection rejection produces an actionable failure with no policy bypass and no false synchronization success.
- A concurrent source update is preserved; the CLI stops or safely re-compares rather than replacing it, and recovery state remains accurate.
- The isolated walkthroughs demonstrate built-package installation, selected-skill setup, source-to-project and project-to-source changes, and a no-op repeat without changing any named repository's main branch.
- Documentation enables a new user to configure, operate, recover, and understand the v1 limits without relying on source inspection.
- Windows validation results are recorded, with actionable follow-up for any failure.
- Final evidence supports a clear release-review decision without broadening v1 scope.

## Open Questions

- Which repository and account arrangement can reliably produce a branch-protection or no-write-permission rejection without affecting shared work?
- Which Windows environment will be used for the platform checks, and who will run it if it is not available in the current environment?
- Should a validation-discovered defect be fixed within this work item when it is a narrow v1 safety correction, or recorded as a separate intent before implementation?

## Handoff

Review this intent. Once approved, create a specification at `sdlc/skills-sync-release-validation/spec.md` using `sdlc-create-spec`.

---
name: sdlc-execute-plan
description: Implement or resume an approved SDLC plan while updating tests, task progress, and concise handover in the plan artifact.
---

# Execute implementation plan

## Position

This stage implements approved requirements after planning and is also the resume entry point. Its outputs are repository changes, relevant tests, and progress maintained only in sdlc/<work-item>/plan.md.

## Inputs and output

- Required inputs: spec.md and plan.md, both with `Approval: approved` (if either is not approved, stop and ask for review); read intent.md when context helps preserve outcome or scope.
- Inspect repository instructions, current state, existing behavior, and available validation evidence before changing code.
- Output: implementation and tests plus an updated existing plan.md. Do not create status, handover, implementation, or validation-report artifacts.

## Execution and resume

Determine whether work is new or resumed. On resume, read task statuses and handover, inspect the actual repository, and reconcile discrepancies before continuing. Execute tasks in dependency order, preserve required behavior, and follow existing conventions. For a task that adds or changes behavior, work test-first with the tdd skill when it is available. Test meaningful milestones and never mark work complete without its defined validation evidence.

Use only pending, in-progress, completed, and blocked statuses. Update checklists, validation notes, and this concise section after meaningful milestones, status changes, material validation results, blockers, deviations, or decisions affecting later work:

```markdown
## Handover

Current: Task 3 — <Title>
Next: <next concrete action>
Blockers: None
Remaining validation: <pending evidence>
```

Do not log routine commands or duplicate Git history. Before editing a file, check the working tree for uncommitted changes this plan did not make. Do not overwrite them; if they conflict with a task, record a blocker. Distinguish required current-scope work from optional improvements, technical debt, and future follow-up. Add only required work that does not change approved requirements; record significant deviations. Return for artifact review when a discovery changes scope or specification.

## Reviewer-facing pull-request summary

Alongside plan.md, create and maintain `sdlc/<work-item>/pr-summary.md` as tasks complete. It is the reviewer-facing narrative that sdlc-create-pull-request will publish, distinct from the plan.md `## Handover` working state. Keep its Summary, Changes, and Testing sections current after meaningful milestones so opening the PR is a no-surprise step; do not defer it to the end. Its first line is the PR title; the rest is the PR body (see the sdlc-create-pull-request skill for the template). When work is done without this file, sdlc-create-pull-request can reconstruct it post-implementation instead.

## Handoff

When implementation tasks are completed with task-level validation, hand off to sdlc-validate-implementation, then to sdlc-create-pull-request to open the PR. Completion here is not a claim that final independent validation passed.
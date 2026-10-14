# SDLC workflow

Each change moves through six stages, one skill per stage. Every work item lives in its own directory, `sdlc/<work-item>/`, named in short lowercase kebab-case.

The skills are maintained in `skills/` (the copies that `skills-sync` distributes). `.agents/skills/` mirrors them for agents working in this repository; edit `skills/` and copy the change across.

```text
sdlc-create-intent -> sdlc-create-spec -> sdlc-create-plan -> sdlc-execute-plan -> sdlc-validate-implementation -> sdlc-create-pull-request
     intent.md            spec.md             plan.md          code + tests +        Passed / Failed / Blocked      pull request
                                                               plan.md and            (no file written)             (from pr-summary.md)
                                                               pr-summary.md
```

## Stages

| Stage | Skill | Input | Output | Gate to the next stage |
| --- | --- | --- | --- | --- |
| 1. Intent | `sdlc-create-intent` | An informal request, bug, improvement, debt item, or refactor | `intent.md`: problem, outcome, scope, non-goals, constraints, open questions | Human approval |
| 2. Specification | `sdlc-create-spec` | Approved `intent.md` | `spec.md`: observable requirements and testable acceptance criteria | Human approval |
| 3. Plan | `sdlc-create-plan` | Approved `intent.md` and `spec.md` | `plan.md`: approach, dependency-ordered tasks with validation criteria, handover | Human approval |
| 4. Execution | `sdlc-execute-plan` | Approved `spec.md` and `plan.md` | Code and tests; task status and handover updated in `plan.md` | Every task completed with its validation evidence |
| 5. Validation | `sdlc-validate-implementation` | `intent.md`, `spec.md`, `plan.md`, and the implementation | A concise result: **Passed**, **Failed**, or **Blocked**, with evidence and gaps | Human sign-off on a **Passed** result |
| 6. Pull request | `sdlc-create-pull-request` | `pr-summary.md` and the branch | An opened Azure DevOps pull request, after a title and description preview the user confirms | Final human review |

Each stage creates only its own artifact. Execution keeps progress and handover in `plan.md` and maintains the reviewer-facing `pr-summary.md` alongside it. Validation adds no file: its result is returned, not stored.

## Approval

`intent.md`, `spec.md`, and `plan.md` each start with `Approval: draft`. It becomes `Approval: approved` only after the user explicitly approves, and returns to `draft` when the content changes. Later stages stop and ask for review if their inputs are still drafts.

## Traceability

Requirements carry stable IDs (FR-1, NFR-1) and acceptance criteria carry IDs (AC-1). Each plan task lists the IDs it covers (`Covers:`), and validation reports the evidence for each ID.

## Small changes

For a small, low-risk change (one behavior, no new interface, dependency, migration, or security impact, and no more than one or two tasks), every stage still produces its artifact but each may be a few lines, and the three documents may be approved in one review.

## Validation context

Run `sdlc-validate-implementation` in a fresh session or a subagent that did not implement the work. If the implementing context has to validate, the result says so and **Passed** is provisional.

## Completion

On **Passed**, validation sets the plan Handover to `Current: Complete` and `Next: sdlc-create-pull-request`. After the human accepts, the work-item directory stays in `sdlc/` as the record of that change.

## Going back

| What changed | Return to |
| --- | --- |
| Outcome or scope | Revise `intent.md`, then re-run the later stages that depend on it |
| Requirements or acceptance criteria | Revise `spec.md`, then re-plan |
| Approach or task breakdown | Revise `plan.md` |
| Validation found incomplete or wrongly completed tasks | Correct task status and handover in `plan.md`, then return to `sdlc-execute-plan` |

Do not rewrite an earlier artifact to fit the code. Change the artifact first, get it approved, and then change the code.

## Resuming

`sdlc-execute-plan` is also the resume point. It reads the task statuses and the Handover section in `plan.md`, inspects the actual repository, and reconciles any differences before continuing.

Task statuses are `pending`, `in-progress`, `completed`, and `blocked`.

## When it applies

Changes to approved v1 behavior need an updated intent, specification, and plan under `sdlc/` before implementation. See the project scope section of `AGENTS.md`.

---
name: sdlc-validate-implementation
description: Independently verify an implemented SDLC work item against its approved artifacts, repository evidence, and relevant tests.
---

# Validate implementation

## Position

This independent final stage follows implementation. It creates no persistent validation artifact: return a concise outcome of **Passed**, **Failed**, or **Blocked**.

Run it in a context that did not implement the work: a fresh session or a subagent. If the implementing context has to validate, say so in the result and treat **Passed** as provisional.

## Inputs and output

- Required inputs: intent.md, spec.md, and plan.md for one work item, all with `Approval: approved`.
- Inspect repository state and implementation changes; run relevant tests, builds, static checks, integration checks, or contract checks where possible.
- Output: a concise validation result with evidence, gaps, remaining work, and readiness for final human review. Update only inaccurate task statuses, validation notes, and handover in the existing plan.md.

## Responsibilities

Independently compare approved intent, requirements, acceptance criteria, and plan progress with concrete repository evidence. Verify required existing behavior, task completion or explicit blocks, relevant regression coverage, and unapproved scope changes. Consider security, compatibility, and operational concerns when applicable. Prefer test results and observable evidence to visual inspection alone, and distinguish implementation defects from environmental or infrastructure failures.

Do not assert a requirement is validated merely because code appears present. If validation cannot run, identify the exact gap. Do not rewrite intent, relax acceptance criteria, silently modify specification to fit code, create a report file, or implement unrelated improvements.

## Outcome and handoff

Report:

- **Passed** only when all required acceptance criteria have sufficient evidence.
- **Failed** when one or more requirements are unsatisfied, with actionable findings for execution.
- **Blocked** when required information, dependencies, or capabilities prevent completion, with the unblock condition.

Map each requirement and acceptance-criterion ID to its evidence, and include checks and results, unresolved gaps, remaining work, and readiness for human review. If findings reveal incomplete or wrongly completed tasks, correct plan status and handover, then hand off to sdlc-execute-plan. A passed result is ready for final human review; on **Passed**, set the plan Handover to `Current: Complete` and `Next: sdlc-create-pull-request`.

On a **Passed** result, refresh the Testing section of `sdlc/<work-item>/pr-summary.md` with the validation evidence when that file exists, then hand off to sdlc-create-pull-request to open the PR.
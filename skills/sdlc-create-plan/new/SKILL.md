---
name: sdlc-create-plan
description: Create a proportional, executable implementation plan from a direct request or an approved SDLC specification, including tasks, validation, and handover.
---

# Create implementation plan

## Position

Create `sdlc/<work-item>/plan.md`, combining implementation strategy and executable tasks.

Support two workflows:

- Compact: Create a self-contained plan directly from a user request.
- Full: Create a plan from approved `intent.md` and `spec.md`.

Do not create separate task artifacts or modify production code.

## Inputs and output

### Compact workflow

Input: A user request without existing SDLC artifacts.

For straightforward changes, capture the intent, requirements, and acceptance criteria directly in `plan.md`.

### Full workflow

Inputs: Approved `intent.md` and `spec.md` in the same work-item directory.

Use the specification as the authoritative source of requirements and the intent as supporting context.

### Common behavior

Inspect the repository, relevant instructions, current implementation, interfaces, dependencies, and engineering conventions.

Output: `sdlc/<work-item>/plan.md`.

If the work-item directory does not exist, create it.

If an existing plan is provided, update it without discarding approved decisions or implementation progress.

## Workflow selection

Use compact mode when:

- The request is sufficiently clear.
- The scope is limited.
- The expected behavior can be captured concisely.
- There are no significant unresolved architectural or cross-system decisions.

Use full mode when:

- Approved intent and specification artifacts already exist.
- The change involves substantial architectural or cross-system decisions.
- The requirements are complex or materially ambiguous.
- Separate specification review is necessary.

If the request is too complex for compact mode, recommend the full workflow instead of creating an incomplete implementation plan.

Do not create `intent.md` or `spec.md` automatically when operating in compact mode.

## Responsibilities

Choose an implementation approach consistent with the repository.

Identify affected components and material compatibility, migration, security, operational, and dependency concerns.

Break only required approved-scope work into dependency-ordered, independently verifiable tasks.

Keep the plan proportional to the complexity of the change.

Each task must have:

- A clear objective.
- A meaningful work checklist.
- Dependencies when applicable.
- Validation criteria.
- Initial status: `pending`.

Include a testing strategy and a concise, resumable handover.

## Plan structure

For compact mode, use this structure when useful:

    # Implementation Plan: <Title>

    ## Intent
    Why the change is needed and the desired outcome.

    ## Requirements
    Observable system behavior and relevant constraints.

    ## Acceptance Criteria
    Testable conditions defining successful implementation.

    ## Approach
    Implementation strategy.

    ## Affected Components
    Relevant modules, services, interfaces, or repositories.

    ## Implementation Tasks

    ### Task 1 — <Title>
    Status: pending

    - [ ] Implementation step
    - [ ] Test or validation

    Validation:
    - Expected completion criteria.

    ## Risks and Dependencies

    ## Final Validation

    ## Handover
    Current: Not started
    Next: Task 1
    Blockers: None

For full mode, use the same structure but omit the Intent, Requirements,
and Acceptance Criteria sections.

Reference the approved intent.md and spec.md instead.

Do not duplicate their contents unnecessarily.

Omit irrelevant sections and avoid unnecessary task fragmentation.

## Clarification and scope control

If planning exposes a genuine specification gap, report it for specification
revision rather than silently changing requirements.

In compact mode, clarify material ambiguities before committing to an
implementation approach.

Do not add unrelated refactoring, new functionality, or unapproved scope.

Do not create tasks.md or edit production code.

Ask only about material decisions that cannot be resolved from the available
context. Otherwise, record a reasonable assumption.

Prefer the agent's native interactive question tools when available.

Keep questions concise and present meaningful options when appropriate.

## Handoff

After plan approval, hand off to sdlc-execute-plan.

The plan must contain enough information for another agent to implement
the change without relying on the original conversation.

Revise plan.md for a material approach or task change.

In full mode, return to specification when requirements change and to
intent when the desired outcome or scope changes.

In compact mode, update the relevant requirements and acceptance criteria
in plan.md before proceeding with an approved scope change.

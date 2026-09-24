# Implementation Plan: Sync All Skills Except Those in .skillsignore

## Approach

Make `selection` optional in the configuration. Resolve the managed skills once per run, in `execute()`, after the source is opened and the baseline is loaded. Then pass a resolved configuration, in which `selection` is always a list, to the existing functions. This leaves their safety logic untouched.

The `.skillsignore` parsing and the union with the direction rules live in `src/sync.ts` as testable functions. The wizard loses its skill prompt, reports which skills will be synced, and returns a `.skillsignore` for migrating a legacy configuration. `cli.ts` writes that file.

## Implementation Tasks

### Task 1 — `.skillsignore` and managed-skill resolution
Status: completed

- [x] Write failing tests for parsing (comments, whitespace, trailing `/`, `*` and `?`), for the symlink rejection, and for the union with the pull and push direction skips.
- [x] Implement `readSkillsIgnore`, `isIgnored`, and `resolveSkills` in `src/sync.ts`.

### Task 2 — Optional selection and run-time resolution
Status: completed
Depends on: Task 1

- [x] Make `selection` optional in `Config` and `validateConfig`.
- [x] In `execute()`, resolve the skills and print the FR-3 notices. Use the resolved configuration in the functions that took `config.selection`: `reconcilePending`, `publication`, `installAgents`, and the main loop.
- [x] In `openSource`, run the local-commit dirty check over the whole source directory when there is no `selection`.
- [x] Add integration tests for acceptance criteria 1 and 2. The existing tests stay unchanged.

### Task 3 — Wizard
Status: completed
Depends on: Task 2

- [x] Remove the skill prompt and `selection` from the saved configuration. Log the skills that will be synced and those ignored, and update the summary.
- [x] Return a `.skillsignore` for a legacy configuration being migrated, and write it in `cli.ts` only when none exists.
- [x] Update the wizard tests, and add the migration test.

### Task 4 — Documentation
Status: completed

- [x] Update the README configuration section and the `sdlc/skills-sync` and `sdlc/clack-prompts` specifications to point to this work item.

## Handover

Current: All tasks completed 2026-09-24.
Next: independent validation (`sdlc-validate-implementation`).
Blockers: None
Evidence: `npm test` passes: 17 publish checks, 20 release-version tests, and 45 CLI tests. New tests cover `.skillsignore` parsing and symlink refusal, managed-skill resolution with the direction skips, pull and bidirectional runs without `selection`, and wizard migration. The existing `selection` tests are unchanged (acceptance criterion 3).

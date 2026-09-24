# Intent: Sync All Skills Except Those in .skillsignore

## Problem

Skills Sync saves an explicit list of skills (`selection` in `.agents/skills-sync.json`), as FR-2 of `sdlc/skills-sync/spec.md` requires. Adding a skill to the source or to `.agents/skills` does nothing until someone reruns the wizard and selects it. A skill that is added and forgotten silently stays out of sync.

## Desired Outcome

The CLI no longer saves the skills to sync. By default it manages every skill: those in the source skills directory and those under the project's `.agents/skills`, the configured project skills directory. A project excludes skills by listing them in a `.skillsignore` file.

## Scope

- Work out the managed skills at run time from the source, the project skills directory, and the saved baseline, minus the `.skillsignore` entries.
- Define the `.skillsignore` location and format.
- Stop the wizard from asking for and saving a selection.
- Keep existing configurations that contain `selection` working, and give them a path to the new behavior.
- Keep the direction guarantees. A pull-only project never writes the source, and a push-only project never overwrites project content.

## Non-Goals

- Ignoring individual files inside a skill.
- A `.skillsignore` in the source repository.
- Changing conflict handling, adoption, deletion confirmation, publication modes, or agent installation.

## Constraints

- The existing review, `--publish`, adoption, and deletion safeguards apply to newly discovered skills exactly as they do to selected skills.
- Symlinked skill directories and a symlinked `.skillsignore` are never followed.
- This changes approved v1 behavior (FR-2), so a specification and plan are needed before implementation.

## Success Criteria

- A project with no `selection` syncs every discovered skill, except those matched by `.skillsignore`.
- Existing configurations with `selection` behave as before.
- The wizard saves no `selection`.

## Decisions

- **2026-09-24, by the user:** "instead of saving the skills, assume all under .agents, unless they are in a .skillsignore".

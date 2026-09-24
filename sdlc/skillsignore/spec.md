# Specification: Sync All Skills Except Those in .skillsignore

## Context

The approved intent is `sdlc/skillsignore/intent.md`. This specification replaces FR-2 of `sdlc/skills-sync/spec.md` (selection) and FR-8 of `sdlc/clack-prompts/spec.md` (the skill selection prompt). Everything else in those specifications is unchanged.

## Functional Requirements

- **FR-1 — Managed skills:** when the configuration has no `selection`, each run manages the union of:
  - skill directories containing `SKILL.md` in the source skills directory, on the configured branch;
  - skill directories containing `SKILL.md` in the project skills directory;
  - skills recorded in the saved baseline and in a pending publication, so that deletions are still detected.

  Skills matched by `.skillsignore` are removed from that union. The list is sorted by name. Symlinked directories are not followed, as discovery already works. A name that fails the existing skill-name validation is skipped with a warning.
- **FR-2 — `.skillsignore`:** the file sits at the project root. It has one entry per line, where:
  - blank lines and lines starting with `#` are ignored;
  - surrounding whitespace and a trailing `/` are removed;
  - an entry matches a skill directory name, and `*` and `?` work as wildcards, matching within the name.

  A missing file means nothing is ignored. A `.skillsignore` that is a symlink or not a regular file MUST fail the run.
- **FR-3 — Direction:**
  - In a `pull` project, a skill that exists only in the project and has no baseline is skipped. The run prints `Skipping <skill>: only in the project, and pull-only projects never publish. Add it to .skillsignore to silence this.`
  - In a `push` project, a skill that exists only in the source and has no baseline is skipped in the same way.
  - In a `bidirectional` project, project-only skills are proposed for publication, which still needs `--publish`, and source-only skills are proposed for pulling.
- **FR-4 — Legacy selection:** a configuration that still contains `selection` MUST behave exactly as before. `.skillsignore` does not apply to it. `validateConfig` accepts configurations with or without `selection`, and validates `selection` when present.
- **FR-5 — Ignored skills:** a skill that becomes ignored is no longer managed. Its files, its agent copies, and its baseline entry are left as they are. Nothing is deleted.
- **FR-6 — Safeguards:** newly managed skills go through the same preview, confirmation, `--publish`, adoption (`--adopt-source` or `--adopt-project`), and deletion (`--delete=`) rules as selected skills. In local-commit mode, the dirty-source check covers the whole source skills directory when there is no `selection`.
- **FR-7 — Wizard:**
  - The wizard no longer asks for skills and never saves `selection`.
  - After loading the source, it shows the discovered skills that will be synced and any that `.skillsignore` excludes.
  - The configuration summary shows `Skills: all except .skillsignore`.
  - When reconfiguring a legacy configuration that has `selection`, and no `.skillsignore` exists yet, saving writes a `.skillsignore` that lists the discovered source and project skills that were not selected. This keeps the same set of synced skills. The summary names that file.
- **FR-8 — Agent installation:** agent installation uses the managed skills in place of `selection`.

## Acceptance Criteria

1. With no `selection`, `sync --yes` in a pull project pulls every source skill that `.skillsignore` does not match. It skips a project-only skill with the FR-3 notice, and it leaves ignored skills untouched.
2. With no `selection`, a bidirectional project with a new project-only skill fails without `--publish`. With `--publish`, it publishes that skill to the source.
3. All existing tests with `selection` pass unchanged.
4. Unit tests cover `.skillsignore` parsing (comments, whitespace, trailing `/`, wildcards), a symlinked `.skillsignore`, and the managed-skill union with the direction rules.
5. Wizard tests show that no skill prompt is shown, that `selection` is not saved, and that a legacy configuration is migrated to `.skillsignore`.

## Assumptions

- `.skillsignore` sits at the project root, not inside `.agents/`, like other ignore files.
- The file lists skill names, not paths.

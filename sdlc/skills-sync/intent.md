# Intent: Synchronize selected AI skills across repositories

## Problem
The existing `skills` npm CLI installs skills, but edits to installed skill files have no safe route back to their source. Updating can overwrite local edits. Across projects, developers must manually track changes and conflicts.

## Desired outcome
A developer configures a project with an interactive wizard and safely synchronizes selected skills with an accessible Git repository. Changes may originate on either side. The tool works locally, through an AI agent, and in CI.

## Scope
- Discover and select skills; save project-specific configuration.
- Synchronize one project with one configured Git repository, with bidirectional, pull-only, and push-only modes.
- Detect independent edits, conflicts, and deletions; report status and prevent silent data loss.
- Preserve unselected skills and unrelated project files.
- Provide an npm command with an interactive setup wizard and noninteractive operation from saved configuration.
- Validate first with `wesleycamargo/skills` and `wesleycamargo/devcontainer-template` while remaining configurable for other users.

## Non-goals
- Hosted service, mandatory central registry, or automatic distribution across all projects.
- Multiple upstream repositories and automated GitHub Actions distribution in the first working version.
- npm publication before local behavior is validated.

## Constraints
- Version the tool's code in `wesleycamargo/skills`; preserve its existing `skills/write-for-me` skill. Restructure if needed.
- Reuse the npm `skills` CLI for installation and agent integration where suitable; provide separate conflict-aware synchronization.
- Support other people's Git repositories, including private repositories accessible through their credentials, without hardcoded account dependencies.
- Fail clearly if noninteractive configuration or credentials are missing.
- Never overwrite conflicting edits or propagate deletions without explicit choice.

## Success indicators
- A user runs the wizard, selects a repository and skills, and gets saved configuration and usable installed skills.
- Edits from either side synchronize without losing independent changes.
- Concurrent edits to the same content are reported; a repeated sync with no changes makes no modifications.
- Another user configures their own repository without modifying the tool.

## Assumptions and open questions
- **Assumption:** The first release handles one configured source repository per project.
- **Open question for specification:** Define whether publishing means a local Git commit, a pushed branch, or a pull request in each execution mode.

# Intent: Adopt the skills CLI Prompt Implementation

## Problem

The interactive `init`/`configure` wizard and the apply confirmation in `src/cli.ts` use a single free-text `prompt()` helper built on `node:readline/promises`. Every question is typed text, including questions with a fixed set of answers:

- Skills are chosen by typing a comma-separated list or `*`. A typo is detected only after the answer is submitted, and the wizard then exits with `Selection contains a skill absent from source`, discarding every earlier answer.
- Direction (`bidirectional/pull/push`) and publication mode (`local-commit/branch/pull-request/main/override-main`) are free text. An invalid value is rejected only by `validateConfig` at the end of the wizard.
- Agents are a free-text comma-separated list with no list of choices.
- Confirmations require typing the literal `yes`. Any other answer, including `y`, counts as no.
- The review screen is raw `JSON.stringify` output, and the wizard gives no progress feedback while it clones the source repository to discover skills.
- Ctrl+C has no defined handling.

Skills Sync already depends on the upstream `skills` CLI (pinned at `1.7.0`), which solves the same problems with `@clack/prompts`. Users see the two tools one after the other during setup, but their prompts look and behave differently.

## Desired Outcome

The Skills Sync wizard and confirmations copy the prompt implementation of the `skills` CLI (`vercel-labs/skills`, MIT license), so they look and behave like `npx skills add`. The resulting configuration, the safety confirmations, and the noninteractive behavior stay the same.

## Reference Implementation

These observations come from the installed `skills@1.7.0` build (`node_modules/skills/dist/cli.mjs`):

- **Library:**
  - It imports `intro`, `outro`, `note`, `log`, `spinner`, `select`, `multiselect`, `confirm`, and `cancel` from `@clack/prompts`, `isCancel` from `@clack/core`, and colors from `picocolors`.
  - These are `devDependencies` (`@clack/prompts ^1.2.0`) bundled into `dist/` by `obuild`. The notices file records `@clack/prompts@1.7.0`, so users install no prompt packages at runtime.
- **Searchable multi-select:** a custom `searchMultiselect` prompt built on `readline` keypress events. It supports:
  - type-to-filter by label or value;
  - initial selection and a required-selection check;
  - a select-all option;
  - a scrolling window (`maxVisible`);
  - a locked "always included" section;
  - a summary of the selected items;
  - clack's glyphs (`◆ ◇ ■ ● ○ │`).
- **Skill selection:** the message is `Select skills to install`. Each item uses the skill name as its label and the `SKILL.md` description as its hint, cut to 60 characters. It shows up to 20 rows, with select-all and required selection.
- **Agent selection:**
  - a searchable multi-select of the known agents (label is the display name, hint is the skills directory);
  - universal `.agents/skills` agents appear in a locked section;
  - the previous selection is remembered, with a default of Claude Code, OpenCode, and Codex.
- **Single choices:** a `select` whose options each have a `label` and a `hint`. The preferred option is marked `(Recommended)`, for example `Symlink (Recommended)`.
- **Review and confirm:**
  - a `note(..., "Installation Summary")` box lists each skill, its destinations, file counts, and a yellow `overwrites:` line;
  - then `confirm({ message: "Proceed with installation?" })` asks for approval;
  - a spinner runs during slow work (`Loading agents…`, `Installing skills…`).
- **Cancellation:** when a prompt is cancelled or confirmation is declined, `cancel("Installation cancelled")` runs. The process then exits with status `0` in a TTY. Without a TTY, it exits with status `1` and prints an actionable message that names the flags for noninteractive use.
- **Flag bypass:** `--agent <name>` / `--agent '*'` and `-y` skip the matching prompts. An invalid flag value prints `log.error` along with the list of valid values, then exits with status `1`.

## Scope

- Replace the readline `prompt()` helper for the interactive paths in `src/cli.ts`, following the patterns above:
  - `intro`/`outro` framing, and `text` inputs for the repository, source branch, source path, project path, and publication branch, with saved values prefilled when reconfiguring (FR-1);
  - a copy of `searchMultiselect` for skill selection, with `SKILL.md` descriptions as hints and the saved selection preselected;
  - agent selection that follows the `skills` agent prompt, using the copied agent registry (see Decisions);
  - `select` prompts for direction and publication mode, each option carrying a hint that explains its effect and required access (FR-13), with the default marked `(Recommended)`;
  - a `note` summary in place of the raw JSON review, and `confirm` controls for `Save this configuration?` and `Apply the listed changes?`;
  - a spinner during the source checkout and skill discovery;
  - cancellation handling that works like the `skills` CLI's.
- Add attribution for the copied code as the MIT license requires.
- Add automated tests for the prompt-driven configuration flow. The interactive wizard currently has no test coverage.
- Update the README where it describes the wizard.

## Non-Goals

- Changes to synchronization behavior, baselines, pending-publication recovery, conflict handling, or publication modes.
- Changes to the configuration file format or validation rules.
- Copying the `skills` CLI's non-prompt features, such as agent detection, installation, lock files, or telemetry.
- Replacing the explicit command-line safety flags (`--yes`, `--override-main`, `--override-target`, `--adopt-source`, `--adopt-project`, `--delete`) with prompts.
- Upgrading or unpinning the `skills` dependency.
- GitHub Actions automation of the sync CLI (tracked in `sdlc/skills-sync-github-actions/`).

## Constraints

- Copied code from `vercel-labs/skills` must keep the MIT copyright and permission notice ("Copyright (c) 2026 Vercel, Inc."). Copy from the upstream TypeScript source, not from the bundled `dist/` output, and record the upstream commit or version.
- AGENTS.md says to prefer Node.js built-ins over new runtime dependencies. Bundling avoids new runtime dependencies, but the specification must still record the justification, pinned versions, and package-size effect of the bundled `@clack/prompts` and `picocolors`, and must include their licenses in the package.
- Noninteractive behavior (FR-4) must not change: with no TTY, no prompt renders, missing configuration fails with an actionable error, and `--yes` runs never block on input.
- Unlike the `skills` CLI, whose `confirm` defaults to yes, the apply confirmation must default to no so that Enter alone does not apply changes. The `override-main` path must keep requiring its explicit flags.
- Prompts must never display authentication secrets.
- Tests must be self-contained and must not need a real TTY session, live GitHub credentials, or `sync-skills-test/`.
- The wizard is approved v1 behavior. The specification and plan must be approved before implementation.
- A version bump is required to publish the change.

## Success Criteria

- A user can finish `init` without typing skill, direction, mode, or confirmation values by hand, and cannot submit a skill, direction, or mode that is not in the list.
- Skill selection supports type-to-filter and select-all, and shows each skill's description, like `npx skills add`.
- Reconfiguring prefills every saved value, including the preselected skills.
- The `agents` saved in the configuration are keys the pinned `skills` CLI accepts.
- For the same answers, the new wizard writes the same `.agents/skills-sync.json` as the current wizard.
- Cancelling at any prompt writes no configuration or skill files and exits the way the `skills` CLI does.
- Existing integration tests pass unchanged. New tests cover answer-to-configuration mapping, cancellation, and the unchanged noninteractive failure.
- `npm pack --dry-run` shows the expected production files, license attribution, and no test files, and `package.json` declares no new runtime `dependencies`.

## Decisions

The following choices were confirmed on 2026-09-24. Each follows the `skills` CLI.

- **Packaging:** declare `@clack/prompts` and `picocolors` as `devDependencies` and bundle them into `dist/`, as the `skills` CLI does. The published package gains no runtime dependencies. The build moves from plain `tsc` to a bundler step, and `tsc` stays in use for type checking and tests. The specification chooses the bundler (`skills` uses `obuild`) and confirms that `npm pack --dry-run` still contains only production files.
- **Agent list:** copy the `skills` agent registry (keys, display names, skills directories, and universal `.agents/skills` agents) from the upstream source that matches the pinned `skills@1.7.0`. Offer agents through the searchable multi-select, with universal agents in a locked section and the saved selection preselected. Upgrading `skills` must include refreshing the copied registry. The specification defines how drift is detected.
- **Cancellation:** in a TTY, cancelling a prompt or declining a confirmation prints a cancellation message, writes nothing, and exits with status `0`. Without a TTY, a run that would need a prompt exits with status `1` and prints an actionable message that names the flags or configuration needed.

## Assumptions

- Tests inject a prompt interface with fake answers instead of driving a pseudo-terminal, which keeps tests self-contained. The rendering of the copied `searchMultiselect` is covered through its state and keypress handling, not through terminal snapshots.

## Handoff

Review this intent. Once it is approved, create `sdlc/clack-prompts/spec.md` with `sdlc-create-spec` before copying code or changing dependencies.

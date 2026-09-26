# Specification: Adopt the skills CLI Prompt Implementation

## Context

The approved intent is `sdlc/clack-prompts/intent.md`.

Today, `src/cli.ts` asks every interactive question through one `prompt()` helper built on `node:readline/promises`. The helper:

- throws `Interactive input required: <question>` when stdin is not a TTY;
- otherwise reads a trimmed line and falls back to a default value.

It serves the `init`/`configure` wizard and the `Apply the listed changes? (yes/no)` confirmation in `execute()`. The wizard:

1. prompts for the repository, source branch, source path, and project path;
2. checks out the source and discovers skills;
3. reads the skills as a comma-separated list or `*`, then direction, agents, publication mode, and, for `branch` and `pull-request` modes, the publication branch;
4. prints the configuration as JSON and asks `Save this configuration? (yes/no)`;
5. writes `.agents/skills-sync.json` and runs `execute()`.

Only the literal answer `yes` confirms. Errors go to stderr and set the exit status to `1`. The wizard has no automated tests.

The reference implementation is the `skills` CLI (`vercel-labs/skills`, MIT license) at tag `v1.7.0` (commit `5b1b4fe90fa9b5809d6db1e0ce97f5d2e3715fdc`). This is the version pinned in `dependencies`. The relevant upstream files are:

- `src/prompts/search-multiselect.ts`: the searchable multi-select;
- `src/agents.ts`: the agent registry and the universal-agent helpers;
- the prompt usage in `src/add.ts`: `intro`, `note`, `select`, `confirm`, `spinner`, `cancel`, and `log` from `@clack/prompts`, and colors from `picocolors`.

The `skills` CLI bundles `@clack/prompts` and `picocolors` into its published output with `obuild`.

## Goals

- Replace free-text answers with a text input, select, searchable multi-select, and confirm prompt that look and behave like `npx skills add`.
- Keep the saved configuration, the safety confirmations, and all noninteractive behavior the same.
- Ship without new runtime `dependencies`.
- Make the interactive flow testable without a terminal.

## Non-Goals

- Changes to the configuration format, `validateConfig`, synchronization, baselines, pending publication, conflict handling, publication modes, or agent installation through `skills add`.
- Prompts for adoption, deletion, publication, or override. The `--adopt-*`, `--delete=`, `--publish`, `--override-*`, and `--yes` flags stay as the only way to choose these.
- Copying `skills` features other than prompts, such as agent detection, global installation, lock files, telemetry, or the remembered-agents file.
- Changing non-prompt output: the change summary, diffs, and status messages.
- Upgrading `skills` or changing its version range.

## Functional Requirements

### Prompt library and copied code

- **FR-1:** Interactive prompts MUST use `@clack/prompts`. Colors MUST use `picocolors`. The CLI MUST NOT keep the free-text `prompt()` helper for any question in scope.
- **FR-2:** The searchable multi-select MUST be a copy of `src/prompts/search-multiselect.ts` from `skills` at the reference commit. Changes MUST be limited to what the TypeScript settings, import paths, and the terminal-restoration rules under Error and Failure Behavior require. The following behavior MUST be preserved:
  - type-to-filter by label or value;
  - Space to toggle an item and Enter to submit;
  - initial selection;
  - the required-selection check;
  - select-all;
  - `maxVisible` scrolling;
  - the locked section;
  - the selected-items summary;
  - cancellation on Escape and Ctrl+C, which returns the cancel symbol.
- **FR-3:** The agent registry MUST be a copy of the static fields of every entry in `src/agents.ts` at the reference commit: the agent key, `displayName`, `skillsDir`, `showInUniversalList`, and `showInUniversalPrompt`. The universal-agent helpers MUST also be copied: `getUniversalAgents`, `getVisibleUniversalAgents`, and `getNonUniversalAgents`. Detection functions, global-directory functions, and the `xdg-basedir` dependency MUST NOT be copied.
- **FR-4:** Each copied file MUST start with a header that gives the upstream repository, path, tag, and commit, and says the file is modified from the original. The Vercel MIT copyright and permission notice MUST be included in the published package.

### Wizard (`init` and `configure`)

- **FR-5:** The wizard MUST start with `intro("skills-sync")`. It MUST end with `outro` after it saves the configuration and the initial run of `execute()` finishes.
- **FR-6:** The following answers MUST use clack `text` prompts:
  - **repository:** `Skills Git URL or local checkout`;
  - **source branch:** `Source branch`;
  - **source path:** `Source skills directory`;
  - **project path:** `Project skills directory`;
  - **publication branch:** `Publication branch`, asked only for `branch` and `pull-request` modes.

  Each prompt MUST offer the saved value as its default when reconfiguring. Otherwise it MUST offer the current default: `main`, `skills`, `.agents/skills`, or `skills-sync/update`. The repository has no default. A default MUST appear as a placeholder: pressing Enter accepts it, and typing replaces it. It MUST NOT be inserted as editable text that typed input appends to. (Corrected 2026-09-24: in `0.2.0` and `0.3.0`, typing `skills` at the branch prompt produced `mainskills`.) Each prompt MUST reject an empty answer inline and ask again. The repository prompt MUST also reject a value that is only whitespace. The source branch, source path, project path, and publication branch MUST each be checked inline with the same rule that `validateConfig` applies to that field. An invalid answer MUST show the validation message and ask again instead of exiting.
- **FR-7:** While the source is checked out and skills are discovered, a spinner MUST show `Loading skills…`. When it finishes, it MUST stop with a message that gives the number of skills found. If the checkout fails or finds no skills, the spinner MUST stop with an error indicator, and the wizard MUST fail with the existing error message and exit status `1`. It MUST NOT offer a retry.
> **Superseded 2026-09-24:** the FR-8 skill prompt was removed; see `sdlc/skillsignore/spec.md`.

- **FR-8:** Skill selection MUST use the copied searchable multi-select with:
  - the message `Select skills to sync`;
  - one item for each discovered skill, with the skill name as the label and value;
  - the `description` from the skill's `SKILL.md` frontmatter as the hint, cut to 57 characters plus `…` when it is longer than 60 characters, and no hint when the description is missing;
  - `maxVisible: 20`, `selectAll: true`, and `required: true`.

  When reconfiguring, the saved skills that are still discovered MUST be preselected. With no saved configuration, nothing is preselected. Saved skills that are no longer discovered MUST be listed in a `log.warn` before the prompt and left out of the selection.
- **FR-9:** Direction MUST use a clack `select` with these options:

  | Value | Label | Hint |
  | --- | --- | --- |
  | `bidirectional` | `Bidirectional (Recommended)` | Pull source changes and publish project edits |
  | `pull` | `Pull only` | Update the project from the source; never write the source |
  | `push` | `Push only` | Publish project edits; never update the project from the source |

  The initial value MUST be the saved direction, or `bidirectional` when there is none.
- **FR-10:** Agent selection MUST be offered only when the project path is `.agents/skills`. It MUST use the copied searchable multi-select with:
  - the message `Which agents do you want to install to?`;
  - one item for each non-universal agent from `getNonUniversalAgents()`, except `eve`, with `displayName` as the label, the key as the value, and `skillsDir` as the hint;
  - a locked section titled `Universal (.agents/skills)` that lists `getVisibleUniversalAgents()` and a hidden count for the rest;
  - `required: false`.

  Only the chosen non-universal agent keys MUST be saved in `agents`. Universal agents are never saved because they already read `.agents/skills`. When reconfiguring, saved agents that are in the list MUST be preselected. A saved agent that is not in the list, including a universal one, MUST be named in a `log.warn` and left out. With no saved agents, nothing is preselected. When the project path is not `.agents/skills`, the wizard MUST skip this prompt, save `agents: []`, and show a `log.info` that says agent installation requires `.agents/skills`.
- **FR-11:** Publication mode MUST use a clack `select` with these options:

  | Value | Label | Hint |
  | --- | --- | --- |
  | `local-commit` | `Local commit (Recommended)` | Commit source edits in a local checkout; no push |
  | `branch` | `Branch` | Push source edits to a publication branch; needs push access |
  | `pull-request` | `Pull request` | Push a branch and open a PR; needs push access and an authenticated `gh` |
  | `main` | `Main` | Push source edits to the source branch; needs push access |
  | `override-main` | `Override main` | May replace conflicting source content; each run needs explicit override flags |

  The initial value MUST be the saved mode, or `local-commit` when there is none. The publication branch prompt MUST NOT accept the source branch, as `validateConfig` requires.
- **FR-12:** Before saving, the wizard MUST show a `note` titled `Configuration Summary` in place of the JSON output. It MUST include:
  - the source repository, branch, and path;
  - the project path;
  - the selected skills;
  - the direction;
  - the agents, or `none`;
  - the publication mode and, for `branch` and `pull-request` modes, the publication branch.

  The configuration MUST still be checked with `validateConfig` before the note is shown.
- **FR-13:** The wizard MUST then ask `Save this configuration?` with clack `confirm` and `initialValue: false`. Only an explicit yes MUST save. A no or a cancellation MUST be handled as described in FR-17.
- **FR-14:** For the same answers, the saved `.agents/skills-sync.json` MUST be byte-for-byte identical to the file the current wizard writes, including key order, two-space indentation, and a trailing newline.

### Apply confirmation

- **FR-15:** `Apply the listed changes?` MUST use clack `confirm` with `initialValue: false`. The confirmation MUST keep its position after the change summary, the diffs, and the checks for `--publish` and the override flags. `--yes` MUST still skip it. Only an explicit yes MUST apply the changes.

### Cancellation and noninteractive behavior

- **FR-16:** Every prompt result MUST be checked with `isCancel` or against the copied cancel symbol before it is used.
- **FR-17:** In a TTY, when a prompt is cancelled (Escape or Ctrl+C) or a `Save` or `Apply` confirmation is answered no, the CLI MUST:
  - call `cancel` with `Setup cancelled` in the wizard, or `Sync cancelled` at the apply confirmation;
  - write no configuration, state, project skill, source, or agent files;
  - clean up any temporary checkout;
  - exit with status `0`.

  If the wizard is cancelled after `.agents/skills-sync.json` was saved (at the apply confirmation of the initial run), the saved configuration MUST remain.
- **FR-18:** Without a TTY on stdin, the CLI MUST NOT render prompts, spinners, `intro`, or `note`, and MUST NOT wait for input:
  - The default command without a TTY MUST stay `status`.
  - An explicit `init` or `configure` MUST fail with exit status `1` and a stderr message saying that setup needs an interactive terminal and that noninteractive runs need a valid committed `.agents/skills-sync.json`.
  - An apply command without `--yes` that reaches the confirmation MUST fail with exit status `1` and a stderr message saying the changes were not applied and that `--yes` confirms a noninteractive run. The `--publish` and override conditions are unchanged.
  - No files MUST be written in either case.
- **FR-19:** Existing noninteractive behavior MUST stay the same, including every `--yes` run, `status`, `diff`, the error messages, and the exit statuses. Output that the current tests check MUST NOT change.

### Build and packaging

- **FR-20:** `@clack/prompts`, `picocolors`, and the bundler MUST be exact-pinned `devDependencies` recorded in `package-lock.json`. `dependencies` MUST still contain only `skills`.
- **FR-21:** `npm run build` MUST create `dist/cli.js` as a single ESM executable. It MUST keep the `#!/usr/bin/env node` shebang, and `@clack/prompts`, `@clack/core`, `picocolors`, and the copied modules MUST be bundled into it. `skills` MUST remain external and be resolved at runtime with `require.resolve('skills/bin/cli.mjs')`. Node.js built-ins MUST remain external. The bundler SHOULD be `obuild`, which the `skills` CLI uses. The plan MAY choose another maintained bundler if `obuild` cannot meet this contract. The plan MUST record the reason.
- **FR-22:** `bin` MUST remain `dist/cli.js`, with no leading `./`. `npm run build` MUST still delete `dist/` first. `npm test` MUST still build production output, then compile tests with `tsc` to `dist-test/` and run them with `node --test`. The integration tests MUST run against the bundled `dist/cli.js`. Type checking with `tsc` MUST cover production sources.
- **FR-23:** The packed package MUST contain:
  - `dist/cli.js`;
  - any chunks it needs;
  - `README.md`;
  - `LICENSE`, if the project has one;
  - a third-party notices file with the license texts for `skills` (for the copied code), `@clack/prompts`, `@clack/core`, `picocolors`, and any other bundled package.

  It MUST NOT contain tests, `dist-test/`, `sdlc/`, or source maps that point to missing sources. Type declaration files MAY be dropped because the package exports no library API.

## Interfaces and Contracts

| Situation | Contract |
| --- | --- |
| `skills-sync` in a TTY with no command | Runs the wizard (unchanged). |
| `skills-sync init` or `configure` in a TTY | Clack wizard (FR-5 to FR-14). Exits `0` on save and a successful initial run, or on cancellation. |
| `skills-sync init` without a TTY | Exits `1`, no files are written, and stderr names the need for a terminal or a committed configuration (FR-18). |
| `skills-sync sync` / `pull` / `push` in a TTY without `--yes` | Change preview, then a clack confirm that defaults to no (FR-15). |
| The same without a TTY or `--yes` | Exits `1`, no writes, and stderr names `--yes` (FR-18). |
| Any command with `--yes` | No prompt. Behavior and output are unchanged (FR-19). |
| Saved `agents` | Only registry keys that the pinned `skills add --agent` accepts, and never universal agents (FR-10). |

**Prompt testability:** the wizard and the apply confirmation MUST get their prompts through an injectable interface covering `text`, `select`, `searchMultiselect`, `confirm`, `spinner`, `note`, `log`, `intro`, `outro`, and `cancel`, backed by clack in production. Tests MUST be able to supply scripted answers, including cancellation, and inspect the prompt options they receive, without a TTY.

**Agent registry drift contract:** an automated test MUST run the pinned `skills` CLI offline in a temporary Git repository, using a local fixture source and an invalid `--agent` value. It MUST parse the `Valid agents:` list from the output and check that the set matches the keys in the copied registry. A mismatch MUST fail the test and name the missing and extra keys.

## Error and Failure Behavior

- Validation errors in text prompts ask again inline (FR-6). Validation errors that are not tied to one prompt, such as those from `validateConfig`, keep their existing messages and exit status `1`.
- A checkout or discovery failure stops the spinner with an error indicator and exits `1` with the existing message (FR-7). It creates no configuration.
- A cancellation or a declined confirmation in a TTY exits `0` with a cancellation message and no writes (FR-17). It is not reported on stderr.
- If the terminal closes or stdin ends during a prompt, the CLI MUST handle it as a cancellation. It MUST NOT hang or leave the terminal in raw mode.
- The copied multi-select MUST restore the terminal state (raw mode, cursor, keypress listeners) on submit, on cancel, and when the process exits during the prompt.
- Messages MUST NOT print tokens or credentials. A repository URL that contains credentials MUST be shown in the summary note with the user-info part replaced by `***`.

## Nonfunctional Requirements

- **Compatibility:** Node.js `>=22.20.0` on Linux, macOS, and Windows terminals. Prompts MUST fall back to plain rendering where the terminal does not support Unicode glyphs, as clack does.
- **Dependencies:** no new runtime dependencies. Devtime additions are limited to `@clack/prompts`, `picocolors`, and one bundler, and are listed with the reason for each in the plan.
- **Size:** the plan MUST record the packed size before and after the change. An increase over 100 kB in the packed tarball MUST be justified.
- **Security:** the existing path validation, symlink protection, and confirmation flow are unchanged. The copied registry supplies labels and values only. Its paths are never used to read or write files.
- **Tests:** self-contained. No TTY, network, GitHub credentials, or `sync-skills-test/` are needed.
- **Maintainability:** upgrading `skills` MUST include re-copying the registry, and the drift test enforces this.

## Acceptance Criteria

1. With scripted answers, the wizard saves a `.agents/skills-sync.json` identical to the one the current wizard saves for the same values. This is shown for:
   - `bidirectional` + `local-commit`;
   - `pull` + `pull-request`, with a publication branch;
   - `push` + `main`, with agents.
2. The skill prompt receives every discovered skill with its truncated description hint, `selectAll`, `required: true`, and `maxVisible: 20`. When reconfiguring, saved skills are preselected, and a saved skill that is missing from the source produces a warning.
3. The direction and mode prompts receive exactly the options and hints in FR-9 and FR-11, with the saved value or the recommended default as the initial value.
4. The agent prompt is offered only for `.agents/skills`. It lists the non-universal agents except `eve`, with universal agents in a locked section. Only chosen non-universal keys are saved.
5. Invalid text answers ask again with the `validateConfig` message instead of exiting. A publication branch equal to the source branch is rejected.
6. Cancelling at each prompt, or answering no to `Save`, writes no files and exits `0` with a cancellation message. Answering no to `Apply` changes no project, source, state, or agent files.
7. `init` without a TTY exits `1` with the FR-18 message and writes nothing. `sync` without a TTY or `--yes` exits `1` with the FR-18 message and writes nothing.
8. All existing unit and integration tests pass unchanged against the bundled `dist/cli.js`.
9. The drift test passes against `skills@1.7.0` and fails when a key is added to or removed from the copied registry.
10. `npm pack --dry-run` lists only the files allowed by FR-23. `package.json` `dependencies` contains only `skills`. The notices file contains the required licenses. The packed-size change is recorded.
11. The README describes the new wizard, including selection keys, cancellation, and the noninteractive `init` failure. It still describes the CLI as under validation.
12. A manual check in a real terminal, recorded as evidence and not automated, covers the full `init` flow, filtering and select-all in the skill prompt, cancellation with Escape, and cancellation with Ctrl+C. After each, the terminal is left in a usable state.

## Assumptions and Open Questions

- **Assumption:** A declined `Save` or `Apply` confirmation counts as a cancellation (exit `0` with a message), as in `skills`. Today a declined `Apply` returns silently with exit `0`. The only change is the added message.
- **Assumption:** Skipping the agent prompt when the project path is not `.agents/skills` replaces the current error with an informational message. The rule that agents need `.agents/skills` is unchanged.
- **Assumption:** No remembered-agents file is added. The saved configuration is the only source for preselection.
- **Assumption:** Inline validation for text prompts (FR-6) goes beyond today's fail-at-end behavior. It follows the intent's success criterion that invalid choices cannot be submitted. The validation rules themselves are unchanged.
- **Assumption:** This change requires a `version` bump in `package.json` and `package-lock.json` to publish. The bump size is a release decision.

## Handoff

Review and approve this specification. Then create `sdlc/clack-prompts/plan.md` with `sdlc-create-plan`.

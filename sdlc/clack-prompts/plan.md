# Implementation Plan: Adopt the skills CLI Prompt Implementation

## Approach

Build the change in four layers. Each layer can be tested before the next depends on it.

1. **Build first.** Replace `tsc` output with a bundled `dist/cli.js` before any prompt code lands. Every later task then runs the existing integration suite against the bundle.
2. **Copied upstream code.** Copy the searchable multi-select and the static agent registry into `src/vendor/skills/`, each with a provenance header. Keeping them in one folder makes the attribution and the refresh step for a future `skills` upgrade obvious.
3. **A prompt interface.** A small `Prompts` interface covers the clack calls and `searchMultiselect`. A clack-backed implementation serves production, and tests supply scripted answers. This meets the testability contract without a pseudo-terminal.
4. **The wizard as a module.** Move the wizard out of `src/cli.ts` into `src/wizard.ts`. `src/cli.ts` runs on import (it reads `process.argv` and dispatches at the top level), so the wizard cannot be unit-tested there. `runWizard(prompts, deps)` returns either a `Config` or a cancellation. `cli.ts` keeps the file writes, the initial `execute()`, TTY checks, and exit handling. The apply confirmation stays in `execute()` and uses the same interface.

Versions follow the reference build: `skills@1.7.0` bundles `@clack/prompts@1.7.0` (which pins `@clack/core@1.4.3`) and `picocolors@1.1.1`. The bundler is `obuild`, as the spec prefers. Task 1 checks it against FR-21, and falls back to `rolldown` (the engine `obuild` wraps) if it cannot meet the contract.

Skill descriptions for hints (FR-8) come from a minimal frontmatter reader built on Node.js built-ins. It reads a single-line `description:` from `SKILL.md` and gives no hint otherwise. This avoids bundling a YAML parser to produce a display-only hint. It reads only regular files found by `discover()` (checked with `lstat`), so the symlink protections are unchanged.

## Affected Components

- `package.json` and `package-lock.json`: `devDependencies`, the `build` script, the version bump, and `files` for the notices file.
- New bundler configuration file (for example `build.config.ts`), plus `tsconfig.json` (type checking only) and `tsconfig.test.json` (test compilation unchanged).
- `src/vendor/skills/search-multiselect.ts` and `src/vendor/skills/agents.ts`: copied code, with the MIT header and a changes note.
- `src/prompts.ts`: the `Prompts` interface, the clack implementation, and the cancel helpers.
- `src/wizard.ts`: the wizard flow, inline validators, summary text, and credential masking.
- `src/cli.ts`: removes the readline `prompt()`, wires the wizard, the apply confirmation, and the non-TTY messages.
- `src/sync.ts`: an exported helper that reads a skill's description (discovery itself is unchanged).
- `THIRD-PARTY-NOTICES.md` (new, packaged).
- `README.md`: the wizard section.
- New tests: `src/wizard.test.ts`, `src/prompts.test.ts`, `src/agents-drift.integration.test.ts`, and additions to `src/cli.integration.test.ts`.

## Implementation Tasks

### Task 1 — Bundled build with no behavior change
Status: completed

- [x] Add exact-pinned `devDependencies`: `obuild@0.4.40`, `@clack/prompts@1.7.0`, and `picocolors@1.1.1`. Run `npm install` so `package-lock.json` records them. `dependencies` stays `{ "skills": "1.7.0" }`.
- [x] Configure `obuild` so it:
  - uses `src/cli.ts` as the only entry;
  - writes ESM to `dist/cli.js`, not `.mjs`;
  - keeps the shebang;
  - keeps `skills` and `node:*` external;
  - emits no `.d.ts` files and no source maps that point to missing sources.
- [x] Change `build` to delete `dist/`, run `tsc -p tsconfig.json --noEmit`, and then run the bundler. Set `noEmit`, or the equivalent, only in the build script, so that `tsconfig.test.json` still emits to `dist-test/`.
- [x] If `obuild` cannot produce `dist/cli.js` with these properties, switch to `rolldown` with an explicit configuration, and record the reason under Risks.
- [x] Record the packed size and file list (baseline before `LICENSE` was added: 12,069 bytes packed, 46,071 bytes unpacked, `README.md`, `package.json`, and `dist/{cli,config,git,sync}.{js,d.ts}`; re-measure with `LICENSE` included and use that as the comparison point).

Validation:
- `npm test` passes with no test changes, and the integration tests run against the bundled `dist/cli.js`.
- `head -1 dist/cli.js` is the shebang. The bundle contains `require.resolve('skills/bin/cli.mjs')` unchanged and does not inline `skills`.
- `npm pack --dry-run` lists only `LICENSE`, `README.md`, `package.json`, and `dist/cli.js`, plus any chunks the bundle needs.
- Completed 2026-09-24: `obuild@0.4.40` met FR-21 with `build.config.mjs` (`dts: false`, `[name].js` entry and chunk names). No `rolldown` fallback was needed. Bundled libraries are emitted as relative `dist/_chunks/*.js` files, which FR-23 allows. `skills` stays external through `require.resolve`. All 20 existing tests passed unchanged against the bundle. The packed size with `LICENSE` and the bundle, before clack was imported, was 23,219 bytes.

### Task 2 — Copy the upstream prompt and registry code
Status: completed
Depends on: Task 1

- [x] Copy `src/prompts/search-multiselect.ts` from `vercel-labs/skills` at `v1.7.0` (`5b1b4fe90fa9b5809d6db1e0ce97f5d2e3715fdc`) to `src/vendor/skills/search-multiselect.ts`. Change it only for the TypeScript settings and import paths, and to guarantee that raw mode, the cursor, and keypress listeners are restored on submit, cancel, stdin end, and process exit.
- [x] Copy the `agents` entries from `src/agents.ts` at the same commit to `src/vendor/skills/agents.ts`. Keep only `displayName`, `skillsDir`, `showInUniversalList`, and `showInUniversalPrompt`, together with `getUniversalAgents`, `getVisibleUniversalAgents`, and `getNonUniversalAgents`. Define the minimal `AgentType` and `AgentConfig` types locally. Drop the detection code, global directories, `xdg-basedir`, and the `os`/`fs` imports.
- [x] Give each file a header with the upstream repository, path, tag, and commit, the Vercel MIT notice, and a short list of the changes.
- [x] Add `THIRD-PARTY-NOTICES.md` with the license texts for:
  - `skills` (for the copied code);
  - `@clack/prompts` and `@clack/core`;
  - `picocolors`;
  - every transitive package that ends up in the bundle (expected: `sisteransi`, `fast-wrap-ansi`, `fast-string-width`, and their dependencies).

  Add the notices file to `files` in `package.json`.
- [x] Add `src/agents-drift.integration.test.ts`. It creates a temporary Git repository and a local fixture skill, then runs the pinned `skills/bin/cli.mjs add <fixture> --agent __invalid__ -y` with `DISABLE_TELEMETRY=1` and `DO_NOT_TRACK=1`. It strips ANSI codes, parses `Valid agents:`, and compares the result with the copied registry keys, naming any missing or extra keys.
- [x] Add unit tests for the copied pure helpers (`buildSearchEntries`, `toggleSearchEntry`, `getSelectAllState`, `toggleAllItems`) and for the universal and non-universal split.

Validation:
- The drift test passes against `skills@1.7.0`. Removing or adding one registry key locally makes it fail with that key named.
- The unit tests pass. A search of the vendor files shows no `xdg-basedir`, `homedir`, `existsSync`, or detection functions.
- Completed 2026-09-24: 79 agents copied, matching the pinned CLI's `Valid agents:` list. The drift test passes, and it failed with `missing: ['zed']` when `zed` was removed. Deviation: `search-multiselect.ts` needed no terminal-restoration changes, because upstream already restores raw mode and listeners on submit and cancel, and cancels on stdin close or end. Only the `node:` import prefixes changed. Deviation: `obuild` generates `dist/THIRD-PARTY-LICENSES.md` for every bundled package, including transitive ones (`sisteransi`, `fast-wrap-ansi`, `fast-string-width`, `fast-string-truncated-width`). The root `THIRD-PARTY-NOTICES.md` therefore covers only the copied `skills` code and points to that file.

### Task 3 — Prompt interface and clack implementation
Status: completed
Depends on: Task 2

- [x] Define `Prompts` in `src/prompts.ts` with `intro`, `outro`, `text`, `select`, `searchMultiselect`, `confirm`, `spinner`, `note`, `log` (`info`, `warn`, `error`), and `cancel`. Every value-returning method returns the value or a shared cancel marker.
- [x] Implement `clackPrompts` by delegating to `@clack/prompts` and the copied `searchMultiselect`. Map clack's `isCancel` and the copied `cancelSymbol` to the shared marker.
- [x] Add a scripted test implementation for tests, either exported from a test helper or colocated in the test file. It replays answers, records the options each call receives, and can return the cancel marker at any step.

Validation:
- Unit tests show that both cancel sources map to the shared marker, and that the scripted implementation records the options of every call.
- Completed 2026-09-24: `src/prompts.test.ts` gets a real clack cancel symbol from an aborted `confirm` and checks that it and the copied `cancelSymbol` both map to `CANCEL`. The scripted implementation lives in `src/wizard.test.ts`.

### Task 4 — Wizard module
Status: completed
Depends on: Task 3

- [x] Add a `readSkillDescription` helper to `src/sync.ts`. It reads a single-line `description:` from the frontmatter of a regular-file `SKILL.md`, returns `undefined` otherwise, and never follows symlinks. Add unit tests for it.
- [x] Create `src/wizard.ts` with `runWizard(prompts, { old, discoverSkills })`, where `discoverSkills` wraps `checkout`, `discover`, and cleanup. The wizard:
  - shows the text prompts (FR-6), with inline validators that reuse `validateConfig`'s rules for the branch, path, and publication-branch fields and reject a publication branch equal to the source branch;
  - runs the `Loading skills…` spinner, stops it with the skill count, or stops it with an error indicator and throws the existing error (FR-7);
  - shows the skill multi-select with the truncated hints, preselected saved skills, and a warning for missing ones (FR-8);
  - shows the direction select with the exact labels, hints, and initial value (FR-9);
  - shows the agent multi-select only for `.agents/skills`, with the locked universal section, `eve` excluded, and warnings for unknown saved agents, or skips it with `log.info` (FR-10);
  - shows the mode select and, for `branch` and `pull-request` modes, the publication-branch prompt (FR-11);
  - builds the configuration object in today's key order, runs `validateConfig`, shows the `Configuration Summary` note with credentials in the URL masked (FR-12), and asks the `Save this configuration?` confirmation with `initialValue: false` (FR-13);
  - returns `{ config }` or `{ cancelled: true }`.
- [x] Refactor any validator that `validateConfig` and the wizard both need into small exported functions in `src/config.ts`, with no change to `validateConfig`'s messages or results.
- [x] Add `src/wizard.test.ts` with scripted answers, covering acceptance criteria 1–6:
  - exact `JSON.stringify(config, null, 2) + '\n'` output for the three spec combinations, checked against literal expected strings;
  - reconfiguration preselection and the missing-skill warning;
  - the exact options for the direction and mode prompts;
  - agent-prompt gating, the locked section, `eve` excluded, and only non-universal keys saved;
  - inline re-asks for invalid answers;
  - cancellation at every prompt, and a declined save, return `cancelled` without calling any writer;
  - URL credential masking in the note.

Validation:
- `npm test` passes. The wizard tests do not need a TTY, network, or credentials. The skill checkout in tests uses the existing disposable local Git fixtures or an injected `discoverSkills`.
- Completed 2026-09-24: `src/wizard.test.ts` has 10 tests covering acceptance criteria 1–6. `readSkillDescription` has its own unit test (plain, quoted, folded, missing frontmatter, and symlink cases). The `validateConfig` messages are unchanged, and the existing config tests pass.

### Task 5 — CLI wiring, apply confirmation, and non-TTY behavior
Status: completed
Depends on: Task 4

- [x] In `src/cli.ts`, remove the readline `prompt()` helper and the `readline/promises` import.
- [x] Change `init` and `configure` so that:
  - without a TTY, they fail with the FR-18 setup message and exit status `1` before any prompt, checkout, or write;
  - with a TTY, they call `intro`, then `runWizard(clackPrompts, …)`. On cancellation they call `cancel('Setup cancelled')` and exit `0` with no writes. On `{ config }` they write `.agents/skills-sync.json` exactly as today, run `execute()`, and then call `outro`.
- [x] In `execute()`, replace the apply prompt:
  - with `--yes`, no prompt runs (unchanged);
  - without a TTY, it fails with the FR-18 apply message naming `--yes` and exits `1`;
  - with a TTY, it asks `confirm` with `initialValue: false`. A no or a cancellation calls `cancel('Sync cancelled')` and returns with exit `0` before `ensureFresh` or any write.

  The confirmation stays after the diffs and the `--publish` and override checks.
- [x] Make sure every cancellation path runs the existing temporary-checkout cleanup in `finally`.
- [x] Extend `src/cli.integration.test.ts`:
  - `init` without a TTY exits `1` with the setup message, and no `.agents/skills-sync.json` is created;
  - `sync` with applicable changes, without `--yes` and without a TTY, exits `1` with the apply message, and the project, source, and state files are unchanged;
  - all existing assertions still pass with no edits.

Validation:
- `npm test` passes. A `grep` of `src/cli.ts` finds no `createInterface` or `rl.question`.
- Acceptance criteria 6–8 are covered by the unit and integration tests.
- Completed 2026-09-24: both non-TTY integration tests failed first, then passed. `src/cli.ts` no longer uses `readline`. Addition: clack's spinner calls `process.exit(0)` on Ctrl+C, skipping `finally`, so the wizard's `discoverSkills` registers a synchronous `exit` handler that removes the temporary checkout.

### Task 6 — Documentation, packaging, and version
Status: completed
Depends on: Task 5

- [x] Update the wizard section of `README.md`. Describe:
  - the prompt types, and the keys for filtering, Space, Enter, and select-all;
  - that agents need `.agents/skills`, and that universal agents are always included;
  - cancellation with Escape and Ctrl+C (exit `0`, nothing written);
  - that `init` needs a terminal, and noninteractive runs need a committed configuration.

  Keep the under-validation wording.
- [x] Bump `version` in `package.json` and `package-lock.json` to `0.2.0`, which the release owner confirmed on 2026-09-24.
- [x] Run `npm pack --dry-run --json`. Confirm that it lists only `LICENSE`, `README.md`, `package.json`, `THIRD-PARTY-NOTICES.md`, and `dist/` production files, that `dependencies` contains only `skills`, and that no test files are included. Record the packed size against the Task 1 baseline and justify any increase over 100 kB.

Validation:
- Acceptance criteria 10 and 11 are met, and the size delta is recorded in this plan's handover.
- Completed 2026-09-24: version `0.2.0`. `npm pack --dry-run` lists `LICENSE`, `README.md`, `THIRD-PARTY-NOTICES.md`, `package.json`, `dist/cli.js`, `dist/THIRD-PARTY-LICENSES.md`, and the `dist/_chunks/` files. `dependencies` contains only `skills`. Packed size is 45,967 bytes (158,169 unpacked), up about 22.7 kB from the 23,219-byte bundle baseline, which is under the 100 kB threshold.

### Task 7 — Manual terminal validation
Status: in-progress
Depends on: Task 6

- [ ] Run the steps below in a real terminal against a disposable consumer project and a local source repository, not `sync-skills-test/` unless the maintainer chooses it.
  1. Run a full `init`: filter skills, select all, clear the selection, choose agents, choose `pull-request` mode, review the summary, and save.
  2. Confirm the initial sync's apply prompt defaults to no.
  3. Rerun `configure` and check the prefilled values.
  4. Cancel with Escape at the skill prompt.
  5. Cancel with Ctrl+C at a text prompt.
- [ ] After each step, check the exit status, that no files were written on cancel, and that the terminal still echoes input and shows the cursor.
- [ ] Repeat the cancellation check on a Windows terminal if one is available, or record it as not verified.

Validation:
- Acceptance criterion 12 is recorded as evidence, including the environment, Node.js version, and observations, in the handover.

## Risks and Dependencies

- **`obuild` fit:** it is pre-1.0 and defaults to `.mjs` output and declaration generation. Task 1 checks it first. Falling back to `rolldown` is a plan change, not a spec change.
- **Terminal state in the copied prompt:** the upstream `searchMultiselect` manages raw mode itself. Any restoration fixes (Task 2) are the main difference from upstream, and they must be listed in the header.
- **Registry drift:** the drift test depends on the text `Valid agents:` in the pinned CLI. A future `skills` upgrade may change that text. The test must then be updated together with the registry refresh.
- **Frontmatter reading:** multi-line or quoted YAML descriptions give no hint or a raw hint. This is acceptable because the hint is for display only. A full YAML parser would add bundle weight.
- **Project license:** the project is licensed under GPL-3.0-or-later (`LICENSE` and the `license` field were added on 2026-09-24), so FR-23 requires `LICENSE` in the package. The copied MIT code and the bundled MIT/ISC packages are compatible with GPLv3, as long as their notices are kept in `THIRD-PARTY-NOTICES.md` and in the vendor file headers.
- **Unrelated working-tree files:** the deleted `.agents/`, `.devcontainer/`, and `AGENTS.md` were restored on 2026-09-24. Untracked stray files remain (`=22.20.0`, `*.orig`, `temp/`). Commits for this work must stage only the files in scope.

## Final Validation

- `npm ci && npm test` passes: all existing tests unchanged, plus the new wizard, prompt, vendor-helper, and drift tests.
- `npm run build` produces the bundled `dist/cli.js`, and `npm pack --dry-run` matches FR-23.
- Every acceptance criterion in `spec.md` (1–12) is mapped to a passing test or recorded manual evidence.
- Hand off to `sdlc-validate-implementation` with this work item.

## Handover

Current: Task 7 — Manual terminal validation (in progress)
Next: A person runs the Task 7 steps in a real terminal, including Windows if available, and records the results. Then hand off to `sdlc-validate-implementation`.
Blockers: None
Remaining validation: a visual check in a real terminal, and a check that the terminal state is restored after Escape and Ctrl+C. Residual risk: if Ctrl+C is pressed during the spinner while `git clone` is still running, the exit handler removes the checkout directory, but raw mode does not send SIGINT to the clone, so it may keep running and recreate the directory in the OS temp folder.
Worktree: `/workspaces/skills/skills-sync-clack-prompts`, branch `feature/clack-prompts`, not committed.

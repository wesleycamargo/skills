# Skills Sync (development branch)

This repository contains an early implementation of `@wesleycamargo/skills-sync` alongside the existing `skills/write-for-me` skill. The CLI is not yet ready for general use or for important repositories until release validation completes. See `sdlc/skills-sync/spec.md` and `plan.md` for the v1 contract.

Requires Node.js 22.20.0 or later, matching the pinned upstream `skills` CLI dependency.

## Requirements

- Node.js 22.20.0 or later
- npm, Git, and read access to the configured source repository
- Write access only for publication modes that write the source
- An authenticated `gh` CLI for `pull-request` mode with a GitHub source

The CLI stores no credentials. Git and `gh` use your existing local authentication.

## Install

The package is published publicly to npmjs as `@wesleycamargo/skills-sync`. It remains under validation and is not yet ready for important repositories.

From a project's root directory:

```sh
npm install --save-dev @wesleycamargo/skills-sync
npx --no-install skills-sync init
```

For a one-off command without adding the package to the project:

```sh
npx --package=@wesleycamargo/skills-sync skills-sync init
```

Do not run unscoped `npx skills-sync` before installing the package: npmjs resolves package names, not executable names.

### GitHub Packages installation

GitHub Packages remains available for existing consumers at `npm.pkg.github.com`. It requires a classic personal access token with the `read:packages` scope and an `@wesleycamargo` registry mapping.

From your project's root directory, run the setup script from a copy of this repository:

```sh
/path/to/skills-sync/scripts/setup-skills-sync.sh
```

It installs from npmjs without changing `.npmrc` or asking for a token. Use `--global` to install globally, `--version <version>` to pick a version, and `--no-init` to skip the wizard.

To install from GitHub Packages by hand instead, log in once, point the scope at GitHub Packages, and install:

```sh
npm login --scope=@wesleycamargo --auth-type=legacy --registry=https://npm.pkg.github.com
echo "@wesleycamargo:registry=https://npm.pkg.github.com" >> .npmrc
npm install --save-dev @wesleycamargo/skills-sync
npx --no-install skills-sync init
```

### Install from a built package

For local validation, build a tarball and install it into a disposable project:

```sh
npm ci
npm test
npm run build
npm pack

cd /path/to/project
npm install --save-dev /path/to/wesleycamargo-skills-sync-0.2.0.tgz
npx --no-install skills-sync init
```

The interactive wizard uses the same prompts as `npx skills add`. It asks for:

- the source repository, source branch, and source and project skill directories, as text inputs that are checked as you type;
- the skills to sync, in a searchable list: type to filter, use Space to select, and use **Select All** to choose every skill;
- the direction and publication mode, from lists that explain each option;
- the agents to install to, when the project skills directory is `.agents/skills`. Agents that read `.agents/skills` directly are always included and are not saved.

The wizard shows a configuration summary and asks before saving `.agents/skills-sync.json`. Re-running `init` or `configure` prefills existing choices. Press Escape or Ctrl+C at any prompt to cancel: nothing is written, and the command exits with status `0`.

Setup needs an interactive terminal. For noninteractive use, commit or otherwise provide a valid `.agents/skills-sync.json` first. `init` without a terminal, or a missing or invalid configuration, fails with a concise next action instead of prompting.

## Publishing

The release script prevents automatic retries of uncertain npmjs versions:

```sh
NPM_OTP=<current-six-digit-code> bash scripts/publish-npm.sh
```

Use the local OTP path only to bootstrap the first public version. Later npmjs releases use the manual npm workflow dispatch with npm trusted publishing and provenance. Configure the npm trusted publisher for this repository and workflow before using that path. The script skips an existing public version and stops on staged, 2FA, conflict, or uncertain registry results; resolve those npm states before another attempt.

## Commands

Run these from the configured project directory:

```sh
npx skills-sync status
npx skills-sync diff
npx skills-sync pull --yes
npx skills-sync push --yes --publish
npx skills-sync sync --yes
npx skills-sync sync --yes --publish
```

`status` summarizes planned changes and `diff` shows content differences without writes. `pull`, `push`, and `sync` show their change preview before applying it; `--yes` supplies the explicit noninteractive confirmation. `--publish` is separately required before a project-side change may write the source. The configured `pull` and `push` directions prevent reverse writes.

Synchronization always uses the configured project copy under `.agents/skills` (or the configured target path). Optional agent copies are installed only after synchronization safety checks succeed; an edited agent copy is never overwritten silently.

## Publication modes

| Mode | Destination and requirements |
| --- | --- |
| `local-commit` | Creates a normal commit in a local source checkout on the configured branch; never pushes. |
| `branch` | Pushes selected skill changes to the configured non-source branch. |
| `pull-request` | Pushes a configured branch and creates or updates one GitHub pull request. Requires `gh auth status` to succeed. |
| `main` | Pushes a normal commit directly to the configured source branch. GitHub branch rules and write permission still apply. |
| `override-main` | Replaces conflicting content only inside selected skills through a normal commit. It never force-pushes or rewrites history. |

For `override-main`, review the replacement preview and supply all confirmations on every noninteractive run:

```sh
npx skills-sync sync --yes --publish --override-main \
  --override-target=<source-repository>@<source-branch>
```

## Conflicts, deletions, and recovery

The CLI records a portable per-skill baseline in `.agents/skills-sync-state.json`. It carries one-sided edits, attempts compatible text merges, and leaves overlapping or binary changes for manual resolution. It does not silently adopt an existing project skill; choose an explicit side instead:

```sh
npx skills-sync sync --yes --adopt-source=<skill>
npx skills-sync sync --yes --adopt-project=<skill>
```

Deletions are proposals, not automatic actions. Review the preview, then confirm each selected file explicitly:

```sh
npx skills-sync sync --yes --publish --delete=<skill>/<file>
```

Branch and pull-request publication can remain pending until the source branch accepts the change. Do not delete the state file to bypass this condition: after the branch or PR is merged, run `sync --yes` to reconcile the pending publication. If the source advances while the CLI is preparing publication, it stops without publishing stale content; review `status` or `diff` and retry from the refreshed comparison.

## Scope and validation status

GitHub Actions workflow generation and automation are outside v1. This repository is still under validation: do not use this CLI to synchronize important repositories or describe it as generally available until the remaining release checks complete.

**Work still required before v1 release:** complete the protected-branch or limited-permission check and Windows validation, then perform final independent review. The current three-way merge handles compatible UTF-8 text and refuses binary or overlapping edits.

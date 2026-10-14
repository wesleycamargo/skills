---
name: tune-agent-efficiency
description: Configure or refresh a coding agent's model defaults and automatic task routing to cut token usage and cost. Works with Codex and Claude Code, with a generic path for other agents. Use when asked to reduce agent cost, optimize or tune model defaults, refresh models, or set up cheaper delegation.
---

# Tune agent efficiency

Configure the user's local coding agent with economical model defaults and
persistent routing rules. Apply changes when asked to configure or optimize; an
audit or preview request is read-only. Each run re-checks current guidance. Out
of scope: schedulers, running model calls as benchmarks, upgrading the agent,
and changing authentication.

## 1. Identify the agent

Configure the agent the user is running or names. Do not configure several
agents unless asked.

| Agent | Detect | Reference |
| --- | --- | --- |
| Codex | `codex` CLI, `CODEX_HOME` or `~/.codex` | [references/codex.md](references/codex.md) |
| Claude Code | `claude` CLI, `~/.claude` | [references/claude-code.md](references/claude-code.md) |
| Other | anything else | [references/other-agents.md](references/other-agents.md) |

Read the matching reference now. It lists the agent's config file, instruction
file, documentation pages, and validation commands.

## 2. Check current guidance and local support

Fetch the vendor's current official documentation listed in the reference; use
an official docs search tool if available, otherwise browse official domains.
Follow moved pages to their replacements. Then inspect, read-only:

- installed version and help output;
- the config and active global instruction files, plus project, profile, CLI,
  or managed overrides that affect the current workspace;
- the locally available model list, where the agent can print one.

Keep credentials out of output. A cached catalog does not prove account access.
If browsing or refresh fails, keep existing model choices, report the
limitation, and apply only independently verified improvements. Never invent a
model ID from a naming pattern.

## 3. Select a proportional setup

Intersect documented recommendations with models the installed client and the
user's provider or account actually support. Preserve explicit user model
choices and budgets. For a custom provider, keep it and choose only models
confirmed for that provider; public prices do not establish its billing.

| Role | Selection goal |
| --- | --- |
| Main | Current balanced coding model at a moderate supported effort |
| Routine | Efficient tool-capable model at the lightest suitable effort |
| Difficult | Main model at a higher supported effort |
| Advisor | Strongest suitable model at a cost-conscious effort |

These are starting points, not measured equivalences or guaranteed savings.
Prefer documented recommendations over the newest model by release date. For an
unavailable role, use a suitable available model or keep the work in the main
thread. Fewer tokens is not the same as a lower price per token; extra agents
and retries can raise both.

## 4. Apply

1. Build a concrete diff: default model, effort, low verbosity where supported,
   and the routing block. Inspect current settings before adding keys.
2. Fill [assets/routing.md](assets/routing.md) with verified IDs and efforts.
   Omit any bullet whose role is unavailable. If the agent has no supported
   delegation mechanism, set the main default and omit delegation bullets,
   reporting the limitation.
3. Back up every file to change, recording which were absent and how to
   restore. Keep backups private.
4. Edit settings with the agent's native config API or a format-aware edit that
   preserves unrelated keys, comments, permissions, and provider settings. Never
   touch sandbox, approvals, trust, MCP, plugins, or skills.
5. Install the routing block with
   `node scripts/apply-block.mjs --file <instructions-file> --block <filled-block> --backup-dir <dir>`.
   It replaces only the marked block, appends on first use, migrates the legacy
   `codex-efficiency` markers, leaves an unchanged file untouched with no new
   backup, and refuses if the file changed during the run. Add `--dry-run` to
   preview.
6. Resolve conflicting routing rules before adding a second policy. Migrate
   older unmarked routing only when clearly generated, keeping unrelated text.

## 5. Verify

Use only local checks; make no paid model requests to validate. Discover
validation commands from the installed help and the reference. Confirm the
config parses strictly, the routing block and models appear in the effective
instructions, and unrelated settings match their previous values. On failure,
restore only this run's changed files and report the error. Report overrides
that stop the new defaults from taking effect.

## 6. Report

Give a compact role/model/effort table, changed paths, dated official sources,
backup and restore details, and validation results, as in
[assets/report-example.md](assets/report-example.md). State that routing is
instruction-driven and new defaults normally need a new session. Report savings
only from actual usage evidence.

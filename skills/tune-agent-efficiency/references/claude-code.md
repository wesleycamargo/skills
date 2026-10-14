# Claude Code

Verified against the official docs on 2026-10-14. Re-check the pages below each
run; keys and defaults change.

- **Settings, highest precedence first:** managed settings, `claude --settings`,
  `.claude/settings.local.json`, `.claude/settings.json`, then
  `~/.claude/settings.json`. Edit as JSON; preserve unrelated keys,
  permissions, hooks, and `env`. A project or local file can override the user
  file, so check the current workspace.
- **Default model:** `model` setting. Overridden by `ANTHROPIC_MODEL`,
  `--model`, and `/model`. `ANTHROPIC_DEFAULT_MODEL` sets the default for new
  sessions (v2.1.236+).
- **Aliases:** `default`, `best`, `fable`, `sonnet`, `opus`, `haiku`,
  `sonnet[1m]`, `opus[1m]`, `opusplan`. Aliases resolve to the newest version
  on the Anthropic API but may resolve older on other providers; pin a full ID
  when that matters. `availableModels` in managed settings can restrict choices.
- **Effort:** `effortLevel` setting (or per-model `modelSettings`), `--effort`,
  `/effort`, and the `CLAUDE_CODE_EFFORT_LEVEL` env var, which wins. Levels are
  `low`, `medium`, `high`, `xhigh`, `max`; supported levels vary by model, and an
  unsupported level falls back to the highest supported one at or below it.
- **Global instructions:** `~/.claude/CLAUDE.md`; install the routing block
  there (project: `CLAUDE.md`).
- **Delegation:** subagent Markdown files in `~/.claude/agents/` or
  `.claude/agents/` (project wins). Frontmatter `model` takes an alias, a full
  ID, or `inherit`; `effort` sets reasoning effort. Prefer a small set of named
  role agents (for example `routine` and `difficult`) with `model` and `effort`
  in frontmatter, and refer to them by name in the routing block. To force one
  model for every subagent, set `CLAUDE_CODE_SUBAGENT_MODEL` and
  `CLAUDE_CODE_SUBAGENT_MODEL_FORCE` in `env`; built-in Explore and Plan are
  unaffected without the force variable.
- **Model list:** the `/model` picker; `/status` shows the current model.
- **Validation:** confirm settings JSON parses and every frontmatter model and
  effort is accepted, then check in a new session that `/status` shows the
  chosen model and the instructions file is loaded. Make no paid requests
  solely to validate.

## Documentation

- https://code.claude.com/docs/en/settings
- https://code.claude.com/docs/en/model-config
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/memory

# Codex

- **Home:** `CODEX_HOME`, falling back to `~/.codex`.
- **Settings:** `config.toml` in the home (TOML; preserve comments and tables).
- **Global instructions:** `AGENTS.md` in the home; `AGENTS.override.md` takes
  precedence when present.
- **Model list:** `codex debug models` (refreshes; `--bundled` does not and
  cannot establish account availability).
- **Delegation:** subagents. Model overrides need a fresh context when
  full-history forks inherit the parent's model (`fork_turns = "none"` where the
  client has that parameter). Preserve an existing concurrency limit; if none,
  use two if supported.
- **Validation:** discover from `codex --help`. Where available use app-server
  `config/read` for strict loading and `codex debug prompt-input` to confirm the
  routing block and models are in the effective instructions.

## Documentation

Confirmed to exist on 2026-10-14:

- https://developers.openai.com/api/docs/guides/model-selection
- https://developers.openai.com/api/docs/models
- https://developers.openai.com/codex/config-basic (layers and precedence:
  CLI flags, profile, project `.codex/config.toml`, user, system, defaults)
- https://developers.openai.com/codex/subagents (custom agents are TOML files
  in `~/.codex/agents/` or `.codex/agents/` with `name`, `description`,
  `developer_instructions`; other fields inherit from the parent)

Not confirmed: the full config-reference page
(https://developers.openai.com/codex/config-reference) and an official
AGENTS.md discovery page were not retrieved. Look them up before relying on
exact key names or discovery order, and follow moved pages.

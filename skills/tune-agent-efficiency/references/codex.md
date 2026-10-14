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

- https://developers.openai.com/api/docs/guides/model-selection
- https://developers.openai.com/api/docs/models
- Codex configuration reference, subagents, and AGENTS.md discovery pages on
  the official OpenAI documentation site. Verify the current URLs; they have
  moved before.

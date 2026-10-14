# Report example

Illustrative only; the model names below are placeholders, not recommendations.

**Agent:** Codex 0.x (`~/.codex`), checked 2026-10-14

| Role | Model | Effort |
| --- | --- | --- |
| Main | `<balanced-model>` | medium |
| Routine | `<efficient-model>` | low |
| Difficult | `<balanced-model>` | high |
| Advisor | `<strongest-model>` | medium |

**Changed**
- `~/.codex/config.toml`: `model`, `model_reasoning_effort`
- `~/.codex/AGENTS.md`: added routing block

**Backups:** `~/.codex/backups/2026-10-14T10-00/` (restore by copying back;
`AGENTS.md` was absent before, so delete it to restore)

**Sources:** model selection guide and model catalog, fetched 2026-10-14

**Validation:** config parsed strictly; routing block present in effective
instructions; unrelated settings unchanged.

**Notes:** a project-level override sets `model`; the new default will not apply
in that workspace. Start a new session for the defaults to take effect.

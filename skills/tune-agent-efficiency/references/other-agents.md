# Other agents

For an agent without its own reference, find the equivalents from its official
documentation before changing anything:

1. **Settings file** that sets the default model and effort, and its format.
2. **Global instruction file** the agent loads every session (for example an
   `AGENTS.md`-style file).
3. **Delegation mechanism**, if any: subagents, profiles, or modes with their
   own model.
4. **Model list command** or documented model IDs.
5. **Validation**: a command that parses config or prints the effective
   instructions.

If item 2 is missing, there is nowhere to persist routing: set only the model
default and say so. If item 3 is missing, omit the delegation bullets from
[../assets/routing.md](../assets/routing.md). Use the same marker block and
`scripts/apply-block.mjs` for the instruction file. Do not guess keys or paths;
report what could not be verified.

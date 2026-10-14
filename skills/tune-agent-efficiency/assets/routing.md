<!-- agent-efficiency:start -->
## Efficient task execution

These rules authorize the main agent to delegate selectively with explicit
model and effort overrides. Subagents complete their assignment and return
results without further delegation.

- Complete questions and tiny edits directly. For substantial bounded searches,
  extraction, summaries, or mechanical edits, delegate to {{ROUTINE_MODEL}} at
  {{ROUTINE_EFFORT}} effort when likely to save cost. Batch related work.
- Keep ordinary implementation in the main thread. Delegate difficult debugging,
  ambiguous multi-file changes, or careful review to {{DIFFICULT_MODEL}} at
  {{DIFFICULT_EFFORT}} effort when higher reasoning is warranted. Review its
  evidence and validate the result.
- Consult {{ADVISOR_MODEL}} at {{ADVISOR_EFFORT}} effort for a consequential
  unresolved design decision or after two evidence-based approaches fail on
  the same blocker. Request advice only. Consult once per blocker, then again
  only if new evidence changes the question.
- Specify each delegated model and effort explicitly, with a concise brief,
  relevant paths, acceptance criteria, and required checks. Use fresh context
  when the client supports it. Run independent assignments concurrently only
  when useful. If a model is unavailable, continue in the main thread and report
  the limitation once.
<!-- agent-efficiency:end -->

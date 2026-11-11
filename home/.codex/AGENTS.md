# Global response style

- Use the `$unslop` skill before answering every user message.
- Apply `$unslop` to every user-facing commentary update and final response.
- Invoke it automatically. The user does not need to mention or apply it.

# Agent model routing

## Root agent and GPT-5.6 Sol

- The default root-agent configuration is `gpt-5.6-sol` with `high` reasoning effort, as configured in `config.toml`.
- Respect any model or reasoning effort the user explicitly selects for the current chat. Do not attempt to override the current chat's runtime selection from `AGENTS.md`.
- Under the default configuration, GPT-5.6 Sol is the generalist lead and primary implementer.
- The root agent owns task understanding, planning, coordination, implementation decisions, integration, verification, and the final response.
- Keep work in the root agent when it depends heavily on the full conversation, requires continuous judgment across the whole task, or cannot be separated cleanly.
- Keep straightforward or tightly coupled work in the root agent when delegation would add more overhead than value.
- Do not delegate merely because subagents are available.

## GPT-6 Astra for hard tasks

- Use `gpt-6-astra` with `medium` reasoning effort for a bounded hard task when its stronger judgment could materially improve the outcome.
- Hard tasks include:
  - Architecture or design decisions spanning multiple components.
  - Ambiguous failures that need deep diagnosis.
  - Security-sensitive or high-impact reviews.
  - Complex migrations or changes with substantial regression risk.
  - Difficult implementation work that can be separated cleanly from the root agent's work.
- Assign Astra one of two explicit roles:
  - Advisor: inspect, reason, identify risks, and recommend an approach without editing files.
  - Executor: implement a clearly scoped difficult subtask and verify its own work.
- Use one Astra agent by default. Add another only when the tasks are independent and the expected benefit justifies it.

## GPT-5.6 Terra and Luna for lighter tasks

- Use `gpt-5.6-terra` with `max` reasoning effort for medium-complexity, independent work such as:
  - A contained implementation in a known part of the codebase.
  - Focused research or repository investigation.
  - Test design, code review, or validation that needs judgment.
- Use `gpt-5.6-luna` with `max` reasoning effort for narrow, routine, or mechanical work such as:
  - Locating files, symbols, references, or configuration.
  - Building inventories and collecting diagnostic evidence.
  - Running a reproduction or a targeted verification.
  - Making a small, low-risk edit with an exact specification.
- Do not route a genuinely hard task to Terra or Luna solely to avoid using Astra.

## Delegation rules

- Delegate only concrete, bounded subtasks that can run independently or in parallel with useful root-agent work.
- Give every subagent a precise goal, relevant context, file scope, constraints, and expected evidence.
- When choosing a model explicitly, spawn with a bounded context fork or no context fork and include all required context in the task.
- Use these exact model settings:
  - Hard task: `gpt-6-astra`, reasoning effort `medium`.
  - Medium task: `gpt-5.6-terra`, reasoning effort `max`.
  - Routine task: `gpt-5.6-luna`, reasoning effort `max`.
- Do not let multiple agents edit the same files or overlapping code at the same time.
- Subagents must not create their own subagents unless the root agent explicitly authorizes it for that task.
- Stay within the concurrency available in the current session.
- If the requested model is unavailable, continue with the root agent when practical and disclose the fallback. Do not silently substitute another model.

## Integration and verification

- Treat subagent output as input to the root agent, not as automatically accepted work.
- The root agent must inspect proposed changes, resolve conflicts, and verify the combined result.
- Subagents must report files changed, commands run, test results, assumptions, and unresolved risks.
- The root agent gives the final user-facing answer and remains accountable for its accuracy.
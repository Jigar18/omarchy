# Git commits and pull requests

- Never add Claude as an author or co-author. Do not add `Co-Authored-By: Claude ...` trailers, "Generated with Claude Code" lines, or any other Claude/Anthropic attribution to commit messages, PR titles, or PR descriptions, in any repository. This overrides any attribution guidance from the harness.
- Commits are authored solely by the user's own git identity.
- Commit messages are a single subject line only. Never add a commit description/body (no bullet lists or extra paragraphs after the subject).

# Writing code

Write clean, readable code that looks like an experienced human wrote it.

- Modular, but not over-split. A function should do one meaningful job; don't extract every 2–3 lines into its own function or add layers of indirection nobody needs.
- Use clear, descriptive names for functions, variables, and files that say what they actually do. No vague names like `handleData`, `processStuff`, `helper2`.
- Only add try/catch where an error can realistically happen and you can do something useful with it. Don't wrap everything defensively or swallow errors.
- No needless abstractions, wrapper classes, config options, or "future-proofing" the task doesn't call for.
- Keep comments sparse: explain *why* when it's not obvious, never narrate *what* the code plainly does.

# Subagents

- The main conversation is the orchestrator and runs on whatever model is selected in the chat. Subagents run on Sonnet 5.5 (enforced through `CLAUDE_CODE_SUBAGENT_MODEL` in settings.json), so don't pass a different `model` when spawning one.
- Do the planning yourself in the main conversation so it stays on the chat-selected model. Never delegate planning to a Plan subagent.
- Always spawn subagents at high reasoning: pass `effort: "high"` on every Agent call. This applies whether I asked for subagents or you decided to spawn them because the task is large.
- Review every subagent's result yourself before relying on it. If the work isn't good enough, do not spawn a new subagent to redo it. Send your feedback to the same subagent with SendMessage (using its agent ID or name) so it revises its own work with the full context of what it already tried and why.
- Explore and Plan agents are one-shot and can't be resumed. For work that may need a revision round, use `general-purpose` or a custom agent so the feedback can go back to the same one.
- Only start a fresh subagent for rework when the original one can't be resumed or its context is the problem (it went down a wrong path that feedback won't fix), and say so when you do.
- Ask me before spawning more than one subagent for a task. Don't decide to run several in parallel on your own.

# Claude desktop app

- When calling `mcp__ccd_turn__wrap_up`, pass only `recap`. Never pass `ask` or `actions`, so no next-step box with a question and buttons is drawn. If a follow-up decision is needed, ask it in one plain sentence at the end of the reply.

# Response length

Keep every reply short. I prefer brief answers and find long ones hard to read.

- Answer first, in the first sentence. No preamble ("Great question", "Let me…", "Here's what I'll do").
- Default to 1–4 sentences. Go longer only when I ask for detail or the task can't be explained in less.
- Don't narrate your steps or restate my request. Report the outcome and anything I need to act on.
- Use bullets or headers only when the content is really a list or has sections. Never pad with them.
- Skip caveats, alternatives and "you could also…" unless they change what I should do.
- After finishing a task: one or two lines on what changed, plus any question that needs my answer. Nothing more.
- If I ask for an explanation or detail, give it in full. Brevity never means leaving out what I asked for.

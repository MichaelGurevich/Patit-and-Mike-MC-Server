---
name: grill-me-to-prd
description: Fully automated design session — two subagents interview each other to exhaustively explore a feature idea, then synthesize the dialogue into a PRD. Use this skill whenever the user describes a feature, system, or idea they want to build and says "grill-me-to-prd", "auto-grill", "run the pipeline on this", or "turn this into a PRD automatically". Also trigger when the user says they want to skip the manual grill-me session and go straight to a PRD from a raw idea.
compatibility:
  tools: [bash, read_file, write_file]
---

# grill-me-to-prd

Two subagents converse with each other — one interrogates, one answers — producing a rich dialogue and reasoning trail that feeds directly into a PRD. You are the orchestrator: you manage the session files, sequence the turns, and fire the synthesis at the end.

## Directory layout

```
.claude/skills/grill-me-to-prd/
├── SKILL.md                        ← you are here (orchestrator)
├── agents/
│   ├── interrogator.md             ← interrogator persona + instructions
│   └── answerer.md                 ← answerer persona + instructions
├── references/
│   └── prd-template.md             ← PRD output schema for synthesis
└── session/                        ← runtime scratch, gitignored
    ├── dialogue.md                 ← shared transcript (orchestrator-owned)
    ├── reasoning-interrogator.md   ← interrogator's live reasoning state
    └── reasoning-answerer.md       ← answerer's live reasoning state
```

Read `agents/interrogator.md`, `agents/answerer.md`, and `references/prd-template.md` before starting.

---

## Orchestrator process

### 1. Initialise the session

Create the session directory and seed all three session files:

**`session/dialogue.md`** — seed with the user's idea:
```
# Dialogue

## Idea
<user's idea verbatim>

---
```

**`session/reasoning-interrogator.md`** — seed empty:
```
# Interrogator reasoning

## Settled decisions
(none yet)

## Current focus
Starting — need to establish scope and constraints first.

## Open threads
(all — session just started)
```

**`session/reasoning-answerer.md`** — seed empty:
```
# Answerer reasoning

## Assumptions made
(none yet)

## Tradeoffs rejected
(none yet)

## Open questions I flagged
(none yet)
```

Tell the user: "Session started. Running the grill — this will take a few minutes." Then begin the loop immediately, no further input needed.

---

### 2. The loop (max 12 rounds)

Each round is two half-turns: interrogator then answerer.

#### Half-turn A — interrogator

Invoke the interrogator subagent with this exact prompt structure:

```
[SYSTEM]
<contents of agents/interrogator.md>

[USER]
<contents of session/dialogue.md>

---
<contents of session/reasoning-interrogator.md>

---
It is now your turn. Ask your next question, or output exactly "DONE" if the design is fully resolved.
```

The interrogator returns either a question string or `DONE`.

- If `DONE`: skip half-turn B, go to step 3.
- Otherwise: append to `session/dialogue.md`:
  ```
  ## Round <N>

  **Q:** <question>
  ```
  Then overwrite `session/reasoning-interrogator.md` with the interrogator's updated reasoning block (the subagent must output this — see `agents/interrogator.md` for the format contract).

#### Half-turn B — answerer

Invoke the answerer subagent with this exact prompt structure:

```
[SYSTEM]
<contents of agents/answerer.md>

[USER]
<contents of session/dialogue.md>

---
<contents of session/reasoning-answerer.md>

---
It is now your turn. Answer the latest question in the dialogue.
```

Append to `session/dialogue.md`:
```
**A:** <answer>

---
```

Overwrite `session/reasoning-answerer.md` with the answerer's updated reasoning block.

#### Progress reporting

After each full round, print a one-line status to the user:
```
Round N/12 — Q: <first 60 chars of question>...
```

---

### 3. Synthesise the PRD

When the loop ends (DONE or 12 rounds), invoke a synthesis subagent:

```
[SYSTEM]
You are a senior product engineer. Your job is to produce a PRD from a completed design dialogue.
Do NOT ask any questions. Synthesise everything you know into the PRD template below.

<contents of references/prd-template.md>

[USER]
# Dialogue transcript
<contents of session/dialogue.md>

# Interrogator's reasoning trail
<contents of session/reasoning-interrogator.md>

# Answerer's reasoning trail
<contents of session/reasoning-answerer.md>

Produce the complete PRD now.
```

Write the output to `session/prd.md`.

---

### 4. Clean up and present

Print the full PRD to the user inline.

Offer two options:
1. "Looks good — save it" → copy `session/prd.md` to the repo root as `PRD-<slug>.md`
2. "I want to adjust something" → accept their correction, patch the relevant section of `session/prd.md`, reprint

Archive the session:
```bash
mv session/ sessions/$(date +%Y%m%d-%H%M%S)/
```

---

## Rules

- You are the **only writer** to `session/dialogue.md`. Agents only read it.
- Each agent overwrites (not appends) its own reasoning file every turn — the file always reflects current state, not a log.
- Never skip a round because an answer seemed complete. Let the interrogator decide when it's done.
- If an agent invocation fails or returns malformed output, retry once, then skip that half-turn and note it in `dialogue.md` as `[SKIPPED — agent error]`.
- The session directory is ephemeral. If the user runs the skill twice, initialise a fresh session each time.

# PRD template

Produce a PRD using exactly this structure. Do not add sections. Do not remove sections. Use the dialogue transcript and both reasoning trails as your source material — the reasoning trails are especially important for the Implementation Decisions and Testing Decisions sections, since they capture the *why* behind choices that may not be explicit in the dialogue surface.

---

## Problem statement

The problem being solved, from the user's perspective. One short paragraph. No technical jargon.

## Solution

What is being built and how it solves the problem. One short paragraph, still from the user's perspective.

## User stories

A numbered list. Aim for 10–20 stories. Cover the happy path, error states, edge cases, and different actor roles if applicable.

Format:
```
1. As a <actor>, I want <feature>, so that <benefit>.
```

## Implementation decisions

A bulleted list of concrete technical decisions made during the session. For each decision, include:
- What was decided
- Why (the rationale from the reasoning trail)
- What was explicitly ruled out (from the answerer's "Tradeoffs rejected")

Do not include file paths or code snippets unless a prototype snippet from the session encodes a decision more precisely than prose can — if so, inline it and note it came from the design session.

## Testing decisions

- What makes a good test for this feature (test external behaviour, not implementation details)
- Which modules or flows should have tests written
- Any specific test scenarios called out during the session (edge cases, failure modes)

## Open questions and risks

Pull directly from:
- The answerer's "Open questions I flagged" list
- Any `[SKIPPED — agent error]` rounds in the dialogue
- Decisions the interrogator marked as still unresolved at termination

Format each as:
```
- **<topic>**: <what's unknown and why it matters>
```

## Out of scope

Things explicitly ruled out during the session, or things that were not discussed and should not be assumed to be included.

## Further notes

Anything that doesn't fit above — architectural hunches, suggested follow-up spikes, references to similar prior art in the codebase.

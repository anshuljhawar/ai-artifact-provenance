# Weekly status: payments migration

**Week of 2026-09-14.** Adyen contract signed. Gateway abstraction merged behind a flag. Shadow traffic at 5% since Tuesday with zero mismatches.

## Risks

- Onboarding for the Indian entity is still pending on Adyen's side.
- Reconciliation job has not been run against a full day of Adyen data yet.

## Next week

- Raise shadow traffic to 25%.
- First reconciliation run against Monday's data.

## Provenance

```json ai-artifact-provenance
{
  "ai_artifact_provenance": "0.1",
  "title": "Weekly status: payments migration",
  "ask": "write the weekly status for the payments migration from the last 7 days of commits and the jira board, keep it under 150 words",
  "purpose": "Weekly update for the platform leads meeting.",
  "audience": "Platform leads",
  "status": "draft",
  "owner": "anshul",
  "generator": { "tool": "Codex CLI", "model": "gpt-5" },
  "created": "2026-09-16",
  "updated": "2026-09-16",
  "inputs": [
    { "name": "git log payments-service, 2026-09-09 to 2026-09-16", "as_of": "2026-09-16" },
    { "name": "Jira board PAY, columns In Progress and Done", "as_of": "2026-09-16" }
  ],
  "constraints": [ { "quote": "keep it under 150 words", "source": "user" } ],
  "assumptions": [
    { "text": "'Zero mismatches' is taken from the shadow-diff dashboard title, not from a query I ran.", "confirmed": false }
  ],
  "decisions": [],
  "unknowns": [
    { "text": "Whether the Indian entity onboarding is blocked on us or on Adyen.", "how_to_check": "Ask the Adyen account manager." }
  ],
  "changelog": [
    { "version": 1, "date": "2026-09-16", "trigger": "write the weekly status for the payments migration from the last 7 days of commits...", "changed": "First draft." }
  ],
  "how_to_question": "Reply on the thread, or give this file to your assistant and ask it what is unverified."
}
```

# ai-artifact-provenance specification, v0.1

**Status:** draft. **Goal:** an AI-generated document carries its own context, so a reader who was not in the session can understand why it looks the way it does and ask a sharp question, with any agent or none.

## 1. Principle

The context travels **inside the document**. Not in a vendor's session, not in a sidecar file. An HTML or Markdown file gets emailed, uploaded and re-hosted; the block goes with it.

Two representations of the same data live in the file:

1. **Machine-readable block**, a JSON object at a fixed location with a fixed id, so any agent or script finds it without guessing.
2. **Human-readable panel**, rendered from that JSON, collapsed at the top of the page.

## 2. Where the block lives

### HTML

```html
<script type="application/json" id="ai-artifact-provenance">
{ ...block... }
</script>
```

Place it in `<head>` or at the start of `<body>`. Exactly one block per document. The panel is rendered by an inline script (see `templates/panel.js`) or emitted as static HTML with the marker attribute `data-ai-artifact-provenance-panel`.

### Markdown

A fenced code block whose info string is `json ai-artifact-provenance`, placed before the first heading or as the last section:

````markdown
```json ai-artifact-provenance
{ ...block... }
```
````

Markdown renderers show it as a JSON code block, which is the human-readable fallback.

## 3. The block

```json
{
  "ai_artifact_provenance": "0.1",
  "title": "Vendor choice for the payments migration",
  "ask": "compare stripe vs adyen for our payments migration, 2 pages max, for the leadership review thursday",
  "purpose": "Support a go/no-go on the vendor by 2026-09-18.",
  "audience": "Engineering leadership",
  "status": "proposal",
  "owner": "anshul",
  "generator": { "tool": "Claude Code", "model": "claude-fable-5-1" },
  "created": "2026-09-16",
  "updated": "2026-09-16",
  "inputs": [
    { "name": "finance/payments-volume-2026.csv", "as_of": "2026-09-01" },
    { "name": "Stripe and Adyen public pricing pages", "as_of": "2026-09-16" }
  ],
  "constraints": [
    { "quote": "2 pages max", "source": "user" },
    { "quote": "must keep PCI scope where it is today", "source": "user" }
  ],
  "assumptions": [
    { "text": "EU volume stays under 20% of total through 2027.", "confirmed": false },
    { "text": "Current gateway contract can be exited without penalty.", "confirmed": true }
  ],
  "decisions": [
    {
      "id": "D1",
      "decision": "Recommend Adyen.",
      "why": "Lower blended rate at our volume once EU share passes 15%.",
      "quote": "optimise for cost at scale, not for speed of integration",
      "rejected": [
        { "option": "Stripe", "why": "Faster integration, but 0.3pt higher blended rate at projected volume." }
      ]
    },
    {
      "id": "D2",
      "decision": "Drop the build-in-house option from the comparison.",
      "why": "User asked for it to be removed.",
      "quote": "no, we are not building this ourselves, take it out",
      "superseded_by": null
    }
  ],
  "unknowns": [
    { "text": "Adyen's onboarding time for our entity type.", "how_to_check": "Ask the Adyen sales contact; not verified." }
  ],
  "changelog": [
    { "version": 1, "date": "2026-09-16", "trigger": "compare stripe vs adyen for our payments migration...", "changed": "First draft." },
    { "version": 2, "date": "2026-09-16", "trigger": "no, we are not building this ourselves, take it out", "changed": "Removed in-house option; recorded as D2." }
  ],
  "links": { "session": "", "source": "" },
  "how_to_question": "Comment on the shared page, or send this file to your own assistant and ask it to read the ai-artifact-provenance block."
}
```

### Field reference

| Field | Required | Meaning |
|---|---|---|
| `ai_artifact_provenance` | yes | Spec version. `"0.1"`. |
| `title` | no | Document title. |
| `ask` | yes | The original request, **verbatim**. Not paraphrased. |
| `purpose` | no | What decision or outcome the document supports. |
| `audience` | no | Who it is for. |
| `status` | yes | One of `draft`, `proposal`, `decided`, `superseded`. |
| `owner` | yes | The human accountable for the content. Name, handle or email. |
| `generator` | yes | `tool` (required) and `model` (recommended). |
| `created` | no | ISO date `YYYY-MM-DD`. |
| `updated` | yes | ISO date of the last publish. |
| `inputs` | no | What the document drew on. Each is a string or `{ name, as_of, note }`. |
| `constraints` | no | Constraints the user gave. Each is a string or `{ quote, source }`. Quote verbatim. |
| `assumptions` | yes | Things the AI decided without being told. Each is a string or `{ text, confirmed }`. May be empty, but must be present: an empty list is a claim. |
| `decisions` | no | Each is a string or `{ id, decision, why, quote, rejected: [{ option, why }], superseded_by }`. |
| `unknowns` | yes | Not verified. Each is a string or `{ text, how_to_check }`. May be empty. |
| `changelog` | yes | One entry per publish: `{ version, date, trigger, changed }`. `trigger` is the user prompt that caused the version, verbatim or truncated. Append-only; versions strictly increasing. |
| `links` | no | `session`, `source`, or any other URL. |
| `how_to_question` | no | One sentence telling the reader how to challenge the document. |

## 4. Rules that keep it honest

1. **Quotes are verbatim.** `ask`, `constraints[].quote`, `decisions[].quote` and `changelog[].trigger` are the user's words. Truncate with `...` if long. Never rewrite.
2. **Changelog is append-only.** Every publish adds an entry. Never edit or remove earlier ones.
3. **Supersede, don't delete.** When a later prompt reverses a decision, set `superseded_by` on the old one and add the new one. Same for assumptions: flip `confirmed`, don't drop the line.
4. **Assumptions are the AI's, constraints are the user's.** If the user said it, it is a constraint. If the AI chose it, it is an assumption.
5. **The owner signs off.** The block describes what the AI did; the `owner` is the person who vouches for it. An unconfirmed assumption on a `decided` document is a warning.
6. **Regenerate on every publish.** The block is not a one-time header. It is updated whenever the document is.

## 5. Consumer contract

Any tool or agent may rely on:

- An HTML document has at most one `<script type="application/json" id="ai-artifact-provenance">`.
- A Markdown document has at most one fenced block with info string `json ai-artifact-provenance`.
- The JSON parses and satisfies `schema/ai-artifact-provenance.schema.json`.

Nothing else is guaranteed. A consumer that wants to answer "why?" reads `ask`, `constraints`, `assumptions`, `decisions` and `changelog`. A consumer that wants to know what to challenge reads unconfirmed `assumptions` and `unknowns`.

## 6. Versioning

The spec version is in the block. Additive changes bump the minor version. A consumer must ignore unknown fields.

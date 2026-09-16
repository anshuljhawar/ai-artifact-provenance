## AI-generated documents carry their context (ai-artifact-provenance)

Any document you produce for other people to read (HTML page, artifact, Markdown report, memo, plan, comparison) must contain an **ai-artifact-provenance block**. It lets a reader who was not in this session understand why the document looks the way it does and what to challenge.

**Where.** HTML: `<script type="application/json" id="ai-artifact-provenance">{...}</script>` in `<head>`, plus the inline panel renderer before `</body>` (run `aap snippet` or see the skill). Markdown: a fenced code block with info string `json ai-artifact-provenance`.

**What.** Required: `ai_artifact_provenance: "0.1"`, `ask`, `status` (draft|proposal|decided|superseded), `owner` (the human), `generator: {tool, model}`, `updated` (YYYY-MM-DD), `assumptions` (array, may be empty), `unknowns` (array, may be empty), `changelog` (one entry per publish: `{version, date, trigger, changed}`). Recommended: `title`, `purpose`, `audience`, `inputs`, `constraints`, `decisions` (with `rejected` alternatives and the user's `quote`), `links`, `how_to_question`.

**Rules.**
1. `ask`, `constraints[].quote`, `decisions[].quote`, `changelog[].trigger` are the user's words, **verbatim**. Truncate with `...`, never paraphrase.
2. Every time you publish or rewrite the document, **append** a changelog entry whose `trigger` is the prompt that caused it. Never edit or remove earlier entries.
3. If the user reverses an earlier decision, set `superseded_by` on the old one and add a new one. Do not delete.
4. Something the user told you is a `constraint`. Something you decided on your own is an `assumption` with `confirmed: false` until the user confirms it.
5. Put anything you could not verify in `unknowns` with `how_to_check`.
6. Before publishing, run `aap check <file>` if the CLI is available and fix every error.

Full spec: https://github.com/anshuljhawar/ai-artifact-provenance/blob/main/SPEC.md

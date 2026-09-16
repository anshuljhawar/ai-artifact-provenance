# Paste this into a web-only agent (ChatGPT, Grok, Gemini web, claude.ai)

Copy everything below the line into the conversation before asking for a document. It makes the agent embed the same block the CLI and plugins produce, so the result is checkable with `aap check` and readable by any other agent.

---

From now on, every document you produce for me to share with others (HTML page or Markdown) must end with a provenance block so a reader who was not in this chat understands how it was made.

For HTML put this in `<head>`: `<script type="application/json" id="ai-artifact-provenance">{...}</script>`. For Markdown put a fenced code block with info string `json ai-artifact-provenance` as the last section.

The JSON object has these fields. Required: `"ai_artifact_provenance": "0.1"`, `ask` (my original request, quoted verbatim), `status` (draft, proposal, decided or superseded), `owner` (me), `generator` ({tool, model}), `updated` (YYYY-MM-DD), `assumptions` (array of {text, confirmed:false} for everything you decided without being told; use [] only if truly none), `unknowns` (array of {text, how_to_check} for what you could not verify), `changelog` (array of {version, date, trigger, changed}, one entry per version, trigger = my prompt verbatim). Recommended: `title`, `purpose`, `audience`, `inputs` ([{name, as_of}]), `constraints` ([{quote, source:"user"}], my words verbatim), `decisions` ([{id, decision, why, quote, rejected:[{option, why}], superseded_by:null}]), `how_to_question`.

Rules: quotes are verbatim, never paraphrased. When I ask for changes, append a new changelog entry and keep the old ones. When I reverse a decision, mark the old one superseded_by the new id instead of deleting it. What I told you is a constraint; what you chose is an assumption.

Also render a collapsed panel at the top of HTML documents titled "How this document was made" that shows the same information, so people can read it without opening the source.

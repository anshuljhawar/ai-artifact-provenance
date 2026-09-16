# ai-artifact-provenance

**AI-generated documents that carry their own context.**

Claude, Codex, Gemini, Grok and friends all produce polished HTML and Markdown documents. Hand one to a manager or a teammate and they see the *answer* but not the *question*: what was asked, what constraints applied, what the AI assumed, what was rejected, what nobody verified, and what changed between version 3 and version 4.

This repo is a small convention plus tooling that fixes that:

- **A block** embedded in the document itself (JSON with a fixed id), so it survives email, upload and re-hosting, and any agent can find it.
- **A panel** rendered from that block, collapsed at the top of the page: "How this document was made".
- **A CLI** to validate, read, and turn the block into reviewer questions.
- **A Claude Code plugin** with a skill and a hook that refuses to publish an artifact without a valid block.
- **An installer** that drops the same instruction into AGENTS.md, CLAUDE.md, GEMINI.md and Cursor rules, adds a git pre-commit gate, and installs the skill for Codex.
- **A paste-able prompt** for web-only agents.

Nothing to install on the reader's side. Open the file and the panel is there. Or give the file to any assistant and ask "why was X rejected?"

## What the block holds

| Field | Meaning |
|---|---|
| `ask` | The original request, **verbatim** |
| `purpose`, `audience` | What decision this supports, for whom |
| `status`, `owner` | draft / proposal / decided / superseded, and the accountable human |
| `generator`, `updated` | Which tool and model, last publish date |
| `inputs` | Files, data, connectors, with as-of dates |
| `constraints` | Given by the user, quoted |
| `assumptions` | Made by the AI without being told, each confirmed or not |
| `decisions` | Each with the user's quote, the choice, rejected alternatives, and supersession |
| `unknowns` | Not verified, with how to check |
| `changelog` | One entry per publish: the prompt that triggered it, what changed. Append-only. |

Full field reference and rules: [SPEC.md](SPEC.md). Schema: [schema/ai-artifact-provenance.schema.json](schema/ai-artifact-provenance.schema.json). Working examples: [examples/decision-memo.html](examples/decision-memo.html), [examples/status-report.md](examples/status-report.md).

## Install

### One command, any project

```sh
npx --yes github:anshuljhawar/ai-artifact-provenance init          # current project
npx --yes github:anshuljhawar/ai-artifact-provenance init --codex  # also install the Codex skill
```

That writes the instruction section into `AGENTS.md`, imports it from `CLAUDE.md`, writes `GEMINI.md` and `.cursor/rules/ai-artifact-provenance.mdc`, adds a Claude Code `PreToolUse` hook in `.claude/settings.json`, and installs a git `pre-commit` hook. It is idempotent; run it again after upgrading.

For a global `aap` command:

```sh
npm i -g github:anshuljhawar/ai-artifact-provenance
```

### Claude Code plugin (skill + publish gate)

```
/plugin marketplace add anshuljhawar/ai-artifact-provenance
/plugin install ai-artifact-provenance@ai-artifact-provenance
```

The skill teaches Claude what to embed and how to keep the changelog across republishes. The hook blocks any `Artifact` publish of an `.html` or `.md` file that lacks a valid block, and tells Claude what to fix. Set `AAP_STRICT=1` to also block on warnings, `AAP_GATE_WRITE=1` to also gate `Write` of `.html` files.

### Codex, Gemini CLI, Cursor

`init` covers them through `AGENTS.md`, `GEMINI.md` and Cursor rules. `init --codex` also copies the skill into `~/.codex/skills/` (or `$CODEX_HOME/skills/`). Enforcement there is the git pre-commit hook, since those tools have no publish-time hook.

### Web-only agents (ChatGPT, Grok, claude.ai, Gemini web)

Paste [prompts/paste.md](prompts/paste.md) into the conversation before asking for a document. Weakest option, but the output is the same block and validates with `aap check`.

## Use

**As the producer** you do nothing different. Ask for the document, iterate, publish. The block appears and the changelog grows with each republish. If a hook blocks a publish, the agent fixes the block and retries.

**As the reader:**

```sh
aap show memo.html          # human summary of the block
aap questions memo.html     # what to challenge: unconfirmed assumptions, unknowns, rejected alternatives
aap show memo.html --json   # raw block for your own tooling
```

Or open the file. The panel is at the top. Or give the file to any assistant and ask it to read the `ai-artifact-provenance` block.

**As a maintainer:**

```sh
aap check docs/*.html reports/*.md      # CI gate; exit 1 on errors, --strict also fails on warnings
aap add new.html --write --owner you --tool "Claude Code"   # skeleton block + inline panel renderer
aap render memo.html --write            # static panel, for readers with JavaScript off
```

## Why these rules

- **Verbatim quotes.** A model can write a coherent rationale it never actually followed. The user's own words in `ask`, `constraints`, `decisions[].quote` and `changelog[].trigger` are the anchor.
- **Append-only changelog.** Artifacts get republished ten times. Without a log, version 10 silently overwrites the reason for version 4.
- **Supersede, don't delete.** "Why did this change?" is the most common manager question. The struck-through decision answers it.
- **Assumptions are the AI's, constraints are the user's.** The distinction tells a reader what is a requirement and what is a guess.
- **An owner signs off.** The block records what the AI did. The human named in `owner` vouches for it.

## What this is not

- Not C2PA or watermarking. Those prove *which model* made a thing. This explains *why it looks like this*.
- Not an audit trail of every tool call. Too low-level for a reader. See the IETF Agent Audit Trail draft for that.
- Not a guarantee. Only the Claude hook and the git hook are hard gates. Everything else relies on the agent following instructions.

## Layout

```
SPEC.md                         the convention
schema/                         JSON schema for the block
lib/core.js                     locate, validate, normalize, render, questions (no dependencies)
bin/aap.js                      CLI: check, show, questions, render, add, hook, init
templates/panel.js              inline panel renderer, CSP-safe
skills/ai-artifact-provenance/  agent skill (Claude Code plugin, Codex, user skills folder)
agents/AGENTS.snippet.md        instruction text for AGENTS.md / CLAUDE.md / GEMINI.md / Cursor
prompts/paste.md                for web-only agents
hooks/hooks.json                Claude Code plugin hook
.claude-plugin/                 plugin and marketplace manifests
examples/                       a decision memo (HTML) and a status report (Markdown)
test/                           node --test
```

## Contributing

`npm test`. Zero dependencies, Node 18+. Spec changes go in `SPEC.md` first, then the validator, then the skill text.

## License

MIT

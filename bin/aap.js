#!/usr/bin/env node
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const core = require('../lib/core.js');

const ROOT = path.resolve(__dirname, '..');
const RENDERER = fs.readFileSync(path.join(ROOT, 'templates', 'panel.js'), 'utf8');
const argv = process.argv.slice(2);
const cmd = argv[0];
const flags = new Set(argv.filter(a => a.startsWith('--')));
const args = argv.slice(1).filter(a => !a.startsWith('--'));

const USAGE = `ai-artifact-provenance (aap) v${require('../package.json').version}

  aap check <file...> [--json] [--strict]   validate the block (exit 1 on errors; --strict also fails on warnings)
  aap check --stdin [--kind html|md]        validate content from stdin
  aap show <file> [--json]                  print the block (human summary, or raw JSON)
  aap questions <file>                      print what a reviewer should challenge
  aap render <file> [--write]               static HTML panel from the block (HTML only)
  aap add <file> [--write] [--owner X] [--tool X] [--model X] [--ask "..."]
                                            insert a skeleton block (and inline renderer for HTML)
  aap hook                                  Claude Code PreToolUse hook (reads tool JSON on stdin)
  aap init [dir] [--codex] [--claude-skill] [--no-git-hook] [--no-claude-hook]
                                            install instruction files, hooks and skills into a project
  aap snippet                               print the inline panel renderer
  aap agents-md                             print the instruction text for AGENTS.md / CLAUDE.md / GEMINI.md
`;

function read(file) { return fs.readFileSync(file, 'utf8'); }
function readStdin() { return fs.readFileSync(0, 'utf8'); }
function report(file, r) {
  const tag = r.ok ? 'OK ' : 'ERR';
  console.log(`${tag} ${file}${r.ok ? '' : ` (${r.errors.length} error${r.errors.length === 1 ? '' : 's'})`}`);
  r.errors.forEach(e => console.log(`   error: ${e}`));
  r.warnings.forEach(w => console.log(`   warn:  ${w}`));
}

function cmdCheck() {
  const strict = flags.has('--strict');
  if (flags.has('--stdin')) {
    const kindIdx = argv.indexOf('--kind');
    const r = core.validate(readStdin(), { kind: kindIdx > -1 ? argv[kindIdx + 1] : undefined });
    if (flags.has('--json')) console.log(JSON.stringify(r, null, 2)); else report('<stdin>', r);
    process.exit(r.ok && !(strict && r.warnings.length) ? 0 : 1);
  }
  if (!args.length) { console.error('aap check: no files given'); process.exit(2); }
  let failed = false;
  const results = {};
  for (const f of args) {
    const r = core.validate(read(f), { filename: f });
    results[f] = r;
    if (!r.ok || (strict && r.warnings.length)) failed = true;
    if (!flags.has('--json')) report(f, r);
  }
  if (flags.has('--json')) console.log(JSON.stringify(results, null, 2));
  process.exit(failed ? 1 : 0);
}

function loadOrDie(f) {
  const r = core.validate(read(f), { filename: f });
  if (!r.ok) { report(f, r); process.exit(1); }
  return r;
}

function cmdShow() {
  const f = args[0]; if (!f) { console.error(USAGE); process.exit(2); }
  const r = loadOrDie(f);
  if (flags.has('--json')) { console.log(JSON.stringify(r.data, null, 2)); return; }
  const d = r.data;
  const last = d.changelog[d.changelog.length - 1];
  console.log(`${d.title || f}\n  status: ${d.status}   owner: ${d.owner}   generator: ${d.generator.tool}${d.generator.model ? ' / ' + d.generator.model : ''}   updated: ${d.updated}   v${last.version}`);
  console.log(`\nThe ask:\n  "${d.ask}"`);
  if (d.purpose) console.log(`\nPurpose: ${d.purpose}`);
  if (d.audience) console.log(`Audience: ${d.audience}`);
  const sec = (name, arr, f) => { if (arr.length) { console.log(`\n${name}:`); arr.forEach(x => console.log(`  - ${f(x)}`)); } };
  sec('Constraints given', d.constraints, c => `"${c.quote}"${c.source ? ' (' + c.source + ')' : ''}`);
  sec('Assumptions the AI made', d.assumptions, a => `${a.text} [${a.confirmed ? 'confirmed' : 'unconfirmed'}]`);
  sec('Decisions', d.decisions, x => `${x.id}: ${x.decision}${x.why ? ' — ' + x.why : ''}${x.quote ? ` ("${x.quote}")` : ''}${x.superseded_by ? ` [superseded by ${x.superseded_by}]` : ''}${x.rejected.length ? '\n      rejected: ' + x.rejected.map(r => r.option + (r.why ? ' — ' + r.why : '')).join('; ') : ''}`);
  sec('Not verified', d.unknowns, u => `${u.text}${u.how_to_check ? ' (' + u.how_to_check + ')' : ''}`);
  sec('Inputs', d.inputs, i => `${i.name}${i.as_of ? ' as of ' + i.as_of : ''}${i.note ? ' — ' + i.note : ''}`);
  sec('Versions', d.changelog, c => `v${c.version} ${c.date} "${c.trigger}"${c.changed ? ' → ' + c.changed : ''}`);
  if (d.how_to_question) console.log(`\nTo question this: ${d.how_to_question}`);
  if (r.warnings.length) { console.log(''); r.warnings.forEach(w => console.log(`warn: ${w}`)); }
}

function cmdQuestions() {
  const f = args[0]; if (!f) { console.error(USAGE); process.exit(2); }
  const r = loadOrDie(f);
  const qs = core.questions(r.data);
  if (flags.has('--json')) { console.log(JSON.stringify(qs, null, 2)); return; }
  console.log(`Questions worth asking about ${r.data.title || f}:\n`);
  qs.forEach((q, i) => console.log(`${String(i + 1).padStart(2)}. [${q.kind}] ${q.q}`));
  if (!qs.length) console.log('  (nothing flagged: no unconfirmed assumptions, unknowns or rejected alternatives)');
}

function cmdRender() {
  const f = args[0]; if (!f) { console.error(USAGE); process.exit(2); }
  const content = read(f);
  const r = loadOrDie(f);
  if (r.kind !== 'html') { console.error('render: only HTML documents get a static panel'); process.exit(2); }
  const panel = core.PANEL_CSS + core.panelHtml(r.data);
  if (!flags.has('--write')) { console.log(panel); return; }
  let out = content.replace(/<script[^>]*data-ai-artifact-provenance-panel[^>]*>[\s\S]*?<\/script>/i, '').replace(/<details class="ai-artifact-provenance-panel"[\s\S]*?<\/details>/i, '').replace(/<style data-ai-artifact-provenance-style>[\s\S]*?<\/style>/i, '');
  out = /<body[^>]*>/i.test(out) ? out.replace(/<body[^>]*>/i, m => `${m}\n${panel}`) : panel + '\n' + out;
  fs.writeFileSync(f, out);
  console.log(`rendered static panel into ${f}`);
}

function flagVal(name) { const i = argv.indexOf(name); return i > -1 ? argv[i + 1] : undefined; }

function cmdAdd() {
  const f = args[0]; if (!f) { console.error(USAGE); process.exit(2); }
  const content = fs.existsSync(f) ? read(f) : '';
  const kind = core.kindOf(f, content);
  if (core.locate(content, kind).count) { console.error(`${f} already has a block. Use "aap show" or edit it in place.`); process.exit(1); }
  const block = core.skeleton({ owner: flagVal('--owner') || os.userInfo().username, generator: { tool: flagVal('--tool') || '', model: flagVal('--model') || '' }, ask: flagVal('--ask') || '', title: flagVal('--title') || '' });
  if (!block.changelog[0].trigger) block.changelog[0].trigger = block.ask;
  const out = core.inject(content, block, { kind, renderer: RENDERER });
  if (!flags.has('--write')) { console.log(out); return; }
  fs.writeFileSync(f, out);
  console.log(`added skeleton block to ${f}. Fill: ask (verbatim), status, owner, generator, assumptions, unknowns, changelog[0].trigger.`);
}

/** Claude Code PreToolUse hook. Blocks Artifact publishes of html/md files without a valid block. */
function cmdHook() {
  let input;
  try { input = JSON.parse(readStdin() || '{}'); } catch { process.exit(0); }
  const tool = input.tool_name || '';
  const ti = input.tool_input || {};
  const strict = process.env.AAP_STRICT === '1';
  const gateWrite = process.env.AAP_GATE_WRITE === '1';
  let content = null, label = null, kind;
  if (tool === 'Artifact') {
    const action = ti.action || 'publish';
    if (action !== 'publish' || ti.asset || ti.type_url || !ti.file_path) process.exit(0);
    if (!/\.(html?|md|markdown)$/i.test(ti.file_path)) process.exit(0);
    if (!fs.existsSync(ti.file_path)) process.exit(0);
    content = read(ti.file_path); label = ti.file_path; kind = core.kindOf(ti.file_path, content);
  } else if (tool === 'Write' && gateWrite) {
    if (!ti.file_path || !/\.(html?)$/i.test(ti.file_path) || typeof ti.content !== 'string') process.exit(0);
    content = ti.content; label = ti.file_path; kind = 'html';
  } else process.exit(0);
  const r = core.validate(content, { kind });
  if (r.ok && !(strict && r.warnings.length)) process.exit(0);
  const lines = [
    `ai-artifact-provenance: ${label} cannot be published without a valid provenance block.`,
    ...r.errors.map(e => `  error: ${e}`),
    ...r.warnings.map(w => `  warn:  ${w}`),
    '',
    'Fix: add or update the <script type="application/json" id="ai-artifact-provenance"> block (see the ai-artifact-provenance skill or `aap agents-md`),',
    'quote the user verbatim in ask/constraints/decisions/changelog.trigger, append a changelog entry for this publish, include the inline panel renderer, then publish again.',
  ];
  console.error(lines.join('\n'));
  process.exit(2);
}

const MARK_START = '<!-- ai-artifact-provenance:start -->';
const MARK_END = '<!-- ai-artifact-provenance:end -->';
function agentsText() { return read(path.join(ROOT, 'agents', 'AGENTS.snippet.md')).trim(); }
function upsertSection(file, body) {
  const wrapped = `${MARK_START}\n${body}\n${MARK_END}`;
  let cur = fs.existsSync(file) ? read(file) : '';
  if (cur.includes(MARK_START) && cur.includes(MARK_END)) {
    cur = cur.replace(new RegExp(`${MARK_START}[\\s\\S]*?${MARK_END}`), wrapped);
  } else {
    cur = cur.replace(/\s*$/, '') + (cur ? '\n\n' : '') + wrapped + '\n';
  }
  fs.writeFileSync(file, cur);
  return file;
}
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}
function whichAap() {
  // Command used by installed hooks. Prefer a global install; fall back to npx from GitHub.
  return 'command -v aap >/dev/null 2>&1 && aap || npx --yes github:anshuljhawar/ai-artifact-provenance';
}

function cmdInit() {
  const dir = path.resolve(args[0] || '.');
  const done = [];
  const body = agentsText();
  // 1. Instruction files read by most agents.
  done.push('wrote section in ' + upsertSection(path.join(dir, 'AGENTS.md'), body));
  const claudeMd = path.join(dir, 'CLAUDE.md');
  const claudeCur = fs.existsSync(claudeMd) ? read(claudeMd) : '';
  if (!/^@AGENTS\.md\s*$/m.test(claudeCur) && !claudeCur.includes(MARK_START)) {
    fs.writeFileSync(claudeMd, claudeCur.replace(/\s*$/, '') + (claudeCur ? '\n\n' : '') + '@AGENTS.md\n');
    done.push('imported AGENTS.md from ' + claudeMd);
  }
  done.push('wrote section in ' + upsertSection(path.join(dir, 'GEMINI.md'), body));
  const cursorDir = path.join(dir, '.cursor', 'rules');
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(path.join(cursorDir, 'ai-artifact-provenance.mdc'), `---\ndescription: AI-generated documents must carry an ai-artifact-provenance block\nalwaysApply: true\n---\n${body}\n`);
  done.push('wrote .cursor/rules/ai-artifact-provenance.mdc');
  // 2. Claude Code project hook (vendor gate at publish time).
  if (!flags.has('--no-claude-hook')) {
    const settingsPath = path.join(dir, '.claude', 'settings.json');
    let settings = {};
    if (fs.existsSync(settingsPath)) { try { settings = JSON.parse(read(settingsPath)); } catch { settings = {}; } }
    settings.hooks = settings.hooks || {};
    settings.hooks.PreToolUse = settings.hooks.PreToolUse || [];
    const hookCmd = `sh -c '${whichAap()} hook'`;
    const already = settings.hooks.PreToolUse.some(h => JSON.stringify(h).includes('ai-artifact-provenance') || JSON.stringify(h).includes('aap hook'));
    if (!already) {
      settings.hooks.PreToolUse.push({ matcher: 'Artifact|Write', hooks: [{ type: 'command', command: hookCmd }] });
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
      done.push('added Claude Code PreToolUse hook in .claude/settings.json');
    }
  }
  // 3. Git pre-commit gate (vendor-neutral).
  const gitDir = path.join(dir, '.git');
  if (!flags.has('--no-git-hook') && fs.existsSync(gitDir)) {
    const hookFile = path.join(gitDir, 'hooks', 'pre-commit');
    const script = `#!/bin/sh\n# ai-artifact-provenance: refuse to commit AI-generated html/md documents without a valid block.\n# Files listing "ai-artifact-provenance: skip" anywhere are ignored, as are files under node_modules.\nfiles=$(git diff --cached --name-only --diff-filter=ACM | grep -Ei '\\.(html?|md|markdown)$' | grep -v node_modules || true)\n[ -z "$files" ] && exit 0\ncheck=""\nfor f in $files; do\n  [ -f "$f" ] || continue\n  grep -q 'ai-artifact-provenance: skip' "$f" && continue\n  case "$f" in README.md|CLAUDE.md|AGENTS.md|GEMINI.md|CHANGELOG.md|LICENSE.md|SPEC.md) continue;; esac\n  grep -q 'ai-artifact-provenance' "$f" || continue   # only gate files that claim to carry a block\n  check="$check $f"\ndone\n[ -z "$check" ] && exit 0\n${whichAap()} check $check\n`;
    if (!fs.existsSync(hookFile)) { fs.mkdirSync(path.dirname(hookFile), { recursive: true }); fs.writeFileSync(hookFile, script, { mode: 0o755 }); done.push('installed git pre-commit hook'); }
    else if (!read(hookFile).includes('ai-artifact-provenance')) { fs.appendFileSync(hookFile, '\n' + script.replace('#!/bin/sh\n', '')); done.push('appended to existing git pre-commit hook'); }
  }
  // 4. Skills for agents that support the skills folder convention.
  const skillSrc = path.join(ROOT, 'skills', 'ai-artifact-provenance');
  if (flags.has('--codex')) {
    const dst = path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills', 'ai-artifact-provenance');
    copyDir(skillSrc, dst); done.push('installed Codex skill at ' + dst);
  }
  if (flags.has('--claude-skill')) {
    const dst = path.join(os.homedir(), '.claude', 'skills', 'ai-artifact-provenance');
    copyDir(skillSrc, dst); done.push('installed Claude Code user skill at ' + dst);
  }
  console.log('ai-artifact-provenance init:\n' + done.map(d => '  - ' + d).join('\n'));
  console.log('\nNext: for Claude Code, also `claude plugin marketplace add anshuljhawar/ai-artifact-provenance` then `/plugin install ai-artifact-provenance` (skill + hook, kept up to date).');
  console.log('For web-only agents (ChatGPT, Grok, claude.ai) paste prompts/paste.md into the conversation.');
}

switch (cmd) {
  case 'check': cmdCheck(); break;
  case 'show': cmdShow(); break;
  case 'questions': cmdQuestions(); break;
  case 'render': cmdRender(); break;
  case 'add': cmdAdd(); break;
  case 'hook': cmdHook(); break;
  case 'init': cmdInit(); break;
  case 'snippet': console.log(RENDERER); break;
  case 'agents-md': console.log(agentsText()); break;
  case 'schema': console.log(read(path.join(ROOT, 'schema', 'ai-artifact-provenance.schema.json'))); break;
  default: console.log(USAGE); process.exit(cmd ? 2 : 0);
}

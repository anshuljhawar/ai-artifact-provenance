'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execFileSync, spawnSync } = require('child_process');
const core = require('../lib/core.js');

const BIN = path.join(__dirname, '..', 'bin', 'aap.js');
const good = () => ({
  ai_artifact_provenance: '0.1', title: 'T', ask: 'do the thing', purpose: 'p', audience: 'a', status: 'draft', owner: 'me',
  generator: { tool: 'Claude Code', model: 'x' }, created: '2026-09-16', updated: '2026-09-16',
  inputs: ['a.csv'], constraints: ['short'], assumptions: [{ text: 'EU < 20%', confirmed: false }],
  decisions: [{ id: 'D1', decision: 'Pick A', why: 'cheaper', quote: 'go cheap', rejected: [{ option: 'B', why: 'pricey' }] }],
  unknowns: [{ text: 'onboarding time', how_to_check: 'ask sales' }],
  changelog: [{ version: 1, date: '2026-09-16', trigger: 'do the thing', changed: 'first' }],
});
const html = (obj, extra = '') => `<!doctype html><html><head><title>t</title><script type="application/json" id="ai-artifact-provenance">${JSON.stringify(obj)}</script></head><body><h1>hi</h1>${extra}</body></html>`;
const md = obj => `# Doc\n\ntext\n\n\`\`\`json ai-artifact-provenance\n${JSON.stringify(obj)}\n\`\`\`\n`;

test('valid html block passes, warns about missing panel', () => {
  const r = core.validate(html(good()), { kind: 'html' });
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.ok(r.warnings.some(w => /panel/.test(w)));
  assert.equal(r.data.decisions[0].rejected[0].option, 'B');
});

test('panel marker removes the warning', () => {
  const r = core.validate(html(good(), '<script data-ai-artifact-provenance-panel>1</script>'), { kind: 'html' });
  assert.ok(!r.warnings.some(w => /panel/.test(w)));
});

test('markdown block passes and kind is detected from filename', () => {
  const r = core.validate(md(good()), { filename: 'x.md' });
  assert.equal(r.ok, true, r.errors.join('\n'));
  assert.equal(r.kind, 'md');
});

test('missing block fails', () => {
  const r = core.validate('<html><body>x</body></html>', { kind: 'html' });
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /No ai-artifact-provenance block/);
});

test('required fields enforced', () => {
  const g = good(); delete g.ask; delete g.assumptions; g.status = 'final';
  const r = core.validate(html(g), { kind: 'html' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.some(e => /"ask" is required/.test(e)));
  assert.ok(r.errors.some(e => /"assumptions" is required/.test(e)));
  assert.ok(r.errors.some(e => /"status" must be one of/.test(e)));
});

test('changelog must be append-only with increasing versions', () => {
  const g = good(); g.changelog.push({ version: 1, date: '2026-09-17', trigger: 'again' });
  const r = core.validate(html(g), { kind: 'html' });
  assert.ok(r.errors.some(e => /append-only/.test(e)));
});

test('wrong script type is an error; two blocks is an error', () => {
  const s = `<html><head><script id="ai-artifact-provenance">${JSON.stringify(good())}</script></head><body></body></html>`;
  assert.ok(core.validate(s, { kind: 'html' }).errors.some(e => /application\/json/.test(e)));
  const two = html(good()).replace('</head>', `<script type="application/json" id="ai-artifact-provenance">{}</script></head>`);
  assert.ok(core.validate(two, { kind: 'html' }).errors.some(e => /Found 2/.test(e)));
});

test('string shorthands normalize to objects', () => {
  const n = core.normalize(good());
  assert.deepEqual(n.inputs[0], { name: 'a.csv' });
  assert.deepEqual(n.constraints[0], { quote: 'short' });
  assert.equal(n.assumptions[0].confirmed, false);
});

test('questions derive from assumptions, unknowns, rejected alternatives', () => {
  const qs = core.questions(good()).map(q => q.kind);
  assert.deepEqual(qs.slice(0, 3), ['assumption', 'unknown', 'decision']);
});

test('inject adds block to head and renderer before body end; inject replaces existing', () => {
  const out = core.inject('<html><head></head><body></body></html>', good(), { kind: 'html', renderer: 'X()' });
  assert.match(out, /id="ai-artifact-provenance"/);
  assert.match(out, /<script data-ai-artifact-provenance-panel>X\(\)<\/script>\n<\/body>/);
  const g2 = good(); g2.title = 'Replaced';
  const out2 = core.inject(out, g2, { kind: 'html' });
  assert.equal((out2.match(/id="ai-artifact-provenance"/g) || []).length, 1);
  assert.match(out2, /Replaced/);
  const m = core.inject('# Doc\n', good(), { kind: 'md' });
  assert.match(m, /```json ai-artifact-provenance/);
});

test('panelHtml escapes and includes sections', () => {
  const g = good(); g.ask = '<b>x</b>';
  const p = core.panelHtml(g);
  assert.match(p, /&lt;b&gt;x&lt;\/b&gt;/);
  assert.match(p, /Rejected: B/);
  assert.match(p, /data-ai-artifact-provenance-panel/);
});

test('examples validate', () => {
  for (const f of ['examples/decision-memo.html', 'examples/status-report.md']) {
    const p = path.join(__dirname, '..', f);
    const r = core.validate(fs.readFileSync(p, 'utf8'), { filename: p });
    assert.equal(r.ok, true, `${f}: ${r.errors.join('; ')}`);
  }
});

test('cli check exits 1 on invalid, 0 on valid', () => {
  const tmp = path.join(require('os').tmpdir(), `aap-${process.pid}.html`);
  fs.writeFileSync(tmp, '<html></html>');
  assert.equal(spawnSync('node', [BIN, 'check', tmp]).status, 1);
  fs.writeFileSync(tmp, html(good()));
  assert.equal(spawnSync('node', [BIN, 'check', tmp]).status, 0);
  fs.unlinkSync(tmp);
});

test('hook blocks Artifact publish of html without block, allows with block, ignores other tools', () => {
  const tmp = path.join(require('os').tmpdir(), `aap-hook-${process.pid}.html`);
  fs.writeFileSync(tmp, '<html></html>');
  const run = input => spawnSync('node', [BIN, 'hook'], { input: JSON.stringify(input) });
  assert.equal(run({ tool_name: 'Artifact', tool_input: { file_path: tmp } }).status, 2);
  assert.equal(run({ tool_name: 'Artifact', tool_input: { file_path: tmp, action: 'read' } }).status, 0);
  assert.equal(run({ tool_name: 'Bash', tool_input: { command: 'ls' } }).status, 0);
  fs.writeFileSync(tmp, html(good()));
  assert.equal(run({ tool_name: 'Artifact', tool_input: { file_path: tmp } }).status, 0);
  assert.equal(run({ tool_name: 'Write', tool_input: { file_path: 'x.html', content: '<html></html>' } }).status, 0, 'Write not gated by default');
  assert.equal(spawnSync('node', [BIN, 'hook'], { input: JSON.stringify({ tool_name: 'Write', tool_input: { file_path: 'x.html', content: '<html></html>' } }), env: { ...process.env, AAP_GATE_WRITE: '1' } }).status, 2);
  fs.unlinkSync(tmp);
});

test('init is idempotent and writes the expected files', () => {
  const dir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'aap-init-'));
  execFileSync('git', ['init', '-q'], { cwd: dir });
  fs.writeFileSync(path.join(dir, 'CLAUDE.md'), '# existing\n');
  execFileSync('node', [BIN, 'init', dir]);
  execFileSync('node', [BIN, 'init', dir]);
  const agents = fs.readFileSync(path.join(dir, 'AGENTS.md'), 'utf8');
  assert.equal((agents.match(/ai-artifact-provenance:start/g) || []).length, 1);
  assert.match(fs.readFileSync(path.join(dir, 'CLAUDE.md'), 'utf8'), /^@AGENTS\.md$/m);
  assert.ok(fs.existsSync(path.join(dir, 'GEMINI.md')));
  assert.ok(fs.existsSync(path.join(dir, '.cursor', 'rules', 'ai-artifact-provenance.mdc')));
  assert.ok(fs.existsSync(path.join(dir, '.git', 'hooks', 'pre-commit')));
  const settings = JSON.parse(fs.readFileSync(path.join(dir, '.claude', 'settings.json'), 'utf8'));
  assert.equal(settings.hooks.PreToolUse.length, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('inline renderer never contains a closing script tag', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'templates', 'panel.js'), 'utf8');
  assert.ok(!/<\/script/i.test(src), 'renderer would terminate the inline <script> early');
  assert.ok(!/<\/body/i.test(src));
});

'use strict';
// ai-artifact-provenance core: locate, parse, validate, normalize, render. Zero dependencies.

const SPEC_VERSION = '0.1';
const STATUSES = ['draft', 'proposal', 'decided', 'superseded'];
const HTML_RE = /<script\b([^>]*)\bid=["']ai-artifact-provenance["']([^>]*)>([\s\S]*?)<\/script>/gi;
const MD_RE = /```json[ \t]+ai-artifact-provenance[ \t]*\r?\n([\s\S]*?)```/g;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function kindOf(filename, content) {
  if (filename && /\.(html?|xhtml)$/i.test(filename)) return 'html';
  if (filename && /\.(md|markdown)$/i.test(filename)) return 'md';
  if (/<html[\s>]|<!doctype html/i.test(content || '')) return 'html';
  return 'md';
}

/** Find raw block(s). Returns { kind, raw, count } where raw is the JSON text of the first match. */
function locate(content, kind) {
  const re = kind === 'html' ? HTML_RE : MD_RE;
  re.lastIndex = 0;
  const matches = [];
  let m;
  while ((m = re.exec(content)) !== null) {
    if (kind === 'html') {
      const attrs = (m[1] + ' ' + m[2]).toLowerCase();
      matches.push({ raw: m[3], typeOk: /type=["']application\/json["']/.test(attrs) });
    } else {
      matches.push({ raw: m[1], typeOk: true });
    }
  }
  return { kind, count: matches.length, raw: matches.length ? matches[0].raw : null, typeOk: matches.length ? matches[0].typeOk : true };
}

function asObj(x, key) {
  if (x == null) return null;
  if (typeof x === 'string') return { [key]: x };
  if (typeof x === 'object') return x;
  return null;
}

/** Turn string shorthands into objects. Does not mutate input. */
function normalize(d) {
  const n = JSON.parse(JSON.stringify(d));
  n.inputs = (n.inputs || []).map(x => asObj(x, 'name')).filter(Boolean);
  n.constraints = (n.constraints || []).map(x => asObj(x, 'quote')).filter(Boolean);
  n.assumptions = (n.assumptions || []).map(x => asObj(x, 'text')).filter(Boolean).map(a => ({ confirmed: false, ...a }));
  n.decisions = (n.decisions || []).map(x => asObj(x, 'decision')).filter(Boolean).map((dd, i) => ({
    id: dd.id || `D${i + 1}`, superseded_by: null, ...dd,
    rejected: (dd.rejected || []).map(r => asObj(r, 'option')).filter(Boolean),
  }));
  n.unknowns = (n.unknowns || []).map(x => asObj(x, 'text')).filter(Boolean);
  n.changelog = Array.isArray(n.changelog) ? n.changelog : [];
  n.links = n.links && typeof n.links === 'object' ? n.links : {};
  n.generator = n.generator && typeof n.generator === 'object' ? n.generator : {};
  return n;
}

/** Validate a document's content. Returns { ok, errors, warnings, data, kind }. */
function validate(content, opts = {}) {
  const errors = [];
  const warnings = [];
  const kind = opts.kind || kindOf(opts.filename, content);
  const loc = locate(content, kind);

  if (loc.count === 0) {
    errors.push(kind === 'html'
      ? 'No ai-artifact-provenance block. Add <script type="application/json" id="ai-artifact-provenance">{...}</script> in <head>.'
      : 'No ai-artifact-provenance block. Add a fenced code block with info string `json ai-artifact-provenance`.');
    return { ok: false, errors, warnings, data: null, kind };
  }
  if (loc.count > 1) errors.push(`Found ${loc.count} ai-artifact-provenance blocks; exactly one is allowed.`);
  if (!loc.typeOk) errors.push('The ai-artifact-provenance <script> must have type="application/json".');

  let data;
  try { data = JSON.parse(loc.raw); } catch (e) { errors.push(`ai-artifact-provenance block is not valid JSON: ${e.message}`); return { ok: false, errors, warnings, data: null, kind }; }
  if (!data || typeof data !== 'object' || Array.isArray(data)) { errors.push('ai-artifact-provenance block must be a JSON object.'); return { ok: false, errors, warnings, data: null, kind }; }

  const str = (k, req) => {
    const v = data[k];
    if (v == null || v === '') { if (req) errors.push(`"${k}" is required.`); return; }
    if (typeof v !== 'string') errors.push(`"${k}" must be a string.`);
  };
  const arr = (k, req, itemKey) => {
    const v = data[k];
    if (v == null) { if (req) errors.push(`"${k}" is required (use [] if there are none).`); return; }
    if (!Array.isArray(v)) { errors.push(`"${k}" must be an array.`); return; }
    v.forEach((x, i) => {
      if (typeof x === 'string') { if (!x.trim()) errors.push(`"${k}[${i}]" is empty.`); return; }
      if (!x || typeof x !== 'object') { errors.push(`"${k}[${i}]" must be a string or object.`); return; }
      if (typeof x[itemKey] !== 'string' || !x[itemKey].trim()) errors.push(`"${k}[${i}].${itemKey}" is required.`);
    });
  };

  if (data.ai_artifact_provenance !== SPEC_VERSION) errors.push(`"ai_artifact_provenance" must be "${SPEC_VERSION}".`);
  str('ask', true); str('owner', true); str('updated', true); str('title'); str('purpose'); str('audience'); str('created'); str('how_to_question');
  if (data.status == null) errors.push('"status" is required.');
  else if (!STATUSES.includes(data.status)) errors.push(`"status" must be one of ${STATUSES.join(', ')}.`);
  if (!data.generator || typeof data.generator !== 'object') errors.push('"generator" is required, with at least "tool".');
  else if (typeof data.generator.tool !== 'string' || !data.generator.tool.trim()) errors.push('"generator.tool" is required.');
  if (typeof data.updated === 'string' && !DATE_RE.test(data.updated)) errors.push('"updated" must be YYYY-MM-DD.');
  if (typeof data.created === 'string' && !DATE_RE.test(data.created)) errors.push('"created" must be YYYY-MM-DD.');

  arr('inputs', false, 'name'); arr('constraints', false, 'quote'); arr('assumptions', true, 'text');
  arr('decisions', false, 'decision'); arr('unknowns', true, 'text');
  (data.decisions || []).forEach((dd, i) => {
    if (dd && typeof dd === 'object' && dd.rejected != null) {
      if (!Array.isArray(dd.rejected)) errors.push(`"decisions[${i}].rejected" must be an array.`);
      else dd.rejected.forEach((r, j) => { if (typeof r !== 'string' && (!r || typeof r.option !== 'string')) errors.push(`"decisions[${i}].rejected[${j}]" needs "option".`); });
    }
  });

  if (!Array.isArray(data.changelog) || data.changelog.length === 0) errors.push('"changelog" must be a non-empty array; add one entry per publish.');
  else {
    let prev = 0;
    data.changelog.forEach((c, i) => {
      if (!c || typeof c !== 'object') { errors.push(`"changelog[${i}]" must be an object.`); return; }
      if (!Number.isInteger(c.version) || c.version < 1) errors.push(`"changelog[${i}].version" must be a positive integer.`);
      else if (c.version <= prev) errors.push(`"changelog[${i}].version" (${c.version}) must be greater than the previous (${prev}). Changelog is append-only.`);
      else prev = c.version;
      if (typeof c.date !== 'string' || !DATE_RE.test(c.date)) errors.push(`"changelog[${i}].date" must be YYYY-MM-DD.`);
      if (typeof c.trigger !== 'string' || !c.trigger.trim()) errors.push(`"changelog[${i}].trigger" is required: the user prompt that caused this version, verbatim.`);
    });
    const last = data.changelog[data.changelog.length - 1];
    if (last && typeof last.date === 'string' && typeof data.updated === 'string' && last.date > data.updated) warnings.push(`Last changelog date (${last.date}) is after "updated" (${data.updated}). Bump "updated".`);
  }

  // Advisory
  if (!data.purpose) warnings.push('No "purpose". Readers ask "what is this for?" first.');
  if (!data.audience) warnings.push('No "audience".');
  if (!data.generator || !data.generator.model) warnings.push('No "generator.model".');
  if (!data.decisions || data.decisions.length === 0) warnings.push('No "decisions". If the user changed course during the session, record it.');
  if (Array.isArray(data.assumptions) && data.assumptions.length === 0) warnings.push('"assumptions" is empty. That is a claim that the AI decided nothing on its own; make sure it is true.');
  if (data.status === 'decided' && Array.isArray(data.assumptions) && data.assumptions.some(a => a && typeof a === 'object' && a.confirmed === false)) warnings.push('Status is "decided" but some assumptions are unconfirmed.');
  if (kind === 'html' && !/data-ai-artifact-provenance-panel/.test(content)) warnings.push('No human-readable panel. Include templates/panel.js inline or run `ai-artifact-provenance render`.');

  return { ok: errors.length === 0, errors, warnings, data: errors.length === 0 ? normalize(data) : data, kind };
}

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

/** Static HTML panel from a normalized block. */
function panelHtml(d) {
  const n = normalize(d);
  const last = n.changelog.length ? n.changelog[n.changelog.length - 1].version : 1;
  const li = (a, f) => a.map(x => `<li>${f(x)}</li>`).join('');
  let h = `<details class="ai-artifact-provenance-panel" data-ai-artifact-provenance-panel><summary>How this document was made · ${esc(n.status)} · v${last}</summary>`;
  h += `<p class="aap-meta"><b>${esc(n.status)}</b> · owner ${esc(n.owner)} · ${esc(n.generator.tool)}${n.generator.model ? ' / ' + esc(n.generator.model) : ''} · updated ${esc(n.updated)}</p>`;
  h += `<h4>The ask</h4><blockquote>${esc(n.ask)}</blockquote>`;
  if (n.purpose || n.audience) h += `<p>${n.purpose ? '<b>Purpose:</b> ' + esc(n.purpose) + ' ' : ''}${n.audience ? '<b>Audience:</b> ' + esc(n.audience) : ''}</p>`;
  if (n.constraints.length) h += `<h4>Constraints given</h4><ul>${li(n.constraints, c => `“${esc(c.quote)}”${c.source ? ' <i>(' + esc(c.source) + ')</i>' : ''}`)}</ul>`;
  if (n.assumptions.length) h += `<h4>Assumptions the AI made</h4><ul>${li(n.assumptions, a => `${esc(a.text)} <i>(${a.confirmed ? 'confirmed' : 'unconfirmed'})</i>`)}</ul>`;
  if (n.decisions.length) h += `<h4>Decisions</h4><ul>${li(n.decisions, dd => `<b>${esc(dd.id)}</b> ${esc(dd.decision)}${dd.why ? ' — ' + esc(dd.why) : ''}${dd.quote ? ` <i>“${esc(dd.quote)}”</i>` : ''}${dd.superseded_by ? ` <s>superseded by ${esc(dd.superseded_by)}</s>` : ''}${dd.rejected.length ? `<ul>${li(dd.rejected, r => `Rejected: ${esc(r.option)}${r.why ? ' — ' + esc(r.why) : ''}`)}</ul>` : ''}`)}</ul>`;
  if (n.unknowns.length) h += `<h4>Not verified</h4><ul>${li(n.unknowns, u => `${esc(u.text)}${u.how_to_check ? ' <i>(' + esc(u.how_to_check) + ')</i>' : ''}`)}</ul>`;
  if (n.inputs.length) h += `<h4>Inputs</h4><ul>${li(n.inputs, i => `${esc(i.name)}${i.as_of ? ' <i>as of ' + esc(i.as_of) + '</i>' : ''}${i.note ? ' — ' + esc(i.note) : ''}`)}</ul>`;
  if (n.changelog.length) h += `<h4>Versions</h4><ol reversed>${[...n.changelog].reverse().map(c => `<li>v${c.version} · ${esc(c.date)} · <i>“${esc(c.trigger)}”</i>${c.changed ? ' → ' + esc(c.changed) : ''}</li>`).join('')}</ol>`;
  const links = Object.entries(n.links).filter(([, v]) => v);
  if (links.length) h += `<p>${links.map(([k, v]) => `<a href="${esc(v)}">${esc(k)}</a>`).join(' · ')}</p>`;
  if (n.how_to_question) h += `<p><b>To question this:</b> ${esc(n.how_to_question)}</p>`;
  h += '</details>';
  return h;
}

const PANEL_CSS = `<style data-ai-artifact-provenance-style>.ai-artifact-provenance-panel{font:14px/1.5 system-ui,sans-serif;border:1px solid #c9c9c9;border-radius:6px;padding:8px 14px;margin:0 0 20px;background:#fafafa;color:#222}.ai-artifact-provenance-panel summary{cursor:pointer;font-weight:600}.ai-artifact-provenance-panel h4{margin:12px 0 4px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;opacity:.7}.ai-artifact-provenance-panel ul,.ai-artifact-provenance-panel ol{margin:0;padding-left:20px}.ai-artifact-provenance-panel blockquote{margin:0;padding-left:10px;border-left:3px solid #999}.aap-meta{margin:6px 0 0;opacity:.8}@media (prefers-color-scheme:dark){.ai-artifact-provenance-panel{background:#1c1c1e;border-color:#444;color:#e6e6e6}.ai-artifact-provenance-panel blockquote{border-color:#666}}</style>`;

/** Reviewer questions derived from the block. Returns array of {kind, q}. */
function questions(d) {
  const n = normalize(d);
  const out = [];
  n.assumptions.filter(a => !a.confirmed).forEach(a => out.push({ kind: 'assumption', q: `Is it true that ${a.text.replace(/\.$/, '')}? The AI assumed this and nobody confirmed it.` }));
  n.unknowns.forEach(u => out.push({ kind: 'unknown', q: `Has this been checked: ${u.text.replace(/\.$/, '')}?${u.how_to_check ? ' (' + u.how_to_check + ')' : ''}` }));
  n.decisions.filter(dd => !dd.superseded_by).forEach(dd => {
    if (dd.rejected.length) out.push({ kind: 'decision', q: `Why "${dd.decision.replace(/\.$/, '')}" over ${dd.rejected.map(r => r.option).join(' / ')}?${dd.why ? ' Stated reason: ' + dd.why : ''}` });
    else if (dd.quote) out.push({ kind: 'decision', q: `${dd.id} came from the instruction “${dd.quote}”. Does that still hold?` });
  });
  n.constraints.forEach(c => out.push({ kind: 'constraint', q: `Does the constraint “${c.quote}” still apply?` }));
  n.inputs.filter(i => i.as_of).forEach(i => out.push({ kind: 'input', q: `${i.name} is as of ${i.as_of}. Is that still current?` }));
  if (n.status !== 'decided') out.push({ kind: 'status', q: `Status is "${n.status}". Who decides, and by when?` });
  return out;
}

/** Insert or replace the block (and renderer) in a document. */
function inject(content, block, opts = {}) {
  const kind = opts.kind || kindOf(opts.filename, content);
  const json = JSON.stringify(block, null, 2);
  if (kind === 'html') {
    const tag = `<script type="application/json" id="ai-artifact-provenance">\n${json}\n</script>`;
    HTML_RE.lastIndex = 0;
    let out = HTML_RE.test(content) ? content.replace(HTML_RE, tag) : (/<\/head>/i.test(content) ? content.replace(/<\/head>/i, `${tag}\n</head>`) : tag + '\n' + content);
    if (opts.renderer && !/data-ai-artifact-provenance-panel/.test(out)) {
      const snippet = `<script data-ai-artifact-provenance-panel>${opts.renderer}</script>`;
      out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${snippet}\n</body>`) : out + '\n' + snippet;
    }
    return out;
  }
  const fence = '```json ai-artifact-provenance\n' + json + '\n```';
  MD_RE.lastIndex = 0;
  return MD_RE.test(content) ? content.replace(MD_RE, fence) : content.replace(/\s*$/, '') + '\n\n## Provenance\n\n' + fence + '\n';
}

function skeleton(overrides = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return {
    ai_artifact_provenance: SPEC_VERSION, title: '', ask: '', purpose: '', audience: '', status: 'draft', owner: '',
    generator: { tool: '', model: '' }, created: today, updated: today,
    inputs: [], constraints: [], assumptions: [], decisions: [], unknowns: [],
    changelog: [{ version: 1, date: today, trigger: '', changed: 'First draft.' }],
    links: {}, how_to_question: 'Send this file to your own assistant and ask it to read the ai-artifact-provenance block.',
    ...overrides,
  };
}

module.exports = { SPEC_VERSION, STATUSES, kindOf, locate, normalize, validate, panelHtml, PANEL_CSS, questions, inject, skeleton, esc };

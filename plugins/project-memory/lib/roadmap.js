'use strict';
// Puts roadmap.md into the fixed section order without touching item text.
// It only moves whole `##` sections, merges duplicate required headings,
// restores missing required sections and Hard constraints sub-headers, and
// normalizes the blank lines between sections.

const REQUIRED = ['Hard constraints', 'Awaiting verification', 'Queue', 'Parked', 'Open questions'];
const HC = 'hard constraints';
const WA = 'working agreements';
const ACTIVE = 'active';
const RULES_RE = /^###\s+rules for claude\s*$/i;
const TECH_RE = /^###\s+technical limits & requirements\s*$/i;
const FENCE_RE = /^\s*(```|~~~)/;

const keyOf = (name) => String(name).trim().toLowerCase();

function trimTrailingBlank(lines) {
  const out = lines.slice();
  while (out.length && !out[out.length - 1].trim()) out.pop();
  return out;
}

function parse(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  const preamble = [];
  const sections = [];
  let fence = null;
  for (const line of lines) {
    const f = FENCE_RE.exec(line);
    if (f) fence = fence === null ? f[1] : (fence === f[1] ? null : fence);
    const m = fence === null && !f ? /^## (.*)$/.exec(line) : null;
    if (m) {
      sections.push({ name: m[1].trim(), key: keyOf(m[1]), headingLine: line, body: [] });
    } else if (sections.length) {
      sections[sections.length - 1].body.push(line);
    } else {
      preamble.push(line);
    }
  }
  return { eol, preamble, sections };
}

// Index of the first line that isn't blank or inside an HTML comment.
function firstContentLine(body) {
  let inComment = false;
  for (let i = 0; i < body.length; i++) {
    const l = body[i].trim();
    if (inComment) {
      if (l.includes('-->')) inComment = false;
      continue;
    }
    if (!l) continue;
    if (l.startsWith('<!--')) {
      if (!l.includes('-->')) inComment = true;
      continue;
    }
    return i;
  }
  return -1;
}

// The sub-header line plus the template's comment line right after it.
function templateSubHeader(templateHc, re, fallback) {
  const body = templateHc ? templateHc.body : [];
  const i = body.findIndex((l) => re.test(l));
  if (i < 0) return [fallback];
  const next = body[i + 1];
  return next !== undefined && next.trim().startsWith('<!--') ? [body[i], next] : [body[i]];
}

function ensureSubHeaders(body, templateHc) {
  let out = trimTrailingBlank(body);
  if (!out.some((l) => RULES_RE.test(l))) {
    const lines = templateSubHeader(templateHc, RULES_RE, '### Rules for Claude');
    const tech = out.findIndex((l) => TECH_RE.test(l));
    const content = firstContentLine(out);
    let at = content < 0 ? out.length : content;
    if (tech >= 0 && tech < at) at = tech;
    out = [...out.slice(0, at), ...lines, ...out.slice(at)];
  }
  if (!out.some((l) => TECH_RE.test(l))) {
    out = [...out, ...templateSubHeader(templateHc, TECH_RE, '### Technical limits & requirements')];
  }
  return out;
}

function cells(row) {
  return row.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
}

function countUndatedRows(body) {
  const start = body.findIndex((l) => /^\s*\|/.test(l));
  if (start < 0) return 0;
  const headerCells = cells(body[start]).length;
  let n = 0;
  for (let i = start + 2; i < body.length && /^\s*\|/.test(body[i]); i++) {
    const c = cells(body[i]);
    if (headerCells < 3 || !c[2]) n++;
  }
  return n;
}

function tidyRoadmap(text, templateText, keep = []) {
  const input = String(text);
  const { eol, preamble, sections } = parse(input);
  const template = parse(String(templateText)).sections;
  const keepKeys = new Set(keep.map(keyOf));
  const requiredKeys = REQUIRED.map(keyOf);

  // First occurrence of each required heading, with duplicates merged in.
  const merged = new Map();
  const others = [];
  for (const s of sections) {
    if (!requiredKeys.includes(s.key)) {
      others.push(s);
      continue;
    }
    const first = merged.get(s.key);
    if (!first) {
      merged.set(s.key, { ...s, body: s.body.slice() });
    } else {
      first.body = [...trimTrailingBlank(first.body), '', ...s.body];
    }
  }

  const legacy = !merged.has(HC) && others.some((s) => s.key === WA);
  const blocks = [];
  const pre = trimTrailingBlank(preamble);
  if (pre.length) blocks.push(pre);
  let rest = others;
  for (const key of requiredKeys) {
    if (key === HC && legacy) {
      const wa = others.find((s) => s.key === WA);
      rest = others.filter((s) => s !== wa);
      blocks.push([wa.headingLine, ...trimTrailingBlank(wa.body)]);
      continue;
    }
    const s = merged.get(key) || template.find((t) => t.key === key) ||
      { headingLine: `## ${REQUIRED[requiredKeys.indexOf(key)]}`, body: [] };
    const body = key === HC ? ensureSubHeaders(s.body, template.find((t) => t.key === HC)) : trimTrailingBlank(s.body);
    blocks.push([s.headingLine, ...body]);
  }
  for (const s of rest) blocks.push([s.headingLine, ...trimTrailingBlank(s.body)]);

  const lines = [];
  blocks.forEach((b, i) => {
    if (i > 0) lines.push('');
    lines.push(...b);
  });
  const output = lines.join(eol) + eol;

  const av = merged.get(keyOf('Awaiting verification'));
  const notes = {
    activeSection: others.some((s) => s.key === ACTIVE),
    legacyWorkingAgreements: legacy,
    extraSections: others
      .filter((s) => s.key !== ACTIVE && !(legacy && s.key === WA) && !keepKeys.has(s.key))
      .map((s) => s.name),
    undatedVerificationRows: av ? countUndatedRows(av.body) : 0,
  };
  return { text: output, changed: output !== input, notes };
}

module.exports = { REQUIRED, tidyRoadmap };

'use strict';

const COMMENT_RE = /<!--[\s\S]*?-->/g;
const TABLE_ROW_RE = /^\s*\|/;
const TABLE_SEP_RE = /^\s*\|[\s:|-]+\|?\s*$/;

// Template guidance lives in HTML comments; it must never reach the context.
const stripComments = (text) => String(text).replace(COMMENT_RE, '');

// A table with only its header and separator row carries no content.
function isEmptyTable(body) {
  const lines = body.split(/\r?\n/).filter((l) => l.trim());
  return lines.length === 2 && TABLE_ROW_RE.test(lines[0]) && TABLE_SEP_RE.test(lines[1]);
}

// Returns the section body without comments, '' when it has no content, or
// null when the heading is missing.
function getSection(markdown, heading) {
  const want = String(heading).trim().toLowerCase();
  const lines = String(markdown).split(/\r?\n/);
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const m = /^## (.*)$/.exec(lines[i]);
    if (m && m[1].trim().toLowerCase() === want) { start = i + 1; break; }
  }
  if (start < 0) return null;
  let end = lines.length;
  for (let i = start; i < lines.length; i++) {
    if (/^#{1,2} /.test(lines[i])) { end = i; break; }
  }
  const body = stripComments(lines.slice(start, end).join('\n'))
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .trim();
  return isEmptyTable(body) ? '' : body;
}

module.exports = { getSection };

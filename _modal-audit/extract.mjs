// Static extractor: scans src/*.js for openModal(title, body, footer) calls,
// extracts each modal body template literal, substitutes ${...} placeholders,
// writes one HTML file per modal to _modal-audit/modals/.
//
// This is a brace/template-literal aware walker — not a full JS parser.
// It works because this codebase passes the body as a literal (template
// literal or string concatenation), not a variable reference.

import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { resolve, join, basename } from 'path';

const SRC_DIR = resolve('src');
const OUT_DIR = resolve('_modal-audit', 'modals');
mkdirSync(OUT_DIR, { recursive: true });

function extractArgs(src, openParen) {
  let i = openParen + 1;
  let depth = 1;
  const args = [];
  let cur = '';
  let inStr = null;
  let escape = false;
  // Track template-literal ${ } nesting depth
  const tplStack = []; // stack of "in expression" flags within nested templates
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (escape) { cur += c; escape = false; i++; continue; }
    if (inStr === '`') {
      if (c === '\\') { cur += c; escape = true; i++; continue; }
      if (c === '$' && src[i+1] === '{') {
        cur += '${';
        tplStack.push(depth); // depth at which matching } will return us
        depth++;
        inStr = null;
        i += 2;
        continue;
      }
      if (c === '`') {
        cur += c;
        inStr = null;
        i++;
        continue;
      }
      cur += c; i++; continue;
    }
    if (inStr === "'" || inStr === '"') {
      if (c === '\\') { cur += c; escape = true; i++; continue; }
      if (c === inStr) { inStr = null; }
      cur += c; i++; continue;
    }
    // Not in string
    if (c === '`') { inStr = '`'; cur += c; i++; continue; }
    if (c === "'" || c === '"') { inStr = c; cur += c; i++; continue; }
    if (c === '{') {
      depth++;
      cur += c; i++; continue;
    }
    if (c === '}') {
      depth--;
      if (depth === 0) {
        if (cur.trim().length) args.push(cur.trim());
        return { args, end: i };
      }
      if (tplStack.length && depth === tplStack[tplStack.length - 1]) {
        tplStack.pop();
        cur += c;
        inStr = '`';
        i++;
        continue;
      }
      cur += c; i++; continue;
    }
    if (c === '(' || c === '[') { depth++; cur += c; i++; continue; }
    if (c === ')' || c === ']') {
      depth--;
      if (depth === 0) {
        if (cur.trim().length) args.push(cur.trim());
        return { args, end: i };
      }
      cur += c; i++; continue;
    }
    if (c === ',' && depth === 1 && !inStr) {
      args.push(cur.trim());
      cur = '';
      i++; continue;
    }
    cur += c; i++;
  }
  return { args, end: i };
}

// Strip a template-literal expression starting at index 0 of `s` (s starts with `${`)
// Returns the substring inside ${...} and the index after the closing brace.
function readTplExpr(s, start) {
  // s[start..start+1] === '${'
  let i = start + 2;
  let depth = 1;
  let str = null;
  let esc = false;
  while (i < s.length && depth > 0) {
    const c = s[i];
    if (esc) { esc = false; i++; continue; }
    if (str) {
      if (c === '\\') { esc = true; i++; continue; }
      if (c === str) str = null;
      i++; continue;
    }
    if (c === "'" || c === '"' || c === '`') { str = c; i++; continue; }
    if (c === '{') depth++;
    else if (c === '}') depth--;
    i++;
  }
  return { expr: s.slice(start + 2, i - 1), end: i };
}

function substitutePlaceholders(src) {
  // Replace ${...} with a placeholder string.
  let out = '';
  let i = 0;
  while (i < src.length) {
    if (src[i] === '$' && src[i+1] === '{') {
      const { expr, end } = readTplExpr(src, i);
      // Heuristic: keep certain expression shapes verbatim so layout is realistic.
      const trimmed = expr.trim();
      // If the expression is an interpolated map/join that emits HTML, replace with
      // a minimal visible row so list rendering produces *some* content.
      if (/\.map\(|\.join\(/.test(trimmed)) {
        out += '<div>x</div>';
      } else if (/^esc\(/.test(trimmed) || /^[A-Za-z_$][\w$.]*$/.test(trimmed)) {
        out += 'x';
      } else if (/\?\s*['"`]/.test(trimmed)) {
        // Ternary returning a string — leave empty
        out += '';
      } else {
        out += 'x';
      }
      i = end;
      continue;
    }
    out += src[i];
    i++;
  }
  return out;
}

function stripQuotes(s) {
  const t = s.trim();
  if (!t) return '';
  if ((t.startsWith('`') && t.endsWith('`')) ||
      (t.startsWith("'") && t.endsWith("'")) ||
      (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  // Concatenated strings like 'a' + b + 'c'
  if (/\+/.test(t)) {
    // Pull out only the quoted literal segments
    const parts = [];
    const re = /(['"`])((?:\\.|(?!\1).)*)\1/g;
    let m;
    while ((m = re.exec(t))) parts.push(m[2]);
    return parts.join('');
  }
  return null; // not a literal — skip
}

function asStringLiteral(s) {
  const u = stripQuotes(s);
  return u;
}

const modals = [];

for (const f of readdirSync(SRC_DIR)) {
  if (!f.endsWith('.js')) continue;
  const filepath = join(SRC_DIR, f);
  const src = readFileSync(filepath, 'utf8');
  const calls = [];
  const re = /openModal\s*\(/g;
  let m;
  while ((m = re.exec(src))) {
    const openParen = m.index + m[0].length - 1;
    const { args, end } = extractArgs(src, openParen);
    if (args.length < 2) continue;
    const titleSrc = args[0];
    const bodySrc = args[1];
    const footerSrc = args[2] || '';
    const wideSrc = args[3] || '';

    const titleStr = asStringLiteral(titleSrc);
    const bodyStr = asStringLiteral(bodySrc);
    if (bodyStr === null) continue; // body not a literal — skip dynamic ones
    const footerStr = footerSrc ? asStringLiteral(footerSrc) : '';

    const title = substitutePlaceholders(titleStr || '(no title)').slice(0, 60);
    const body = substitutePlaceholders(bodyStr);
    const footer = footerStr === null ? '' : substitutePlaceholders(footerStr || '');
    const wide = /true/i.test(wideSrc);

    calls.push({ title, body, footer, wide, sourceLine: src.slice(0, openParen).split('\n').length });
  }

  calls.forEach((c, idx) => {
    const safe = (c.title || `modal-${idx}`).replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 50) || `modal-${idx}`;
    const key = `${basename(f, '.js')}__${idx}__${safe}`;
    modals.push({ key, module: basename(f, '.js'), ...c });
  });
}

writeFileSync(join(OUT_DIR, '_index.json'), JSON.stringify(modals, null, 2));
console.log(`Extracted ${modals.length} modals from ${readdirSync(SRC_DIR).filter(f=>f.endsWith('.js')).length} source files`);
for (const m of modals) {
  console.log(`  ${m.module}:${m.sourceLine} — ${m.title || '(no title)'}`);
}

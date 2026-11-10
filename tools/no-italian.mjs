/**
 * Finds Italian in source code: comments, and (with --strings) string literals.
 *
 *   node tools/no-italian.mjs [--strings] [--json] [paths…]
 *
 * Code, comments, logs and developer-facing messages are English. Text shown to
 * users lives in locale files, which are listed in ALLOW below. A line is flagged
 * when it contains at least two common Italian words (or one Italian word with an
 * accented letter): a heuristic, tuned to have no false positives on English.
 * Exit code 1 when something is found, so CI can block it.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, relative, extname } from 'node:path';

const args = process.argv.slice(2);
const STRINGS = args.includes('--strings');
const JSON_OUT = args.includes('--json');
// --loose: one Italian word is enough (more false positives; for reviewing by hand).
const LOOSE = args.includes('--loose');
const roots = args.filter((a) => !a.startsWith('--'));
const ROOT = process.cwd();

// Files allowed to contain Italian: user-facing text, legal pages, fixtures that reproduce Italian contracts.
let ALLOW = [/(^|\/)node_modules\//, /(^|\/)dist\//, /(^|\/)\.wrangler\//, /(^|\/)test\/golden\//, /(^|\/)test\/fixtures\//, /\.min\.js$/];
const allowFile = join(ROOT, '.italian-allow');
if (existsSync(allowFile)) {
  ALLOW = ALLOW.concat(readFileSync(allowFile, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '§').replace(/\*/g, '[^/]*').replace(/§/g, '.*') + '$')));
}

const WORDS = new Set(('il lo gli della delle dello degli dei del che non sono nel nella nelle negli alla alle allo dalla dalle dal ' +
  'quando questo questa questi queste quello quella quelli anche più già perché ogni essere viene vengono deve devono ' +
  'una uno sulla sulle sul tra fra senza dopo prima poi così cosa chi dove qui qua sempre mai ancora oppure ovvero ' +
  'serve servono quindi altrimenti solo soltanto altro altra niente nessuno nessuna tutto tutti tutte ciò cioè se ' +
  'hanno può possono fa fanno resta restano manca mancano sia siano erano').split(' '));
const ACCENT = /[àèìòùé]/i;

function flagged(text) {
  const words = text.toLowerCase().match(/[a-zàèéìòù']+/g) || [];
  const hits = words.filter((w) => WORDS.has(w.replace(/^[a-z]+'/, ''))).length;
  return hits >= (LOOSE ? 1 : 2) || (hits >= 1 && ACCENT.test(text)) || (LOOSE && ACCENT.test(text)) || /\b(è|perché|più|già|così|cioè)\b/i.test(text);
}

/** Comments and string literals of a JS-like file, with their line numbers. */
function pieces(src) {
  const out = [];
  let line = 1;
  for (let i = 0; i < src.length; i++) {
    const c = src[i], n = src[i + 1];
    if (c === '\n') { line++; continue; }
    if (c === '/' && n === '/') { const end = src.indexOf('\n', i); const t = src.slice(i + 2, end < 0 ? src.length : end); out.push({ kind: 'comment', line, text: t }); i = (end < 0 ? src.length : end) - 1; continue; }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); const t = src.slice(i + 2, end < 0 ? src.length : end); t.split('\n').forEach((l, k) => out.push({ kind: 'comment', line: line + k, text: l })); line += (t.match(/\n/g) || []).length; i = (end < 0 ? src.length : end + 1); continue; }
    if (c === '"' || c === "'" || c === '`') {
      let j = i + 1, t = '';
      while (j < src.length && src[j] !== c) { if (src[j] === '\\') { t += src[j + 1]; j += 2; continue; } t += src[j]; j++; }
      t.split('\n').forEach((l, k) => out.push({ kind: 'string', line: line + k, text: l }));
      line += (t.match(/\n/g) || []).length;
      i = j;
    }
  }
  return out;
}

/** HTML: comments, plus comments and strings inside <script> and <style> blocks. */
function htmlPieces(src) {
  const lineAt = (i) => src.slice(0, i).split('\n').length;
  const out = [...src.matchAll(/<!--([\s\S]*?)-->/g)].map((m) => ({ kind: 'comment', line: lineAt(m.index), text: m[1] }));
  for (const m of src.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const base = lineAt(m.index + m[0].indexOf('>') + 1) - 1;
    for (const p of pieces(m[2])) out.push({ ...p, line: p.line + base });
  }
  return out;
}

const EXT = new Set(['.js', '.mjs', '.cjs', '.css', '.html', '.md', '.yml']);
const files = [];
const walk = (p) => {
  const rel = relative(ROOT, p).split('\\').join('/');
  if (rel && ALLOW.some((re) => re.test(rel) || re.test(rel + '/'))) return;
  if (statSync(p).isDirectory()) { for (const f of readdirSync(p)) if (!f.startsWith('.') || f === '.github') walk(join(p, f)); }
  else if (EXT.has(extname(p))) files.push(p);
};
for (const r of roots.length ? roots : ['.']) walk(join(ROOT, r));

const found = [];
for (const f of files) {
  const src = readFileSync(f, 'utf8');
  const ext = extname(f);
  const items = ['.md', '.yml'].includes(ext) ? src.split('\n').map((text, k) => ({ kind: 'text', line: k + 1, text }))
    : ext === '.html' ? htmlPieces(src)
    : pieces(src);
  for (const it of items) {
    if (it.kind === 'string' && !STRINGS) continue;
    if (flagged(it.text)) found.push({ file: relative(ROOT, f), line: it.line, kind: it.kind, text: it.text.trim().slice(0, 100) });
  }
}

if (JSON_OUT) console.log(JSON.stringify(found, null, 1));
else {
  const byFile = {};
  for (const x of found) (byFile[x.file] ||= []).push(x);
  for (const [f, xs] of Object.entries(byFile)) console.log(`${f}: ${xs.length}`);
  console.log(`${found.length} Italian ${found.length === 1 ? 'line' : 'lines'} in ${Object.keys(byFile).length} files`);
}
process.exit(found.length ? 1 : 0);

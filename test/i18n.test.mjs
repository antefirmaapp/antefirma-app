/**
 * Le lingue: ogni frase passata a t()/tn() nel codice e ogni testo delle
 * pagine HTML ha la sua traduzione in inglese e in spagnolo, con gli stessi
 * segnaposti. Una frase dimenticata resterebbe in italiano per chi usa
 * l'estensione in un'altra lingua.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { t, setLang, resolveLang } from '../src/i18n/index.js';

const dict = globalThis.AF_I18N.dict;

function files(dir, ext) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p, ext) : p.endsWith(ext) ? [p] : [];
  });
}

/** Le frasi letterali dentro t('…') e tn(n, '…', '…'). */
function keysIn(src) {
  const out = [];
  const str = String.raw`'((?:[^'\\]|\\.)*)'`;
  for (const m of src.matchAll(new RegExp(String.raw`\bt\(\s*` + str, 'g'))) out.push(m[1]);
  for (const m of src.matchAll(new RegExp(String.raw`\btn\([^,]+,\s*` + str + String.raw`\s*,\s*` + str, 'g'))) out.push(m[1], m[2]);
  return out.map((s) => s.replace(/\\'/g, "'"));
}

const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(',');

test('ogni frase del codice ha la traduzione inglese e spagnola', () => {
  const missing = [];
  for (const f of files('src', '.js')) {
    if (f.includes('i18n')) continue;
    for (const k of keysIn(readFileSync(f, 'utf8'))) if (!dict[k]) missing.push(`${f}: ${k}`);
  }
  assert.deepEqual(missing, []);
});

test('le traduzioni hanno gli stessi segnaposti dell’italiano', () => {
  const bad = [];
  for (const [k, [en, es]] of Object.entries(dict)) {
    if (!en || !es) bad.push(`vuota: ${k}`);
    else if (vars(en) !== vars(k) || vars(es) !== vars(k)) bad.push(k);
  }
  assert.deepEqual(bad, []);
});

test('t(): lingua, segnaposti, ripiego sull’italiano', () => {
  setLang('en');
  assert.equal(t('Disdici entro {n} giorni', { n: 5 }), 'Cancel within 5 days');
  assert.equal(t('frase che non esiste'), 'frase che non esiste');
  setLang('es');
  assert.equal(t('Torna indietro'), 'Volver atrás');
  setLang('xx');
  assert.equal(t('Torna indietro'), 'Torna indietro');
  assert.equal(resolveLang('auto', 'es-ES'), 'es');
  assert.equal(resolveLang('auto', 'de-DE'), 'en');
  assert.equal(resolveLang('it', 'en-US'), 'it');
  setLang('it');
});

test('etichette e testi dei vocabolari hanno la traduzione', async () => {
  const { RISK_CATEGORIES, LEVELS, ACTION_LABELS, PROTECTION_LABELS } = await import('../src/core/constants.js');
  const { LETTER_LABELS } = await import('../src/core/letter.js');
  const { runConsumerChecks } = await import('../src/core/eu.js');
  const all = [
    ...Object.values(RISK_CATEGORIES).flatMap((c) => [c.label, c.why]),
    ...LEVELS.flatMap((l) => [l.label, l.headline]),
    ...Object.values(ACTION_LABELS), ...Object.values(PROTECTION_LABELS), ...Object.values(LETTER_LABELS),
  ];
  // Le tutele: tutti i controlli, con un testo che li fa scattare tutti o quasi.
  const text = 'arbitrato foro competente rinuncia azioni collettive modifica unilaterale responsabilità nessun rimborso rinnovo tacito vendita dati terze parti addestrare';
  const findings = Object.keys(RISK_CATEGORIES).map((category) => ({ category, severity: 50 }));
  const r = runConsumerChecks({ text, findings, ctx: { form: { bundledConsent: true, precheckedConsents: 1 } }, cost: { notice: { months: 3 }, hasAutoRenewal: true }, actionType: 'purchase', jurisdiction: 'IT' });
  all.push(r.disclaimer, ...r.flags.flatMap((f) => [f.title, f.note]));
  const missing = all.filter((s) => s && !dict[s]);
  assert.deepEqual(missing, []);
});

test('i testi delle pagine HTML hanno la traduzione', () => {
  const missing = [];
  const skip = /^(AnteFirma\*?|PDF|Max|Team|Pro|AF-X{4}(-X{4}){3}|Italiano|English|Español|https?:\/\/\S+)$/;
  for (const f of ['src/options/options.html', 'src/sidepanel/sidepanel.html', 'src/welcome/welcome.html']) {
    const html = readFileSync(f, 'utf8').replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|textarea)[\s\S]*?<\/\1>/g, '');
    const texts = [
      ...[...html.matchAll(/>([^<>]+)</g)].map((m) => m[1]),
      ...[...html.matchAll(/\s(?:placeholder|title|aria-label|alt)="([^"]+)"/g)].map((m) => m[1]),
    ].map((s) => s.replace(/\s+/g, ' ').trim()).filter((s) => /[A-Za-zÀ-ú]{2,}/.test(s) && !skip.test(s));
    for (const s of texts) if (!dict[s.replace(/&amp;/g, '&')]) missing.push(`${f}: ${s}`);
  }
  assert.deepEqual(missing, []);
});

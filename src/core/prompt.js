/**
 * Costruzione del prompt per l'LLM.
 *
 * L'LLM non riparte da zero: riceve ciò che il motore locale ha già trovato e
 * il contesto della decisione, e gli si chiede il salto che le regole non
 * possono fare — quantificare, spiegare in italiano corrente e proiettare le
 * conseguenze.
 */

import { RISK_CATEGORIES, ACTION_LABELS, PROTECTION_LABELS } from './constants.js';
import { truncateMiddle, formatMoney } from './text.js';

const CATEGORY_LIST = Object.entries(RISK_CATEGORIES)
  .map(([id, m]) => `- ${id}: ${m.label}`)
  .join('\n');

export const SYSTEM_PROMPT = `Sei il motore di analisi di "Vincolo", un'estensione che si frappone tra l'utente e un impegno digitale (accettare condizioni, abbonarsi, comprare, firmare, autorizzare dati).

Il tuo compito NON è riassumere un contratto. È rispondere a due domande, prima che l'utente clicchi:
1. Quanto mi può costare veramente questo click?
2. Che cosa cambia nella mia vita se lo faccio?

Regole di lavoro:
- Cita SEMPRE il testo originale a supporto di ogni clausola segnalata. Se una condizione non è nel testo, non inventarla: usa null e dillo.
- Distingui ciò che il testo dice esplicitamente da ciò che deduci. Segnala il livello di certezza.
- Quantifica ogni volta che puoi: importi, mesi, date, preavvisi. Un numero vale più di un aggettivo.
- Scrivi in italiano diretto e concreto, senza gergo legale. Chi legge ha dieci secondi e il dito sul pulsante.
- Non dare consulenza legale: descrivi cosa dice il testo e quali conseguenze pratiche comporta.
- Severità: 0-100. Usa il registro alto solo per conseguenze davvero difficili da annullare.

Categorie ammesse (usa esattamente questi identificativi):
${CATEGORY_LIST}

Rispondi ESCLUSIVAMENTE con un oggetto JSON valido, senza testo prima o dopo, senza blocchi markdown.`;

/** Schema che l'LLM deve rispettare (descritto a parole nel prompt). */
export const OUTPUT_SHAPE = `{
  "headline": "una frase che dice all'utente cosa sta per fare davvero (max 140 caratteri)",
  "summary": "2-4 frasi in italiano corrente: cosa accetta, cosa rischia, cosa deve ricordarsi",
  "clauses": [
    {
      "category": "<uno degli identificativi ammessi>",
      "severity": 0-100,
      "title": "titolo breve della clausola",
      "quote": "citazione testuale dal documento (max 300 caratteri)",
      "plain": "cosa significa in pratica, in una frase",
      "certainty": "explicit" | "inferred"
    }
  ],
  "economics": {
    "recurringAmount": numero o null,
    "currency": "EUR" | "USD" | ...,
    "period": "day"|"week"|"month"|"quarter"|"year"|null,
    "minimumTermMonths": numero o null,
    "autoRenewal": true|false|null,
    "noticeDays": numero o null,
    "penaltyAmount": numero o null,
    "oneOffCosts": [{"label": "...", "amount": numero}],
    "refundable": true|false|null,
    "worstCaseTotal": numero o null,
    "worstCaseExplanation": "la formula in parole, es. 19,99 x 12 mesi + 49 di penale"
  },
  "consequences": ["cosa cambia subito", "cosa succede tra N mesi", "cosa succede se non fai nulla"],
  "mustRemember": "l'unica cosa che l'utente deve segnarsi in calendario, o null",
  "confidence": 0-1
}`;

/**
 * Compone il messaggio utente.
 */
export function buildUserPrompt({ text = '', ctx = {}, ruleFindings = [], actionType = 'manual', profile = {}, jurisdiction = 'IT', maxChars = 22000 } = {}) {
  const parts = [];

  parts.push(`## Azione che l'utente sta per compiere\n${ACTION_LABELS[actionType] || actionType}`);

  const pageBits = [];
  if (ctx.url) pageBits.push(`URL: ${ctx.url}`);
  if (ctx.title) pageBits.push(`Titolo pagina: ${ctx.title}`);
  if (ctx.buttonText) pageBits.push(`Testo del pulsante: "${ctx.buttonText}"`);
  if (pageBits.length) parts.push(`## Contesto della pagina\n${pageBits.join('\n')}`);

  if (ctx.pricing?.amount != null || ctx.pricing?.candidates?.length) {
    const p = ctx.pricing;
    const bits = [];
    if (p.amount != null) {
      bits.push(`Prezzo mostrato: ${formatMoney(p.amount, p.currency)}${p.period ? ` per ${p.period}` : ''}`);
    }
    if (p.trial) bits.push(`Prova gratuita: ${p.trial.raw}`);
    if (p.candidates?.length) {
      bits.push(`Altri importi visibili: ${p.candidates.slice(0, 6).map((c) => c.raw).join(', ')}`);
    }
    parts.push(`## Dati economici letti dalla pagina\n${bits.join('\n')}`);
  }

  if (ctx.form?.summary) parts.push(`## Modulo / checkout\n${ctx.form.summary}`);

  if (ruleFindings.length) {
    const list = ruleFindings
      .slice(0, 14)
      .map((f) => `- ${f.category} (severità locale ${f.baseSeverity ?? f.severity}): "${(f.quote || '').slice(0, 200)}"`)
      .join('\n');
    parts.push(`## Segnalazioni del motore locale (da confermare, correggere o completare)\n${list}`);
  }

  const activeAreas = Object.entries(profile || {})
    .filter(([, v]) => v)
    .map(([k]) => PROTECTION_LABELS[k] || k);
  if (activeAreas.length) {
    parts.push(`## Profilo dell'utente\nVuole proteggere soprattutto: ${activeAreas.join(', ')}.\nAlza la severità delle clausole che toccano queste aree e spiega perché lo fai.`);
  }

  parts.push(`## Contesto normativo di riferimento\nL'utente è un consumatore con residenza: ${jurisdiction}. Se una condizione appare in tensione con le tutele applicabili ai consumatori in quest'area, dillo con prudenza e senza affermare che la clausola è nulla.`);

  parts.push(`## Testo da analizzare\n"""\n${truncateMiddle(text, maxChars)}\n"""`);

  parts.push(`## Formato della risposta\nRispondi con questo oggetto JSON e nient'altro:\n${OUTPUT_SHAPE}`);

  return parts.join('\n\n');
}

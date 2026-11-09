/**
 * Modello on-device (Prompt API integrata in Chrome).
 *
 * È il pezzo che chiude il cerchio su privacy, costo e latenza insieme: il
 * contratto non esce dal dispositivo, non consuma crediti, e risponde abbastanza
 * in fretta da poter essere usato *prima* del click, in modo speculativo.
 *
 * Il modello locale è però piccolo: contesto ridotto e ragionamento limitato.
 * Quindi non gli si chiede di leggere tutto il contratto, ma di fare il salto
 * che le regole non sanno fare — spiegare in italiano corrente e quantificare —
 * partendo da ciò che il motore locale ha già trovato.
 *
 * Se non è disponibile, non è un errore: si degrada al motore a regole e,
 * quando l'utente lo consente, all'API remota.
 */

import { validate } from './llm.js';
import { RISK_CATEGORIES } from './constants.js';
import { truncateMiddle, formatMoney } from './text.js';

/** Limite prudenziale: il contesto on-device è molto più piccolo di quello remoto. */
const MAX_CHARS = 6000;

const SYSTEM = `Sei il motore di analisi di un'estensione che protegge l'utente prima che accetti, paghi o firmi.
Non riassumere il contratto: rispondi a "quanto mi costa" e "cosa cambia se clicco".
Usa italiano diretto e concreto. Cita sempre il testo originale. Non inventare numeri: se un dato non c'è, usa null.
Rispondi solo con JSON valido.`;

/** Schema per il vincolo di output strutturato, quando il browser lo supporta. */
const SCHEMA = {
  type: 'object',
  required: ['headline', 'summary'],
  additionalProperties: false,
  properties: {
    headline: { type: 'string', maxLength: 160 },
    summary: { type: 'string', maxLength: 600 },
    clauses: {
      type: 'array',
      maxItems: 6,
      items: {
        type: 'object',
        required: ['category', 'severity', 'plain'],
        additionalProperties: false,
        properties: {
          category: { type: 'string', enum: Object.keys(RISK_CATEGORIES) },
          severity: { type: 'integer', minimum: 0, maximum: 100 },
          title: { type: 'string', maxLength: 80 },
          quote: { type: 'string', maxLength: 300 },
          plain: { type: 'string', maxLength: 240 },
        },
      },
    },
    economics: {
      type: 'object',
      additionalProperties: false,
      properties: {
        minimumTermMonths: { type: ['number', 'null'] },
        noticeDays: { type: ['number', 'null'] },
        penaltyAmount: { type: ['number', 'null'] },
        autoRenewal: { type: ['boolean', 'null'] },
        worstCaseTotal: { type: ['number', 'null'] },
        worstCaseExplanation: { type: 'string', maxLength: 200 },
      },
    },
    mustRemember: { type: ['string', 'null'], maxLength: 200 },
  },
};

/** Individua l'API, che ha avuto due forme diverse durante la sua evoluzione. */
export function resolveApi(scope = globalThis) {
  if (scope.LanguageModel?.create) return { api: scope.LanguageModel, style: 'global' };
  if (scope.ai?.languageModel?.create) return { api: scope.ai.languageModel, style: 'legacy' };
  return null;
}

/**
 * Stato del modello, per la pagina impostazioni.
 * @returns {Promise<{supported:boolean, status:string, label:string}>}
 */
export async function localModelStatus(scope = globalThis) {
  const resolved = resolveApi(scope);
  if (!resolved) {
    return {
      supported: false,
      status: 'unsupported',
      label: 'Non disponibile in questa versione di Chrome.',
    };
  }
  try {
    const status = resolved.api.availability
      ? await resolved.api.availability()
      : (await resolved.api.capabilities())?.available;

    const normalized = { readily: 'available', after_download: 'downloadable', no: 'unavailable' }[status] || status;
    return {
      supported: normalized !== 'unavailable',
      status: normalized,
      label: {
        available: 'Pronto: l’analisi resta sul dispositivo.',
        downloadable: 'Disponibile, ma il modello va scaricato al primo utilizzo.',
        downloading: 'Scaricamento del modello in corso…',
        unavailable: 'Il dispositivo non soddisfa i requisiti del modello integrato.',
      }[normalized] || `Stato: ${normalized}`,
    };
  } catch (err) {
    return { supported: false, status: 'error', label: `Non interrogabile: ${err.message}` };
  }
}

let sessionPromise = null;

/** La sessione è costosa da creare: si tiene viva e si riusa. */
async function getSession(scope, { onDownload, signal } = {}) {
  const resolved = resolveApi(scope);
  if (!resolved) throw new Error('Prompt API non disponibile.');

  if (!sessionPromise) {
    sessionPromise = resolved.api
      .create({
        // Il segnale deve arrivare fin qui: `create()` può restare in attesa
        // finché il modello non è scaricato, e senza di esso l'attesa non ha
        // un limite. Il click, intanto, resta sospeso.
        signal,
        initialPrompts: [{ role: 'system', content: SYSTEM }],
        temperature: 0,
        topK: 1,
        monitor(m) {
          m.addEventListener?.('downloadprogress', (e) => {
            onDownload?.(e.loaded, e.total);
          });
        },
      })
      .catch((err) => {
        sessionPromise = null;
        throw err;
      });
  }
  return sessionPromise;
}

export function resetSession() {
  sessionPromise?.then?.((s) => s.destroy?.()).catch(() => {});
  sessionPromise = null;
}

/**
 * Analisi con il modello integrato.
 * Stessa forma di output di `analyzeWithLLM`, così l'orchestratore non deve
 * sapere quale dei due ha risposto.
 */
/**
 * La sessione è morta invece che rotta?
 *
 * Il service worker viene sospeso fra la pre-analisi speculativa e il click, e
 * la sessione del Prompt API muore con lui: al click il modello risponde
 * «The model execution session has been destroyed». Non è un guasto, è il ciclo
 * di vita normale di un service worker — va ricreata, non riferita all'utente.
 */
const SESSION_GONE = /session\s+has\s+been\s+destroyed|session\s+is\s+(?:destroyed|invalid)|invalid\s+state|InvalidStateError/i;

export async function analyzeLocally({ text, ctx = {}, ruleFindings = [], actionType, profile, signal, scope = globalThis, onDownload } = {}) {
  const prompt = buildCompactPrompt({ text, ctx, ruleFindings, actionType, profile });

  const ask = async (session) => {
    try {
      return await session.prompt(prompt, { signal, responseConstraint: SCHEMA });
    } catch (err) {
      // Non tutte le versioni accettano il vincolo di schema: si riprova senza.
      if (/responseConstraint|constraint|not supported|Unexpected/i.test(err?.message || '')) {
        return session.prompt(`${prompt}\n\nRispondi con un oggetto JSON e nient'altro.`, { signal });
      }
      throw err;
    }
  };

  let raw;
  try {
    raw = await ask(await getSession(scope, { onDownload, signal }));
  } catch (err) {
    resetSession();
    // Un solo tentativo in più, e solo se la sessione era semplicemente
    // scaduta: su un errore vero riprovare all'infinito sarebbe peggio.
    if (!SESSION_GONE.test(err?.message || '') || signal?.aborted) throw err;
    raw = await ask(await getSession(scope, { onDownload, signal }));
  }

  const parsed = typeof raw === 'string' ? JSON.parse(extractJson(raw)) : raw;
  const out = validate(parsed);
  out.source = 'local';
  return out;
}

/**
 * Prompt compatto: al modello locale si dà il meno possibile da leggere e il
 * più possibile di già masticato.
 */
export function buildCompactPrompt({ text = '', ctx = {}, ruleFindings = [], actionType = 'manual', profile = {} } = {}) {
  const parts = [];

  parts.push(`Azione: ${actionType}.`);
  if (ctx.buttonText) parts.push(`Pulsante: "${ctx.buttonText}".`);
  if (ctx.pricing?.amount != null) {
    parts.push(
      `Prezzo mostrato: ${formatMoney(ctx.pricing.amount, ctx.pricing.currency)}${ctx.pricing.period ? ` per ${ctx.pricing.period}` : ''}.`
    );
  }

  const areas = Object.entries(profile || {}).filter(([, v]) => v).map(([k]) => k);
  if (areas.length) parts.push(`L'utente vuole proteggere: ${areas.join(', ')}.`);

  if (ruleFindings.length) {
    parts.push(
      'Clausole già individuate (conferma, correggi o completa):\n' +
        ruleFindings.slice(0, 8).map((f) => `- ${f.category}: "${(f.quote || '').slice(0, 140)}"`).join('\n')
    );
  }

  parts.push(`Testo:\n"""\n${truncateMiddle(text, MAX_CHARS)}\n"""`);
  parts.push(
    'Restituisci JSON con: headline (cosa sta per fare davvero, max 160 caratteri), summary, ' +
      'clauses [{category, severity 0-100, title, quote, plain}], ' +
      'economics {minimumTermMonths, noticeDays, penaltyAmount, autoRenewal, worstCaseTotal, worstCaseExplanation}, mustRemember.'
  );

  return parts.join('\n\n');
}

function extractJson(raw) {
  const text = String(raw).trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) return fence[1];
  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  return first >= 0 && last > first ? text.slice(first, last + 1) : text;
}

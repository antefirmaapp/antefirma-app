/**
 * Orchestratore dell'analisi.
 *
 *   testo + contesto
 *        ↓  server di AnteFirma    (il modello legge la pagina; il server scarta
 *        ↓                          ogni rischio la cui citazione non c'è)
 *        ↓  severità ed etichette  (costanti dell'estensione)
 *        ↓  consequence engine     (€ / durata / date, dalle cifre verificate)
 *        ↓  personal risk profile
 *        ↓  motore consumer UE/IT
 *        ↓  decision risk score
 *   verdetto
 *
 * Non c'è più un motore a regole locale: ogni avviso nasce da una frase della
 * pagina che il server ha ritrovato nel testo. Se il server non risponde,
 * l'analisi fallisce con un `ServerError` e l'interfaccia lo dice — non si
 * finge un verdetto «sicuro» che nessuno ha calcolato.
 */

import { analyzeRemote } from './server.js';
import { computeCost, buildTimeline, termsFromServer, mergePricing } from './consequence.js';
import { personalize } from './profile.js';
import { runConsumerChecks } from './eu.js';
import { computeScore } from './scoring.js';
import { RISK_CATEGORIES, DEFAULT_SETTINGS, ACTION_TYPES } from './constants.js';
import { hashText, normalize } from './text.js';

/**
 * @param {object} p
 * @param {string} p.text        Testo da analizzare (contratto, ToS, pagina).
 * @param {object} p.ctx         Contesto estratto dalla pagina.
 * @param {string} p.actionType  Tipo di azione intercettata.
 * @param {object} p.settings    Impostazioni utente.
 * @param {AbortSignal} [p.signal]
 * @param {number} [p.now]       Istante di riferimento (per i test).
 * @param {Function} [p.remote]  La chiamata al server (sostituibile nei test).
 * @throws {ServerError}         Se il server non ha potuto analizzare.
 */
export async function analyze({ text = '', ctx = {}, actionType = ACTION_TYPES.MANUAL, settings = DEFAULT_SETTINGS, signal, now = Date.now(), remote = analyzeRemote } = {}) {
  const started = now;
  const clock = Date.now();
  const clean = normalize(text);
  const profile = settings.profile || DEFAULT_SETTINGS.profile;
  const jurisdiction = settings.jurisdiction || 'IT';

  // 1. Il server.
  const response = await remote({
    text: clean,
    url: ctx.url || null,
    actionType,
    button: ctx.button?.text || ctx.buttonText || null,
    uiLang: settings.uiLang || 'it',
    jurisdiction,
    signal,
  });

  // 2. Severità ed etichette: le decide l'estensione, non il modello.
  const raw = fromServer(response?.findings || []);

  // 3. Conseguenze economiche, dalle sole cifre che il server ha verificato.
  const terms = termsFromServer(response?.terms);
  const enrichedCtx = { ...ctx, pricing: mergePricing(ctx.pricing, terms) };
  const cost = computeCost({ ctx: enrichedCtx, findings: raw, terms });

  // 4. Personalizzazione sul profilo.
  const findings = personalize(raw, profile);

  // 5. Tutele consumer UE/IT.
  const consumer = runConsumerChecks({ text: clean, findings, ctx: enrichedCtx, cost, actionType, jurisdiction });

  // 6. Punteggio della decisione.
  const analyzed = clean.length > 120 || Boolean(enrichedCtx.pricing?.amount);
  const { score, level, components, drivers } = computeScore({ findings, cost, consumer, actionType, analyzed });

  // 7. Timeline delle conseguenze.
  const timeline = buildTimeline({ ctx: enrichedCtx, cost, findings, actionType, now: started });

  return {
    version: 2,
    createdAt: new Date(started).toISOString(),
    actionType,
    url: ctx.url || null,
    termsUrl: ctx.terms?.url || null,
    /**
     * Il prezzo risolto viaggia con il verdetto perché serve dopo: un
     * ricontrollo delle stesse condizioni senza il prezzo della pagina
     * ricalcola un impegno molto più basso e segnala un calo che non esiste.
     */
    pricing: enrichedCtx.pricing || null,
    host: safeHost(ctx.url),
    title: ctx.title || null,
    score,
    level,
    components,
    drivers,
    headline: headlineFor({ level, cost, actionType }),
    summary: (response?.summary || '').trim() || summaryFor({ findings, cost, consumer }),
    findings,
    cost,
    timeline,
    consumer,
    mustRemember: mustRememberFor(cost, timeline),
    engine: {
      source: 'server',
      model: response?.model || null,
      cached: Boolean(response?.cached),
      dropped: Number(response?.dropped) || 0,
      truncated: Boolean(response?.truncated),
      quota: response?.quota ?? null,
      textHash: hashText(clean),
      textLength: clean.length,
      durationMs: Date.now() - clock,
    },
  };
}

/**
 * Dai rischi del server ai finding dell'estensione.
 *
 * Una categoria compare una volta sola: se il server ne cita più passi, resta
 * quello con la fiducia più alta e gli altri vanno in `quotes`. Le categorie che
 * l'estensione non conosce vengono ignorate: senza severità non si sa come
 * pesarle.
 */
export function fromServer(serverFindings = []) {
  const byCategory = new Map();
  for (const f of serverFindings) {
    const def = RISK_CATEGORIES[f?.category];
    if (!def || typeof f.quote !== 'string' || !f.quote.trim()) continue;
    const confidence = clamp01(Number(f.confidence));
    const item = {
      category: f.category,
      label: def.label,
      severity: def.base,
      confidence,
      quote: f.quote.trim(),
      span: f.span || null,
      why: (typeof f.why === 'string' && f.why.trim()) || def.why,
      plain: (typeof f.why === 'string' && f.why.trim()) || def.why,
      source: 'ai',
      sources: ['ai'],
      quotes: [],
    };
    const prev = byCategory.get(f.category);
    if (!prev) {
      byCategory.set(f.category, item);
    } else if (confidence > prev.confidence) {
      byCategory.set(f.category, { ...item, quotes: [prev.quote, ...prev.quotes] });
    } else {
      prev.quotes.push(item.quote);
    }
  }
  /**
   * La fiducia sposta la severità solo verso il basso, e di poco: un rischio
   * citato ma incerto pesa meno di uno certo, ma non sparisce. Il server ha già
   * verificato che la frase c'è.
   */
  return [...byCategory.values()]
    .map((f) => ({ ...f, severity: Math.round(f.severity * (0.8 + 0.2 * f.confidence)) }))
    .sort((a, b) => b.severity - a.severity);
}

// ── testi del verdetto ───────────────────────────────────────────────────────

function headlineFor({ level, cost, actionType }) {
  if (cost.understated && cost.worstCaseLabel) {
    return `Vedi ${cost.displayed}, ma stai impegnando fino a ${cost.worstCaseLabel}`;
  }
  if (cost.worstCaseLabel) {
    return `Stai per assumere un impegno economico stimato in ${cost.worstCaseLabel}`;
  }
  const byAction = {
    accept_terms: 'Stai accettando un contratto con condizioni da verificare',
    subscribe: 'Stai attivando un abbonamento',
    purchase: 'Stai confermando un acquisto',
    sign: 'Stai firmando un documento vincolante',
    signup: 'Stai creando un account accettandone le condizioni',
    consent: 'Stai autorizzando un trattamento dei tuoi dati',
    oauth: 'Stai dando a un servizio accesso a un altro tuo account',
    manual: 'Analisi del documento',
  };
  return byAction[actionType] || level.headline;
}

function summaryFor({ findings, cost, consumer }) {
  const bits = [];
  if (findings.length) {
    const top = findings.slice(0, 3).map((f) => f.label.toLowerCase());
    bits.push(`Il testo contiene ${findings.length === 1 ? 'una condizione rilevante' : `${findings.length} condizioni rilevanti`}: ${top.join(', ')}.`);
  } else {
    bits.push('Nel testo disponibile non sono state trovate clausole che ti impegnano.');
  }
  if (cost.worstCaseLabel) {
    bits.push(`L’impegno economico potenziale stimato è ${cost.worstCaseLabel}${cost.horizonReason ? ` (${cost.horizonReason})` : ''}.`);
  }
  if (consumer.flags?.length) {
    bits.push(`${consumer.flags.length} ${consumer.flags.length === 1 ? 'condizione merita' : 'condizioni meritano'} una verifica rispetto alle tutele previste per i consumatori.`);
  }
  return bits.join(' ');
}

function mustRememberFor(cost, timeline) {
  const deadline = timeline.find((s) => s.kind === 'deadline');
  if (deadline) return `${deadline.when}: ${deadline.items[0]}`;
  if (cost.hasAutoRenewal && cost.horizonMonths) {
    return `Il contratto si rinnova da solo tra ${Math.round(cost.horizonMonths)} mesi: segna la scadenza in calendario.`;
  }
  return null;
}

function clamp01(n) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export { RISK_CATEGORIES };

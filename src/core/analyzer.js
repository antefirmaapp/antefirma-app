/**
 * Orchestratore dell'analisi: la pipeline descritta nell'architettura.
 *
 *   testo + contesto
 *        ↓  regole locali          (sempre, offline)
 *        ↓  LLM                    (solo se serve davvero)
 *        ↓  merge dei finding
 *        ↓  consequence engine     (€ / durata / date)
 *        ↓  personal risk profile
 *        ↓  motore consumer UE/IT
 *        ↓  decision risk score
 *   verdetto
 */

import { runRules } from './rules.js';
import { analyzeWithLLM, LLMError } from './llm.js';
import { analyzeLocally, resolveApi } from './local-llm.js';
import { computeCost, buildTimeline } from './consequence.js';
import { personalize } from './profile.js';
import { runConsumerChecks } from './eu.js';
import { computeScore, aggregateSeverity } from './scoring.js';
import { RISK_CATEGORIES, DEFAULT_SETTINGS, ACTION_TYPES } from './constants.js';
import { hashText, normalize, formatMoney, PERIOD_MONTHS } from './text.js';

/**
 * @param {object} p
 * @param {string} p.text        Testo da analizzare (contratto, ToS, pagina).
 * @param {object} p.ctx         Contesto estratto dalla pagina.
 * @param {string} p.actionType  Tipo di azione intercettata.
 * @param {object} p.settings    Impostazioni utente.
 * @param {'full'|'speculative'|'rules'} [p.mode]
 *        'speculative' gira prima del click: usa solo ciò che non costa nulla
 *        — regole locali e modello on-device — e marca il verdetto come
 *        parziale, così al click si sa che vale la pena raffinarlo.
 *        'rules' non interpella alcun modello: serve ai controlli automatici,
 *        dove l'estensione agisce di propria iniziativa e non può permettersi
 *        di spendere né di far uscire il testo dal browser.
 * @param {AbortSignal} [p.signal]
 * @param {number} [p.now]       Istante di riferimento (per i test).
 * @param {object} [p.scope]     Contesto globale (iniettabile per i test del modello locale).
 */
/**
 * Tempo massimo concesso al modello integrato in Chrome.
 *
 * È il gradino gratuito, ma non per questo può tenere in ostaggio il click:
 * `create()` resta in attesa finché il modello non è scaricato, e su una
 * pagina qualsiasi — senza il pannello aperto a svegliare il service worker —
 * l'avviso restava su «Sto verificando…» a tempo indeterminato, con l'azione
 * dell'utente sospesa e due sole vie d'uscita, entrambe cieche.
 *
 * Cinque secondi, poi si prosegue con le regole. Il verdetto resta pieno.
 */
const LOCAL_BUDGET_MS = 5000;

/** Come Promise.race, ma senza lasciare il timer acceso a lavoro finito. */
function withDeadline(promise, ms, reason) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(reason)), ms);
    const settle = (fn) => (v) => { clearTimeout(t); fn(v); };
    promise.then(settle(resolve), settle(reject));
  });
}

export async function analyze({ text = '', ctx = {}, actionType = ACTION_TYPES.MANUAL, settings = DEFAULT_SETTINGS, signal, now = Date.now(), mode = 'full', scope = globalThis } = {}) {
  const started = now;
  const clean = normalize(text);
  const profile = settings.profile || DEFAULT_SETTINGS.profile;
  const jurisdiction = settings.jurisdiction || 'IT';

  // 1. Regole locali — sempre, senza rete.
  // La giurisdizione serve alle regole quanto al motore consumer: senza, «foro
  // di Roma» veniva presentato a un utente italiano come foro estero.
  const { findings: ruleFindings, stats } = runRules(clean, { ...ctx, jurisdiction });

  // 2. Modelli. Due gradini, con costi molto diversi.
  const localPreview = aggregateSeverity(ruleFindings);
  const substantial = clean.length > 200;
  const highStakes = [ACTION_TYPES.PURCHASE, ACTION_TYPES.SUBSCRIBE, ACTION_TYPES.SIGN, ACTION_TYPES.MANUAL].includes(actionType);
  const worthModel = substantial && (localPreview >= (settings.llmThreshold ?? 15) || highStakes);

  const remoteConfigured =
    settings.useLLM &&
    settings.provider !== 'none' &&
    Boolean((settings.apiKey || '').trim()) &&
    // Il consenso è una precondizione, non una preferenza: senza, il testo del
    // contratto non esce dal browser nemmeno se la chiave c'è.
    Boolean(settings.remoteConsentAt);

  let llm = null;
  let llmError = null;
  let modelUsed = null;

  // 2a. Modello on-device: non manda nulla fuori e non costa crediti, quindi
  //     può girare anche in modo speculativo, prima che l'utente clicchi.
  const localEnabled = mode !== 'rules' && settings.useLocalModel !== false && Boolean(resolveApi(scope));
  if (worthModel && localEnabled) {
    try {
      llm = await withDeadline(
        analyzeLocally({ text: clean, ctx, ruleFindings, actionType, profile, signal, scope }),
        LOCAL_BUDGET_MS,
        'il modello on-device non ha risposto in tempo'
      );
      modelUsed = 'local';
    } catch (err) {
      /**
       * Il modello on-device assente o caduto **non è un errore**: il verdetto
       * resta pieno, viene dalle regole, e la riga di provenienza in fondo alla
       * card lo dice già. Segnalarlo in rosso sopra il numero — con la stringa
       * tecnica inglese di Chrome dentro — occupava il posto più prominente
       * dell'avviso per una cosa su cui l'utente non può né deve fare nulla.
       * Il dettaglio resta, ma per la diagnostica, non per la card.
       */
      llmError = {
        message: 'Modello on-device non disponibile',
        detail: String(err?.message || err),
        retriable: false,
        surfaced: false,
        source: 'local',
      };
    }
  }

  // 2b. Modello remoto: più accurato, ma il testo esce dal browser e costa.
  //     Mai in modalità speculativa.
  const useRemote = mode === 'full' && worthModel && remoteConfigured;
  if (useRemote) {
    try {
      llm = await analyzeWithLLM({
        text: clean,
        ctx,
        ruleFindings,
        actionType,
        profile,
        jurisdiction,
        settings,
        signal,
      });
      modelUsed = 'remote';
      llmError = null;
    } catch (err) {
      const timedOut = signal?.aborted || err?.name === 'TimeoutError' || err?.name === 'AbortError';
      llmError = {
        message: timedOut
          ? 'tempo massimo superato'
          : err instanceof LLMError
            ? err.message
            : 'Analisi AI non riuscita.',
        retriable: timedOut || Boolean(err?.retriable),
        timedOut: Boolean(timedOut),
        // Il modello remoto l'utente l'ha configurato apposta e lo paga: se non
        // è stato interpellato deve saperlo.
        surfaced: true,
        source: 'remote',
      };
    }
  }

  /**
   * Il verdetto è "parziale" quando esiste un gradino successivo non ancora
   * salito: è il segnale che dice all'interfaccia di mostrare subito questo
   * risultato e poi aggiornarlo.
   */
  const partial = mode === 'speculative' && worthModel && remoteConfigured;

  // 3. Merge: le due sorgenti si completano a vicenda.
  const merged = mergeFindings(ruleFindings, llm?.clauses || []);

  // 4. Conseguenze economiche: motore locale, poi correzione con i numeri
  //    dell'LLM quando sono più precisi.
  const enrichedCtx = reconcilePricing(ctx, llm);
  let cost = computeCost({ text: clean, ctx: enrichedCtx, findings: merged });
  cost = reconcileCost(cost, llm, enrichedCtx);

  // 5. Personalizzazione sul profilo.
  const findings = personalize(merged, profile);

  // 6. Tutele consumer UE/IT.
  const consumer = runConsumerChecks({ text: clean, findings, ctx: enrichedCtx, cost, actionType, jurisdiction });

  // 7. Punteggio della decisione.
  const analyzed = clean.length > 120 || Boolean(enrichedCtx.pricing?.amount);
  const { score, level, components, drivers } = computeScore({ findings, cost, consumer, actionType, analyzed });

  // 8. Timeline delle conseguenze.
  const timeline = buildTimeline({ ctx: enrichedCtx, cost, findings, actionType, now: started });

  return {
    version: 1,
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
    headline: llm?.headline || fallbackHeadline({ level, cost, actionType }),
    summary: llm?.summary || fallbackSummary({ findings, cost, consumer }),
    findings,
    cost,
    timeline,
    consumer,
    mustRemember: llm?.mustRemember || fallbackMustRemember(cost, timeline),
    consequences: llm?.consequences || [],
    engine: {
      rules: true,
      llm: Boolean(llm),
      model: modelUsed,
      mode,
      partial,
      llmError,
      llmSkipped: !worthModel,
      llmConfidence: llm?.confidence ?? null,
      localPreview,
      stats,
      textHash: hashText(clean),
      textLength: clean.length,
      durationMs: Date.now() - started,
    },
  };
}

/**
 * Unisce i finding delle due sorgenti per categoria.
 * L'LLM porta citazione e spiegazione; le regole portano affidabilità.
 * Quando entrambi vedono la stessa cosa, la fiducia sale.
 */
export function mergeFindings(ruleFindings = [], llmClauses = []) {
  const map = new Map();

  for (const f of ruleFindings) {
    map.set(f.category, { ...f, sources: ['rules'] });
  }

  for (const c of llmClauses) {
    const existing = map.get(c.category);
    if (!existing) {
      map.set(c.category, {
        category: c.category,
        label: c.label,
        title: c.title,
        severity: c.severity,
        confidence: c.certainty === 'explicit' ? 0.85 : 0.6,
        quote: c.quote,
        plain: c.plain,
        why: c.why,
        source: 'llm',
        sources: ['llm'],
        certainty: c.certainty,
      });
      continue;
    }
    // Concordanza fra motore locale e LLM: alza la severità e la fiducia.
    const agreement = 1.06;
    map.set(c.category, {
      ...existing,
      title: c.title || existing.label,
      severity: Math.min(100, Math.round(Math.max(existing.severity, c.severity) * agreement)),
      confidence: Math.min(1, Math.max(existing.confidence, 0.9)),
      quote: pickQuote(existing.quote, c.quote),
      plain: c.plain || existing.why,
      certainty: c.certainty,
      source: 'both',
      sources: ['rules', 'llm'],
    });
  }

  return [...map.values()].sort((a, b) => b.severity - a.severity);
}

function pickQuote(a, b) {
  const A = (a || '').trim();
  const B = (b || '').trim();
  if (!A) return B;
  if (!B) return A;
  // La citazione più ricca ma non sproporzionata.
  return B.length > 40 && B.length <= A.length * 1.6 ? B : A;
}

/** Se l'LLM ha letto meglio il prezzo dalla pagina, usiamo il suo. */
function reconcilePricing(ctx, llm) {
  if (!llm?.economics) return ctx;
  const e = llm.economics;
  const pricing = { ...(ctx.pricing || {}) };

  if (pricing.amount == null && e.recurringAmount != null) {
    pricing.amount = e.recurringAmount;
    pricing.currency = e.currency || pricing.currency || 'EUR';
    pricing.period = e.period || pricing.period;
    pricing.source = 'llm';
  }
  if (!pricing.period && e.period) pricing.period = e.period;
  if (!pricing.currency && e.currency) pricing.currency = e.currency;
  if (pricing.recurring == null && e.period) pricing.recurring = true;

  return { ...ctx, pricing };
}

/**
 * I numeri dell'LLM sostituiscono quelli locali solo dove il motore locale non
 * ha trovato nulla, oppure dove l'LLM è più conservativo verso l'utente
 * (cioè indica un impegno maggiore: meglio un avviso in più).
 */
function reconcileCost(cost, llm, ctx) {
  if (!llm?.economics) return cost;
  const e = llm.economics;
  const out = { ...cost, lines: [...cost.lines] };
  const currency = out.currency || e.currency || 'EUR';

  // Fra le due letture della durata vince la più lunga: sottostimare
  // l'orizzonte dell'impegno è l'errore che questo prodotto esiste per evitare.
  if (e.minimumTermMonths && e.minimumTermMonths > (out.minTerm?.months || 0)) {
    out.minTerm = { months: e.minimumTermMonths, raw: `${e.minimumTermMonths} mesi`, source: 'llm' };
    out.horizonMonths = e.minimumTermMonths;
    out.horizonReason = `durata minima indicata dall’analisi AI: ${e.minimumTermMonths} mesi`;
  }
  if (!out.notice && e.noticeDays) {
    out.notice = { months: e.noticeDays / 30, raw: `${e.noticeDays} giorni`, source: 'llm' };
  }
  if (!out.penalty && e.penaltyAmount != null) {
    out.penalty = { amount: e.penaltyAmount, currency, raw: formatMoney(e.penaltyAmount, currency), source: 'llm' };
    out.lines.push({ label: 'Penale di recesso', amount: e.penaltyAmount, kind: 'penalty' });
  }
  if (e.autoRenewal === true) out.hasAutoRenewal = true;

  for (const c of e.oneOffCosts || []) {
    if (out.lines.some((l) => l.kind === 'extra' && l.amount === c.amount)) continue;
    out.lines.push({ label: c.label, amount: c.amount, kind: 'extra' });
  }

  // Ricalcolo del totale se l'orizzonte è cambiato o mancava.
  const pricing = ctx.pricing || {};
  const periodMonths = pricing.period ? PERIOD_MONTHS[pricing.period] || 1 : null;
  if (pricing.amount != null && periodMonths && out.horizonMonths) {
    const cycles = Math.max(1, Math.round(out.horizonMonths / periodMonths));
    const sub = Math.round(pricing.amount * cycles * 100) / 100;
    const idx = out.lines.findIndex((l) => l.kind === 'recurring');
    const line = { label: `${formatMoney(pricing.amount, currency)} × ${cycles} ${cycles === 1 ? 'ciclo' : 'cicli'}`, amount: sub, kind: 'recurring' };
    if (idx >= 0) out.lines[idx] = line;
    else out.lines.push(line);
    out.hasRecurring = true;
  }

  const total = out.lines.reduce((s, l) => s + (l.amount || 0), 0);
  const llmTotal = e.worstCaseTotal;
  // Si tiene il valore più alto: sottostimare l'impegno è l'errore peggiore.
  const best = Math.max(total || 0, llmTotal || 0);
  if (best > 0) {
    out.worstCase = Math.round(best * 100) / 100;
    out.worstCaseLabel = formatMoney(out.worstCase, currency);
    out.understated = pricing.amount != null && out.worstCase >= pricing.amount * 3;
  }
  if (e.worstCaseExplanation) out.explanation = e.worstCaseExplanation;
  if (e.refundable === false && !out.lines.some((l) => l.kind === 'norefund')) out.refundable = false;

  out.currency = currency;
  return out;
}

// ── fallback testuali quando l'LLM non è disponibile ────────────────────────

function fallbackHeadline({ level, cost, actionType }) {
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

function fallbackSummary({ findings, cost, consumer }) {
  const bits = [];
  if (findings.length) {
    const top = findings.slice(0, 3).map((f) => f.label.toLowerCase());
    bits.push(`Il testo contiene ${findings.length === 1 ? 'una condizione rilevante' : `${findings.length} condizioni rilevanti`}: ${top.join(', ')}.`);
  } else {
    bits.push('Il motore locale non ha rilevato clausole tipiche di rischio nel testo disponibile.');
  }
  if (cost.worstCaseLabel) {
    bits.push(`L’impegno economico potenziale stimato è ${cost.worstCaseLabel}${cost.horizonReason ? ` (${cost.horizonReason})` : ''}.`);
  }
  if (consumer.flags?.length) {
    bits.push(`${consumer.flags.length} ${consumer.flags.length === 1 ? 'condizione merita' : 'condizioni meritano'} una verifica rispetto alle tutele previste per i consumatori.`);
  }
  return bits.join(' ');
}

function fallbackMustRemember(cost, timeline) {
  const deadline = timeline.find((s) => s.kind === 'deadline');
  if (deadline) return `${deadline.when}: ${deadline.items[0]}`;
  if (cost.hasAutoRenewal && cost.horizonMonths) {
    return `Il contratto si rinnova da solo tra ${Math.round(cost.horizonMonths)} mesi: segna la scadenza in calendario.`;
  }
  return null;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export { RISK_CATEGORIES };

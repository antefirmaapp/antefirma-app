/**
 * Consequence Engine.
 *
 * Trasforma il linguaggio legale in due cose che una persona capisce senza
 * mediazione: **quanto mi può costare** e **cosa succede se clicco**.
 *
 * È la parte del prodotto che sostituisce il "Risk score 73/100" con
 * "impegno potenziale 479,76 €".
 */

import { extractDurations, extractPrices, parseAmount, formatMoney, PERIOD_MONTHS, normalize } from './text.js';

const MONTHS_IT = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];

/** Cerca la durata minima del vincolo nel testo delle clausole rilevanti. */
export function extractMinimumTerm(text, findings = []) {
  const scopes = scopeTexts(text, findings, ['minimum_term', 'auto_renewal']);
  const cues = /(?:durata\s+minima|periodo\s+minimo|vincolo|impegno\s+minimo|minimum\s+term|minimum\s+period|commitment\s+period|lock-?in|durata\s+(?:del\s+)?contratto|contract\s+(?:term|length)|si\s+rinnov\w+\s+(?:automaticamente\s+)?per|renews?\s+for|permanencia\s+m[íi]nima|compromiso\s+de\s+permanencia|duraci[óo]n\s+m[íi]nima|plazo\s+m[íi]nimo|per[íi]odo\s+m[íi]nimo|periodo\s+m[íi]nimo|duraci[óo]n\s+del\s+contrato|se\s+renueva\s+(?:autom[áa]ticamente\s+)?por)/i;

  let best = null;
  for (const scope of scopes) {
    if (!cues.test(scope)) continue;
    for (const d of extractDurations(scope)) {
      if (d.months < 0.9) continue; // scarta "30 giorni di preavviso"
      if (/preavviso|notice|disdetta|recesso|rimborso|refund|prova|trial|garanzia|warranty/i.test(d.near || d.context)) continue;
      if (!best || d.months > best.months) best = d;
    }
  }
  return best; // {value, unit, months, raw, context} | null
}

/** Cerca il preavviso necessario per disdire. */
export function extractNoticePeriod(text, findings = []) {
  const scopes = scopeTexts(text, findings, ['notice_period', 'auto_renewal']);
  const cues = /(?:preavviso|disdetta|recesso|notice|cancel|preaviso|antelaci[óo]n|baja|desistimiento)/i;

  let best = null;
  for (const scope of scopes) {
    if (!cues.test(scope)) continue;
    for (const d of extractDurations(scope)) {
      if (!cues.test(d.near || d.context)) continue;
      if (d.months > 12) continue;
      if (!best || d.months > best.months) best = d;
    }
  }
  return best;
}

/** Cerca l'importo della penale di recesso. */
export function extractPenalty(text, findings = []) {
  const scopes = scopeTexts(text, findings, ['early_termination_penalty']);
  const cues = /(?:penale|penalit[àa]|indennit[àa]|early\s+termination|cancellation\s+fee|exit\s+fee|break\s+fee|costi\s+di\s+(?:recesso|disattivazione)|penalizaci[óo]n|penalidad|coste\s+de\s+(?:cancelaci[óo]n|baja)|comisi[óo]n\s+por\s+(?:cancelaci[óo]n|baja)|indemnizaci[óo]n\s+por\s+(?:baja|desistimiento))/i;

  const candidates = [];
  for (const scope of scopes) {
    if (!cues.test(scope)) continue;
    const prices = extractPrices(scope);
    for (const p of prices) {
      if (!cues.test(tightContext(scope, p, prices))) continue;
      candidates.push(p);
    }
    // Penale espressa come "pari a N mensilità"
    const installments = /pari\s+a\s+(\d{1,2})\s*mensilit[àa]|(\d{1,2})\s*mensilit[àa]\s+residu\w+/i.exec(scope);
    if (installments) {
      candidates.push({ amount: null, months: Number(installments[1] || installments[2]), currency: null, raw: installments[0], context: scope.slice(0, 160) });
    }
  }
  if (!candidates.length) return null;
  const withAmount = candidates.filter((c) => c.amount != null);
  if (withAmount.length) return withAmount.sort((a, b) => b.amount - a.amount)[0];
  return candidates[0];
}

/** Costi aggiuntivi una tantum (attivazione, istruttoria, servizi obbligatori). */
export function extractExtraCosts(text, findings = []) {
  const scopes = scopeTexts(text, findings, ['hidden_costs']);
  /**
   * La causale può presentarsi in tre modi, e prima ne era coperto uno solo:
   * la formula distesa («spese di attivazione»). In una tabella di riepilogo
   * la cella dice solo «Attivazione», e i 49 € sparivano dal totale; qui la
   * finestra è già stretta attorno all'importo, quindi la parola nuda basta.
   */
  const cues = /(?:spes\w+\s+di\s+(?:attivazione|gestione|istruttoria|incasso|spedizione)|costo\s+(?:una\s+tantum|di\s+attivazione)|contributo\s+(?:fisso|obbligatorio)|activation\s+fee|setup\s+fee|processing\s+fee|servizio\s+obbligatorio|mandatory|\battivazione\b|\bistruttoria\b|\bincasso\b|\bspese\s+di\s+bollo\b|\bcommissioni?\b|gastos\s+de\s+(?:activaci[óo]n|gesti[óo]n|tramitaci[óo]n|env[íi]o|estudio)|coste\s+de\s+alta|cuota\s+de\s+(?:alta|inscripci[óo]n)|comisi[óo]n\s+de\s+apertura|\bactivaci[óo]n\b|\btramitaci[óo]n\b)/i;

  /**
   * «Spese di incasso di € 4,00 **per ogni rata**» su 60 rate sono 240 €, e
   * venivano contate come 4. Il caso quotidiano è il contributo di 2 € per la
   * bolletta cartacea: ~48 € su 24 mesi.
   */
  const perCycleCue = /per\s+(?:ogni|ciascun\w*)\s+(?:rata|mese|mensilit[àa]|fattura|bolletta|ciclo|periodo)|\ba\s+rata\b|\bmensil\w+\b|per\s+(?:each|every)\s+(?:installment|month|invoice)|por\s+cada\s+(?:cuota|mes|factura|recibo)|\bal\s+mes\b|\bmensual(?:es)?\b/i;

  const out = [];
  const seen = new Set();
  for (const scope of scopes) {
    if (!cues.test(scope)) continue;
    const prices = extractPrices(scope);
    for (const p of prices) {
      const near = tightContext(scope, p, prices);
      if (!cues.test(near)) continue;
      const key = `${p.amount}|${p.currency}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        amount: p.amount,
        currency: p.currency,
        label: labelForExtra(near),
        perCycle: perCycleCue.test(near),
        raw: p.raw,
      });
    }
  }
  return out;
}

/**
 * Finestra stretta attorno a un importo.
 *
 * Serve a non attribuire a un importo la causale di quello accanto: in
 * "il canone è € 19,99 al mese, oltre a spese di attivazione di € 49,00"
 * una finestra larga farebbe passare anche 19,99 per costo di attivazione.
 */
function tightContext(scope, price, prices = [], before = 70, after = 16) {
  // La finestra non può scavalcare l'importo precedente: è lì che finisce la
  // causale di questo e comincia quella dell'altro.
  const prev = prices
    .filter((p) => p.index < price.index)
    .sort((a, b) => b.index - a.index)[0];
  const floor = prev ? prev.index + prev.raw.length : 0;
  const start = Math.max(0, floor, price.index - before);
  return scope.slice(start, price.index + price.raw.length + after);
}

function labelForExtra(context) {
  const map = [
    [/attivazione|activation/i, 'Attivazione'],
    [/istruttoria/i, 'Istruttoria'],
    [/gestione|management/i, 'Gestione'],
    [/incasso/i, 'Incasso'],
    [/spedizione|shipping/i, 'Spedizione'],
    [/setup/i, 'Setup'],
    [/obbligatori\w*|mandatory/i, 'Servizio obbligatorio'],
  ];
  for (const [re, label] of map) if (re.test(context)) return label;
  return 'Costo aggiuntivo';
}

/**
 * Calcola il costo potenziale dell'impegno.
 *
 * L'obiettivo non è la precisione contabile — impossibile da un testo legale —
 * ma dare all'utente l'ordine di grandezza corretto prima del click, con la
 * formula esplicita così può giudicare da sé.
 */
export function computeCost({ text = '', ctx = {}, findings = [] } = {}) {
  const pricing = ctx.pricing || {};
  const currency = pricing.currency || 'EUR';

  const minTerm = extractMinimumTerm(text, findings);
  const notice = extractNoticePeriod(text, findings);
  const penalty = extractPenalty(text, findings);
  const extras = extractExtraCosts(text, findings);

  const hasAutoRenewal = findings.some((f) => f.category === 'auto_renewal');
  const periodMonths = pricing.period ? PERIOD_MONTHS[pricing.period] || 1 : null;

  // Orizzonte di impegno: durata minima dichiarata, altrimenti un ciclo di
  // rinnovo (12 mesi se annuale/mensile con rinnovo automatico).
  let horizonMonths = null;
  let horizonReason = null;
  if (minTerm) {
    horizonMonths = minTerm.months;
    horizonReason = `durata minima dichiarata: ${minTerm.raw}`;
  } else if (hasAutoRenewal && periodMonths) {
    horizonMonths = Math.max(12, periodMonths);
    horizonReason = 'rinnovo automatico, orizzonte prudenziale di 12 mesi';
  } else if (periodMonths) {
    horizonMonths = periodMonths;
    horizonReason = 'un solo ciclo di fatturazione';
  }

  const lines = [];
  let total = 0;
  let hasRecurring = false;

  let cycles = 1;
  if (pricing.amount != null && periodMonths && horizonMonths) {
    cycles = Math.max(1, Math.round(horizonMonths / periodMonths));
    const sub = round2(pricing.amount * cycles);
    total += sub;
    hasRecurring = true;
    lines.push({
      label: `${formatMoney(pricing.amount, currency)} × ${cycles} ${cycles === 1 ? 'ciclo' : 'cicli'}`,
      amount: sub,
      kind: 'recurring',
    });
  } else if (pricing.amount != null) {
    total += pricing.amount;
    lines.push({ label: 'Importo', amount: round2(pricing.amount), kind: 'oneoff' });
  }

  if (penalty) {
    if (penalty.amount != null) {
      total += penalty.amount;
      lines.push({ label: 'Penale di recesso', amount: round2(penalty.amount), kind: 'penalty' });
    } else if (penalty.months && pricing.amount != null && pricing.period === 'month') {
      const p = round2(pricing.amount * penalty.months);
      total += p;
      lines.push({ label: `Penale (${penalty.months} mensilità)`, amount: p, kind: 'penalty' });
    } else {
      lines.push({ label: 'Penale di recesso (importo non quantificato)', amount: null, kind: 'penalty' });
    }
  }

  for (const e of extras) {
    if (e.amount == null) continue;
    // Una spesa per rata va moltiplicata per i cicli: contarla una volta sola
    // è l'errore che fa sparire due terzi del suo peso.
    const times = e.perCycle && cycles > 1 ? cycles : 1;
    const sub = round2(e.amount * times);
    total += sub;
    lines.push({
      label: times > 1 ? `${e.label} (${formatMoney(e.amount, currency)} × ${times})` : e.label,
      amount: sub,
      kind: 'extra',
    });
  }

  const displayed = pricing.amount != null
    ? formatMoney(pricing.amount, currency) + (pricing.period ? ` / ${periodLabel(pricing.period)}` : '')
    : null;

  const worstCase = lines.length && total > 0 ? round2(total) : null;
  const uncertain = lines.some((l) => l.amount == null) || (!minTerm && hasAutoRenewal);

  return {
    currency,
    displayed,
    worstCase,
    worstCaseLabel: worstCase != null ? formatMoney(worstCase, currency) : null,
    lines,
    horizonMonths,
    horizonReason,
    minTerm,
    notice,
    penalty,
    extras,
    hasRecurring,
    hasAutoRenewal,
    uncertain,
    /** Vero quando il prezzo mostrato sottostima nettamente l'impegno reale. */
    understated:
      worstCase != null &&
      pricing.amount != null &&
      worstCase >= pricing.amount * 3,
  };
}

/**
 * Costruisce la timeline "cosa succede se clicco".
 * @param {Date|number} now - istante di riferimento (iniettabile per i test).
 */
export function buildTimeline({ ctx = {}, cost = {}, findings = [], actionType = 'accept_terms', now = Date.now() } = {}) {
  const start = new Date(now);
  const steps = [];

  const immediate = [];
  if (actionType === 'signup' || ctx.form?.isSignup) immediate.push('crei l’account');
  if (actionType === 'accept_terms' || ctx.terms?.found) immediate.push('accetti il contratto nella sua interezza');
  if (actionType === 'purchase') immediate.push('l’ordine viene inviato');
  if (actionType === 'subscribe' || cost.hasRecurring) immediate.push('parte l’abbonamento');
  if (actionType === 'sign') immediate.push('il documento risulta firmato');
  if (findings.some((f) => ['data_sharing', 'profiling', 'data_sale'].includes(f.category))) {
    immediate.push('autorizzi il trattamento dei dati descritto nell’informativa');
  }
  if (findings.some((f) => f.category === 'auto_renewal')) immediate.push('accetti il rinnovo automatico');
  if (!immediate.length) immediate.push('l’azione viene completata');

  steps.push({ when: 'Ora', at: start.toISOString(), items: immediate, kind: 'now' });

  if (ctx.pricing?.trial?.months) {
    const trialEnd = addMonths(start, ctx.pricing.trial.months);
    steps.push({
      when: `Tra ${ctx.pricing.trial.raw}`,
      at: trialEnd.toISOString(),
      items: [
        `finisce la prova gratuita${cost.displayed ? ` e parte l’addebito di ${cost.displayed}` : ' e parte l’addebito'}`,
      ],
      kind: 'billing',
    });
  }

  if (cost.horizonMonths) {
    const end = addMonths(start, cost.horizonMonths);
    if (cost.notice?.months) {
      const deadline = addMonths(end, -cost.notice.months);
      steps.push({
        when: `Entro il ${formatDate(deadline)}`,
        at: deadline.toISOString(),
        items: [`devi inviare la disdetta (preavviso di ${cost.notice.raw}) — è la data da segnare in calendario`],
        kind: 'deadline',
      });
    }
    steps.push({
      when: `${formatDate(end)}`,
      at: end.toISOString(),
      items: [
        cost.hasAutoRenewal
          ? 'scade il periodo: se non hai disdetto, il contratto si rinnova'
          : 'scade il periodo di impegno',
      ],
      kind: cost.hasAutoRenewal ? 'renewal' : 'end',
    });

    if (cost.hasAutoRenewal) {
      const nextEnd = addMonths(end, cost.horizonMonths);
      const renewalCost = cost.lines.find((l) => l.kind === 'recurring');
      steps.push({
        when: `Poi fino al ${formatDate(nextEnd)}`,
        at: nextEnd.toISOString(),
        items: [
          renewalCost?.amount != null
            ? `nuovo periodo per altri ${formatMoney(renewalCost.amount, cost.currency)}`
            : 'nuovo periodo di impegno alle stesse condizioni',
        ],
        kind: 'renewal',
      });
    }
  }

  if (cost.penalty) {
    steps.push({
      when: 'Se esci prima',
      at: null,
      items: [
        cost.penalty.amount != null
          ? `paghi una penale di ${formatMoney(cost.penalty.amount, cost.currency)}`
          : 'è prevista una penale di recesso, di importo non chiaramente quantificato',
      ],
      kind: 'penalty',
    });
  }

  return steps;
}

// ── helper ──────────────────────────────────────────────────────────────────

/**
 * Restituisce i frammenti di testo su cui cercare i numeri: le citazioni delle
 * categorie rilevanti più, in fallback, l'intero testo. Serve a non prendere
 * l'importo sbagliato da un punto scollegato del documento.
 */
function scopeTexts(text, findings, categories) {
  const scopes = findings
    .filter((f) => categories.includes(f.category))
    .map((f) => `${f.quote} ${f.matched || ''}`);
  if (!scopes.length) return [normalize(text)];
  scopes.push(normalize(text));
  return scopes;
}

function addMonths(date, months) {
  const d = new Date(date.getTime());
  const whole = Math.trunc(months);
  const frac = months - whole;
  d.setMonth(d.getMonth() + whole);
  if (frac) d.setDate(d.getDate() + Math.round(frac * 30));
  return d;
}

function formatDate(d) {
  return `${d.getDate()} ${MONTHS_IT[d.getMonth()]} ${d.getFullYear()}`;
}

function periodLabel(period) {
  return { day: 'giorno', week: 'settimana', month: 'mese', quarter: 'trimestre', year: 'anno' }[period] || period;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

export { parseAmount };

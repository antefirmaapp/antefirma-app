/**
 * Context Engine (lato pagina).
 *
 * Guarda la *decisione*, non solo il documento: che pulsante è, quanto costa,
 * per quanto tempo, quali consensi sono già spuntati, dove sono i termini.
 *
 * Tutto ciò che raccoglie resta nella pagina finché l'utente non compie
 * l'azione: nulla viene inviato in background prima del click.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.context) return;
  const { labelOf, deepQueryAll, isVisible } = CF.util;

  const CURRENCY = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY' };
  /**
   * Le forme a parole («29,90 euro al mese») valgono quanto il simbolo: senza,
   * il prezzo di una pagina che non usa «€» non veniva visto affatto. Solo
   * postfisse, come in core/text.js: in italiano l'unità segue l'importo.
   */
  const CURRENCY_WORD = { euro: 'EUR', euros: 'EUR', dollari: 'USD', sterline: 'GBP', franchi: 'CHF' };
  const AMOUNT_RE =
    /(?:([€$£¥])|\b(EUR|USD|GBP|CHF)\b)\s*(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)|(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)\s*(?:([€$£¥])|\b(EUR|USD|GBP|CHF)\b|\b(euros?|dollari|sterline|franchi)\b)/gi;

  const PERIOD_RE = [
    [/\/\s*(?:mo|mese|month|m)\b|\bal\s*mese\b|\bmensil\w*|\bper\s+month\b|\bmonthly\b/i, 'month'],
    [/\/\s*(?:yr|anno|year|a)\b|\ball'?\s*anno\b|\bannual\w*|\bper\s+year\b|\byearly\b/i, 'year'],
    [/\/\s*(?:wk|week|sett)\b|\ba\s*settimana\b|\bsettimanal\w*|\bweekly\b/i, 'week'],
    [/\bal\s*giorno\b|\bdaily\b|\bper\s+day\b/i, 'day'],
    [/\btrimestral\w*|\bquarterly\b/i, 'quarter'],
  ];

  const TRIAL_RE =
    /\b(?:prova|periodo)\s+(?:gratuit\w+|di\s+prova)[^.]{0,40}?(\d{1,2})\s*(giorni|mesi|settimane)|\b(\d{1,2})\s*(?:giorni|days|mesi|months)\s+(?:di\s+prova|gratis|free\s+trial)|\bfree\s+trial\s+(?:for\s+)?(\d{1,2})\s*(days?|months?|weeks?)|\bprimo\s+mese\s+gratis|\bfree\s+for\s+(\d{1,2})\s*(days?|months?)/i;

  const TERMS_LINK_RE =
    /termini|condizioni|contratt|informativa|privacy|terms|conditions|agreement|policy|eula|clausol/i;

  function parseAmount(raw) {
    let s = String(raw).replace(/\s/g, '');
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (hasComma) {
      s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (hasDot && /\.\d{3}$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function pricesIn(text) {
    const out = [];
    AMOUNT_RE.lastIndex = 0;
    let m;
    while ((m = AMOUNT_RE.exec(text)) !== null) {
      const symbol = m[1] || m[5];
      const code = m[2] || m[6];
      const word = m[7];
      const amount = parseAmount(m[3] || m[4]);
      if (amount == null || amount === 0) continue;
      const around = text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50);
      let period = null;
      for (const [re, p] of PERIOD_RE) {
        if (re.test(around)) { period = p; break; }
      }
      out.push({
        amount,
        currency: code
          ? code.toUpperCase()
          : word
            ? CURRENCY_WORD[word.toLowerCase()]
            : CURRENCY[symbol] || 'EUR',
        period,
        raw: m[0].trim(),
        context: around.replace(/\s+/g, ' ').trim(),
      });
    }
    return out;
  }

  /** Risale dal pulsante al contenitore che con più probabilità contiene il prezzo. */
  function decisionScope(target) {
    let node = target;
    let best = target;
    for (let i = 0; i < 8 && node; i++) {
      node = node.parentElement || node.getRootNode?.()?.host || null;
      if (!node) break;
      best = node;
      const text = (node.innerText || '').trim();
      if (text.length > 120 && AMOUNT_RE.test(text)) {
        AMOUNT_RE.lastIndex = 0;
        return node;
      }
      AMOUNT_RE.lastIndex = 0;
      if (text.length > 3000) break;
    }
    return best;
  }

  /**
   * Importi che non sono "il prezzo": penali, cauzioni, spese accessorie.
   * Confonderli con il prezzo è l'errore più visibile che questo pannello
   * possa fare, perché è il primo numero che l'utente legge.
   */
  const NOT_A_PRICE = /(?:penale|penalit[àa]|multa|indennit[àa]|cauzione|deposito|spes\w+\s+di|attivazione|istruttoria|risarcimento|rimborso|penalty|fee\b|deposit)/i;

  /**
   * Marcatori del prezzo **a regime**: quello che si paga quando la promozione
   * finisce. Sono la conferma testuale che due prezzi ricorrenti diversi non
   * sono due piani alternativi ma due tempi dello stesso impegno.
   */
  const REGIME_RE =
    /\b(poi|successivamente|in\s+seguito|dal\s+secondo|dal\s+\d+°?\s*(?:mese|anno)|a\s+partire\s+dal|al\s+termine|alla\s+scadenza|then|thereafter|afterwards?|after\s+the\s+first|after\s+the\s+trial|renews\s+at)\b/i;

  /** Marcatori del prezzo **promozionale**: il lato corto dell'offerta. */
  const PROMO_RE =
    /\b(prim[oiae]\s*\d*\s*(?:mese|mesi|anno|anni|settiman\w+|giorni)|per\s+i\s+primi|offert\w+|promo\w*|scont\w+|introduttiv\w+|di\s+lancio|solo\s+per\s+ora|first\s+\d*\s*(?:month|months|year|years)|for\s+the\s+first|intro(?:ductory)?|limited\s+time)\b/i;

  /**
   * Prezzo barrato = prezzo di listino, cioè quello che *non* si sta per
   * accettare. Tenerlo dentro produce l'errore opposto a quello della promo
   * («39,99 € barrato, ora 19,99 €» stimato a 39,99): sovrastimare qui non è
   * prudenza, è un avviso che l'utente scopre falso guardando la pagina.
   *
   * Il CSS calcolato non si eredita: un <span> dentro un <del> risulta
   * `textDecorationLine: none` pur essendo barrato a schermo. Per questo si
   * risale di tre livelli guardando anche tag e classi.
   */
  const STRIKE_TAGS = new Set(['S', 'DEL', 'STRIKE']);
  const STRIKE_CLASS_RE = /strike|barrat|line-?through|original|list-?price|old-?price|prezzo-?pieno|full-?price|\bwas\b/i;
  const PRICEY_RE = /[€$£¥]|\b(?:EUR|USD|GBP|CHF|euros?|dollari|sterline)\b/i;

  function isStruck(el) {
    let node = el;
    for (let depth = 0; node && depth <= 3; depth += 1) {
      if (STRIKE_TAGS.has(node.tagName)) return true;
      const cls = typeof node.className === 'string' ? node.className : node.getAttribute?.('class') || '';
      if (cls && STRIKE_CLASS_RE.test(cls)) return true;
      let deco = '';
      try {
        deco = getComputedStyle(node).textDecorationLine || '';
      } catch { /* nodo non più nel documento */ }
      if (deco.includes('line-through')) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Chiavi degli importi barrati. Si indicizza anche il solo importo perché
   * su un frammento corto («39,99 €») la periodicità sta fuori dall'elemento.
   */
  function struckKeys(root) {
    const keys = new Set();
    const els = deepQueryAll('s, del, strike, span, b, strong, em, small, li, td, p, div', root, 300);
    for (const el of els) {
      const text = (el.textContent || '').trim();
      if (!text || text.length > 80 || !PRICEY_RE.test(text)) continue;
      if (!isStruck(el)) continue;
      for (const p of pricesIn(text)) {
        keys.add(`${p.amount}|${p.period || ''}`);
        keys.add(String(p.amount));
      }
    }
    return keys;
  }

  function tightAround(text, price, before = 60, after = 16) {
    const i = text.indexOf(price.raw);
    if (i < 0) return price.context;
    return text.slice(Math.max(0, i - before), i + price.raw.length + after);
  }

  function extractPricing(target) {
    const scope = decisionScope(target);
    const scopeText = (scope?.innerText || '').slice(0, 6000);
    const pageText = (document.body?.innerText || '').slice(0, 20000);

    const inScope = pricesIn(scopeText).map((p) => ({ ...p, near: true }));
    const inPage = pricesIn(pageText).map((p) => ({ ...p, near: false }));

    // Dedup per importo+periodo, dando la precedenza a quelli vicini al pulsante.
    const byKey = new Map();
    for (const p of [...inScope, ...inPage]) {
      const key = `${p.amount}|${p.period || ''}`;
      if (!byKey.has(key)) byKey.set(key, p);
    }
    const struck = struckKeys(scope || document.body || document);
    const candidates = [...byKey.values()].map((c) => ({
      ...c,
      struck: struck.has(`${c.amount}|${c.period || ''}`) || struck.has(String(c.amount)),
    }));

    // Se la pagina barra *tutti* i prezzi si è sbagliato qualcosa: meglio un
    // prezzo imperfetto che nessun prezzo.
    const live = candidates.filter((c) => !c.struck);
    const pool = live.length ? live : candidates;

    /**
     * 1) Il prezzo è quello ricorrente: è lui a generare l'impegno.
     *
     * Fra più prezzi ricorrenti **non** vince il primo del documento: l'ordine
     * nel DOM non ha alcun significato semantico, e nella struttura d'offerta
     * più diffusa che esista — «primi 3 mesi a 9,99 €/mese, poi 19,99 €/mese» —
     * il primo è quello promozionale. Prenderlo dimezzava l'impegno stimato e
     * rendeva la headline «stai impegnando fino a Y» più rassicurante del vero:
     * l'esatto contrario di ciò che questo prodotto promette.
     *
     * Quindi: si sceglie la periodicità più vicina al pulsante, e dentro quella
     * l'importo **più alto**. In caso di ambiguità si sbaglia per eccesso.
     */
    const recurring = pool.filter((c) => c.period);
    const near = recurring.filter((c) => c.near);
    const group = near.length ? near : recurring;
    const period = group.length ? group[0].period : null;
    const samePeriod = group.filter((c) => c.period === period);
    let primary = samePeriod.length ? samePeriod.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;

    /**
     * Il prezzo promozionale non si butta: serve a chi calcolerà la formula
     * «9,99 € × 3 + 19,99 € × 21» invece di moltiplicare un prezzo solo.
     * Si registra solo con una prova testuale di promozione, altrimenti due
     * piani alternativi («Base 9,99 – Premium 19,99») diventerebbero un'offerta.
     */
    let introductory = null;
    if (primary && samePeriod.length > 1) {
      const cheapest = samePeriod.reduce((a, b) => (b.amount < a.amount ? b : a));
      const evidence =
        REGIME_RE.test(primary.context) || REGIME_RE.test(cheapest.context) || PROMO_RE.test(cheapest.context);
      if (cheapest.amount < primary.amount && evidence) {
        introductory = {
          amount: cheapest.amount,
          currency: cheapest.currency,
          period: cheapest.period,
          raw: cheapest.raw,
        };
      }
    }

    // 2) Nessuna ricorrenza: si prende l'importo più alto fra quelli che non
    //    sono chiaramente penali o spese accessorie. Meglio nessun prezzo che
    //    il prezzo sbagliato.
    if (!primary) {
      const plausible = pool.filter((c) => {
        const source = c.near ? scopeText : pageText;
        return !NOT_A_PRICE.test(tightAround(source, c));
      });
      primary = plausible.sort((a, b) => (b.near - a.near) || (b.amount - a.amount))[0] || null;
    }

    const trialMatch = TRIAL_RE.exec(scopeText) || TRIAL_RE.exec(pageText);
    let trial = null;
    if (trialMatch) {
      const value = Number(trialMatch[1] || trialMatch[3] || trialMatch[4] || trialMatch[6] || 1);
      const unit = (trialMatch[2] || trialMatch[5] || 'mesi').toLowerCase();
      const months = /giorn|day/.test(unit) ? value / 30 : /settimana|week/.test(unit) ? value / 4.345 : value;
      trial = { raw: trialMatch[0].replace(/\s+/g, ' ').trim(), months };
    }

    return {
      amount: primary?.amount ?? null,
      currency: primary?.currency ?? 'EUR',
      period: primary?.period ?? null,
      recurring: Boolean(primary?.period) || recurring.length > 0,
      raw: primary?.raw ?? null,
      introductory,
      trial,
      candidates: candidates.slice(0, 10),
      scopeChars: scopeText.length,
    };
  }

  /** Ispeziona il modulo: consensi precompilati, tipo di form, caratteri minuscoli. */
  function extractForm(target) {
    const form = target.closest?.('form') || null;
    const root = form || document.body;
    const checkboxes = deepQueryAll('input[type="checkbox"]', root, 60).filter(isVisible);

    let precheckedConsents = 0;
    let consentBoxes = 0;
    let hasSpecificApproval = false;

    for (const cb of checkboxes) {
      const label = labelText(cb);
      const isConsent = TERMS_LINK_RE.test(label) || /consenso|accett|acconsent|marketing|newsletter|profilazione|consent|agree/i.test(label);
      if (!isConsent) continue;
      consentBoxes += 1;
      if (cb.checked) precheckedConsents += 1;
      if (/(art\.?\s*1341|specifica(?:mente)?\s+approv|doppia\s+(?:firma|sottoscrizione))/i.test(label)) {
        hasSpecificApproval = true;
      }
    }

    // Consenso "a pacchetto": una sola casella copre contratto + marketing/dati.
    const bundledConsent =
      consentBoxes === 1 &&
      checkboxes.some((cb) => {
        const l = labelText(cb);
        return TERMS_LINK_RE.test(l) && /(marketing|profilazione|newsletter|terze\s+parti|third\s+part)/i.test(l);
      });

    const passwordFields = deepQueryAll('input[type="password"]', root, 10).length;
    const emailFields = deepQueryAll('input[type="email"], input[name*="mail" i]', root, 10).length;
    const cardFields = deepQueryAll(
      'input[autocomplete*="cc-"], input[name*="card" i], input[name*="carta" i], iframe[src*="stripe" i], iframe[src*="checkout" i]',
      root,
      10
    ).length;

    return {
      hasForm: Boolean(form),
      isSignup: passwordFields > 0 && emailFields > 0,
      isCheckout: cardFields > 0,
      consentBoxes,
      precheckedConsents,
      bundledConsent,
      hasSpecificApproval,
      smallPrintPrice: hasSmallPrintPrice(root),
      summary: [
        form ? 'Modulo presente' : 'Nessun modulo',
        passwordFields ? 'campo password' : null,
        cardFields ? 'campi di pagamento' : null,
        consentBoxes ? `${consentBoxes} casella/e di consenso (${precheckedConsents} già spuntate)` : null,
      ]
        .filter(Boolean)
        .join(', '),
    };
  }

  function labelText(input) {
    const parts = [];
    if (input.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lab) parts.push(lab.innerText);
    }
    const wrapper = input.closest('label');
    if (wrapper) parts.push(wrapper.innerText);
    const parent = input.parentElement;
    if (parent && parts.length === 0) parts.push(parent.innerText);
    if (input.getAttribute('aria-label')) parts.push(input.getAttribute('aria-label'));
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  }

  /** Prezzo o rinnovo scritti in un carattere molto più piccolo del resto: classico dark pattern. */
  function hasSmallPrintPrice(root) {
    const nodes = deepQueryAll('small, .fine-print, .disclaimer, .legal, span, p', root, 300);
    const baseSize = Number.parseFloat(getComputedStyle(document.body).fontSize) || 16;
    for (const el of nodes) {
      const text = (el.innerText || '').trim();
      if (text.length < 15 || text.length > 400) continue;
      if (!/rinnov|auto-?renew|al\s*mese|per\s+month|penale|disdetta|preavviso/i.test(text)) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize) || baseSize;
      if (size <= baseSize * 0.75) return true;
    }
    return false;
  }

  /** Trova i termini: testo già nella pagina oppure link da scaricare. */
  function extractTerms(target) {
    const scope = target.closest?.('form') || document.body;
    const links = deepQueryAll('a[href]', scope, 200)
      .filter((a) => TERMS_LINK_RE.test(labelOf(a) + ' ' + (a.getAttribute('href') || '')))
      .filter((a) => {
        const href = a.getAttribute('href') || '';
        return href && !href.startsWith('#') && !href.startsWith('javascript:');
      });

    let inline = '';
    const containers = deepQueryAll(
      '[class*="terms" i], [class*="condizioni" i], [id*="terms" i], [id*="condizioni" i], [class*="tos" i], [class*="legal" i], pre, article, .modal-body',
      document,
      60
    );
    for (const el of containers) {
      const t = (el.innerText || '').trim();
      if (t.length > inline.length && t.length > 500 && /(?:articolo|clausol|condizioni|termini|section|clause|agreement)/i.test(t)) {
        inline = t;
      }
    }

    const primary = links[0];
    return {
      found: Boolean(primary) || inline.length > 500,
      url: primary ? new URL(primary.getAttribute('href'), location.href).href : null,
      linkText: primary ? labelOf(primary) : null,
      linkCount: links.length,
      textInPage: inline.length > 500,
      inlineText: inline.slice(0, 60000),
      linkOnly: Boolean(primary) && inline.length <= 500,
    };
  }

  /** Testo rilevante da mandare all'analisi. */
  function collectText(target, terms) {
    const parts = [];
    if (terms.inlineText) parts.push(terms.inlineText);

    const scope = decisionScope(target);
    const scopeText = (scope?.innerText || '').trim();
    if (scopeText && scopeText.length < 12000) parts.push(scopeText);

    const body = (document.body?.innerText || '').trim();
    if (parts.join('\n').length < 1500 && body) parts.push(body.slice(0, 40000));

    return [...new Set(parts)].join('\n\n').slice(0, 80000);
  }

  CF.context = {
    build(target, actionType) {
      const terms = extractTerms(target);
      return {
        ctx: {
          url: location.href,
          title: document.title,
          buttonText: labelOf(target),
          actionType,
          pricing: extractPricing(target),
          form: extractForm(target),
          terms: { ...terms, inlineText: undefined },
          lang: document.documentElement.lang || null,
        },
        text: collectText(target, terms),
      };
    },
    pricesIn,
    extractPricing,
    // Il detector ne ha bisogno per decidere in modo *sincrono* se un pulsante
    // generico («Continua») sta in un checkout: il testo da solo non basta.
    extractForm,
  };
})();

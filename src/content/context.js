/**
 * Context Engine (page side).
 *
 * It looks at the *decision*, not just the document: which button it is, what it
 * costs, for how long, which consents are already ticked, where the terms are.
 *
 * Everything it collects stays in the page until the user performs the action:
 * nothing is sent in the background before the click.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.context) return;
  const { labelOf, deepQueryAll, isVisible } = CF.util;

  const CURRENCY = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY' };
  /**
   * Word forms ("29,90 euro al mese") count as much as the symbol: without them,
   * the price of a page that doesn't use "€" was not seen at all. Postfix only,
   * as in core/text.js: in Italian the unit follows the amount.
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

  /** Walks up from the button to the container most likely to hold the price. */
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
   * Amounts that are not "the price": exit fees, deposits, extra charges.
   * Mistaking them for the price is the most visible error this panel can make,
   * because it is the first number the user reads.
   */
  const NOT_A_PRICE = /(?:penale|penalit[àa]|multa|indennit[àa]|cauzione|deposito|spes\w+\s+di|attivazione|istruttoria|risarcimento|rimborso|penalty|fee\b|deposit)/i;

  /**
   * Markers of the **regular** price: the one paid when the promotion ends. They
   * are the textual confirmation that two different recurring prices are not two
   * alternative plans but two phases of the same commitment.
   */
  const REGIME_RE =
    /\b(poi|successivamente|in\s+seguito|dal\s+secondo|dal\s+\d+°?\s*(?:mese|anno)|a\s+partire\s+dal|al\s+termine|alla\s+scadenza|then|thereafter|afterwards?|after\s+the\s+first|after\s+the\s+trial|renews\s+at)\b/i;

  /** Markers of the **promotional** price: the short side of the offer. */
  const PROMO_RE =
    /\b(prim[oiae]\s*\d*\s*(?:mese|mesi|anno|anni|settiman\w+|giorni)|per\s+i\s+primi|offert\w+|promo\w*|scont\w+|introduttiv\w+|di\s+lancio|solo\s+per\s+ora|first\s+\d*\s*(?:month|months|year|years)|for\s+the\s+first|intro(?:ductory)?|limited\s+time)\b/i;

  /**
   * A struck-through price = the list price, i.e. the one *not* being accepted.
   * Keeping it produces the opposite error to the promo one ("€39.99 struck
   * through, now €19.99" estimated at 39.99): overestimating here is not
   * prudence, it is a warning the user finds false by looking at the page.
   *
   * Computed CSS isn't inherited: a <span> inside a <del> reports
   * `textDecorationLine: none` while being struck through on screen. That is why
   * we walk up three levels looking at tags and classes too.
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
      } catch { /* node no longer in the document */ }
      if (deco.includes('line-through')) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Keys of struck-through amounts. The bare amount is indexed too because on a
   * short fragment ("€39.99") the period is outside the element.
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

    // Dedupe by amount+period, preferring those close to the button.
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

    // If the page strikes through *every* price something went wrong: an
    // imperfect price is better than none.
    const live = candidates.filter((c) => !c.struck);
    const pool = live.length ? live : candidates;

    /**
     * 1) The price is the recurring one: it is what creates the commitment.
     *
     * Among several recurring prices the first in the document does **not** win:
     * DOM order has no semantic meaning, and in the most common offer structure
     * there is — "first 3 months at €9.99/month, then €19.99/month" — the first
     * is the promotional one. Taking it halved the estimated commitment and made
     * the headline "you are committing up to Y" more reassuring than the truth:
     * the exact opposite of what this product promises.
     *
     * So: the period closest to the button is chosen, and within it the
     * **highest** amount. When ambiguous, err on the high side.
     */
    const recurring = pool.filter((c) => c.period);
    const near = recurring.filter((c) => c.near);
    const group = near.length ? near : recurring;
    const period = group.length ? group[0].period : null;
    const samePeriod = group.filter((c) => c.period === period);
    let primary = samePeriod.length ? samePeriod.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;

    /**
     * The promotional price is not thrown away: it serves whoever computes the
     * formula "€9.99 × 3 + €19.99 × 21" instead of multiplying a single price.
     * It is recorded only with textual proof of a promotion, otherwise two
     * alternative plans ("Basic 9.99 – Premium 19.99") would become one offer.
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

    // 2) No recurrence: take the highest amount among those that are not
    //    clearly exit fees or extra charges. Better no price than the wrong
    //    price.
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
      const unit = (trialMatch[2] || trialMatch[5] || 'mesi').toLowerCase(); // default unit: months
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

  /** Inspects the form: pre-ticked consents, form type, tiny print. */
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

    // "Bundled" consent: a single box covers contract + marketing/data.
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

  /** Price or renewal written in a much smaller font than the rest: a classic dark pattern. */
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

  /** Finds the terms: text already on the page or a link to download. */
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

  /** Relevant text to send for analysis. */
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
          // The seller's name, if the page declares it: needed when Paddle, Stripe… collect the payment.
          merchant: (document.querySelector('meta[property="og:site_name"],meta[name="application-name"]')?.content || '').trim().slice(0, 60) || null,
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
    // The detector needs it to decide *synchronously* whether a generic button
    // ("Continue") is in a checkout: the text alone is not enough.
    extractForm,
  };
})();

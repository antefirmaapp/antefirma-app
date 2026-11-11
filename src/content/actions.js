/**
 * Action recognition: which buttons represent a commitment.
 *
 * It lives in its own file, with no DOM and no Chrome APIs, for two reasons:
 * it is the table updated most often when a new site turns up, and it is the
 * only part of the detector testable in Node without a browser.
 *
 * Loaded as a classic script by the content scripts and imported by the tests:
 * in both cases it just registers itself on globalThis.__CF.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.actions) return;

  /**
   * `weight` resolves overlaps: "Accetta e firma" contains both "accetta" and
   * "firma", but the signature sets the stakes.
   *
   * The weight also serves the opt-out veto (see below): below 3 the action is
   * too weak to stand against a "cancel" in the same label, above it isn't.
   *
   * Spanish sits in a separate branch of the alternation, after the `\b(…)\b`
   * of Italian and English, for two reasons. The first is hygiene: the tables
   * already tested stay identical character for character, so a wrong Spanish
   * rule can only add matches, never move an old one. The second is that the
   * Spanish branch cannot use `\b`: in JavaScript `\b` is defined on
   * [A-Za-z0-9_], and between a space and the "í" of "Suscríbete" there is no
   * transition to hook onto — the boundary simply doesn't exist and the rule
   * never fires. It is the same defect already found in `\bnon\s+è\b` and in
   * `\bpenalit[àa]\b`. The lookarounds `(?<![\wÀ-ÿ])` and `(?![\wÀ-ÿ])` do the
   * same job while counting accented vowels as letters, and that is why they
   * delimit every Spanish alternative.
   */
  const ACTION_PATTERNS = [
    {
      type: 'sign',
      weight: 5,
      // "firmar" alone is enough: it covers "Firmar el contrato" and "Aceptar y
      // firmar". The lookbehind is what keeps out "Confirmar pedido", which
      // contains "firmar" but is a purchase, not a signature.
      re: /\b(firma\s+(?:il\s+|questo\s+)?(?:contratto|documento|ordine)?|firmo|sottoscriv\w+|accetta\s+e\s+firma|sign\s+(?:now|document|contract|and\s+accept)|e-?sign)\b|(?<![\wÀ-ÿ])(firmar(?:lo|la)?|firmo\s+(?:el\s+)?(?:contrato|documento))(?![\wÀ-ÿ])/i,
    },
    {
      type: 'subscribe',
      weight: 4,
      re: /\b(abbonati|abbonamento\s+(?:ora|adesso)|attiva\s+(?:l['’])?abbonamento|attiva\s+(?:l['’]|la\s+|il\s+|lo\s+)?(?:piano|servizio|offerta|promo(?:zione)?|tariffa|prova)|attiva\s+(?:ora|adesso|subito)|contratta\s+(?:ora|adesso|subito)|sottoscrivi\s+(?:ora|adesso)|conferma\s+e\s+attiva|sottoscrivi\s+(?:l['’])?abbonamento|conferma\s+(?:l['’]|la\s+|il\s+|lo\s+)?(?:abbonamento|polizza|piano|iscrizione|sottoscrizione|attivazione)|rinnova\s+ora|inizia\s+(?:la\s+)?prova|prova(?:lo)?\s+(?:gratis|gratuitamente|gratuita\w*)|passa\s+(?:a|ad|al|alla)\s+(?:premium|pro\b|plus\b|business|gold|platinum|piano\b|abbonamento|versione)|iscriviti\s+(?:a|ad|al|alla)\s+(?:premium|pro\b|plus\b|business|piano\b|abbonamento)|scegli\s+(?:questo\s+|il\s+)?(?:piano|abbonamento)|subscribe|start\s+(?:free\s+)?trial|start\s+(?:my\s+|your\s+)?(?:plan|subscription|membership)|become\s+a\s+member|try\s+(?:it\s+)?free|get\s+(?:premium|pro\b|plus\b)|upgrade(?![-_\w])(?:\s+now)?)\b|(?<![\wÀ-ÿ])(suscr[ií]b(?:ete|irse|irme|irte)|activar\s+(?:el\s+|mi\s+|la\s+|tu\s+)?(?:plan|servicio|suscripci[óo]n)|activar\s+(?:ahora|ya)|(?:empezar|comenzar|iniciar|activar)\s+(?:la\s+|mi\s+)?prueba(?:\s+grat[\wÀ-ÿ]+)?|probar\s+gratis|pasar\s+a\s+(?:premium|pro|plus|business|gold|platinum)|elegir\s+(?:este\s+|el\s+|mi\s+)?plan|mejorar\s+(?:el\s+|mi\s+|tu\s+)?plan|contratar(?:\s+(?:ahora|ya|el\s+plan|el\s+servicio|la\s+tarifa))?)(?![\wÀ-ÿ])/i,
    },
    {
      type: 'purchase',
      weight: 4,
      /**
       * In Spanish the payment button is written in the infinitive, so "Pagar"
       * alone is a real commitment — unlike Italian, where a bare "paga" is too
       * ambiguous and indeed always requires a complement above. But precisely
       * because it is an infinitive, the same word also carries sentences that
       * describe payment instead of performing it: "Formas de pagar" is a list,
       * "Continuar sin pagar" is the free path. Those two contexts are excluded
       * by name; "Terminar de pagar", which really pays, stays in.
       */
      re: /\b(acquista|compra|paga\s+(?:ora|adesso|subito|con\b|tutto)|effettua\s+(?:il\s+)?pagamento|procedi\s+(?:al\s+|con\s+il\s+)?(?:pagamento|checkout|ordine)|(?:continua|prosegui|vai)\s+(?:e\s+paga|e\s+pagamento|al\s+pagamento|al\s+checkout|alla\s+cassa)|conferma\s+(?:e\s+paga|e\s+procedi|ordine|acquisto|pagamento)|concludi\s+(?:l['’])?(?:ordine|acquisto)|ordina\s+(?:ora|adesso|e\s+paga)|completa\s+(?:l['’])?(?:ordine|acquisto)|buy\s+now|place\s+(?:your\s+)?order|complete\s+(?:purchase|order)|pay\s+now|confirm\s+and\s+pay|continue\s+to\s+(?:payment|checkout)|proceed\s+to\s+checkout|checkout(?![-_\w]))\b|(?<![\wÀ-ÿ])(comprar(?:lo|la)?|(?<!sin\s)(?<!(?:formas|m[ée]todos|opciones)\s+de\s)pagar(?:lo|la)?|ir\s+al\s+(?:pago|checkout)|pasar\s+por\s+caja|proceder\s+al\s+pago|(?:finalizar|completar|confirmar|realizar|tramitar|hacer)\s+(?:la\s+|el\s+|mi\s+|tu\s+)?(?:compra|pedido|pago|reserva))(?![\wÀ-ÿ])/i,
    },
    {
      type: 'oauth',
      weight: 3,
      re: /\b(autorizza|consenti\s+l['’]accesso|(?:continua|accedi|entra|registrati|prosegui)\s+con\s+(?:l['’]\s*account\s+|il\s+tuo\s+account\s+|un\s+account\s+)?(?:google|facebook|apple|github|microsoft|linkedin|spid)|authorize|allow\s+access|grant\s+access|(?:continue|sign\s*in|log\s*in|sign\s*up)\s+with\s+(?:your\s+)?(?:google|facebook|apple|github|microsoft|linkedin)\s*(?:account)?)\b|(?<![\wÀ-ÿ])(autorizar(?:\s+(?:el\s+)?acceso)?|permitir\s+(?:el\s+)?acceso|conceder\s+(?:el\s+)?acceso|(?:continuar|acceder|entrar|registrarse|iniciar\s+sesi[óo]n)\s+con\s+(?:tu\s+|mi\s+|una\s+)?(?:cuenta\s+de\s+)?(?:google|facebook|apple|github|microsoft|linkedin))(?![\wÀ-ÿ])/i,
    },
    {
      type: 'consent',
      weight: 3,
      /**
       * "Entendido" is anchored to the whole label, not searched inside the text
       * like the others: alone on a button it is the twin of "Ho capito" and
       * counts as consent, but it is also a very common word in banner prose
       * ("Hemos entendido tus preferencias"), where it would close a notice on a
       * sentence that commits to nothing.
       */
      re: /\b(accetta\s+tutt\w+|consenti\s+tutt\w+|acconsento\s+a\s+tutt\w+|consenti(?![-_\w])|ho\s+capito|accept\s+all(?:\s+cookies)?|allow\s+all|got\s+it|gestisci\s+(?:i\s+)?consensi|salva\s+(?:le\s+)?preferenze\s+(?:sui\s+)?cookie)\b|(?<![\wÀ-ÿ])(aceptar\s+tod[oa]s?(?:\s+las\s+cookies)?|aceptar\s+(?:las\s+)?cookies|permitir\s+tod[oa]s?|consentir|doy\s+mi\s+consentimiento)(?![\wÀ-ÿ])|^[\s¡"'«(]*entendido[\s!.…»)]*$/i,
    },
    {
      type: 'accept_terms',
      weight: 2,
      re: /\b(accetto|accetta(?:re)?|ho\s+letto\s+e\s+accetto|acconsento|approvo|prosegui\s+e\s+accetta|i\s+agree|agree\s+(?:and|to)\b|accept\s+(?:and|terms)|accetta\s+e\s+continua)\b|(?<![\wÀ-ÿ])(acepto|estoy\s+de\s+acuerdo|aceptar\s+(?:los\s+|las\s+)?(?:t[ée]rminos|condiciones)|aceptar\s+y\s+continuar)(?![\wÀ-ÿ])/i,
    },
    {
      type: 'signup',
      weight: 1,
      re: /\b(crea\s+(?:un\s+)?account|registrati|iscriviti\s+ora|apri\s+(?:un\s+)?conto|create\s+(?:an\s+)?account|sign\s+up|get\s+started\s+free|join\s+now)\b|(?<![\wÀ-ÿ])(crear\s+(?:una\s+|mi\s+|tu\s+)?cuenta|abrir\s+(?:una\s+)?cuenta|registrar(?:se|me|te)|reg[ií]strate|dar(?:se|me|te)?\s+de\s+alta|date\s+de\s+alta)(?![\wÀ-ÿ])/i,
    },
  ];

  const ACTION_LABELS = {
    accept_terms: 'acceptingTermsConditions',
    subscribe: 'startingSubscription',
    purchase: 'purchase',
    sign: 'signingDocument',
    signup: 'creatingAccount',
    consent: 'consentDataProcessing',
    oauth: 'accessAuthorisation',
  };

  /**
   * Expressions meaning the opposite of a commitment: refusal, waiver, exit.
   * They cannot be an absolute veto: "Subscribe — cancel anytime" is standard
   * checkout microcopy, and "Firma il contratto e chiudi" is a signature with
   * an instruction about what to do next. See `optOutWins`.
   *
   * Two cautions about Spanish, both learnt from how it is really written:
   *
   * - "volver a comprar" is not a return, it is a re-purchase: the same word
   *   that usually goes back here opens an order. The exclusion is explicit
   *   because the case is exactly the reverse of "Volver" and "Volver a la
   *   tienda", which stay opt-outs.
   * - "cerrar" is left out on purpose: "cerrar la compra" means completing the
   *   purchase, not closing the window, and the risk of silencing a real
   *   checkout outweighs that of an unrecognised banner.
   */
  const OPT_OUT = /\b(rifiut\w+|nega|non\s+(?:accett|consent|autorizz)\w+|solo\s+(?:i\s+)?(?:cookie\s+)?(?:necessari|essenziali)|continua\s+senza\s+accettare|reject(?:\s+all)?|decline|deny|manage\s+(?:preferences|options)|annulla|cancel|indietro|torna|chiudi|close|esci|log\s*out|disdici|unsubscribe)\b|(?<![\wÀ-ÿ])(rechaz(?:ar|o)(?:\s+tod[oa]s)?|denegar|s[óo]lo\s+(?:las\s+|los\s+)?(?:cookies\s+)?(?:necesari[oa]s|esenciales|t[ée]cnicas)|continuar\s+sin\s+aceptar|no\s+(?:acepto|aceptar|autorizar|permitir)|cancelar?|volver(?!\s+a\s+(?:comprar|pagar|contratar|suscribirse|reservar))|atr[áa]s|gestionar\s+(?:las\s+|mis\s+)?(?:preferencias|opciones|cookies)|configurar\s+(?:las\s+)?(?:cookies|preferencias)|dar(?:se|me|te)?\s+de\s+baja|date\s+de\s+baja)(?![\wÀ-ÿ])/i;

  /**
   * Labels about something free and without commitment: newsletters, alerts,
   * notifications. "Subscribe to our newsletter" is not a subscription, and an
   * id like "subscribe-nl" must not make it one. Only subscribe and sign-up
   * give way, and only when the label names no price: a paid newsletter's
   * "Subscribe — €5/month" is still a subscription.
   */
  const FREE_ONLY = /\b(newsletter|notify\s+me|avvisami|notifiche|alerts?)\b|(?<![\wÀ-ÿ])(bolet[ií]n|av[ií]same|notificaciones)(?![\wÀ-ÿ])/i;

  const PRICED = /[€$£]|\d/;

  /** Below this weight an action cannot stand against an opt-out. */
  const STRONG_WEIGHT = 3;

  /**
   * The refusal wins if it is **at the start** of the label, or if what it
   * caught is a weak action.
   *
   * Position is the signal: whoever writes a button puts the commanding verb
   * first ("Annulla e torna al carrello"); what follows is trimming. Conversely,
   * in "Subscribe — cancel anytime" the refusal is a reassurance about later,
   * and treating it as a veto cancelled a real subscription — exactly the case
   * this product exists to stop.
   */
  function optOutWins(text, best) {
    const m = OPT_OUT.exec(text);
    if (!m) return false;
    const strong = Boolean(best) && best.weight >= STRONG_WEIGHT;
    if (!strong) return true;
    const head = Math.max(1, Math.ceil(text.trim().length / 3));
    return m.index < head;
  }

  function heaviestMatch(text) {
    let best = null;
    for (const p of ACTION_PATTERNS) {
      if (!p.re.test(text)) continue;
      if (!best || p.weight > best.weight) best = p;
    }
    return best;
  }

  /**
   * Like `classifyText`, but it also says *why* it didn't classify.
   *
   * The detector needs it: if the visible label refuses the action ("Cancel"),
   * HTML attributes must not be able to overrule it; if the label simply says
   * nothing, attributes may speak.
   *
   * @returns {{type: string|null, weight: number, vetoed: boolean}}
   */
  function classifyDetail(text) {
    if (!text) return { type: null, weight: 0, vetoed: false };
    const best = heaviestMatch(text);
    if (optOutWins(text, best)) return { type: null, weight: 0, vetoed: true };
    // A label that only speaks of newsletters or alerts commits to nothing, and
    // says so: an id like "subscribe-nl" must not turn it into a subscription.
    if (FREE_ONLY.test(text) && (!best || ['subscribe', 'signup'].includes(best.type)) && !PRICED.test(text)) {
      return { type: null, weight: 0, vetoed: true };
    }
    return { type: best ? best.type : null, weight: best ? best.weight : 0, vetoed: false };
  }

  /** Classifies a text. @returns {string|null} */
  function classifyText(text) {
    return classifyDetail(text).type;
  }

  CF.actions = { ACTION_PATTERNS, ACTION_LABELS, OPT_OUT, classifyText, classifyDetail, STRONG_WEIGHT };
})();

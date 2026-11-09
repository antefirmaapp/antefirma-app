/**
 * Riconoscimento dell'azione: quali pulsanti rappresentano un impegno.
 *
 * Vive in un file a parte, senza DOM e senza API di Chrome, per due motivi:
 * è la tabella che si aggiorna più spesso quando si incontra un sito nuovo,
 * ed è l'unica parte del detector verificabile in Node senza un browser.
 *
 * Caricato come classic script dai content script e importato dai test:
 * in entrambi i casi si limita a registrarsi su globalThis.__CF.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.actions) return;

  /**
   * `weight` risolve le sovrapposizioni: "Accetta e firma" contiene sia
   * "accetta" sia "firma", ma è la firma a determinare la posta in gioco.
   *
   * Il peso serve anche al veto di opt-out (vedi sotto): sotto 3 l'azione è
   * troppo debole per reggere il confronto con un "annulla" nella stessa
   * etichetta, sopra no.
   *
   * Lo spagnolo sta in un ramo separato dell'alternanza, dopo il `\b(…)\b` di
   * italiano e inglese, per due ragioni. La prima è di igiene: le tabelle già
   * collaudate restano identiche carattere per carattere, quindi una regola
   * spagnola sbagliata può solo aggiungere match, mai spostarne uno vecchio.
   * La seconda è che il ramo spagnolo non può usare `\b`: in JavaScript `\b` è
   * definito su [A-Za-z0-9_], e fra uno spazio e la «í» di «Suscríbete» non
   * c'è nessuna transizione da agganciare — il confine semplicemente non
   * esiste e la regola non scatta mai. È lo stesso difetto già trovato in
   * `\bnon\s+è\b` e in `\bpenalit[àa]\b`. I lookaround `(?<![\wÀ-ÿ])` e
   * `(?![\wÀ-ÿ])` fanno lo stesso lavoro contando come lettera anche le
   * vocali accentate, e per questo delimitano ogni alternativa spagnola.
   */
  const ACTION_PATTERNS = [
    {
      type: 'sign',
      weight: 5,
      // «firmar» da solo basta: copre «Firmar el contrato» e «Aceptar y
      // firmar». Il lookbehind è ciò che tiene fuori «Confirmar pedido», che
      // contiene «firmar» ma è un acquisto, non una firma.
      re: /\b(firma\s+(?:il\s+|questo\s+)?(?:contratto|documento|ordine)?|firmo|sottoscriv\w+|accetta\s+e\s+firma|sign\s+(?:now|document|contract|and\s+accept)|e-?sign)\b|(?<![\wÀ-ÿ])(firmar(?:lo|la)?|firmo\s+(?:el\s+)?(?:contrato|documento))(?![\wÀ-ÿ])/i,
    },
    {
      type: 'subscribe',
      weight: 4,
      re: /\b(abbonati|abbonamento\s+(?:ora|adesso)|attiva\s+(?:l['’])?abbonamento|attiva\s+(?:l['’]|la\s+|il\s+|lo\s+)?(?:piano|servizio|offerta|promo(?:zione)?|tariffa|prova)|attiva\s+(?:ora|adesso|subito)|contratta\s+(?:ora|adesso|subito)|sottoscrivi\s+(?:ora|adesso)|conferma\s+e\s+attiva|sottoscrivi\s+(?:l['’])?abbonamento|conferma\s+(?:l['’]|la\s+|il\s+|lo\s+)?(?:abbonamento|polizza|piano|iscrizione|sottoscrizione|attivazione)|rinnova\s+ora|inizia\s+(?:la\s+)?prova|prova(?:lo)?\s+(?:gratis|gratuitamente|gratuita\w*)|passa\s+(?:a|ad|al|alla)\s+(?:premium|pro\b|plus\b|business|gold|platinum|piano\b|abbonamento|versione)|iscriviti\s+(?:a|ad|al|alla)\s+(?:premium|pro\b|plus\b|business|piano\b|abbonamento)|scegli\s+(?:questo\s+|il\s+)?(?:piano|abbonamento)|subscribe|start\s+(?:free\s+)?trial|start\s+(?:my\s+)?(?:plan|subscription)|try\s+(?:it\s+)?free|get\s+(?:premium|pro\b|plus\b)|upgrade(?![-_\w])(?:\s+now)?)\b|(?<![\wÀ-ÿ])(suscr[ií]b(?:ete|irse|irme|irte)|activar\s+(?:el\s+|mi\s+|la\s+|tu\s+)?(?:plan|servicio|suscripci[óo]n)|activar\s+(?:ahora|ya)|(?:empezar|comenzar|iniciar|activar)\s+(?:la\s+|mi\s+)?prueba(?:\s+grat[\wÀ-ÿ]+)?|probar\s+gratis|pasar\s+a\s+(?:premium|pro|plus|business|gold|platinum)|elegir\s+(?:este\s+|el\s+|mi\s+)?plan|mejorar\s+(?:el\s+|mi\s+|tu\s+)?plan|contratar(?:\s+(?:ahora|ya|el\s+plan|el\s+servicio|la\s+tarifa))?)(?![\wÀ-ÿ])/i,
    },
    {
      type: 'purchase',
      weight: 4,
      /**
       * In spagnolo il pulsante di pagamento si scrive all'infinito, quindi
       * «Pagar» da solo è un impegno vero — a differenza dell'italiano, dove
       * «paga» nudo è troppo ambiguo e infatti qui sopra chiede sempre un
       * complemento. Ma proprio perché è un infinito, la stessa parola regge
       * anche le frasi che il pagamento lo raccontano invece di eseguirlo:
       * «Formas de pagar» è un elenco, «Continuar sin pagar» è la via
       * gratuita. Quei due contesti sono esclusi per nome; «Terminar de
       * pagar», che invece paga davvero, resta dentro.
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
       * «Entendido» è ancorato all'intera etichetta, non cercato dentro il
       * testo come gli altri: da solo su un pulsante è il gemello di «Ho
       * capito» e vale un consenso, ma è anche una parola comunissima nella
       * prosa dei banner («Hemos entendido tus preferencias»), dove chiuderebbe
       * un avviso su una frase che non impegna a niente.
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
    accept_terms: 'Accettazione di termini e condizioni',
    subscribe: 'Attivazione di un abbonamento',
    purchase: 'Acquisto',
    sign: 'Firma di un documento',
    signup: 'Creazione di un account',
    consent: 'Consenso al trattamento dei dati',
    oauth: 'Autorizzazione di accesso',
  };

  /**
   * Espressioni che indicano il contrario di un impegno: rifiuto, rinuncia,
   * uscita. Non possono essere un veto assoluto: "Subscribe — cancel anytime"
   * è microcopy standard nei checkout, e "Firma il contratto e chiudi" è una
   * firma con l'istruzione su cosa fare dopo. Vedi `optOutWins`.
   *
   * Sullo spagnolo due cautele, entrambe imparate da come si scrive davvero:
   *
   * - «volver a comprar» non è un ritorno, è un riacquisto: la stessa parola
   *   che di solito riporta indietro qui apre un ordine. L'esclusione è
   *   esplicita perché il caso è esattamente rovesciato rispetto a «Volver» e
   *   a «Volver a la tienda», che restano opt-out.
   * - «cerrar» resta fuori apposta: «cerrar la compra» vuol dire concludere
   *   l'acquisto, non chiudere la finestra, e il rischio di zittire un
   *   checkout vero supera quello di un banner non riconosciuto.
   */
  const OPT_OUT = /\b(rifiut\w+|nega|non\s+(?:accett|consent|autorizz)\w+|solo\s+(?:i\s+)?(?:cookie\s+)?(?:necessari|essenziali)|continua\s+senza\s+accettare|reject(?:\s+all)?|decline|deny|manage\s+(?:preferences|options)|annulla|cancel|indietro|torna|chiudi|close|esci|log\s*out|disdici|unsubscribe)\b|(?<![\wÀ-ÿ])(rechaz(?:ar|o)(?:\s+tod[oa]s)?|denegar|s[óo]lo\s+(?:las\s+|los\s+)?(?:cookies\s+)?(?:necesari[oa]s|esenciales|t[ée]cnicas)|continuar\s+sin\s+aceptar|no\s+(?:acepto|aceptar|autorizar|permitir)|cancelar?|volver(?!\s+a\s+(?:comprar|pagar|contratar|suscribirse|reservar))|atr[áa]s|gestionar\s+(?:las\s+|mis\s+)?(?:preferencias|opciones|cookies)|configurar\s+(?:las\s+)?(?:cookies|preferencias)|dar(?:se|me|te)?\s+de\s+baja|date\s+de\s+baja)(?![\wÀ-ÿ])/i;

  /** Sotto questo peso un'azione non regge il confronto con un opt-out. */
  const STRONG_WEIGHT = 3;

  /**
   * Il rifiuto vince se sta **all'inizio** dell'etichetta, o se ciò che ha
   * intercettato è un'azione debole.
   *
   * La posizione è il segnale: chi scrive un pulsante mette per primo il
   * verbo che comanda ("Annulla e torna al carrello"); ciò che segue è
   * contorno. Al contrario, in "Subscribe — cancel anytime" il rifiuto è una
   * rassicurazione sul dopo, e trattarlo come veto cancellava un abbonamento
   * vero — cioè esattamente il caso che questo prodotto esiste per fermare.
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
   * Come `classifyText`, ma dice anche *perché* non ha classificato.
   *
   * Serve al detector: se è l'etichetta visibile a rifiutare l'azione
   * ("Annulla"), gli attributi HTML non devono poterla smentire; se invece
   * l'etichetta semplicemente non dice niente, gli attributi possono parlare.
   *
   * @returns {{type: string|null, weight: number, vetoed: boolean}}
   */
  function classifyDetail(text) {
    if (!text) return { type: null, weight: 0, vetoed: false };
    const best = heaviestMatch(text);
    if (optOutWins(text, best)) return { type: null, weight: 0, vetoed: true };
    return { type: best ? best.type : null, weight: best ? best.weight : 0, vetoed: false };
  }

  /** Classifica un testo. @returns {string|null} */
  function classifyText(text) {
    return classifyDetail(text).type;
  }

  CF.actions = { ACTION_PATTERNS, ACTION_LABELS, OPT_OUT, classifyText, classifyDetail, STRONG_WEIGHT };
})();

/**
 * Action Detector.
 *
 * È il punto in cui questo prodotto smette di essere un lettore di contratti e
 * diventa un firewall: il click viene sospeso *prima* di produrre effetti, si
 * analizza la decisione, e solo dopo l'utente sceglie in modo informato.
 *
 * L'intercettazione avviene in fase di cattura sul document, così arriva prima
 * di qualsiasi handler del sito. Il click originale viene poi riprodotto
 * fedelmente se l'utente conferma.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.detector) return;
  const { labelOf, composedPath, isVisible } = CF.util;

  const { ACTION_LABELS, classifyText, classifyDetail } = CF.actions;
  const t = (s, v) => globalThis.AF_I18N.t(s, v);

  const CLICKABLE = 'button, a[href], input[type="submit"], input[type="button"], [role="button"], [type="submit"]';

  /** I nostri elementi: nessun click al loro interno va classificato. */
  const OURS = new Set(['VINCOLO-AVVISO', 'VINCOLO-NOTA']);

  /**
   * Classifica un elemento; restituisce il tipo di azione o null.
   *
   * Etichetta e attributi si valutano separatamente perché non hanno lo stesso
   * peso: se è il testo visibile a dire di no («Annulla»), una classe CSS che
   * contiene "subscribe" non può smentirlo — l'utente legge l'etichetta.
   */
  function classify(el) {
    const label = labelOf(el);
    const fromLabel = label && label.length <= 120 ? classifyDetail(label) : null;
    if (fromLabel?.vetoed) return null;
    const fromAttrs = classifyDetail(attrSignature(el));
    const best = [fromLabel, fromAttrs].filter((d) => d?.type).sort((a, b) => b.weight - a.weight)[0];
    return best?.type || null;
  }

  /**
   * Pulsanti che non dicono niente: «Continua», «Avanti», «Conferma».
   *
   * Sono l'etichetta più comune sull'ultimo passo di un checkout e la più
   * comune su un wizard qualsiasi: dal testo non si distingueranno mai, e
   * allargare la tabella delle azioni per includerli produrrebbe un blocco su
   * ogni modulo del web. Serve una prova strutturale, non lessicale.
   */
  const GENERIC_RE =
    /^(?:continua|continue|avanti|next|conferma|confermo|confirm|procedi|prosegui|proceed|vai\s+avanti|ok)[\s.!…»>→-]*$/i;

  /**
   * Il riquadro della decisione: il contenitore più ampio attorno al pulsante
   * che ancora parla *di quel pulsante*.
   *
   * Non può essere `<body>`. Il prezzo ricorrente vale come prova solo se sta
   * accanto al pulsante: su una pagina che mostra un piano in alto, altrimenti,
   * anche il «Continua» di un questionario in fondo diventerebbe un
   * abbonamento — verificato in Chromium, ed era esattamente il falso allarme
   * che questo fallback deve evitare.
   */
  const ACTIONABLE_SELECTOR = 'button, input[type=submit], input[type=button], [role="button"]';

  /** Quanti pulsanti contiene questo sottoalbero, compreso l'elemento stesso. */
  function countActionable(node) {
    return node.querySelectorAll(ACTIONABLE_SELECTOR).length + (node.matches?.(ACTIONABLE_SELECTOR) ? 1 : 0);
  }

  function decisionBox(el) {
    let node = el;
    const ownButtons = countActionable(el);
    for (let i = 0; i < 6; i += 1) {
      const parent = node.parentElement;
      if (!parent || parent === document.body || parent === document.documentElement) break;
      if ((parent.innerText || '').length > 1500) break;
      /**
       * Un pulsante in più rispetto a quelli che stanno già dentro `node`
       * significa che il riquadro non parla più solo di questa decisione: da lì
       * in su il prezzo appartiene a un'altra. Il limite sui caratteri non
       * basta — su una pagina con un checkout in alto e un questionario in
       * fondo, entrambi corti, il «Continua» del questionario ereditava il
       * canone del checkout e diventava un abbonamento.
       */
      if (countActionable(parent) > ownButtons) break;
      node = parent;
    }
    return node;
  }

  /**
   * Campi di pagamento *dentro il riquadro*, non nella pagina.
   *
   * `context.extractForm()` ripiega su `document.body` quando il pulsante non
   * sta in un `<form>`: per l'analisi va bene — descrive la pagina — ma come
   * prova strutturale no. Su una pagina con un checkout in alto e un
   * questionario in fondo, il «Continua» del questionario ereditava i campi
   * carta dell'altro riquadro e diventava un acquisto.
   */
  const PAYMENT_FIELD_SELECTOR = [
    'input[autocomplete*="cc-"]',
    'input[name*="card" i]', 'input[id*="card" i]',
    'input[name*="cvv" i]', 'input[name*="cvc" i]',
    'iframe[src*="stripe" i]', 'iframe[src*="checkout" i]',
    'iframe[src*="paypal" i]', 'iframe[src*="adyen" i]',
  ].join(',');

  function hasPaymentFields(box) {
    try {
      return Boolean(box.querySelector?.(PAYMENT_FIELD_SELECTOR));
    } catch {
      return false;
    }
  }

  /**
   * La prova la fornisce il contesto che context.js raccoglie comunque: campi
   * carta o iframe di pagamento (form.isCheckout) e prezzo ricorrente accanto
   * al pulsante. Il risultato si memorizza per un attimo perché il click e
   * l'eventuale submit dello stesso pulsante non devono ricostruire due volte
   * lo stesso contesto.
   */
  const evidence = new WeakMap();

  function structuralType(el) {
    const label = labelOf(el);
    if (!label || !GENERIC_RE.test(label)) return null;

    const cached = evidence.get(el);
    if (cached && Date.now() - cached.at < 2000) return cached.type;

    let type = null;
    try {
      // Un prezzo ricorrente accanto a un «Continua» è un abbonamento che sta
      // per partire; senza prezzo, ma con i campi carta, è un acquisto.
      const box = decisionBox(el);
      if (CF.context.pricesIn((box.innerText || '').slice(0, 2000)).some((p) => p.period)) type = 'subscribe';
      else if (hasPaymentFields(box)) type = 'purchase';
    } catch {
      type = null; // il contesto non deve mai far fallire l'intercettazione
    }
    evidence.set(el, { at: Date.now(), type });
    return type;
  }

  function attrSignature(el) {
    if (!el?.getAttribute) return '';
    return ['id', 'name', 'class', 'data-testid', 'aria-label', 'value', 'title']
      .map((a) => el.getAttribute(a) || '')
      .join(' ')
      .slice(0, 300);
  }

  /** Dal percorso dell'evento risale al primo elemento cliccabile classificabile. */
  function findTarget(event) {
    const path = composedPath(event);
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (OURS.has(node.tagName)) return null; // avviso e notifica sono nostri
      const clickable = node.matches?.(CLICKABLE) ? node : node.closest?.(CLICKABLE);
      if (!clickable) continue;
      const type = classify(clickable) || structuralType(clickable);
      if (type) return { el: clickable, type };
      // Un solo livello di risalita per non classificare l'intera pagina.
      break;
    }
    return null;
  }

  const state = {
    approved: new WeakSet(),
    busy: false,
    settings: null,
  };

  /**
   * Le impostazioni si caricano subito e si tengono in cache locale.
   *
   * È essenziale che siano già disponibili quando arriva il click: la
   * decisione di sospendere l'evento deve essere presa in modo sincrono
   * (vedi sotto), quindi non c'è modo di attenderle in quel momento.
   */
  CF.bridge.settings().then((s) => { state.settings = s; }).catch(() => {});

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.settings) state.settings = changes.settings.newValue;
  });

  /** Il firewall è spento per questa pagina? Risposta sincrona, mai bloccante. */
  function disabledHere() {
    const s = state.settings;
    if (!s) return false; // impostazioni non ancora note: si sospende comunque
    if (!s.enabled) return true;
    const host = location.hostname.replace(/^www\./, '');
    return (s.allowlist || []).some((e) => {
      const d = String(e).trim().replace(/^www\./, '').toLowerCase();
      return d && (host === d || host.endsWith(`.${d}`));
    });
  }

  /**
   * Handler del click: **sincrono per costruzione**.
   *
   * preventDefault() ha effetto solo mentre l'evento è ancora in corso di
   * dispatch. Un solo `await` prima di chiamarlo — anche solo per leggere le
   * impostazioni — restituisce il controllo al browser, che nel frattempo ha
   * già eseguito l'azione: il form parte, il pagamento va a buon fine, e
   * l'avviso compare quando non serve più a niente.
   *
   * Quindi qui si decide e si sospende senza attese; tutto il resto —
   * analisi, rete, interfaccia — avviene dopo, in handleAction().
   */
  function onClick(event) {
    if (!event.isTrusted) return; // il nostro replay non deve ri-attivare il firewall
    if (event.button !== 0) return;
    if (state.busy) return;
    if (disabledHere()) return;

    const found = findTarget(event);
    if (!found) return;
    if (state.approved.has(found.el)) return;
    if (!isVisible(found.el)) return;

    // Sospensione del click: prima di qualsiasi await.
    event.preventDefault();
    event.stopImmediatePropagation();
    state.busy = true;

    handleAction(found, event);
  }

  /**
   * Chiude un'intercettazione: registra la decisione nello storico e, se
   * l'utente ha escluso il sito, aggiorna la allowlist.
   *
   * Sta fuori da handleAction perché anche il percorso `submit` deve passarci.
   * Senza, un contratto accettato premendo Invio in un form non produceva
   * alcun impegno registrato — niente scadenza, niente lettera, niente prova,
   * cioè niente kit di uscita — e «Non avvisarmi su questo sito» non aveva
   * effetto: il dominio non veniva aggiunto e il form non partiva. Il click
   * spariva nel nulla.
   *
   * `via` dice *come* si è arrivati alla decisione senza alterarla: lo storico
   * deve poter distinguere «ho premuto Continua comunque» da «è passato sotto
   * la soglia», ma in entrambi i casi l'utente ha proceduto e l'impegno va
   * registrato.
   *
   * @returns {Promise<'proceed'|'cancel'>} la decisione effettiva.
   */
  async function finalize(decision, verdict, via = 'blocked') {
    let how = via;
    // «Continua e ricordami la disdetta»: si prosegue e l'impegno si registra
    // anche se nelle impostazioni la registrazione automatica è spenta.
    let track = false;
    if (decision === 'track') { decision = 'proceed'; track = true; }

    if (decision === 'allowlist') {
      const host = location.hostname.replace(/^www\./, '');
      await CF.bridge.send('ALLOWLIST_ADD', { host }).catch(() => {});
      state.settings = null;
      CF.state.settings = null;
      decision = 'proceed';
      how = 'allowlist';
    }

    if (verdict?.historyId && (decision === 'proceed' || decision === 'cancel')) {
      CF.bridge.send('RECORD_DECISION', { id: verdict.historyId, decision, via: how, track }).catch(() => {});
    }
    return decision;
  }

  /**
   * Chiede l'analisi al service worker. La prima volta il service worker
   * risponde che manca il consenso: l'avviso lo chiede, e solo dopo un sì il
   * testo della pagina parte verso il server. Un no lascia procedere l'azione
   * senza analisi, come se l'estensione non ci fosse.
   */
  async function requestAnalysis(overlay, waiting, payload, label) {
    const aborted = waiting.then((d) => ({ __userAborted: d }));
    let res = await Promise.race([CF.bridge.send('ANALYZE_ACTION', payload), aborted]);
    if (!res?.needsConsent) return res;

    const choice = await Promise.race([overlay.askConsent(), aborted]);
    if (choice?.__userAborted) return choice;
    if (choice !== 'accept') return { skip: true, reason: 'no_consent' };

    await CF.bridge.send('GRANT_CONSENT', {});
    overlay.showLoading(label);
    res = await Promise.race([CF.bridge.send('ANALYZE_ACTION', payload), aborted]);
    return res?.needsConsent ? { skip: true, reason: 'no_consent' } : res;
  }

  /** Ciò che si può mostrare subito, prima della risposta del server. */
  function previewOf(ctx) {
    const p = ctx?.pricing;
    let price = null;
    if (p?.amount != null) {
      try { price = new Intl.NumberFormat(globalThis.AF_I18N.locale, { style: 'currency', currency: p.currency || 'EUR' }).format(p.amount); } catch { price = String(p.amount); }
      const per = { month: t('al mese'), year: t('all\'anno'), week: t('a settimana'), quarter: t('al trimestre') }[p.period];
      if (per) price += ` ${per}`;
    }
    return { price, host: location.hostname.replace(/^www\./, '') };
  }

  async function handleAction(found, event) {
    const overlay = new CF.overlay.Overlay();
    const waiting = overlay.wait();
    let decision = 'cancel';
    let current = null;
    let via = 'blocked';
    try {
      const { ctx, text } = CF.context.build(found.el, found.type);
      overlay.showLoading(t(ACTION_LABELS[found.type]), previewOf(ctx));
      const res = await requestAnalysis(overlay, waiting, { actionType: found.type, ctx, text }, t(ACTION_LABELS[found.type]));

      if (res?.__userAborted) {
        decision = res.__userAborted;
      } else if (res?.error) {
        overlay.showError(res.error.message, res.error.code);
        decision = await waiting;
      } else if (res?.skip) {
        overlay.destroy();
        decision = 'proceed';
      } else {
        const verdict = { ...res.verdict, actionLabel: t(ACTION_LABELS[found.type]) };
        current = verdict;
        if (!res.blocking) {
          // Sotto la soglia scelta dall'utente: non si interrompe il flusso.
          // La decisione va registrata lo stesso: è il caso più frequente, e
          // senza, lo storico mostrava «Nessuna decisione registrata» su ogni
          // avviso non bloccante.
          overlay.destroy();
          decision = 'proceed';
          via = 'auto';
          flash(verdict);
        } else {
          overlay.showVerdict(verdict, { blocking: true });
          decision = await waiting;
        }
      }
    } catch (err) {
      overlay.showError(err?.message || t('Errore durante l’analisi.'));
      decision = await waiting;
    } finally {
      state.busy = false;
    }

    decision = await finalize(decision, current, via);

    if (decision === 'proceed') replay(found.el, event);
  }

  /**
   * Riproduce l'azione originale.
   * L'elemento entra nella allowlist di sessione, così il nuovo click passa.
   */
  function replay(el, originalEvent) {
    state.approved.add(el);

    // Link semplice: navigazione diretta, più affidabile di un click sintetico.
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !el.hasAttribute('download')) {
      const target = el.getAttribute('target');
      const url = new URL(href, location.href).href;
      if (target === '_blank') window.open(url, '_blank', 'noopener');
      else location.assign(url);
      return;
    }

    // Pulsante di submit: si usa requestSubmit per far girare la validazione.
    const form = el.form || el.closest?.('form');
    const isSubmit = el.type === 'submit' || (el.tagName === 'BUTTON' && (!el.type || el.type === 'submit'));
    if (form && isSubmit && typeof form.requestSubmit === 'function') {
      try {
        form.requestSubmit(el.tagName === 'BUTTON' || el.tagName === 'INPUT' ? el : undefined);
        return;
      } catch { /* fallback sotto */ }
    }

    if (typeof el.click === 'function') {
      el.click();
      return;
    }

    el.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        composed: true,
        clientX: originalEvent?.clientX ?? 0,
        clientY: originalEvent?.clientY ?? 0,
      })
    );
  }

  /**
   * Stessa regola del click: si sospende prima, si ragiona dopo.
   * Copre i form inviati con Invio da tastiera, dove il click non arriva mai.
   */
  function onSubmit(event) {
    if (!event.isTrusted) return;
    if (state.busy) return;
    if (disabledHere()) return;

    const form = event.target;
    if (!form || state.approved.has(form)) return;

    const submitter = event.submitter;
    if (submitter && state.approved.has(submitter)) return;
    const type = submitter
      ? classify(submitter) || structuralType(submitter)
      : classifyText(attrSignature(form));
    if (!type) return;

    event.preventDefault();
    event.stopImmediatePropagation();
    state.busy = true;

    handleSubmit(form, submitter, type);
  }

  async function handleSubmit(form, submitter, type) {
    const overlay = new CF.overlay.Overlay();
    const waiting = overlay.wait();
    let decision = 'cancel';
    let current = null;
    let via = 'blocked';
    try {
      const { ctx, text } = CF.context.build(submitter || form, type);
      overlay.showLoading(t(ACTION_LABELS[type]), previewOf(ctx));
      const res = await requestAnalysis(overlay, waiting, { actionType: type, ctx, text }, t(ACTION_LABELS[type]));
      if (res?.__userAborted) decision = res.__userAborted;
      else if (res?.error) { overlay.showError(res.error.message, res.error.code); decision = await waiting; }
      else if (res?.skip) { overlay.destroy(); decision = 'proceed'; }
      else if (!res.blocking) {
        overlay.destroy();
        current = res.verdict;
        decision = 'proceed';
        via = 'auto';
        flash(res.verdict);
      } else {
        current = res.verdict;
        overlay.showVerdict({ ...res.verdict, actionLabel: t(ACTION_LABELS[type]) }, { blocking: true });
        decision = await waiting;
      }
    } catch (err) {
      overlay.showError(err?.message || t('Errore durante l’analisi.'));
      decision = await waiting;
    } finally {
      state.busy = false;
    }

    decision = await finalize(decision, current, via);

    if (decision === 'proceed') {
      state.approved.add(form);
      if (submitter) state.approved.add(submitter);
      form.requestSubmit ? form.requestSubmit(submitter || undefined) : form.submit();
    }
  }



  // ── notifica non bloccante ─────────────────────────────────────────────────

  /**
   * La fascia REVIEW è il caso **più frequente**: non blocca, quindi tutto ciò
   * che l'utente saprà di quell'impegno è questa notifica. Il vecchio `flash()`
   * era un vicolo cieco — nessun ruolo ARIA, nessun modo di sapere perché fosse
   * comparsa, sparizione dopo 6 secondi, testo bianco a 3,25:1 e toast
   * sovrapposti se si premevano due pulsanti di fila.
   *
   * Qui invece: una sola notifica alla volta con coda, `role="status"`, colori
   * verificati con la formula WCAG, una via d'uscita («Vedi perché»), una X,
   * pausa su hover e su focus, e nessuna scadenza automatica quando c'è
   * qualcosa da segnarsi: una scadenza che sparisce da sola è una scadenza
   * persa.
   */
  const TOAST_MS = 7000;
  const toast = {
    host: null,
    root: null,
    queue: [],
    current: null,
    timer: null,
    left: 0,
    startedAt: 0,
  };

  /** Luminanza relativa secondo WCAG 2.x. */
  function luminance(hex) {
    const h = String(hex || '').replace('#', '');
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const ch = [0, 2, 4].map((i) => Number.parseInt(full.slice(i, i + 2), 16) / 255);
    if (ch.some((v) => !Number.isFinite(v))) return 0;
    const lin = ch.map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  }

  function contrast(a, b) {
    const l1 = luminance(a);
    const l2 = luminance(b);
    return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
  }

  /**
   * Il colore del livello si usa come sfondo **solo** se un testo sopra ci
   * arriva a 4,5:1. Per REVIEW (#b8860b) il bianco fa 3,25:1 e il nero 5,72:1;
   * per COMMITMENT (#c2620f) nessuno dei due ce la fa, e allora il colore
   * scende a fare la barra su una superficie neutra. Il livello si legge dalla
   * barra e dall'icona: il testo non è il posto dove risparmiare contrasto.
   */
  function palette(color) {
    const candidates = ['#ffffff', '#101317'].map((fg) => ({ fg, ratio: contrast(color, fg) }));
    const best = candidates.sort((a, b) => b.ratio - a.ratio)[0];
    if (best && best.ratio >= 4.5) {
      return { bg: color, fg: best.fg, bar: 'transparent', ratio: best.ratio, onColor: true };
    }
    return { bg: '#ffffff', fg: '#101317', bar: color, ratio: contrast('#ffffff', '#101317'), onColor: false };
  }

  const TOAST_CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; }
    .toast {
      position: fixed; right: 16px; bottom: 16px; z-index: 2147483646;
      width: min(360px, calc(100vw - 32px));
      display: grid; grid-template-columns: auto 1fr auto; gap: 4px 10px;
      align-items: start;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
      background: var(--bg); color: var(--fg);
      border-left: 5px solid var(--bar, transparent);
      border-radius: 12px; padding: 12px 12px 10px 13px;
      box-shadow: 0 10px 32px rgba(0,0,0,.30);
      animation: enter .18s cubic-bezier(.2,.7,.3,1);
    }
    @keyframes enter { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: none } }
    /* Chi ha chiesto meno movimento non deve avere né l'ingresso animato né
       una barra che scorre in un angolo dello schermo. */
    @media (prefers-reduced-motion: reduce) { .toast { animation: none } .life { display: none } }
    .ico { font-size: 15px; line-height: 1.35; }
    .txt { min-width: 0; }
    .headline { margin: 0; font-size: 13.5px; font-weight: 600; line-height: 1.4; }
    .note { margin: 6px 0 0; font-size: 12.5px; line-height: 1.4; font-weight: 500; }
    .queued { margin: 6px 0 0; font-size: 11.5px; opacity: .85; }
    .actions { grid-column: 2 / 4; display: flex; gap: 8px; align-items: center; margin-top: 9px; }
    button {
      font: inherit; font-size: 12.5px; font-weight: 600; cursor: pointer;
      border-radius: 8px; padding: 6px 10px; color: inherit;
      background: transparent; border: 1px solid currentColor;
    }
    button:hover { background: var(--hover); }
    button:focus-visible { outline: 2px solid currentColor; outline-offset: 2px; }
    .x {
      grid-column: 3; grid-row: 1; border: 0; padding: 2px 4px; font-size: 15px;
      line-height: 1; opacity: .8;
    }
    .x:hover { opacity: 1; background: var(--hover); }
    .life { grid-column: 1 / 4; height: 2px; background: currentColor; opacity: .25; margin-top: 9px;
            transform-origin: left; transition: transform linear; }
  `;

  /** Accoda una notifica. Una sola resta visibile: le altre aspettano il turno. */
  function flash(verdict) {
    if (!verdict?.level || verdict.level.id === 'safe') return;
    // Premere tre pulsanti di fila non deve produrre tre avvisi sovrapposti,
    // né una coda infinita da smaltire: contano gli ultimi, non tutti.
    if (toast.queue.length >= 3) toast.queue.shift();
    toast.queue.push(verdict);
    if (!toast.current) showNextToast();
    else refreshQueued(); // chi sta leggendo deve sapere che ne è arrivato un altro
  }

  function mountToast() {
    if (toast.host?.isConnected) return;
    toast.host = document.createElement('antefirma-toast');
    // L'host non occupa spazio (è il contenuto a essere `position: fixed`), ma
    // display e visibilità si dichiarano !important: un `* { display: none }`
    // del sito non deve poter zittire l'unico avviso della fascia REVIEW.
    for (const [prop, value] of Object.entries({
      position: 'static', display: 'block', visibility: 'visible', opacity: '1', 'pointer-events': 'auto',
    })) {
      toast.host.style.setProperty(prop, value, 'important');
    }
    toast.root = toast.host.attachShadow({ mode: 'open' });
    const style = document.createElement('style');
    style.textContent = TOAST_CSS;
    toast.root.append(style);
    document.documentElement.append(toast.host);
  }

  function showNextToast() {
    const verdict = toast.queue.shift();
    if (!verdict) {
      closeToast();
      return;
    }
    toast.current = verdict;
    mountToast();

    const level = verdict.level || {};
    const colors = palette(level.color || '#4a5568');
    const sticky = Boolean(verdict.mustRemember); // una scadenza non si toglie da sola

    const old = toast.root.querySelector('.toast');
    if (old) old.remove();

    const box = document.createElement('div');
    box.className = 'toast';
    box.setAttribute('role', 'status');
    box.setAttribute('aria-atomic', 'true');
    box.style.setProperty('--bg', colors.bg);
    box.style.setProperty('--fg', colors.fg);
    box.style.setProperty('--bar', colors.onColor ? 'rgba(255,255,255,.35)' : colors.bar);
    box.style.setProperty('--hover', colors.onColor ? 'rgba(255,255,255,.16)' : 'rgba(16,19,23,.08)');

    const esc = CF.util.escapeHtml;
    box.innerHTML = `
      <span class="ico" aria-hidden="true">${esc(level.icon || '•')}</span>
      <div class="txt">
        <p class="headline">${esc(verdict.headline || level.headline || t('Condizioni da verificare'))}</p>
        ${verdict.mustRemember ? `<p class="note">📌 ${esc(verdict.mustRemember)}</p>` : ''}
        ${toast.queue.length ? `<p class="queued">${esc(queuedLabel(toast.queue.length))}</p>` : ''}
      </div>
      <button class="x" type="button" aria-label="${esc(t('Chiudi questa notifica'))}">✕</button>
      <div class="actions">
        <button class="why" type="button">${esc(t('Vedi perché →'))}</button>
      </div>
      ${sticky ? '' : '<div class="life" aria-hidden="true"></div>'}
    `;

    box.querySelector('.x').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      advanceToast();
    });
    box.querySelector('.why').addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const v = toast.current;
      advanceToast();
      explain(v);
    });

    // Pausa su hover e su focus: leggere un avviso non deve essere una gara.
    box.addEventListener('mouseenter', pauseToast);
    box.addEventListener('mouseleave', resumeToast);
    box.addEventListener('focusin', pauseToast);
    box.addEventListener('focusout', resumeToast);

    toast.root.append(box);

    if (!sticky) {
      toast.left = TOAST_MS;
      resumeToast();
    }
  }

  function queuedLabel(n) {
    return n === 1 ? t('un altro avviso in attesa') : t('altri {n} avvisi in attesa', { n });
  }

  /** Aggiorna il contatore della coda sulla notifica già a schermo. */
  function refreshQueued() {
    const txt = toast.root?.querySelector('.txt');
    if (!txt) return;
    let line = txt.querySelector('.queued');
    if (!toast.queue.length) {
      line?.remove();
      return;
    }
    if (!line) {
      line = document.createElement('p');
      line.className = 'queued';
      txt.append(line);
    }
    line.textContent = queuedLabel(toast.queue.length);
  }

  function lifeBar() {
    return toast.root?.querySelector('.life') || null;
  }

  function pauseToast() {
    if (!toast.timer) return;
    clearTimeout(toast.timer);
    toast.timer = null;
    // Mai zero: con zero il timer non ripartirebbe più e la notifica
    // resterebbe a schermo per sempre solo perché ci si è passati sopra.
    toast.left = Math.max(800, toast.left - (Date.now() - toast.startedAt));
    const bar = lifeBar();
    if (bar) {
      // Si congela la larghezza raggiunta, altrimenti la barra tornerebbe indietro.
      const w = bar.getBoundingClientRect().width;   // larghezza *trasformata*
      const full = bar.offsetWidth || w || 1;        // larghezza di layout
      bar.style.transition = 'none';
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, w / full))})`;
    }
  }

  function resumeToast() {
    if (toast.timer || !toast.current) return;
    if (!toast.left) return; // notifica persistente: nessun timer da riprendere
    toast.startedAt = Date.now();
    toast.timer = setTimeout(advanceToast, toast.left);
    const bar = lifeBar();
    if (bar) {
      requestAnimationFrame(() => {
        bar.style.transition = `transform ${toast.left}ms linear`;
        bar.style.transform = 'scaleX(0)';
      });
    }
  }

  function advanceToast() {
    clearTimeout(toast.timer);
    toast.timer = null;
    toast.left = 0;
    toast.current = null;
    if (toast.queue.length) showNextToast();
    else closeToast();
  }

  function closeToast() {
    clearTimeout(toast.timer);
    toast.timer = null;
    toast.current = null;
    toast.host?.remove();
    toast.host = null;
    toast.root = null;
  }

  /**
   * «Vedi perché»: riapre il verdetto **già calcolato**, senza rianalizzare
   * niente e senza uscire in rete — è lo stesso oggetto che ha prodotto la
   * notifica.
   *
   * Non apre il pannello laterale perché `chrome.sidePanel` non esiste nei
   * content script e il service worker oggi non espone un messaggio per
   * aprirlo; il giorno in cui ci sarà, cambia solo il corpo di questa
   * funzione. Nel frattempo il contenuto mostrato è lo stesso.
   */
  function explain(verdict) {
    if (!verdict) return;
    try {
      const overlay = new CF.overlay.Overlay();
      overlay.showVerdict(verdict, { blocking: false });
      overlay.wait().then((choice) => {
        // L'azione è già avvenuta: non c'è niente da riprodurre e la decisione
        // è già a storico. Resta utile una sola scelta, escludere il sito.
        if (choice === 'allowlist') finalize('allowlist', null, 'toast');
      });
    } catch { /* l'avviso è un di più: non deve mai rompere la pagina */ }
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);

  CF.detector = { classify, classifyText, findTarget, structuralType, contrast, palette };
})();

/**
 * L'avviso che si frappone fra l'utente e il click.
 *
 * Principio di progetto: l'utente ha il dito sul pulsante e dieci secondi di
 * pazienza. Quindi prima il numero (quanto mi costa), poi la scadenza da
 * ricordare, e solo dopo, se vuole, il dettaglio delle clausole. Il punteggio
 * e il motore che l'ha prodotto stanno in fondo: sono la provenienza del
 * verdetto, non il verdetto.
 *
 * Vive in uno shadow root, dentro un <dialog> aperto con showModal(): il top
 * layer non è raggiungibile dallo z-index del sito, il focus resta dentro
 * l'avviso e il resto della pagina diventa inerte senza che dobbiamo
 * reimplementarlo. Sopra a tutto, un guardiano che rimette l'avviso al suo
 * posto se il sito prova a rimuoverlo o a nasconderlo con il proprio CSS.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.overlay) return;
  const esc = CF.util.escapeHtml;
  const I = globalThis.AF_I18N;
  const t = (s, v) => I.t(s, v);
  const tn = (n, one, many, v) => I.tn(n, one, many, v);

  /**
   * Ogni livello ha due inchiostri, uno per tema.
   *
   * I colori di `LEVELS` in core/constants.js sono tarati per il fondo chiaro:
   * su fondo scuro `#7d0a0a` (CRITICAL) contro `#1c2027` fa 1,49:1, cioè il
   * numero più importante dell'avviso — la cifra da 30 px — diventa
   * illeggibile proprio nel caso più grave. Quel file è il vocabolario del
   * motore e resta com'è: la variante scura è una questione di resa, e vive
   * qui insieme al resto degli stili.
   *
   * `badge` è l'inchiostro del pill colorato: su ambra e arancione il bianco
   * non arriva a 4,5:1 a 11 px (3,25:1 e 4,16:1), quindi lì si scrive scuro.
   *
   * Contrasti misurati con la formula WCAG 2.1 (fondi: chiaro #f7f8fa dentro
   * il blocco costo, scuro #1c2027):
   *   safe        #176e47 5,89:1   ·  #57d08f 8,42:1  ·  badge #fff  5,00:1
   *   review      #8a6508 5,01:1   ·  #e3b341 8,40:1  ·  badge scuro 6,08:1
   *   commitment  #a44f00 5,35:1   ·  #f59b4a 7,52:1  ·  badge scuro 4,76:1
   *   high_risk   #b3312a 5,83:1   ·  #ff8a80 7,16:1  ·  badge #fff  5,44:1
   *   critical    #7d0a0a 10,29:1  ·  #ff9b9b 8,10:1  ·  badge #fff 10,94:1
   */
  const LEVEL_PALETTE = {
    safe: { light: '#176e47', dark: '#57d08f', badge: '#ffffff' },
    review: { light: '#8a6508', dark: '#e3b341', badge: '#0d0a02' },
    commitment: { light: '#a44f00', dark: '#f59b4a', badge: '#0d0a02' },
    high_risk: { light: '#b3312a', dark: '#ff8a80', badge: '#ffffff' },
    critical: { light: '#7d0a0a', dark: '#ff9b9b', badge: '#ffffff' },
  };

  const FALLBACK_PALETTE = { light: '#4a5058', dark: '#b0b8c4', badge: '#ffffff' };

  const paletteFor = (levelId) => LEVEL_PALETTE[levelId] || FALLBACK_PALETTE;

  /** Fasce di severità di una singola clausola: stessa scala dei livelli. */
  const SEV_BANDS = [
    [80, 'critical'],
    [65, 'high_risk'],
    [45, 'commitment'],
    [25, 'review'],
    [0, 'safe'],
  ];

  function sevPalette(sev) {
    for (const [min, id] of SEV_BANDS) if (sev >= min) return paletteFor(id);
    return FALLBACK_PALETTE;
  }

  /** Colore (tema chiaro) della fascia di severità. */
  function sevColor(sev) {
    return sevPalette(sev).light;
  }

  const STYLES = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    /* Il <dialog> occupa tutto il viewport e fa da area di scarto: un click
       fuori dalla card colpisce lui, ed è il gesto di "torna indietro". */
    dialog.backdrop {
      position: fixed; inset: 0; margin: 0; border: 0; padding: 24px;
      width: 100%; max-width: 100%; height: 100%; max-height: 100%;
      background: transparent; color: inherit; overflow: hidden;
      display: none; align-items: center; justify-content: center;
      font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    }
    dialog.backdrop[open] { display: flex; animation: fade .16s ease-out; }
    dialog.backdrop::backdrop { background: rgba(11, 14, 20, .62); backdrop-filter: blur(3px); }
    @keyframes fade { from { opacity: 0 } to { opacity: 1 } }
    @keyframes rise { from { opacity: 0; transform: translateY(12px) } to { opacity: 1; transform: none } }
    .card {
      width: min(680px, 100%); max-height: min(86vh, 900px);
      background: #fff; color: #15203a; border-radius: 14px;
      box-shadow: 0 24px 70px rgba(0,0,0,.45);
      display: flex; flex-direction: column; overflow: hidden;
      animation: rise .2s cubic-bezier(.2,.7,.3,1);
      /* Inchiostri di livello: il tema scuro li ribalta più in basso. */
      --ink-safe: #176e47; --ink-review: #8a6508; --ink-commitment: #a44f00;
      --ink-high: #b3312a; --ink-critical: #7d0a0a;
    }
    .bar { height: 5px; background: var(--level-color, #888); }
    header { padding: 18px 22px 12px; border-bottom: 1px solid #eceef2; }
    .eyebrow {
      display: flex; align-items: center; gap: 8px; flex-wrap: wrap;
      font-size: 11px; letter-spacing: .09em; text-transform: uppercase;
      color: #6b7280; font-weight: 600;
    }
    .eyebrow .mark { width: 16px; height: auto; flex: none; }
    .badge {
      display: inline-flex; align-items: center; gap: 6px;
      background: var(--level-color, #888); color: var(--badge-ink, #fff);
      padding: 3px 9px; border-radius: 999px; font-size: 11px; letter-spacing: .06em;
    }
    h1 { margin: 10px 0 0; font-size: 19px; line-height: 1.32; font-weight: 650; }
    .action { margin: 6px 0 0; font-size: 13px; color: #6b7280; }
    .body { padding: 16px 22px; overflow-y: auto; flex: 1; }
    .cost {
      background: #f7f8fa; border: 1px solid #e8eaef; border-radius: 11px;
      padding: 14px 16px; margin-bottom: 14px;
    }
    .cost .head { display: flex; align-items: baseline; gap: 14px; flex-wrap: wrap; }
    .cost .amount { font-size: 30px; font-weight: 680; letter-spacing: -.02em; color: var(--level-ink, #15203a); }
    .cost .caption { font-size: 12px; color: #6b7280; }
    .cost .displayed { font-size: 13px; color: #6b7280; }
    .cost .displayed b { color: #15203a; }

    /* La formula come elenco verticale: chi deve giudicare da sé ha bisogno di
       leggere gli addendi uno per uno, non una riga di somme. */
    .formula { margin-top: 12px; font-size: 12.5px; color: #414852; width: 100%; }
    .formula li { display: flex; justify-content: space-between; gap: 14px; padding: 3px 0; }
    .formula .voce { color: #4a5058; }
    .formula .cifra { font-variant-numeric: tabular-nums; white-space: nowrap; }
    .formula .tot { border-top: 1px solid #dfe3ea; margin-top: 4px; padding-top: 6px; font-weight: 650; }
    .horizon { margin: 6px 0 0; font-size: 12px; color: #6b7280; }

    .remember {
      display: flex; gap: 10px; align-items: flex-start;
      background: #fff7cc; border: 1px solid #ffe04a; border-radius: 10px;
      padding: 11px 13px; margin-bottom: 14px; font-size: 13.5px; line-height: 1.45;
    }
    /* Dentro il blocco costo la scadenza è la seconda riga, non un box a parte:
       «648,76 €» e «entro il 15 giugno 2028» sono un colpo d'occhio solo. */
    .cost .remember { margin: 12px 0 0; }
    .remember .ico { font-size: 15px; line-height: 1.3; }
    .summary { font-size: 14px; line-height: 1.55; margin: 0 0 14px; color: #2b3038; }
    section { margin-bottom: 16px; }
    h2 {
      font-size: 11.5px; text-transform: uppercase; letter-spacing: .08em;
      color: #6b7280; margin: 0 0 8px; font-weight: 650;
    }
    ul { margin: 0; padding: 0; list-style: none; }
    .finding {
      border: 1px solid #e8eaef; border-radius: 10px; padding: 11px 13px; margin-bottom: 8px;
      border-left: 3px solid var(--sev-color, #d0d4dc);
    }
    .finding .top { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    .finding .name { font-weight: 620; font-size: 14px; }
    .finding .sev { font-size: 11px; color: #6b7280; white-space: nowrap; }
    .finding .plain { font-size: 13px; color: #414852; margin-top: 4px; line-height: 1.45; }
    .finding .quote {
      font-size: 12px; color: #5a616c; margin-top: 7px; padding: 7px 9px;
      background: #f7f8fa; border-radius: 7px; font-style: italic; line-height: 1.45;
    }
    .finding .tag {
      display: inline-block; margin-top: 6px; font-size: 10.5px; color: #6b7280;
      background: #f0f2f6; border-radius: 5px; padding: 2px 6px;
    }
    .timeline { position: relative; padding-left: 18px; }
    .timeline::before { content: ''; position: absolute; left: 5px; top: 6px; bottom: 6px; width: 2px; background: #e3e6ec; }
    .step { position: relative; margin-bottom: 11px; }
    .step::before {
      content: ''; position: absolute; left: -16px; top: 5px; width: 9px; height: 9px;
      border-radius: 50%; background: #b9bfca; border: 2px solid #fff;
    }
    .step[data-kind='deadline']::before { background: var(--ink-commitment); }
    .step[data-kind='renewal']::before { background: var(--ink-high); }
    .step[data-kind='penalty']::before { background: var(--ink-critical); }
    .step .when { font-size: 12px; font-weight: 650; color: #15203a; }
    .step .items { font-size: 13px; color: #414852; line-height: 1.5; }
    .law { border: 1px solid #dfe7f5; background: #f5f8fe; border-radius: 10px; padding: 11px 13px; margin-bottom: 8px; }
    .law .title { font-weight: 620; font-size: 13.5px; }
    .law .note { font-size: 12.5px; color: #414852; margin-top: 4px; line-height: 1.45; }
    .law .refs { font-size: 11px; color: #6b7280; margin-top: 5px; }
    details { border-top: 1px solid #eceef2; padding-top: 10px; }
    summary { cursor: pointer; font-size: 12.5px; color: #4a5568; font-weight: 600; }
    /* Il troncamento muto delle clausole in eccesso è un'omissione: qui il
       resto è chiuso, ma dichiarato e raggiungibile. */
    .more { border-top: none; padding-top: 2px; }
    .more > summary { color: #4a5568; }
    footer {
      padding: 13px 22px; border-top: 1px solid #eceef2; background: #fafbfc;
      display: flex; gap: 10px; align-items: center; flex-wrap: wrap;
    }
    footer .spacer { flex: 1; }
    button {
      font: inherit; font-size: 14px; font-weight: 600; border-radius: 9px;
      padding: 10px 16px; cursor: pointer; border: 1px solid transparent; transition: .12s;
    }
    button:focus-visible { outline: 2px solid #2f5bd3; outline-offset: 2px; }
    .cancel { background: #15203a; color: #fff; }
    .cancel:hover { background: #0d1424; }
    .proceed { background: #fff; color: #6b7280; border-color: #d7dbe2; font-weight: 500; }
    .proceed:hover { color: #15203a; border-color: #b9bfca; }
    .proceed[aria-disabled='true'] { opacity: .45; cursor: not-allowed; }
    .proceed[aria-disabled='true']:hover { color: #6b7280; border-color: #d7dbe2; }
    .link { background: none; border: none; color: #6b7280; font-size: 12.5px; font-weight: 500; padding: 6px 4px; text-decoration: underline; }
    .armhint { margin: 0; padding: 0 22px 10px; font-size: 11.5px; color: #6b7280; line-height: 1.45; }
    .armhint:empty { padding: 0; }
    /**
     * Testo per chi ascolta, non per chi guarda: l'annuncio dello sblocco
     * restava a schermo come una riga di interfaccia («Ora puoi premere
     * "Continua comunque"»), che a chi vede il pulsante attivo non dice nulla.
     * Ritaglio invece di display:none, altrimenti gli screen reader non lo
     * leggerebbero affatto.
     */
    .v-arm-live {
      position: absolute; width: 1px; height: 1px; margin: -1px;
      padding: 0; border: 0; overflow: hidden; white-space: nowrap;
      clip: rect(0 0 0 0); clip-path: inset(50%);
    }
    /* Provenienza: da dove viene il verdetto e quanto pesa il punteggio.
       Serve a chi vuole controllare, non a chi deve decidere in tre secondi. */
    .provenance { font-size: 11px; color: #6b7280; padding: 0 22px 4px; line-height: 1.5; }
    .disclaimer { font-size: 11px; color: #6b7280; padding: 0 22px 12px; line-height: 1.45; }
    @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
    .loading { padding: 40px 22px; text-align: center; }
    .spinner {
      width: 26px; height: 26px; border: 3px solid #e3e6ec; border-top-color: #15203a;
      border-radius: 50%; margin: 0 auto 14px; animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg) } }
    .loading p { font-size: 14px; color: #414852; margin: 0; }
    .loading small { display: block; margin-top: 6px; color: #6b7280; font-size: 12px; }
    .upsell { margin: 0 0 12px; }
    .upgrade { all: unset; box-sizing: border-box; display: block; width: 100%; text-align: center; cursor: pointer; font: 700 14px/1.2 inherit; padding: 11px 14px; border-radius: 10px; background: #ffe04a; color: #15203a; }
    .upgrade:focus-visible { outline: 3px solid #2f5bd3; outline-offset: 2px; }
    .upgrade[aria-disabled="true"] { opacity: .6; cursor: default; }
    .upsell-note { margin: 6px 0 0; font-size: 12.5px; }
    .error { background: #fff5f5; border: 1px solid #f5c6c6; border-radius: 9px; padding: 10px 12px; font-size: 12.5px; color: #7d2020; margin-bottom: 12px; }

    @media (prefers-color-scheme: dark) {
      .card {
        background: #15203a; color: #e8eaef;
        --ink-safe: #57d08f; --ink-review: #e3b341; --ink-commitment: #f59b4a;
        --ink-high: #ff8a80; --ink-critical: #ff9b9b;
      }
      header, footer, details { border-color: #2a2f38; }
      footer { background: #12151a; }
      .cost, .finding .quote { background: #1c2027; border-color: #2a2f38; }
      .finding { border-color: #2a2f38; }
      .finding { border-left-color: var(--sev-color-dark, var(--sev-color, #444c59)); }
      .law { background: #161d2a; border-color: #24314a; }
      .remember { background: #2a2312; border-color: #4a3d18; color: #f0e6cf; }
      .summary, .finding .plain, .step .items, .law .note, .loading p, .formula { color: #c3c8d1; }
      h1, .finding .name, .step .when, .law .title, .cost .displayed b { color: #f2f4f8; }
      summary, .more > summary { color: #c3c8d1; }
      /* Il grigio dei testi secondari è tarato sul fondo chiaro: su #15203a
         scende a 3,64:1, sotto la soglia per corpi da 11-12 px. */
      .eyebrow, .action, h2, .cost .caption, .cost .displayed, .formula .voce, .horizon,
      .finding .sev, .finding .tag, .law .refs, .loading small, .link,
      .armhint, .provenance, .disclaimer { color: #a8b0bd; }
      .finding .quote { color: #b4bbc7; }
      .finding .tag { background: #232830; }
      .formula .tot { border-top-color: #2a2f38; }
      /* Sul fondo scuro il pill e la barra prendono l'inchiostro chiaro: il
         colore di livello pieno (1,61:1 per CRITICAL) sparirebbe nella card. */
      .bar { background: var(--level-ink-dark, var(--level-color, #888)); }
      .badge { background: var(--level-ink-dark, var(--level-color, #888)); color: #15203a; }
      .cost .amount { color: var(--level-ink-dark, #f2f4f8); }
      .cancel { background: #f2f4f8; color: #15203a; }
      .proceed { background: transparent; border-color: #3a414d; color: #9aa2ae; }
      .proceed:hover { color: #f2f4f8; border-color: #5a6472; }
      .proceed[aria-disabled='true']:hover { color: #9aa2ae; border-color: #3a414d; }
      .timeline::before { background: #2a2f38; }
      .spinner { border-color: #2a2f38; border-top-color: #e8eaef; }
      .error { background: #2a1616; border-color: #5a2626; color: #f5b5b5; }
    }

    /* Chi ha chiesto meno movimento lo ha chiesto al sistema operativo: un
       avviso che pulsa mentre si legge un contratto è esattamente il caso. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }
      /* Lo stato "in corso" resta leggibile senza rotazione: un anello pieno
         invece di uno che gira. */
      .spinner { animation: none; border-style: dotted; border-color: #8a919d; }
    }
  `;

  const HOST_TAG = 'antefirma-alert';

  /** Quanto resta bloccato "Continua comunque" dal primo disegno della card. */
  const ARM_MS = 3000;

  /** Passi di timeline che da soli valgono comunque la sezione. */
  const KEY_STEPS = new Set(['deadline', 'renewal', 'penalty']);

  /** Quante clausole stanno in chiaro prima del blocco richiudibile. */
  const FINDINGS_HEAD = 6;

  function money(amount, currency = 'EUR') {
    if (amount == null || !Number.isFinite(amount)) return '';
    try {
      return new Intl.NumberFormat(I.locale, { style: 'currency', currency }).format(amount);
    } catch {
      return `${amount.toFixed(2)} ${currency}`;
    }
  }

  class Overlay {
    constructor() {
      this.host = null;
      this.root = null;
      this.dialog = null;
      /** Istante del primo armamento: il conto alla rovescia parte una volta sola. */
      this.armedAt = null;
      this.armTimer = null;
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    mount() {
      if (this.host?.isConnected) return;
      this.host = document.createElement(HOST_TAG);
      this.host.setAttribute('data-open', '1');
      this.root = this.host.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = STYLES;
      this.root.append(style);
      this.enforceHostStyle();
      (document.documentElement || document.body).append(this.host);
      document.addEventListener('keydown', this.onKeyDown, true);
      this.startWatchdog();
    }

    /**
     * Gli stili dell'host vanno scritti inline e in !important.
     *
     * Il foglio di stile del sito ha la stessa dignità del nostro: gli
     * basterebbe un `antefirma-alert { display: none }` per far sparire
     * l'avviso lasciando il click sospeso — cioè per rompere la pagina e
     * insieme la protezione.
     */
    enforceHostStyle() {
      const rules = {
        position: 'fixed', inset: '0', 'z-index': '2147483647',
        display: 'block', visibility: 'visible', opacity: '1',
        'pointer-events': 'auto', transform: 'none', filter: 'none',
      };
      for (const [prop, value] of Object.entries(rules)) {
        this.host.style.setProperty(prop, value, 'important');
      }
    }

    /**
     * Un shadow root chiuso darebbe solo l'illusione della protezione: la
     * pagina non ne leggerebbe il contenuto, ma potrebbe comunque rimuovere
     * l'elemento host dal DOM. Meglio uno shadow aperto — ispezionabile, e
     * quindi verificabile dai test — con un guardiano che rimette l'avviso al
     * suo posto se qualcuno lo toglie di mezzo.
     */
    startWatchdog() {
      this.watchdog = new MutationObserver(() => {
        if (!this.resolve) return; // decisione già presa: nulla da difendere
        if (!this.host) return;
        if (!this.host.isConnected) {
          (document.documentElement || document.body).append(this.host);
        }
        this.enforceHostStyle();
        // Staccare l'host dal documento fa cadere il dialogo dal top layer:
        // rimetterlo nel DOM non basta, va riaperto o l'avviso resta lì
        // svuotato di ogni difesa (niente focus trap, niente inerzia).
        this.ensureModal();
      });
      this.watchdog.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['style', 'class'],
      });
    }

    /**
     * Apre (o riapre) il dialogo come modale.
     *
     * showModal() è ciò che ci dà gratis quello che `aria-modal` da solo non dà
     * dentro uno shadow root: il focus non esce dall'avviso, il resto della
     * pagina è inerte — compreso il pulsante che stiamo bloccando — ed Esc
     * arriva a noi. Se il browser non lo supporta si ripiega su un dialogo
     * aperto e basta: meno protetto, ma visibile.
     */
    ensureModal() {
      const dlg = this.dialog;
      if (!dlg?.isConnected) return;
      try {
        if (dlg.open && dlg.matches(':modal')) return;
        if (dlg.open) dlg.close();
        dlg.showModal();
      } catch {
        dlg.setAttribute('open', '');
      }
    }

    onKeyDown(e) {
      if (!this.host?.isConnected) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.finish('cancel');
      }
    }

    /**
     * @param {string} html contenuto del dialogo
     * @param {{ role?: string, label?: string, labelledby?: string }} [aria]
     */
    render(html, aria = {}) {
      this.mount();
      const existing = this.root.querySelector('dialog.backdrop');
      if (existing) existing.remove();
      const dlg = document.createElement('dialog');
      dlg.className = 'backdrop';
      // Con un role esplicito l'`aria-modal` implicito del dialogo modale non
      // vale più: va riscritto a mano.
      dlg.setAttribute('role', aria.role || 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      if (aria.labelledby) dlg.setAttribute('aria-labelledby', aria.labelledby);
      else if (aria.label) dlg.setAttribute('aria-label', aria.label);
      dlg.innerHTML = html;
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) this.finish('cancel');
      });
      // Esc e ogni altra "close request" del browser passano di qui e valgono
      // «Torna indietro», come è sempre stato.
      //
      // Non stiamo invece a sentire `close`: quell'evento è accodato, non
      // sincrono, e arriva anche quando siamo noi a chiudere il dialogo per
      // ridisegnare la card. Ascoltarlo significava annullare l'azione
      // dell'utente al primo aggiornamento del verdetto.
      dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        this.finish('cancel');
      });
      this.root.append(dlg);
      this.dialog = dlg;
      this.ensureModal();
      return dlg;
    }

    showLoading(actionLabel) {
      this.render(
        `
        <div class="card">
          <div class="bar" style="--level-color:#6b7280"></div>
          <div class="loading">
            <div class="spinner"></div>
            <p role="status">${esc(t('Sto verificando a cosa ti stai impegnando…'))}</p>
            <small>${esc(actionLabel || t('Azione in sospeso'))} · ${esc(t('il click è momentaneamente sospeso'))}</small>
          </div>
          <footer>
            <span class="spacer"></span>
            <button class="link" data-act="cancel">Annulla</button>
          </footer>
        </div>
      `,
        { label: t('Verifica dell’impegno in corso') }
      );
      this.bind();
    }

    /**
     * Il consenso alla prima analisi. Il testo della pagina parte verso il
     * server di AnteFirma solo dopo questo sì, e il sì vale per le analisi
     * successive finché non lo si ritira dalle impostazioni.
     *
     * I due pulsanti accettano solo click veri (`isTrusted`): l'avviso sta in
     * uno shadow root aperto, e uno script della pagina potrebbe altrimenti
     * premere «Analizza» al posto della persona.
     *
     * @returns {Promise<'accept'|'skip'>} `cancel` passa da `wait()`, come sempre.
     */
    askConsent() {
      return new Promise((resolve) => {
        this.render(
          `
          <div class="card" style="--level-color:#15203A">
            <div class="bar"></div>
            <header>
              <div class="eyebrow"><svg class="mark" viewBox="0 0 64 72" aria-hidden="true"><path d="M32 4 L55.5 10 C57.5 10.6 58.5 12.2 58.5 14.2 V34 C58.5 48.5 48.5 59.5 34.2 66.6 C33.3 67.1 30.7 67.1 29.8 66.6 C15.5 59.5 5.5 48.5 5.5 34 V14.2 C5.5 12.2 6.5 10.6 8.5 10 Z" fill="#FFE04A"/><path d="M32 6.6 L52.9 11.9 C54.9 12.4 55.9 13.8 55.9 15.5 V32.4 C55.9 46.4 46.6 56.4 33.9 62.7 C33.3 63.2 30.7 63.2 30.1 62.7 C17.4 56.4 8.1 46.4 8.1 32.4 V15.5 C8.1 13.8 9.1 12.4 11.1 11.9 Z" fill="#15203A"/><path d="M32 15.5V37.5M22.47 21L41.53 32M22.47 32L41.53 21" stroke="#FFE04A" stroke-width="6.4" stroke-linecap="round"/><path d="M19 49.5 C22 44 26 43.5 29 47 S34.5 52 38 47.5 S43 42.5 45 43" fill="none" stroke="#FFE04A" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="badge">AnteFirma*</span><span>${esc(t('prima analisi'))}</span></div>
              <h1 id="v-title">${esc(t('Posso leggere questa pagina per te?'))}</h1>
            </header>
            <div class="body">
              <p class="summary">${esc(t('Per dirti a che cosa ti stai impegnando, AnteFirma manda il testo della pagina e il suo indirizzo al proprio server, che lo fa leggere a un modello di intelligenza artificiale (Claude, di Anthropic) e ti risponde con le clausole che ti impegnano, ciascuna con la frase esatta da cui nasce.'))}</p>
              <p class="summary">${esc(t('Il server non conserva il testo né l’indirizzo. Nessun account, nessun dato che ti identifichi. Puoi ritirare il consenso quando vuoi dalle impostazioni.'))}</p>
            </div>
            <footer>
              <button class="cancel" data-act="cancel">${esc(t('Torna indietro'))}</button>
              <span class="spacer"></span>
              <button class="link" data-consent="skip">${esc(t('Prosegui senza analisi'))}</button>
              <button class="proceed" data-consent="accept">${esc(t('Sì, analizza'))}</button>
            </footer>
          </div>
        `,
          { role: 'alertdialog', labelledby: 'v-title' }
        );
        this.bind();
        for (const btn of this.root.querySelectorAll('[data-consent]')) {
          btn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            if (!e.isTrusted) return;
            if (btn.dataset.consent === 'skip') {
              resolve('skip');
              this.finish('proceed');
            } else {
              resolve('accept');
            }
          });
        }
        this.root.querySelector('[data-consent="accept"]')?.focus?.();
      });
    }

    /** L'avviso è ancora in attesa di una decisione dell'utente? */
    isOpen() {
      return Boolean(this.resolve && this.host?.isConnected);
    }

    showVerdict(verdict, { blocking = true } = {}) {
      const level = verdict.level || {};
      const cost = verdict.cost || {};
      const findings = verdict.findings || [];
      const timeline = verdict.timeline || [];
      const consumer = verdict.consumer || {};
      const ink = paletteFor(level.id);

      const remember = verdict.mustRemember
        ? `<div class="remember"><span class="ico">📌</span><span>${esc(verdict.mustRemember)}</span></div>`
        : '';

      const formula = cost.lines?.length
        ? `<ul class="formula">
             ${cost.lines
               .map(
                 (l) => `<li>
                   <span class="voce">${esc(l.label)}</span>
                   <span class="cifra">${l.amount != null ? esc(money(l.amount, cost.currency)) : esc(t('importo non quantificato'))}</span>
                 </li>`
               )
               .join('')}
             ${cost.worstCaseLabel ? `<li class="tot"><span class="voce">${esc(t('totale'))}</span><span class="cifra">${esc(cost.worstCaseLabel)}</span></li>` : ''}
           </ul>
           ${cost.horizonReason ? `<p class="horizon">${esc(cost.horizonReason)}</p>` : ''}`
        : '';

      // La scadenza entra dentro il blocco del costo: sono le due cose che il
      // prodotto promette, e devono stare nello stesso sguardo. Se non c'è un
      // costo da mostrare, la scadenza resta comunque, da sola.
      const costBlock = cost.worstCaseLabel
        ? `<div class="cost">
             <div class="head">
               <div>
                 <div class="amount">${esc(cost.worstCaseLabel)}</div>
                 <div class="caption">${esc(t('impegno economico potenziale stimato'))}</div>
               </div>
               ${cost.displayed ? `<div class="displayed">${esc(t('prezzo mostrato in pagina'))}<br><b>${esc(cost.displayed)}</b></div>` : ''}
             </div>
             ${remember}
             ${formula}
           </div>`
        : remember;

      const head = findings.slice(0, FINDINGS_HEAD);
      const rest = findings.slice(FINDINGS_HEAD);
      const findingsBlock = findings.length
        ? `<section>
             <h2>${esc(t('Cosa stai accettando'))}</h2>
             <ul>${head.map(renderFinding).join('')}</ul>
             ${
               rest.length
                 ? `<details class="more">
                      <summary>${esc(tn(rest.length, 'Altra {n} condizione', 'Altre {n} condizioni'))}</summary>
                      <ul style="margin-top:8px">${rest.map(renderFinding).join('')}</ul>
                    </details>`
                 : ''
             }
           </section>`
        : '';

      // Un solo passo di timeline di solito è rumore, ma se quel passo è una
      // scadenza, un rinnovo o una penale è proprio la data da ricordare:
      // scartarla la farebbe uscire dalla card.
      const showTimeline =
        timeline.length > 1 || (timeline.length === 1 && KEY_STEPS.has(timeline[0]?.kind));
      const timelineBlock = showTimeline
        ? `<section>
             <h2>${esc(t('Che cosa succede se clicchi'))}</h2>
             <div class="timeline">
               ${timeline
                 .map(
                   (s) => `<div class="step" data-kind="${esc(s.kind)}">
                     <div class="when">${esc(s.when)}</div>
                     <div class="items">${s.items.map(esc).join(' · ')}</div>
                   </div>`
                 )
                 .join('')}
             </div>
           </section>`
        : '';

      const lawBlock = consumer.flags?.length
        ? `<details>
             <summary>${esc(consumer.jurisdiction === 'IT'
               ? tn(consumer.flags.length, '{n} condizione da verificare rispetto alle tutele italiane per i consumatori', '{n} condizioni da verificare rispetto alle tutele italiane per i consumatori')
               : tn(consumer.flags.length, '{n} condizione da verificare rispetto alle tutele UE per i consumatori', '{n} condizioni da verificare rispetto alle tutele UE per i consumatori'))}</summary>
             <div style="margin-top:10px">
               ${consumer.flags
                 .map(
                   (f) => `<div class="law">
                     <div class="title">${esc(f.title)}</div>
                     <div class="note">${esc(f.note)}</div>
                     <div class="refs">${esc((f.refs || []).join(' · '))}</div>
                   </div>`
                 )
                 .join('')}
             </div>
           </details>`
        : '';

      const errorBlock = verdict.engine?.truncated
        ? `<div class="error">${esc(t('La pagina era molto lunga: è stata analizzata solo in parte.'))}</div>`
        : '';

      this.render(
        `
        <div class="card" style="--level-color:${esc(level.color || '#888')};--level-ink:${ink.light};--level-ink-dark:${ink.dark};--badge-ink:${ink.badge}">
          <div class="bar"></div>
          <header>
            <div class="eyebrow">
              <svg class="mark" viewBox="0 0 64 72" aria-hidden="true"><path d="M32 4 L55.5 10 C57.5 10.6 58.5 12.2 58.5 14.2 V34 C58.5 48.5 48.5 59.5 34.2 66.6 C33.3 67.1 30.7 67.1 29.8 66.6 C15.5 59.5 5.5 48.5 5.5 34 V14.2 C5.5 12.2 6.5 10.6 8.5 10 Z" fill="#FFE04A"/><path d="M32 6.6 L52.9 11.9 C54.9 12.4 55.9 13.8 55.9 15.5 V32.4 C55.9 46.4 46.6 56.4 33.9 62.7 C33.3 63.2 30.7 63.2 30.1 62.7 C17.4 56.4 8.1 46.4 8.1 32.4 V15.5 C8.1 13.8 9.1 12.4 11.1 11.9 Z" fill="#15203A"/><path d="M32 15.5V37.5M22.47 21L41.53 32M22.47 32L41.53 21" stroke="#FFE04A" stroke-width="6.4" stroke-linecap="round"/><path d="M19 49.5 C22 44 26 43.5 29 47 S34.5 52 38 47.5 S43 42.5 45 43" fill="none" stroke="#FFE04A" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span class="badge">${esc(level.icon || '')} ${esc(level.label || '')}</span>
              <span>${esc(verdict.actionLabel || '')}</span>
            </div>
            <h1 id="v-title">${esc(verdict.headline || level.headline || '')}</h1>
            ${verdict.host ? `<p class="action">${esc(verdict.host)}</p>` : ''}
          </header>
          <div class="body">
            ${errorBlock}
            ${costBlock}
            ${verdict.summary ? `<p class="summary">${esc(verdict.summary)}</p>` : ''}
            ${findingsBlock}
            ${timelineBlock}
            ${lawBlock}
          </div>
          <footer>
            <button class="cancel" data-act="cancel">${esc(blocking ? t('Torna indietro') : t('Annulla'))}</button>
            <button class="proceed" data-act="proceed"${blocking ? ' data-arm="1" aria-disabled="true" aria-describedby="v-arm-why"' : ''}>${esc(t('Continua comunque'))}</button>
            <span class="spacer"></span>
            <button class="link" data-act="allowlist">${esc(t('Non avvisarmi su {x}', { x: verdict.host || t('questo sito') }))}</button>
          </footer>
          ${
            blocking
              ? `<p class="armhint">
                   <span id="v-arm-why">${esc(t('«Continua comunque» si attiva fra un istante: il click che hai appena fatto è ancora in corso.'))}</span>
                   <span class="v-arm-live" role="status"></span>
                 </p>`
              : ''
          }
          <div class="provenance">${esc(t('Verdetto da {x} · rischio della decisione {n}/100', { x: engineLabel(verdict.engine), n: verdict.score }))}${esc(quotaNote(verdict))}</div>
          <div class="disclaimer">${esc(consumer.disclaimer || t('Analisi automatica a scopo informativo. Non è un parere legale.'))}</div>
        </div>
      `,
        { role: 'alertdialog', labelledby: 'v-title' }
      );

      this.bind();
      this.armProceed();
    }

    showError(message, code = '') {
      const ink = paletteFor('review');
      // Analisi del mese finite: il momento in cui la persona ha appena visto
      // che il servizio le serve. Il pulsante apre il pagamento già legato a
      // questo browser (o le impostazioni, per chi ha già un piano).
      const upsell = code === 'quota_month'
        ? `<div class="upsell"><button class="upgrade" type="button" data-upgrade>${esc(t('Passa a Pro · 50 analisi al mese'))}</button><p class="upsell-note" aria-live="polite"></p></div>`
        : '';
      this.render(
        `
        <div class="card" style="--level-color:#b8860b;--level-ink:${ink.light};--level-ink-dark:${ink.dark};--badge-ink:${ink.badge}">
          <div class="bar"></div>
          <header>
            <div class="eyebrow"><span class="badge">⚠️ ${esc(t('ANALISI NON RIUSCITA'))}</span></div>
            <h1 id="v-title">${esc(t('Non sono riuscito a verificare questo impegno'))}</h1>
          </header>
          <div class="body">
            <div class="error">${esc(message)}</div>
            ${upsell}
            <p class="summary">${esc(t('Puoi procedere comunque, ma lo stai facendo senza verifica. Se il documento è lungo, aprilo nel pannello laterale e incollalo lì.'))}</p>
          </div>
          <footer>
            <button class="cancel" data-act="cancel">${esc(t('Torna indietro'))}</button>
            <button class="proceed" data-act="proceed">${esc(t('Continua comunque'))}</button>
          </footer>
        </div>
      `,
        { role: 'alertdialog', labelledby: 'v-title' }
      );
      this.bind();
    }

    /**
     * "Continua comunque" si sblocca dopo un attimo: non per attrito fine a sé
     * stesso, ma perché il click che stiamo intercettando era già partito e la
     * mano è ancora in movimento.
     *
     * Due cose che prima non erano vere:
     *
     * 1. Il pulsante non è `disabled`. Un `<button disabled>` esce dall'ordine
     *    di tabulazione: chi naviga da tastiera non lo incontra proprio, e
     *    dopo tre secondi se lo ritrova comparso senza che nulla glielo abbia
     *    detto. Con `aria-disabled` il pulsante resta raggiungibile e
     *    annunciato come non disponibile, e il click lo fermiamo noi in bind().
     *
     * 2. L'armamento è idempotente. Il raffinamento ridisegna la card, e con
     *    essa faceva ripartire il conto da tre — un bersaglio che si sposta
     *    sotto il dito di chi lo stava già puntando. L'istante di partenza è
     *    memorizzato una volta sola.
     */
    armProceed() {
      clearTimeout(this.armTimer);
      this.armTimer = null;
      const btn = this.root?.querySelector('.proceed[data-arm]');
      if (!btn) return;
      this.armedAt ??= Date.now();
      const left = ARM_MS - (Date.now() - this.armedAt);
      if (left <= 0) {
        // Già scaduto quando la card è stata ridisegnata: niente da annunciare,
        // il pulsante era libero anche un attimo fa.
        this.releaseProceed(false);
        return;
      }
      this.armTimer = setTimeout(() => this.releaseProceed(true), left);
    }

    /** @param {boolean} announce dare voce allo sblocco (una volta sola). */
    releaseProceed(announce) {
      const btn = this.root?.querySelector('.proceed[data-arm]');
      if (!btn) return;
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('aria-describedby');
      this.root.querySelector('#v-arm-why')?.remove();
      const live = this.root.querySelector('.v-arm-live');
      // Tolto il perché, resta solo la live region: senza padding la riga non
      // lascia un vuoto sotto ai pulsanti (`.armhint:empty`).
      // Un annuncio solo, allo sblocco. Un tick al secondo riempirebbe di
      // numeri lo spazio sonoro proprio mentre c'è un contratto da ascoltare.
      if (live) live.textContent = announce ? t('Ora puoi premere «Continua comunque».') : '';
    }

    bind() {
      for (const btn of this.root.querySelectorAll('[data-act]')) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // `aria-disabled` non impedisce il click come farebbe `disabled`:
          // il rifiuto tocca a noi.
          if (btn.getAttribute('aria-disabled') === 'true') return;
          this.finish(btn.dataset.act);
        });
      }
      const up = this.root.querySelector('[data-upgrade]');
      up?.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        up.setAttribute('aria-disabled', 'true');
        const note = this.root.querySelector('.upsell-note');
        try {
          const r = await CF.bridge.send('UPGRADE');
          if (note) note.textContent = r?.error ? r.message : r?.where === 'options'
            ? t('Ho aperto le impostazioni del piano in una nuova scheda.')
            : t('Ho aperto la pagina di pagamento in una nuova scheda. Dopo il pagamento il piano si attiva da solo.');
        } catch (err) {
          if (note) note.textContent = err?.message || t('Non riesco ad aprire la pagina di pagamento.');
        }
      });
      // Durante il caricamento non c'è nessun `.cancel`, solo un `.link`: la
      // ricerca per classe lasciava il focus dov'era, cioè sulla pagina sotto.
      const first = this.root.querySelector('[data-act]');
      first?.focus?.();
    }

    finish(action) {
      const resolve = this.resolve;
      this.resolve = null;
      this.destroy();
      resolve?.(action || 'cancel');
    }

    destroy() {
      document.removeEventListener('keydown', this.onKeyDown, true);
      clearTimeout(this.armTimer);
      this.armTimer = null;
      this.watchdog?.disconnect();
      this.watchdog = null;
      this.dialog = null;
      this.host?.remove();
      this.host = null;
      this.root = null;
    }

    /** @returns {Promise<'proceed'|'cancel'|'allowlist'>} */
    wait() {
      return new Promise((resolve) => {
        this.resolve = resolve;
      });
    }
  }

  /**
   * Quante analisi gratuite restano nel mese. Solo per un verdetto appena
   * arrivato dal server: uno dalla cache locale non ha consumato niente, e il
   * suo numero sarebbe vecchio.
   */
  function quotaNote(verdict = {}) {
    const m = verdict.engine?.quota?.month;
    if (!m || verdict.cached || typeof m.remaining !== 'number') return '';
    const n = m.remaining;
    const paid = verdict.engine?.quota?.plan && verdict.engine.quota.plan !== 'free';
    return ' · ' + (paid
      ? tn(n, 'ti resta {n} analisi questo mese', 'ti restano {n} analisi questo mese')
      : tn(n, 'ti resta {n} analisi gratuita questo mese', 'ti restano {n} analisi gratuite questo mese'));
  }

  /** Da dove viene questo verdetto: conta per la fiducia che merita. */
  function engineLabel(engine = {}) {
    return engine.cached ? t('AI (analisi già fatta per questo testo)') : 'AI';
  }

  function renderFinding(f) {
    const ink = sevPalette(f.severity);
    const tags = [];
    if (f.personalized && f.personalReasons?.length) tags.push(t('rilevante per: {x}', { x: f.personalReasons.join(', ') }));
    if (f.quotes?.length) tags.push(t('citata in {n} punti della pagina', { n: f.quotes.length + 1 }));

    return `<li class="finding" style="--sev-color:${ink.light};--sev-color-dark:${ink.dark}">
      <div class="top">
        <span class="name">${esc(f.title || f.label)}</span>
        <span class="sev">${esc(String(f.severity))}/100</span>
      </div>
      <div class="plain">${esc(f.plain || f.why || '')}</div>
      ${f.quote ? `<div class="quote">“${esc(f.quote)}”</div>` : ''}
      ${tags.length ? `<span class="tag">${esc(tags.join(' · '))}</span>` : ''}
    </li>`;
  }

  CF.overlay = { Overlay, sevColor };
})();

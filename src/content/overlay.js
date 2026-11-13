/**
 * The warning that stands between the user and the click.
 *
 * Design principle: the user has a finger on the button and ten seconds of
 * patience. So first the number (what it costs me), then the deadline to
 * remember, and only then, if they want, the clause details. The score and the
 * engine that produced it sit at the bottom: they are where the verdict comes
 * from, not the verdict.
 *
 * It lives in a shadow root, inside a <dialog> opened with showModal(): the top
 * layer is out of reach of the site's z-index, focus stays inside the warning
 * and the rest of the page becomes inert without us reimplementing it. On top
 * of everything, a guard puts the warning back in place if the site tries to
 * remove it or hide it with its own CSS.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.overlay) return;
  const esc = CF.util.escapeHtml;
  const I = globalThis.AF_I18N;
  /**
   * The help page on the warning, per interface language. A content script can't
   * import core/help.js: test/help.test.mjs checks these match helpUrl('warning').
   */
  const WARNING_HELP = { it: '/aiuto/l-avviso/', en: '/en/help/the-warning/', es: '/es/ayuda/el-aviso/', de: '/de/hilfe/die-warnung/', fr: '/fr/aide/l-avertissement/', nl: '/nl/hulp/de-waarschuwing/', pl: '/pl/pomoc/ostrzezenie/', pt: '/pt/ajuda/o-aviso/', sv: '/sv/hjalp/varningen/', ro: '/ro/ajutor/avertismentul/', cs: '/cs/napoveda/upozorneni/', da: '/da/hjaelp/advarslen/', fi: '/fi/ohje/varoitus/', no: '/no/hjelp/advarselen/', sk: '/sk/pomocnik/upozornenie/', hu: '/hu/sugo/a-figyelmeztetes/', el: '/el/voitheia/i-proeidopoiisi/', hr: '/hr/pomoc/upozorenje/', sl: '/sl/pomoc/opozorilo/', bg: '/bg/pomosht/preduprezhdenieto/', lt: '/lt/pagalba/ispejimas/', lv: '/lv/palidziba/bridinajums/', et: '/et/abi/hoiatus/' };
  const t = (s, v) => I.t(s, v);
  const tn = (n, one, many, v) => I.tn(n, one, many, v);

  /**
   * Every level has two inks, one per theme.
   *
   * The `LEVELS` colours in core/constants.js are tuned for the light
   * background: on dark, `#7d0a0a` (CRITICAL) against `#1c2027` is 1.49:1, so
   * the most important number of the warning — the 30 px figure — becomes
   * unreadable in exactly the most serious case. That file is the engine's
   * vocabulary and stays as it is: the dark variant is a rendering matter, and
   * lives here with the rest of the styles.
   *
   * `badge` is the ink of the coloured pill: on amber and orange, white doesn't
   * reach 4.5:1 at 11 px (3.25:1 and 4.16:1), so dark ink is used there.
   *
   * Contrasts measured with the WCAG 2.1 formula (backgrounds: light #f7f8fa
   * inside the cost block, dark #1c2027):
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

  /** Severity bands of a single clause: the same scale as the levels. */
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

  /** Colour (light theme) of the severity band. */
  function sevColor(sev) {
    return sevPalette(sev).light;
  }

  // The style sheet is in overlay-styles.js.
  const STYLES = CF.overlayStyles;

  const HOST_TAG = 'antefirma-alert';

  /** How long "Continue anyway" stays locked from the card's first paint. */
  const ARM_MS = 3000;

  /** Timeline steps that are worth the section on their own. */
  const KEY_STEPS = new Set(['deadline', 'renewal', 'penalty']);

  /** How many clauses are shown before the collapsible block. */
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
      /** When it was first armed: the countdown starts only once. */
      this.armedAt = null;
      this.armTimer = null;
      this.onKeyDown = this.onKeyDown.bind(this);
    }

    mount() {
      if (this.host?.isConnected) return;
      this.host = document.createElement(HOST_TAG);
      this.host.setAttribute('data-open', '1');
      // The interface language, not the site's: Greek capitals drop their accents only when the browser knows the text is Greek.
      this.host.setAttribute('lang', I.lang === 'no' ? 'nb' : I.lang);
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
     * Host styles must be written inline and !important.
     *
     * The site's stylesheet ranks as high as ours: an `antefirma-alert
     * { display: none }` would be enough to make the warning disappear while the
     * click stays held — breaking the page and the protection at once.
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
     * A closed shadow root would only give the illusion of protection: the page
     * couldn't read its content, but it could still remove the host element from
     * the DOM. Better an open shadow — inspectable, and so testable — with a
     * guard that puts the warning back if someone moves it out of the way.
     */
    startWatchdog() {
      this.watchdog = new MutationObserver(() => {
        if (!this.resolve) return; // decision already taken: nothing to defend
        if (!this.host) return;
        if (!this.host.isConnected) {
          (document.documentElement || document.body).append(this.host);
        }
        this.enforceHostStyle();
        // Detaching the host from the document drops the dialog from the top
        // layer: putting it back in the DOM isn't enough, it must be reopened or
        // the warning stays there stripped of every defence (no focus trap, no inertness).
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
     * Opens (or reopens) the dialog as a modal.
     *
     * showModal() gives us for free what `aria-modal` alone doesn't inside a
     * shadow root: focus doesn't leave the warning, the rest of the page is inert
     * — including the button we are holding — and Esc comes to us. If the
     * browser doesn't support it we fall back to a plain open dialog: less
     * protected, but visible.
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
     * @param {string} html the dialog content
     * @param {{ role?: string, label?: string, labelledby?: string }} [aria]
     */
    render(html, aria = {}) {
      this.mount();
      const existing = this.root.querySelector('dialog.backdrop');
      if (existing) existing.remove();
      const dlg = document.createElement('dialog');
      dlg.className = 'backdrop';
      // With an explicit role the dialog's implicit `aria-modal` no longer
      // applies: it must be set by hand.
      dlg.setAttribute('role', aria.role || 'dialog');
      dlg.setAttribute('aria-modal', 'true');
      if (aria.labelledby) dlg.setAttribute('aria-labelledby', aria.labelledby);
      else if (aria.label) dlg.setAttribute('aria-label', aria.label);
      dlg.innerHTML = html;
      dlg.addEventListener('click', (e) => {
        if (e.target === dlg) this.finish('cancel');
      });
      // Esc and every other browser "close request" go through here and mean
      // "Go back", as they always did.
      //
      // We don't listen to `close` instead: that event is queued, not
      // synchronous, and it also arrives when we close the dialog ourselves to
      // redraw the card. Listening to it meant undoing the user's action at the
      // first verdict update.
      dlg.addEventListener('cancel', (e) => {
        e.preventDefault();
        this.finish('cancel');
      });
      this.root.append(dlg);
      this.dialog = dlg;
      this.ensureModal();
      return dlg;
    }

    /**
     * The wait. The server takes a few seconds: meanwhile we show at once what
     * the extension already knows (action, site, price read on the page) and the
     * boxes that will fill up, and "Continue without waiting" is available from
     * the start: waiting is a choice, not a trap.
     *
     * @param {string} actionLabel
     * @param {{ price?: string|null, host?: string|null }} [preview]
     */
    showLoading(actionLabel, preview = {}) {
      const tile = (label, value) => `<div class="tile"><div class="tlabel">${esc(label)}</div>${value ? `<div class="tvalue">${esc(value)}</div>` : '<div class="skel"></div>'}</div>`;
      this.render(
        `
        <div class="card" style="--level-color:#6b7280">
          <div class="bar"></div>
          <header>
            <div class="eyebrow"><span>${esc(actionLabel || t('actionHold'))}</span></div>
            <h1 id="v-title" role="status">${esc(t('readingTerms'))}</h1>
            ${preview.host ? `<p class="action">${esc(preview.host)}</p>` : ''}
          </header>
          <div class="body">
            <div class="tiles">
              ${tile(t('whatReallyPay'), null)}
              ${tile(t('untilWhen'), null)}
              ${tile(t('ifLeaveEarly'), null)}
            </div>
            ${preview.price ? `<p class="summary">${esc(t('priceShownPageX', { x: preview.price }))}</p>` : ''}
            <div class="skel line"></div><div class="skel line short"></div>
            <p class="armhint">${esc(t('clickPausedFewSecondsCanAlso'))}</p>
          </div>
          <footer>
            <button class="link" data-act="cancel">${esc(t('cancel'))}</button>
            <span class="spacer"></span>
            <button class="proceed" data-act="proceed">${esc(t('continueWithoutWaiting'))}</button>
          </footer>
        </div>
      `,
        { label: t('checkingCommitment') }
      );
      this.bind();
    }

    /**
     * Consent at the first analysis. The page text goes to the AnteFirma server
     * only after this yes, and the yes covers later analyses until it is
     * withdrawn in settings.
     *
     * Both buttons accept only real clicks (`isTrusted`): the warning lives in an
     * open shadow root, and a page script could otherwise press "Analyse" on the
     * person's behalf.
     *
     * @returns {Promise<'accept'|'skip'>} `cancel` goes through `wait()`, as always.
     */
    askConsent() {
      return new Promise((resolve) => {
        this.render(
          `
          <div class="card" style="--level-color:#15203A">
            <div class="bar"></div>
            <header>
              <div class="eyebrow"><svg class="mark" viewBox="0 0 64 72" aria-hidden="true"><path d="M32 4 L55.5 10 C57.5 10.6 58.5 12.2 58.5 14.2 V34 C58.5 48.5 48.5 59.5 34.2 66.6 C33.3 67.1 30.7 67.1 29.8 66.6 C15.5 59.5 5.5 48.5 5.5 34 V14.2 C5.5 12.2 6.5 10.6 8.5 10 Z" fill="#FFE04A"/><path d="M32 6.6 L52.9 11.9 C54.9 12.4 55.9 13.8 55.9 15.5 V32.4 C55.9 46.4 46.6 56.4 33.9 62.7 C33.3 63.2 30.7 63.2 30.1 62.7 C17.4 56.4 8.1 46.4 8.1 32.4 V15.5 C8.1 13.8 9.1 12.4 11.1 11.9 Z" fill="#15203A"/><path d="M32 15.5V37.5M22.47 21L41.53 32M22.47 32L41.53 21" stroke="#FFE04A" stroke-width="6.4" stroke-linecap="round"/><path d="M19 49.5 C22 44 26 43.5 29 47 S34.5 52 38 47.5 S43 42.5 45 43" fill="none" stroke="#FFE04A" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="badge">AnteFirma</span><span>${esc(t('firstAnalysis'))}</span></div>
              <h1 id="v-title">${esc(t('canIReadPage'))}</h1>
            </header>
            <div class="body">
              <p class="summary">${esc(t('tellWhatReCommittingAntefirmaSends'))}</p>
              <p class="summary">${esc(t('serverKeepsNeitherTextNorAddress'))}</p>
            </div>
            <footer>
              <button class="cancel" data-act="cancel">${esc(t('goBack'))}</button>
              <span class="spacer"></span>
              <button class="link" data-consent="skip">${esc(t('continueWithoutAnalysis'))}</button>
              <button class="proceed" data-consent="accept">${esc(t('yesAnalyse'))}</button>
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

    /** Is the warning still waiting for a user decision? */
    isOpen() {
      return Boolean(this.resolve && this.host?.isConnected);
    }

    showVerdict(verdict, { blocking = true } = {}) {
      const level = verdict.level || {};
      const cost = verdict.cost || {};
      // Two categories born from the same sentence are shown once, with both names.
      const findings = [];
      for (const f of verdict.findings || []) {
        const key = (f.quote || '').trim().toLowerCase();
        const prev = key && findings.find((x) => (x.quote || '').trim().toLowerCase() === key);
        if (prev) prev.title = `${prev.title || prev.label} · ${f.title || f.label}`;
        else findings.push({ ...f });
      }
      // An exit fee in monthly payments has a computed figure, not a written amount.
      const penaltyAmount = cost.penalty?.amount ?? (cost.lines || []).find((l) => l.kind === 'penalty')?.amount ?? null;
      const timeline = verdict.timeline || [];
      const consumer = verdict.consumer || {};
      const ink = paletteFor(level.id);

      // The three answers the person is looking for: what I really pay, how long
      // I am bound, how I get out. The rest is behind "Why?".
      const deadline = timeline.find((x) => x.kind === 'deadline');
      const months = cost.horizonMonths ? Math.round(cost.horizonMonths) : null;
      const tiles = [
        {
          label: t('whatReallyPay'),
          value: cost.worstCaseLabel || cost.displayed || t('noCostFound'),
          sub: cost.worstCaseLabel && months ? tn(months, 'overNMonth', 'overNMonths') : (cost.displayed && !cost.worstCaseLabel ? t('pricePage') : ''),
          strong: !!cost.worstCaseLabel,
        },
        {
          label: t('untilWhen'),
          value: deadline ? deadline.when : cost.hasAutoRenewal ? t('renewsItself') : months ? tn(months, 'nMonth', 'nMonths') : t('noLockFound'),
          sub: deadline ? t('lastDayCancel') : cost.hasAutoRenewal ? t('noteEndDate') : '',
        },
        {
          label: t('ifLeaveEarly'),
          value: penaltyAmount != null ? money(penaltyAmount, cost.currency) : cost.penalty ? t('feeNotStated') : findings.some((f) => f.category === 'no_refund') ? t('noRefund') : t('noFeeFound'),
          sub: cost.penalty ? t('earlyTerminationFee2') : '',
        },
      ];
      const tilesBlock = `<div class="tiles">${tiles.map((x) => `<div class="tile${x.strong ? ' strong' : ''}"><div class="tlabel">${esc(x.label)}</div><div class="tvalue">${esc(x.value)}</div>${x.sub ? `<div class="tsub">${esc(x.sub)}</div>` : ''}</div>`).join('')}</div>
        ${cost.displayed && cost.worstCaseLabel && cost.understated ? `<p class="displayed-note">${esc(t('pageSeeX', { x: cost.displayed }))}</p>` : ''}`;
      const chips = findings.length
        ? `<ul class="chips" aria-label="${esc(t('whatReAccepting'))}">${findings.slice(0, 4).map((f) => `<li>${esc(f.title || f.label)}</li>`).join('')}${findings.length > 4 ? `<li class="more">+${findings.length - 4}</li>` : ''}</ul>`
        : '';

      const formula = cost.lines?.length
        ? `<ul class="formula">
             ${cost.lines
               .map(
                 (l) => `<li>
                   <span class="voce">${esc(l.label)}</span>
                   <span class="cifra">${l.amount != null ? esc(money(l.amount, cost.currency)) : esc(t('amountNotStated'))}</span>
                 </li>`
               )
               .join('')}
             ${cost.worstCaseLabel ? `<li class="tot"><span class="voce">${esc(t('total'))}</span><span class="cifra">${esc(cost.worstCaseLabel)}</span></li>` : ''}
           </ul>
           ${cost.horizonReason ? `<p class="horizon">${esc(cost.horizonReason)}</p>` : ''}`
        : '';
      const costBlock = formula ? `<section><h2>${esc(t('howWeGetFigure'))}</h2><div class="cost">${formula}</div></section>` : '';

      const head = findings.slice(0, FINDINGS_HEAD);
      const rest = findings.slice(FINDINGS_HEAD);
      const findingsBlock = findings.length
        ? `<section>
             <h2>${esc(t('whatReAccepting'))}</h2>
             <ul>${head.map(renderFinding).join('')}</ul>
             ${
               rest.length
                 ? `<details class="more">
                      <summary>${esc(tn(rest.length, 'nMoreTerm', 'nMoreTerms'))}</summary>
                      <ul style="margin-top:8px">${rest.map(renderFinding).join('')}</ul>
                    </details>`
                 : ''
             }
           </section>`
        : '';

      // A single timeline step is usually noise, but if that step is a deadline,
      // a renewal or an exit fee it is exactly the date to remember: dropping it
      // would push it out of the card.
      const showTimeline =
        timeline.length > 1 || (timeline.length === 1 && KEY_STEPS.has(timeline[0]?.kind));
      const timelineBlock = showTimeline
        ? `<section>
             <h2>${esc(t('whatHappensIfClick'))}</h2>
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
               ? tn(consumer.flags.length, 'nTermCheckAgainstItalianConsumer2', 'nTermsCheckAgainstItalianConsumer2')
               : tn(consumer.flags.length, 'nTermCheckAgainstEuConsumer2', 'nTermsCheckAgainstEuConsumer2'))}</summary>
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

      // A commitment with a deadline or a recurring cost: the main button
      // becomes "Continue and remind me to cancel" (goes ahead and records it).
      const trackable = blocking && !!(deadline || cost.hasRecurring || cost.hasAutoRenewal);
      const arm = blocking ? ' data-arm="1" aria-disabled="true" aria-describedby="v-arm-why"' : '';
      // The paid plan is offered when its value is visible, not only at the limit.
      const q = verdict.engine?.quota;
      const free = !q?.plan || q.plan === 'free';
      const left = q?.month?.remaining;
      const bigFind = cost.understated && (cost.worstCase || 0) >= 100;
      const upsellBlock = free && !verdict.cached && (left === 0 || left === 1 || bigFind)
        ? `<div class="upsell soft"><p>${esc(left === 0 ? t('wasLastFreeAnalysisMonth') : left === 1 ? t('haveOneFreeAnalysisLeftMonth') : t('antefirmaJustShowedXCommitmentPage', { x: cost.worstCaseLabel }))}</p>
             <button class="upgrade" type="button" data-upgrade>${esc(t('upgradePro50AnalysesMonth'))}</button><p class="upsell-note" aria-live="polite"></p></div>`
        : '';
      this.model = verdict.engine?.model || null;
      const n = verdict.engine?.notice;
      const noticeBlock = n ? `<div class="notice ${n.level === 'warn' ? 'warn' : ''}" role="note">${esc(n[I.lang] || n.it)}</div>` : '';
      const errorBlock = verdict.engine?.truncated
        ? `<div class="error">${esc(t('pageWasVeryLongOnlyPart'))}</div>`
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
            ${noticeBlock}
            ${errorBlock}
            ${tilesBlock}
            ${chips}
            ${upsellBlock}
            <details class="why">
              <summary>${esc(t('whyClausesExactSentencesCalculation'))}</summary>
              ${verdict.summary ? `<p class="summary">${esc(verdict.summary)}</p>` : ''}
              ${findingsBlock}
              ${costBlock}
              ${timelineBlock}
              ${lawBlock}
            </details>
          </div>
          <footer>
            ${trackable
              ? `<button class="cancel alt" data-act="cancel">${esc(t('goBack'))}</button>
                 <button class="proceed main" data-act="track"${arm}>${esc(t('continueRemindMeCancel'))}</button>`
              : `<button class="cancel" data-act="cancel">${esc(blocking ? t('goBack') : t('cancel'))}</button>
                 <button class="proceed" data-act="proceed"${arm}>${esc(t('continueAnyway'))}</button>`}
            <span class="spacer"></span>
            ${trackable ? `<button class="link" data-act="proceed">${esc(t('continueWithoutReminder'))}</button>` : ''}
            <button class="link${(verdict.proceedCount || 0) >= 3 ? ' hint' : ''}" data-act="allowlist">${esc((verdict.proceedCount || 0) >= 3
              ? t('wentAheadNTimesHereStop', { n: verdict.proceedCount, x: verdict.host || t('site') })
              : t('donTWarnMeX', { x: verdict.host || t('site') }))}</button>
          </footer>
          ${
            blocking
              ? `<p class="armhint">
                   <span id="v-arm-why">${esc(t('buttonContinueTurnsMomentClickJust'))}</span>
                   <span class="v-arm-live" role="status"></span>
                 </p>`
              : ''
          }
          <div class="provenance">${esc((verdict.engine?.cached ? t('analysisAlreadyDoneText') : t('automaticAnalysisAntefirma')) + quotaNote(verdict))}</div>
          <div class="disclaimer">${esc(consumer.disclaimer || t('automaticAnalysisInformationOnlyNotLegal'))} <a class="help" href="https://antefirma.app${WARNING_HELP[I.lang] || WARNING_HELP.en}" target="_blank" rel="noopener">${esc(t('howReadWarning'))}</a></div>
        </div>
      `,
        { role: 'alertdialog', labelledby: 'v-title' }
      );

      this.bind();
      this.armProceed();
    }

    showError(message, code = '') {
      const ink = paletteFor('review');
      // This month's analyses are used up: the moment the person has just seen
      // that the service is useful to them. The button opens the payment already
      // linked to this browser (or settings, for those who already have a plan).
      const upsell = code === 'quota_month'
        ? `<div class="upsell"><button class="upgrade" type="button" data-upgrade>${esc(t('upgradePro50AnalysesMonth'))}</button><p class="upsell-note" aria-live="polite"></p></div>`
        : '';
      this.render(
        `
        <div class="card" style="--level-color:#b8860b;--level-ink:${ink.light};--level-ink-dark:${ink.dark};--badge-ink:${ink.badge}">
          <div class="bar"></div>
          <header>
            <div class="eyebrow"><span class="badge">⚠️ ${esc(t('analysisFailed'))}</span></div>
            <h1 id="v-title">${esc(t('iCouldnTCheckCommitment'))}</h1>
          </header>
          <div class="body">
            <div class="error">${esc(message)}</div>
            ${upsell}
            <p class="summary">${esc(t('canGoAheadAnywayButWithout'))}</p>
          </div>
          <footer>
            <button class="cancel" data-act="cancel">${esc(t('goBack'))}</button>
            <button class="proceed" data-act="proceed">${esc(t('continueAnyway'))}</button>
          </footer>
        </div>
      `,
        { role: 'alertdialog', labelledby: 'v-title' }
      );
      this.bind();
    }

    /**
     * "Continue anyway" unlocks after a moment: not friction for its own sake,
     * but because the click we are intercepting had already started and the hand
     * is still moving.
     *
     * Two things that weren't true before:
     *
     * 1. The button is not `disabled`. A `<button disabled>` leaves the tab
     *    order: keyboard users don't meet it at all, and after three seconds
     *    find it appeared without anything telling them. With `aria-disabled` the
     *    button stays reachable and announced as unavailable, and we stop the
     *    click ourselves in bind().
     *
     * 2. Arming is idempotent. Refining the verdict redraws the card, and with
     *    it the countdown restarted from three — a target moving under the
     *    finger of someone already aiming at it. The start time is stored only
     *    once.
     */
    armProceed() {
      clearTimeout(this.armTimer);
      this.armTimer = null;
      const btn = this.root?.querySelector('.proceed[data-arm]');
      if (!btn) return;
      this.armedAt ??= Date.now();
      const left = ARM_MS - (Date.now() - this.armedAt);
      if (left <= 0) {
        // Already expired when the card was redrawn: nothing to announce, the
        // button was free a moment ago too.
        this.releaseProceed(false);
        return;
      }
      this.armTimer = setTimeout(() => this.releaseProceed(true), left);
    }

    /** @param {boolean} announce voice the unlock (only once). */
    releaseProceed(announce) {
      const btn = this.root?.querySelector('.proceed[data-arm]');
      if (!btn) return;
      btn.removeAttribute('aria-disabled');
      btn.removeAttribute('aria-describedby');
      this.root.querySelector('#v-arm-why')?.remove();
      const live = this.root.querySelector('.v-arm-live');
      // Without the reason only the live region stays: with no padding the line
      // leaves no gap under the buttons (`.armhint:empty`).
      // A single announcement, at unlock. A tick per second would fill the audio
      // space with numbers right while there is a contract to listen to.
      if (live) live.textContent = announce ? t('canContinueNow') : '';
    }

    bind() {
      for (const btn of this.root.querySelectorAll('[data-act]')) {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          // `aria-disabled` doesn't stop the click like `disabled` would: refusing
          // it is our job.
          if (btn.getAttribute('aria-disabled') === 'true') return;
          this.finish(btn.dataset.act);
        });
      }
      // "Wrong warning?": only the category goes to the server, never the text.
      for (const b of this.root.querySelectorAll('[data-feedback]')) {
        b.addEventListener('click', async (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!e.isTrusted || b.disabled) return;
          b.disabled = true;
          try { await CF.bridge.send('FEEDBACK', { category: b.dataset.feedback, model: this.model }); b.textContent = t('thanksReported'); } catch { b.disabled = false; }
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
            ? t('iOpenedPlanSettingsNewTab')
            : t('iOpenedPaymentPageNewTab');
        } catch (err) {
          if (note) note.textContent = err?.message || t('iCanTOpenPaymentPage');
        }
      });
      // While loading there is no `.cancel`, only a `.link`: searching by class
      // left focus where it was, i.e. on the page underneath.
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
   * How many free analyses are left this month. Only for a verdict that has
   * just arrived from the server: one from the local cache used nothing, and
   * its number would be stale.
   */
  function quotaNote(verdict = {}) {
    const m = verdict.engine?.quota?.month;
    if (!m || verdict.cached || typeof m.remaining !== 'number') return '';
    const n = m.remaining;
    const paid = verdict.engine?.quota?.plan && verdict.engine.quota.plan !== 'free';
    return ' · ' + (paid
      ? tn(n, 'nAnalysisLeftMonth', 'nAnalysesLeftMonth')
      : tn(n, 'nFreeAnalysisLeftMonth', 'nFreeAnalysesLeftMonth'));
  }


  function renderFinding(f) {
    const ink = sevPalette(f.severity);
    const tags = [];
    if (f.personalized && f.personalReasons?.length) tags.push(t('relevantX', { x: f.personalReasons.join(', ') }));
    if (f.quotes?.length) tags.push(t('quotedNPlacesPage', { n: f.quotes.length + 1 }));

    return `<li class="finding" style="--sev-color:${ink.light};--sev-color-dark:${ink.dark}">
      <div class="top">
        <span class="name">${esc(f.title || f.label)}</span>
        <span class="sev">${esc(f.severity >= 65 ? t('weighsLot') : f.severity >= 40 ? t('worthKnowing') : t('minor'))}</span>
      </div>
      <div class="plain">${esc(f.plain || f.why || '')}</div>
      ${f.quote ? `<div class="quote">“${esc(f.quote)}”</div>` : ''}
      ${tags.length ? `<span class="tag">${esc(tags.join(' · '))}</span>` : ''}
      ${f.category ? `<button type="button" class="wrong" data-feedback="${esc(f.category)}">${esc(t('wrongWarning'))}</button>` : ''}
    </li>`;
  }

  CF.overlay = { Overlay, sevColor };
})();

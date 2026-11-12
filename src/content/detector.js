/**
 * Action Detector.
 *
 * This is where the product stops being a contract reader and becomes a
 * firewall: the click is held *before* it has any effect, the decision is
 * analysed, and only then does the user choose, informed.
 *
 * Interception happens in the capture phase on the document, so it comes before
 * any of the site's handlers. The original click is then faithfully replayed if
 * the user confirms.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.detector) return;
  const { labelOf, composedPath, isVisible } = CF.util;

  const { ACTION_LABELS, classifyText, classifyDetail } = CF.actions;
  const t = (s, v) => globalThis.AF_I18N.t(s, v);

  const CLICKABLE = 'button, a[href], input[type="submit"], input[type="button"], [role="button"], [type="submit"]';

  /** Our own elements: no click inside them is classified. */
  const OURS = new Set(['VINCOLO-AVVISO', 'VINCOLO-NOTA']);

  /**
   * Classifies an element; returns the action type or null.
   *
   * Label and attributes are weighed separately because they don't count the
   * same: if the visible text says no ("Cancel"), a CSS class containing
   * "subscribe" cannot overrule it — the user reads the label.
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
   * Buttons that say nothing: "Continue", "Next", "Confirm".
   *
   * They are the most common label on the last step of a checkout and the most
   * common on any wizard: the text will never tell them apart, and widening the
   * action table to include them would block every form on the web. A
   * structural proof is needed, not a lexical one.
   */
  const GENERIC_RE =
    /^(?:continua|continue|avanti|next|conferma|confermo|confirm|procedi|prosegui|proceed|vai\s+avanti|ok)[\s.!…»>→-]*$/i;

  /**
   * The decision box: the widest container around the button that still talks
   * *about that button*.
   *
   * It cannot be `<body>`. A recurring price only counts as proof next to the
   * button: otherwise, on a page showing a plan at the top, even a
   * questionnaire's "Continue" at the bottom would become a subscription —
   * verified in Chromium, and exactly the false alarm this fallback must avoid.
   */
  const ACTIONABLE_SELECTOR = 'button, input[type=submit], input[type=button], [role="button"]';

  /** How many buttons this subtree contains, the element itself included. */
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
       * One more button than those already inside `node` means the box no
       * longer talks only about this decision: from there up the price belongs
       * to another one. A character limit is not enough — on a page with a
       * checkout at the top and a questionnaire at the bottom, both short, the
       * questionnaire's "Continue" inherited the checkout's fee and became a
       * subscription.
       */
      if (countActionable(parent) > ownButtons) break;
      node = parent;
    }
    return node;
  }

  /**
   * Payment fields *inside the box*, not in the page.
   *
   * `context.extractForm()` falls back to `document.body` when the button isn't
   * in a `<form>`: fine for the analysis — it describes the page — but not as a
   * structural proof. On a page with a checkout at the top and a questionnaire
   * at the bottom, the questionnaire's "Continue" inherited the card fields of
   * the other box and became a purchase.
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
   * The proof comes from the context context.js collects anyway: card fields or
   * payment iframes (form.isCheckout) and a recurring price next to the button.
   * The result is cached for a moment because the click and a possible submit
   * of the same button must not rebuild the same context twice.
   */
  const evidence = new WeakMap();

  function structuralType(el) {
    const label = labelOf(el);
    if (!label || !GENERIC_RE.test(label)) return null;

    const cached = evidence.get(el);
    if (cached && Date.now() - cached.at < 2000) return cached.type;

    let type = null;
    try {
      // A recurring price next to a "Continue" is a subscription about to start;
      // without a price but with card fields, it is a purchase.
      const box = decisionBox(el);
      if (CF.context.pricesIn((box.innerText || '').slice(0, 2000)).some((p) => p.period)) type = 'subscribe';
      else if (hasPaymentFields(box)) type = 'purchase';
    } catch {
      type = null; // the context must never make interception fail
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

  /** Walks up the event path to the first classifiable clickable element. */
  function findTarget(event) {
    const path = composedPath(event);
    for (const node of path) {
      if (!node || node.nodeType !== 1) continue;
      if (OURS.has(node.tagName)) return null; // the warning and the notification are ours
      const clickable = node.matches?.(CLICKABLE) ? node : node.closest?.(CLICKABLE);
      if (!clickable) continue;
      const type = classify(clickable) || structuralType(clickable);
      if (type) return { el: clickable, type };
      // A single level of walking up, so as not to classify the whole page.
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
   * Settings are loaded at once and kept in a local cache.
   *
   * They must already be available when the click arrives: the decision to
   * hold the event has to be taken synchronously (see below), so there is no
   * way to wait for them at that moment.
   */
  CF.bridge.settings().then((s) => { state.settings = s; }).catch(() => {});

  chrome.storage?.onChanged?.addListener((changes, area) => {
    if (area === 'local' && changes.settings) state.settings = changes.settings.newValue;
  });

  /** Is the firewall off for this page? A synchronous answer, never blocking. */
  function disabledHere() {
    const s = state.settings;
    if (!s) return false; // settings not known yet: hold anyway
    if (!s.enabled) return true;
    const host = location.hostname.replace(/^www\./, '');
    return (s.allowlist || []).some((e) => {
      const d = String(e).trim().replace(/^www\./, '').toLowerCase();
      return d && (host === d || host.endsWith(`.${d}`));
    });
  }

  /**
   * Click handler: **synchronous by construction**.
   *
   * preventDefault() only works while the event is still being dispatched. A
   * single `await` before calling it — even just to read settings — hands
   * control back to the browser, which meanwhile has already performed the
   * action: the form is sent, the payment goes through, and the warning
   * appears when it is no longer of any use.
   *
   * So here we decide and hold without waiting; everything else — analysis,
   * network, interface — happens afterwards, in handleAction().
   */
  function onClick(event) {
    if (!event.isTrusted) return; // our replay must not trigger the firewall again
    if (event.button !== 0) return;
    if (state.busy) return;
    if (disabledHere()) return;

    const found = findTarget(event);
    if (!found) return;
    if (state.approved.has(found.el)) return;
    if (!isVisible(found.el)) return;

    // Hold the click: before any await.
    event.preventDefault();
    event.stopImmediatePropagation();
    state.busy = true;

    handleAction(found, event);
  }

  /**
   * Closes an interception: records the decision in history and, if the user
   * excluded the site, updates the allowlist.
   *
   * It lives outside handleAction because the `submit` path must go through it
   * too. Without it, a contract accepted by pressing Enter in a form produced no
   * recorded commitment — no deadline, no letter, no proof, i.e. no exit kit —
   * and "Don't warn me on this site" had no effect: the domain wasn't added and
   * the form wasn't sent. The click vanished into nothing.
   *
   * `via` says *how* the decision was reached without changing it: history must
   * tell "I pressed Continue anyway" from "it went through below the threshold",
   * but in both cases the user went ahead and the commitment must be recorded.
   *
   * @returns {Promise<'proceed'|'cancel'>} the actual decision.
   */
  async function finalize(decision, verdict, via = 'blocked') {
    let how = via;
    // "Continue and remind me to cancel": go ahead and record the commitment
    // even if automatic recording is off in settings.
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
   * Asks the service worker for the analysis. The first time the service worker
   * answers that consent is missing: the warning asks for it, and only after a
   * yes does the page text go to the server. A no lets the action go ahead
   * without analysis, as if the extension weren't there.
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

  /** What can be shown at once, before the server answers. */
  function previewOf(ctx) {
    const p = ctx?.pricing;
    let price = null;
    if (p?.amount != null) {
      try { price = new Intl.NumberFormat(globalThis.AF_I18N.locale, { style: 'currency', currency: p.currency || 'EUR' }).format(p.amount); } catch { price = String(p.amount); }
      const per = { month: t('perMonth'), year: t('perYear'), week: t('perWeek'), quarter: t('perQuarter') }[p.period];
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
          // Below the threshold the user chose: the flow is not interrupted.
          // The decision is recorded anyway: it is the most frequent case, and
          // without it history showed "No decision recorded" on every
          // non-blocking warning.
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
      overlay.showError(err?.message || t('errorDuringAnalysis'));
      decision = await waiting;
    } finally {
      state.busy = false;
    }

    decision = await finalize(decision, current, via);

    if (decision === 'proceed') replay(found.el, event);
  }

  /**
   * Replays the original action.
   * The element joins the session allowlist, so the new click goes through.
   */
  function replay(el, originalEvent) {
    state.approved.add(el);

    // Plain link: direct navigation, more reliable than a synthetic click.
    const href = el.tagName === 'A' ? el.getAttribute('href') : null;
    if (href && !href.startsWith('#') && !href.startsWith('javascript:') && !el.hasAttribute('download')) {
      const target = el.getAttribute('target');
      const url = new URL(href, location.href).href;
      if (target === '_blank') window.open(url, '_blank', 'noopener');
      else location.assign(url);
      return;
    }

    // Submit button: requestSubmit is used so validation runs.
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
   * Same rule as the click: hold first, think afterwards.
   * Covers forms sent with Enter from the keyboard, where no click ever arrives.
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
      overlay.showError(err?.message || t('errorDuringAnalysis'));
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



  // ── non-blocking notification ──────────────────────────────────────────────

  /**
   * The REVIEW band is the **most frequent** case: it doesn't block, so all the
   * user will know about that commitment is this notification. The old `flash()`
   * was a dead end — no ARIA role, no way to know why it appeared, gone after 6
   * seconds, white text at 3.25:1 and toasts piling up if two buttons were
   * pressed in a row.
   *
   * Here instead: one notification at a time with a queue, `role="status"`,
   * colours checked with the WCAG formula, a way out ("See why"), an X, pause on
   * hover and focus, and no automatic timeout when there is something to note
   * down: a deadline that disappears by itself is a lost deadline.
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
   * The level colour is used as a background **only** if text on it reaches
   * 4.5:1. For REVIEW (#b8860b) white gives 3.25:1 and black 5.72:1; for
   * COMMITMENT (#c2620f) neither makes it, so the colour drops to being the bar
   * on a neutral surface. The level is read from the bar and the icon: text is
   * not the place to save on contrast.
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
    /* Whoever asked for less motion must get neither the animated entrance nor
       a bar moving in a corner of the screen. */
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

  /** Queues a notification. Only one stays visible: the others wait their turn. */
  function flash(verdict) {
    if (!verdict?.level || verdict.level.id === 'safe') return;
    // Pressing three buttons in a row must not produce three overlapping
    // warnings, nor an endless queue to work through: the latest count, not all.
    if (toast.queue.length >= 3) toast.queue.shift();
    toast.queue.push(verdict);
    if (!toast.current) showNextToast();
    else refreshQueued(); // whoever is reading must know another one arrived
  }

  function mountToast() {
    if (toast.host?.isConnected) return;
    toast.host = document.createElement('antefirma-toast');
    // The host takes no space (the content is `position: fixed`), but display
    // and visibility are declared !important: a site's `* { display: none }`
    // must not be able to silence the only warning of the REVIEW band.
    for (const [prop, value] of Object.entries({
      position: 'static', display: 'block', visibility: 'visible', opacity: '1', 'pointer-events': 'auto',
    })) {
      toast.host.style.setProperty(prop, value, 'important');
    }
    toast.host.setAttribute('lang', globalThis.AF_I18N.lang === 'no' ? 'nb' : globalThis.AF_I18N.lang);
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
    const sticky = Boolean(verdict.mustRemember); // a deadline doesn't go away by itself

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
        <p class="headline">${esc(verdict.headline || level.headline || t('termsCheck'))}</p>
        ${verdict.mustRemember ? `<p class="note">📌 ${esc(verdict.mustRemember)}</p>` : ''}
        ${toast.queue.length ? `<p class="queued">${esc(queuedLabel(toast.queue.length))}</p>` : ''}
      </div>
      <button class="x" type="button" aria-label="${esc(t('closeNotification'))}">✕</button>
      <div class="actions">
        <button class="why" type="button">${esc(t('seeWhy'))}</button>
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

    // Pause on hover and focus: reading a warning must not be a race.
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
    return n === 1 ? t('oneMoreWarningWaiting') : t('nMoreWarningsWaiting', { n });
  }

  /** Updates the queue counter on the notification already on screen. */
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
    // Never zero: with zero the timer would never restart and the notification
    // would stay on screen forever just because the pointer passed over it.
    toast.left = Math.max(800, toast.left - (Date.now() - toast.startedAt));
    const bar = lifeBar();
    if (bar) {
      // Freeze the width reached, otherwise the bar would go backwards.
      const w = bar.getBoundingClientRect().width;   // *transformed* width
      const full = bar.offsetWidth || w || 1;        // layout width
      bar.style.transition = 'none';
      bar.style.transform = `scaleX(${Math.max(0, Math.min(1, w / full))})`;
    }
  }

  function resumeToast() {
    if (toast.timer || !toast.current) return;
    if (!toast.left) return; // persistent notification: no timer to resume
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
   * "See why": reopens the verdict **already computed**, without analysing
   * anything again and without going online — it is the same object that
   * produced the notification.
   *
   * It doesn't open the side panel because `chrome.sidePanel` doesn't exist in
   * content scripts and the service worker doesn't expose a message to open it
   * yet; the day it does, only this function's body changes. Meanwhile the
   * content shown is the same.
   */
  function explain(verdict) {
    if (!verdict) return;
    try {
      const overlay = new CF.overlay.Overlay();
      overlay.showVerdict(verdict, { blocking: false });
      overlay.wait().then((choice) => {
        // The action already happened: there is nothing to replay and the
        // decision is already in history. One choice stays useful: excluding the site.
        if (choice === 'allowlist') finalize('allowlist', null, 'toast');
      });
    } catch { /* the warning is an extra: it must never break the page */ }
  }

  document.addEventListener('click', onClick, true);
  document.addEventListener('submit', onSubmit, true);

  CF.detector = { classify, classifyText, findTarget, structuralType, contrast, palette };
})();

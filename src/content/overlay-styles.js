/**
 * The warning's own style sheet, as text: overlay.js puts it inside the
 * warning's shadow root, where the page's styles cannot reach it and it cannot
 * leak into the page. Kept apart from overlay.js so that the logic there can be
 * read without scrolling past 260 lines of CSS.
 *
 * A classic content script: it registers itself on globalThis.__CF.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.overlayStyles) return;

  CF.overlayStyles = `
    :host { all: initial; }
    * { box-sizing: border-box; }

    /* The <dialog> fills the viewport and acts as a discard area: a click
       outside the card hits it, and that is the "go back" gesture. */
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
      /* Level inks: the dark theme flips them further down. */
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

    /* The formula as a vertical list: whoever must judge for themselves needs
       to read the addends one by one, not a line of sums. */
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
    /* Inside the cost block the deadline is the second line, not a separate
       box: "€648.76" and "by 15 June 2028" are a single glance. */
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
    /* Silently cutting extra clauses would be an omission: here the rest is
       collapsed, but declared and reachable. */
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
     * Text for listeners, not for viewers: the unlock announcement used to stay
     * on screen as an interface line ("You can now press 'Continue anyway'"),
     * which says nothing to someone who sees the button active. Clipped rather
     * than display:none, otherwise screen readers would not read it at all.
     */
    .v-arm-live {
      position: absolute; width: 1px; height: 1px; margin: -1px;
      padding: 0; border: 0; overflow: hidden; white-space: nowrap;
      clip: rect(0 0 0 0); clip-path: inset(50%);
    }
    /* Provenance: where the verdict comes from and how much the score weighs.
       For whoever wants to check, not for whoever must decide in three seconds. */
    .provenance { font-size: 11px; color: #6b7280; padding: 0 22px 4px; line-height: 1.5; }
    .disclaimer { font-size: 11px; color: #6b7280; padding: 0 22px 12px; line-height: 1.45; }
    .disclaimer a.help { color: inherit; text-decoration: underline; white-space: nowrap; }
    @keyframes pulse { 0%, 100% { opacity: 1 } 50% { opacity: .45 } }
    .loading { padding: 40px 22px; text-align: center; }
    .spinner {
      width: 26px; height: 26px; border: 3px solid #e3e6ec; border-top-color: #15203a;
      border-radius: 50%; margin: 0 auto 14px; animation: spin .8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg) } }
    .loading p { font-size: 14px; color: #414852; margin: 0; }
    .loading small { display: block; margin-top: 6px; color: #6b7280; font-size: 12px; }
    .finding .wrong { all: unset; cursor: pointer; display: inline-block; margin-top: 6px; font-size: 11.5px; text-decoration: underline; opacity: .7; }
    .finding .wrong:hover, .finding .wrong:focus-visible { opacity: 1; }
    .finding .wrong:disabled { text-decoration: none; cursor: default; }
    .notice { background: #eef3ff; border: 1px solid #c9d7fb; color: #1d3a8a; border-radius: 9px; padding: 9px 12px; font-size: 12.5px; margin-bottom: 12px; }
    .notice.warn { background: #fff7e0; border-color: #f0d78a; color: #6b4e00; }
    .tiles { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin: 0 0 12px; }
    .tile { border: 1px solid #e3e6eb; border-radius: 10px; padding: 10px 11px; background: #f7f8fa; min-width: 0; }
    .tile.strong { border-color: var(--level-color, #b8860b); }
    .tlabel { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; font-weight: 650; }
    /* Greek capitals keep their accents when CSS uppercases them: in Greek the labels stay in normal case. */
    :host([lang="el"]) * { text-transform: none !important; }
    .tvalue { font-size: 18px; font-weight: 720; letter-spacing: -.01em; color: #15203a; margin-top: 3px; line-height: 1.2; overflow-wrap: anywhere; }
    .tile.strong .tvalue { color: var(--level-ink, #15203a); font-size: 22px; }
    .tsub { font-size: 11.5px; color: #6b7280; margin-top: 2px; }
    .displayed-note { font-size: 12.5px; color: #6b7280; margin: -4px 0 10px; }
    .chips { list-style: none; padding: 0; margin: 0 0 12px; display: flex; flex-wrap: wrap; gap: 6px; }
    .chips li { font-size: 12px; padding: 4px 9px; border-radius: 999px; background: #eef0f4; color: #2b3240; }
    .chips li.more { background: none; border: 1px dashed #c9ced8; }
    details.why { border: 1px solid #e3e6eb; border-radius: 10px; padding: 8px 12px; }
    details.why > summary { cursor: pointer; font-weight: 650; font-size: 13px; color: #15203a; }
    details.why[open] > summary { margin-bottom: 10px; }
    .skel { height: 18px; margin-top: 6px; border-radius: 6px; background: linear-gradient(90deg, #eceef2 25%, #f6f7f9 50%, #eceef2 75%); background-size: 200% 100%; animation: af-shimmer 1.2s linear infinite; }
    .skel.line { height: 12px; margin: 8px 0; }
    .skel.line.short { width: 60%; }
    @keyframes af-shimmer { from { background-position: 200% 0; } to { background-position: -200% 0; } }
    .proceed.main { background: #15203a; color: #fff; border-color: #15203a; font-weight: 650; }
    .proceed.main:hover { background: #0d1424; color: #fff; }
    .proceed.main[aria-disabled='true']:hover { background: #15203a; color: #fff; }
    .cancel.alt { background: #fff; color: #15203a; border-color: #c9ced8; }
    .link.hint { color: #15203a; font-weight: 650; }
    .upsell.soft { border: 1px solid #f0d78a; background: #fffbea; border-radius: 10px; padding: 10px 12px; }
    .upsell.soft p { margin: 0 0 8px; font-size: 13px; }
    @media (max-width: 520px) { .tiles { grid-template-columns: 1fr; } }
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
      /* The grey of secondary text is tuned for the light background: on
         #15203a it drops to 3.64:1, below the threshold for 11-12 px text. */
      .eyebrow, .action, h2, .cost .caption, .cost .displayed, .formula .voce, .horizon,
      .finding .sev, .finding .tag, .law .refs, .loading small, .link,
      .armhint, .provenance, .disclaimer { color: #a8b0bd; }
      .finding .quote { color: #b4bbc7; }
      .finding .tag { background: #232830; }
      .formula .tot { border-top-color: #2a2f38; }
      /* On the dark background the pill and the bar take the light ink: the
         full level colour (1.61:1 for CRITICAL) would vanish into the card. */
      .bar { background: var(--level-ink-dark, var(--level-color, #888)); }
      .badge { background: var(--level-ink-dark, var(--level-color, #888)); color: #15203a; }
      .cost .amount { color: var(--level-ink-dark, #f2f4f8); }
      .cancel { background: #f2f4f8; color: #15203a; }
      .tile { background: #12151a; border-color: #2a2f38; } .tvalue { color: #f2f4f8; } .tlabel, .tsub, .displayed-note { color: #9aa2ae; }
      .tile.strong .tvalue { color: var(--level-ink-dark, #f2f4f8); }
      .chips li { background: #232830; color: #d6dae1; } details.why { border-color: #2a2f38; } details.why > summary { color: #f2f4f8; }
      .skel { background: linear-gradient(90deg, #232830 25%, #2c323b 50%, #232830 75%); background-size: 200% 100%; }
      .proceed.main { background: #f2f4f8; color: #15203a; border-color: #f2f4f8; } .cancel.alt { background: transparent; color: #f2f4f8; border-color: #3a414d; }
      .link.hint { color: #f2f4f8; } .upsell.soft { background: #2a2312; border-color: #4a3d18; }
      .proceed { background: transparent; border-color: #3a414d; color: #9aa2ae; }
      .proceed:hover { color: #f2f4f8; border-color: #5a6472; }
      .proceed[aria-disabled='true']:hover { color: #9aa2ae; border-color: #3a414d; }
      .timeline::before { background: #2a2f38; }
      .spinner { border-color: #2a2f38; border-top-color: #e8eaef; }
      .error { background: #2a1616; border-color: #5a2626; color: #f5b5b5; }
    }

    /* Whoever asked for less motion asked the operating system: a warning that
       pulses while you read a contract is exactly that case. */
    @media (prefers-reduced-motion: reduce) {
      *, *::before, *::after {
        animation-duration: .01ms !important;
        animation-iteration-count: 1 !important;
        transition-duration: .01ms !important;
        scroll-behavior: auto !important;
      }
      /* The "in progress" state stays readable without rotation: a full ring
         instead of a spinning one. */
      .spinner { animation: none; border-style: dotted; border-color: #8a919d; }
    }
  `;
})();

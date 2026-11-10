/**
 * Rendering del verdetto nel pannello laterale.
 * Stessa gerarchia dell'overlay: prima il costo, poi la scadenza, poi il dettaglio.
 */

import { formatMoney } from '../core/text.js';
import { t, tn, getLang } from '../i18n/index.js';

export function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const SEV_COLORS = [
  [80, '#7d0a0a'],
  [65, '#c0392b'],
  [45, '#c2620f'],
  [25, '#b8860b'],
  [0, '#1a7f52'],
];

export function sevColor(sev) {
  for (const [min, color] of SEV_COLORS) if (sev >= min) return color;
  return '#888';
}

export function renderVerdict(v) {
  const level = v.level || {};
  const cost = v.cost || {};
  const consumer = v.consumer || {};

  return `
    <div class="verdict" data-level="${esc(level.id || '')}" style="--level-color:${esc(level.color || '#888')}">
      <div class="bar"></div>
      <div class="head">
        <span class="badge">${esc(level.icon || '')} ${esc(level.label || '')}</span>
        <h2>${esc(v.headline || level.headline || '')}</h2>
        ${v.host || v.engine?.cached || v.cached ? `<div class="meta">${[v.host ? esc(v.host) : '', v.engine?.cached || v.cached ? esc(t('da cache')) : ''].filter(Boolean).join(' · ')}</div>` : ''}
      </div>
      <div class="content">
        ${v.engine?.notice ? `<div class="status" style="margin-bottom:10px">${esc(v.engine.notice[getLang()] || v.engine.notice.it)}</div>` : ''}
        ${v.engine?.truncated ? `<div class="status error" style="margin-bottom:10px">${esc(t('La pagina era molto lunga: è stata analizzata solo in parte.'))}</div>` : ''}
        ${renderCost(cost)}
        ${v.mustRemember ? `<div class="remember">📌 ${esc(v.mustRemember)}</div>` : ''}
        ${v.summary ? `<p class="summary">${esc(v.summary)}</p>` : ''}
        ${renderFindings(v.findings || [])}
        ${renderTimeline(v.timeline || [])}
        ${renderConsequences(v.consequences || [])}
        ${renderLaw(consumer)}
        ${renderDebug(v)}
      </div>
      <div class="disclaimer">${esc(consumer.disclaimer || t('Analisi automatica a scopo informativo. Non è un parere legale.'))}</div>
    </div>
  `;
}

function renderCost(cost) {
  if (!cost.worstCaseLabel) {
    if (!cost.displayed) return '';
    return `<div class="cost-box">
      <div class="amount">${esc(cost.displayed)}</div>
      <div class="cap">${esc(t('prezzo rilevato · nessun impegno pluriennale identificato nel testo'))}</div>
    </div>`;
  }
  const formula = (cost.lines || [])
    .map((l) => `${l.label}${l.amount != null ? ` = ${formatMoney(l.amount, cost.currency)}` : ''}`)
    .join('  +  ');
  return `<div class="cost-box">
    <div class="amount">${esc(cost.worstCaseLabel)}</div>
    <div class="cap">${esc(t('impegno economico potenziale stimato'))}${cost.displayed ? ` · ${esc(t('prezzo mostrato: {x}', { x: cost.displayed }))}` : ''}</div>
    ${formula ? `<div class="formula">${esc(formula)}${cost.horizonReason ? ` · ${esc(cost.horizonReason)}` : ''}</div>` : ''}
    ${cost.explanation ? `<div class="formula">${esc(cost.explanation)}</div>` : ''}
  </div>`;
}

/**
 * Due categorie possono nascere dalla stessa frase («la quota di 49 € non è
 * rimborsabile» è insieme «nessun rimborso» e «costo aggiuntivo»): si mostra
 * una volta sola, con i due nomi.
 */
export function mergeByQuote(findings) {
  const out = [];
  const byQuote = new Map();
  for (const f of findings) {
    const key = (f.quote || '').trim().toLowerCase();
    const prev = key && byQuote.get(key);
    if (prev) {
      prev.title = `${prev.title || prev.label} · ${f.title || f.label}`;
      prev.severity = Math.max(prev.severity || 0, f.severity || 0);
      continue;
    }
    const copy = { ...f };
    out.push(copy);
    if (key) byQuote.set(key, copy);
  }
  return out;
}

function renderFindings(list) {
  const findings = mergeByQuote(list);
  if (!findings.length) return '';
  return `<h3 class="section">${esc(t('Cosa stai accettando'))}</h3>
    ${findings
      .map((f) => {
        const tags = [];
        if (f.personalized && f.personalReasons?.length) tags.push(t('rilevante per: {x}', { x: f.personalReasons.join(', ') }));
        if (f.quotes?.length) tags.push(t('citata in {n} punti', { n: f.quotes.length + 1 }));
        return `<div class="finding" style="--sev-color:${sevColor(f.severity)}">
          <div class="top">
            <span class="name">${esc(f.title || f.label)}</span>
          </div>
          <div class="plain">${esc(f.plain || f.why || '')}</div>
          ${f.quote ? `<div class="quote">“${esc(f.quote)}”</div>` : ''}
          ${tags.length ? `<div class="plain" style="opacity:.75;font-size:11px">${esc(tags.join(' · '))}</div>` : ''}
        </div>`;
      })
      .join('')}`;
}

function renderTimeline(timeline) {
  if (timeline.length < 2) return '';
  return `<h3 class="section">${esc(t('Che cosa succede se accetti'))}</h3>
    <div class="timeline">
      ${timeline
        .map(
          (s) => `<div class="step" data-kind="${esc(s.kind)}">
            <div class="when">${esc(s.when)}</div>
            <div class="items">${s.items.map(esc).join(' · ')}</div>
          </div>`
        )
        .join('')}
    </div>`;
}

function renderConsequences(list) {
  if (!list.length) return '';
  return `<h3 class="section">${esc(t('In pratica'))}</h3>
    <ul style="margin:0 0 12px;padding-left:18px;font-size:12.5px;line-height:1.55">
      ${list.map((c) => `<li>${esc(c)}</li>`).join('')}
    </ul>`;
}

function renderLaw(consumer) {
  if (!consumer.flags?.length) return '';
  return `<details>
    <summary>${esc(consumer.jurisdiction === 'IT'
      ? tn(consumer.flags.length, '{n} condizione da verificare rispetto alle tutele italiane', '{n} condizioni da verificare rispetto alle tutele italiane')
      : tn(consumer.flags.length, '{n} condizione da verificare rispetto alle tutele UE', '{n} condizioni da verificare rispetto alle tutele UE'))}</summary>
    ${consumer.flags
      .map(
        (f) => `<div class="law">
          <div class="title">${esc(f.title)}</div>
          <div class="note">${esc(f.note)}</div>
          <div class="refs">${esc((f.refs || []).join(' · '))}</div>
        </div>`
      )
      .join('')}
  </details>`;
}

function renderDebug(v) {
  const e = v.engine || {};
  return `<details>
    <summary>${esc(t('Dettagli tecnici dell’analisi'))}</summary>
    <div class="small muted" style="line-height:1.7;padding:4px 0">
      ${esc(t('Caratteri analizzati: {n}', { n: e.textLength ?? '—' }))}<br>
      ${esc(t('Citazioni scartate perché assenti dal testo: {n}', { n: e.dropped ?? 0 }))}<br>
      ${esc(t('Componenti: base {a} · pressione economica {b} · tutele consumer {c}', { a: v.components?.base ?? '—', b: v.components?.money ?? '—', c: v.components?.euBoost ?? '—' }))}<br>
      ${esc(t('Modello: {x}', { x: e.model || '—' }))}<br>
      ${esc(t('Durata: {n} ms', { n: e.durationMs ?? '—' }))}
    </div>
  </details>`;
}

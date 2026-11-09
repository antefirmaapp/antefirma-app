/**
 * Rendering del verdetto nel pannello laterale.
 * Stessa gerarchia dell'overlay: prima il costo, poi la scadenza, poi il dettaglio.
 */

import { formatMoney } from '../core/text.js';

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
        <div class="meta">
          rischio della decisione ${esc(String(v.score))}/100 ·
          ${v.engine?.llm ? 'regole + AI' : 'solo motore locale'}
          ${v.host ? ` · ${esc(v.host)}` : ''}
          ${v.cached ? ' · da cache' : ''}
        </div>
      </div>
      <div class="content">
        ${v.engine?.llmError?.surfaced ? `<div class="status error" style="margin-bottom:10px">Analisi AI non disponibile: ${esc(v.engine.llmError.message)}</div>` : ''}
        ${renderCost(cost)}
        ${v.mustRemember ? `<div class="remember">📌 ${esc(v.mustRemember)}</div>` : ''}
        ${v.summary ? `<p class="summary">${esc(v.summary)}</p>` : ''}
        ${renderFindings(v.findings || [])}
        ${renderTimeline(v.timeline || [])}
        ${renderConsequences(v.consequences || [])}
        ${renderLaw(consumer)}
        ${renderDebug(v)}
      </div>
      <div class="disclaimer">${esc(consumer.disclaimer || 'Analisi automatica a scopo informativo. Non è un parere legale.')}</div>
    </div>
  `;
}

function renderCost(cost) {
  if (!cost.worstCaseLabel) {
    if (!cost.displayed) return '';
    return `<div class="cost-box">
      <div class="amount">${esc(cost.displayed)}</div>
      <div class="cap">prezzo rilevato · nessun impegno pluriennale identificato nel testo</div>
    </div>`;
  }
  const formula = (cost.lines || [])
    .map((l) => `${l.label}${l.amount != null ? ` = ${formatMoney(l.amount, cost.currency)}` : ''}`)
    .join('  +  ');
  return `<div class="cost-box">
    <div class="amount">${esc(cost.worstCaseLabel)}</div>
    <div class="cap">impegno economico potenziale stimato${cost.displayed ? ` · prezzo mostrato: ${esc(cost.displayed)}` : ''}</div>
    ${formula ? `<div class="formula">${esc(formula)}${cost.horizonReason ? ` · ${esc(cost.horizonReason)}` : ''}</div>` : ''}
    ${cost.explanation ? `<div class="formula">${esc(cost.explanation)}</div>` : ''}
  </div>`;
}

function renderFindings(findings) {
  if (!findings.length) return '';
  return `<h3 class="section">Cosa stai accettando</h3>
    ${findings
      .map((f) => {
        const tags = [];
        if (f.personalized && f.personalReasons?.length) tags.push(`rilevante per: ${f.personalReasons.join(', ')}`);
        if (f.sources?.length === 2) tags.push('regole + AI');
        else if (f.source === 'llm') tags.push('rilevata dall’AI');
        if (f.certainty === 'inferred') tags.push('dedotta');
        return `<div class="finding" style="--sev-color:${sevColor(f.severity)}">
          <div class="top">
            <span class="name">${esc(f.title || f.label)}</span>
            <span class="sev">${esc(String(f.severity))}/100</span>
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
  return `<h3 class="section">Che cosa succede se accetti</h3>
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
  return `<h3 class="section">In pratica</h3>
    <ul style="margin:0 0 12px;padding-left:18px;font-size:12.5px;line-height:1.55">
      ${list.map((c) => `<li>${esc(c)}</li>`).join('')}
    </ul>`;
}

function renderLaw(consumer) {
  if (!consumer.flags?.length) return '';
  return `<details>
    <summary>${consumer.flags.length} condizion${consumer.flags.length === 1 ? 'e' : 'i'} da verificare rispetto alle tutele ${consumer.jurisdiction === 'IT' ? 'italiane' : 'UE'}</summary>
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
    <summary>Dettagli tecnici dell'analisi</summary>
    <div class="small muted" style="line-height:1.7;padding:4px 0">
      Clausole esaminate: ${esc(String(e.stats?.clauses ?? '—'))}<br>
      Caratteri analizzati: ${esc(String(e.textLength ?? '—'))}<br>
      Punteggio locale prima dell'AI: ${esc(String(e.localPreview ?? '—'))}<br>
      Componenti: base ${esc(String(v.components?.base ?? '—'))} · pressione economica ${esc(String(v.components?.money ?? '—'))} · tutele consumer ${esc(String(v.components?.euBoost ?? '—'))}<br>
      Motore AI: ${e.llm ? 'usato' : e.llmSkipped ? 'non necessario' : 'non disponibile'}${e.llmConfidence != null ? ` (confidenza ${e.llmConfidence})` : ''}<br>
      Durata: ${esc(String(e.durationMs ?? '—'))} ms
    </div>
  </details>`;
}

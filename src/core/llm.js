/**
 * Client LLM.
 *
 * Due provider supportati, stessa interfaccia. La chiave resta in
 * chrome.storage.local e non lascia mai il dispositivo se non verso l'API
 * scelta dall'utente.
 *
 * Nota: l'LLM viene interpellato solo se il motore locale ha già trovato
 * qualcosa che vale la pena approfondire (soglia in impostazioni). È la
 * differenza tra un prodotto che manda ogni contratto a un server e uno che lo
 * fa quando serve.
 */

import { SYSTEM_PROMPT, buildUserPrompt } from './prompt.js';
import { RISK_CATEGORIES } from './constants.js';

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
const OPENAI_URL = 'https://api.openai.com/v1/chat/completions';

export class LLMError extends Error {
  constructor(message, { status, provider, retriable = false } = {}) {
    super(message);
    this.name = 'LLMError';
    this.status = status;
    this.provider = provider;
    this.retriable = retriable;
  }
}

/**
 * Esegue l'analisi LLM e restituisce l'oggetto JSON validato.
 * @throws {LLMError}
 */
export async function analyzeWithLLM({ text, ctx, ruleFindings, actionType, profile, jurisdiction, settings, signal }) {
  const provider = settings.provider || 'anthropic';
  const apiKey = (settings.apiKey || '').trim();
  if (!apiKey) throw new LLMError('Chiave API non configurata.', { provider });

  const userPrompt = buildUserPrompt({ text, ctx, ruleFindings, actionType, profile, jurisdiction });

  const raw = provider === 'openai'
    ? await callOpenAI({ apiKey, model: settings.model, userPrompt, signal })
    : await callAnthropic({ apiKey, model: settings.model, userPrompt, signal });

  return validate(parseJSON(raw));
}

async function callAnthropic({ apiKey, model, userPrompt, signal }) {
  const res = await fetch(ANTHROPIC_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      // Necessario per chiamare l'API direttamente da un contesto browser.
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: model || 'claude-sonnet-4-5',
      max_tokens: 3000,
      temperature: 0,
      system: SYSTEM_PROMPT,
      messages: [
        { role: 'user', content: userPrompt },
        // Prefill: forza l'inizio di un oggetto JSON.
        { role: 'assistant', content: '{' },
      ],
    }),
  });

  if (!res.ok) throw await httpError(res, 'anthropic');
  const data = await res.json();
  const body = (data.content || []).map((c) => c.text || '').join('');
  return `{${body}`;
}

async function callOpenAI({ apiKey, model, userPrompt, signal }) {
  const res = await fetch(OPENAI_URL, {
    method: 'POST',
    signal,
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: model || 'gpt-4o-mini',
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    }),
  });

  if (!res.ok) throw await httpError(res, 'openai');
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

async function httpError(res, provider) {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.error?.message || JSON.stringify(body).slice(0, 200);
  } catch {
    detail = await res.text().catch(() => '');
  }
  const retriable = res.status === 429 || res.status >= 500;
  const friendly = {
    401: 'Chiave API non valida.',
    403: 'Chiave API senza permessi per questo modello.',
    404: 'Modello non trovato: controlla il nome nelle impostazioni.',
    429: 'Limite di richieste raggiunto: riprova tra poco.',
  }[res.status];
  return new LLMError(friendly || `Errore ${res.status} dal provider. ${detail}`.trim(), {
    status: res.status,
    provider,
    retriable,
  });
}

/** L'LLM a volte incornicia il JSON: qui lo si recupera comunque. */
export function parseJSON(raw) {
  const text = String(raw || '').trim();
  const attempts = [text];

  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) attempts.push(fence[1]);

  const first = text.indexOf('{');
  const last = text.lastIndexOf('}');
  if (first >= 0 && last > first) attempts.push(text.slice(first, last + 1));

  for (const candidate of attempts) {
    try {
      return JSON.parse(candidate);
    } catch {
      /* prova il prossimo */
    }
  }
  throw new LLMError('Risposta del modello non interpretabile come JSON.');
}

/** Normalizza e ripulisce l'output del modello. Scarta ciò che non è nel formato. */
export function validate(obj) {
  if (!obj || typeof obj !== 'object') throw new LLMError('Risposta del modello vuota.');

  const clauses = Array.isArray(obj.clauses) ? obj.clauses : [];
  const cleanClauses = clauses
    .filter((c) => c && RISK_CATEGORIES[c.category])
    .map((c) => ({
      category: c.category,
      label: RISK_CATEGORIES[c.category].label,
      title: str(c.title) || RISK_CATEGORIES[c.category].label,
      severity: clamp(num(c.severity) ?? RISK_CATEGORIES[c.category].base, 0, 100),
      quote: str(c.quote).slice(0, 400),
      plain: str(c.plain) || RISK_CATEGORIES[c.category].why,
      certainty: c.certainty === 'inferred' ? 'inferred' : 'explicit',
      confidence: c.certainty === 'inferred' ? 0.7 : 1,
      source: 'llm',
      why: RISK_CATEGORIES[c.category].why,
    }));

  const e = obj.economics || {};
  const economics = {
    recurringAmount: num(e.recurringAmount),
    currency: str(e.currency).toUpperCase() || null,
    period: ['day', 'week', 'month', 'quarter', 'year'].includes(e.period) ? e.period : null,
    minimumTermMonths: num(e.minimumTermMonths),
    autoRenewal: typeof e.autoRenewal === 'boolean' ? e.autoRenewal : null,
    noticeDays: num(e.noticeDays),
    penaltyAmount: num(e.penaltyAmount),
    oneOffCosts: Array.isArray(e.oneOffCosts)
      ? e.oneOffCosts
          .filter((c) => c && num(c.amount) != null)
          .map((c) => ({ label: str(c.label) || 'Costo', amount: num(c.amount) }))
      : [],
    refundable: typeof e.refundable === 'boolean' ? e.refundable : null,
    worstCaseTotal: num(e.worstCaseTotal),
    worstCaseExplanation: str(e.worstCaseExplanation),
  };

  return {
    headline: str(obj.headline).slice(0, 200),
    summary: str(obj.summary),
    clauses: cleanClauses.sort((a, b) => b.severity - a.severity),
    economics,
    consequences: Array.isArray(obj.consequences) ? obj.consequences.map(str).filter(Boolean).slice(0, 8) : [],
    mustRemember: str(obj.mustRemember) || null,
    confidence: clamp(num(obj.confidence) ?? 0.6, 0, 1),
  };
}

function str(v) {
  return typeof v === 'string' ? v.trim() : v == null ? '' : String(v);
}
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number.parseFloat(String(v).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}
function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

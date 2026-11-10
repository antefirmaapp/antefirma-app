/**
 * Analysis orchestrator.
 *
 *   text + context
 *        ↓  AnteFirma server       (the model reads the page; the server drops
 *        ↓                          every risk whose quote isn't there)
 *        ↓  severity and labels    (extension constants)
 *        ↓  consequence engine     (€ / duration / dates, from the verified figures)
 *        ↓  personal risk profile
 *        ↓  EU/IT consumer engine
 *        ↓  decision risk score
 *   verdict
 *
 * There is no local rule engine any more: every warning comes from a sentence
 * of the page that the server found again in the text. If the server doesn't
 * answer, the analysis fails with a `ServerError` and the interface says so —
 * we never fake a "safe" verdict that nobody computed.
 */

import { analyzeRemote } from './server.js';
import { computeCost, buildTimeline, termsFromServer, mergePricing } from './consequence.js';
import { personalize } from './profile.js';
import { runConsumerChecks } from './eu.js';
import { computeScore } from './scoring.js';
import { RISK_CATEGORIES, DEFAULT_SETTINGS, ACTION_TYPES } from './constants.js';
import { hashText, normalize } from './text.js';
import { t, tn, setLang } from '../i18n/index.js';

/**
 * @param {object} p
 * @param {string} p.text        Text to analyse (contract, ToS, page).
 * @param {object} p.ctx         Context extracted from the page.
 * @param {string} p.actionType  Type of the intercepted action.
 * @param {object} p.settings    User settings.
 * @param {AbortSignal} [p.signal]
 * @param {number} [p.now]       Reference time (for tests).
 * @param {Function} [p.remote]  The server call (replaceable in tests).
 * @throws {ServerError}         If the server could not analyse.
 */
export async function analyze({ text = '', ctx = {}, actionType = ACTION_TYPES.MANUAL, settings = DEFAULT_SETTINGS, signal, now = Date.now(), remote = analyzeRemote } = {}) {
  const started = now;
  const clock = Date.now();
  const clean = normalize(text);
  // The language of the verdict texts and of the server's answers.
  const lang = setLang(settings.uiLang || 'it');
  const profile = settings.profile || DEFAULT_SETTINGS.profile;
  const jurisdiction = settings.jurisdiction || 'IT';

  // 1. Il server.
  const response = await remote({
    text: clean,
    url: ctx.url || null,
    actionType,
    button: ctx.button?.text || ctx.buttonText || null,
    uiLang: lang,
    jurisdiction,
    signal,
  });

  // 2. Severity and labels: decided by the extension, not by the model.
  const raw = fromServer(response?.findings || []);

  // 3. Economic consequences, only from the figures the server verified.
  const terms = termsFromServer(response?.terms);
  const enrichedCtx = { ...ctx, pricing: mergePricing(ctx.pricing, terms) };
  const cost = computeCost({ ctx: enrichedCtx, findings: raw, terms });

  // 4. Personalizzazione sul profilo.
  const findings = personalize(raw, profile);

  // 5. Tutele consumer UE/IT.
  const consumer = runConsumerChecks({ text: clean, findings, ctx: enrichedCtx, cost, actionType, jurisdiction });

  // 6. Punteggio della decisione.
  const analyzed = clean.length > 120 || Boolean(enrichedCtx.pricing?.amount);
  const { score, level, components, drivers } = computeScore({ findings, cost, consumer, actionType, analyzed });

  // 7. Timeline delle conseguenze.
  const timeline = buildTimeline({ ctx: enrichedCtx, cost, findings, actionType, now: started });

  return {
    version: 2,
    createdAt: new Date(started).toISOString(),
    actionType,
    url: ctx.url || null,
    termsUrl: ctx.terms?.url || null,
    /**
     * The resolved price travels with the verdict because it is needed later:
     * re-checking the same terms without the page price would compute a much
     * lower commitment and report a drop that doesn't exist.
     */
    pricing: enrichedCtx.pricing || null,
    host: safeHost(ctx.url),
    title: ctx.title || null,
    merchant: ctx.merchant || null,
    score,
    level: { ...level, label: t(level.label), headline: t(level.headline) },
    components,
    drivers,
    headline: headlineFor({ level, cost, actionType }),
    summary: (response?.summary || '').trim() || summaryFor({ findings, cost, consumer }),
    findings,
    cost,
    timeline,
    consumer,
    mustRemember: mustRememberFor(cost, timeline),
    engine: {
      source: 'server',
      model: response?.model || null,
      cached: Boolean(response?.cached),
      notice: response?.notice || null,
      dropped: Number(response?.dropped) || 0,
      truncated: Boolean(response?.truncated),
      quota: response?.quota ?? null,
      textHash: hashText(clean),
      textLength: clean.length,
      durationMs: Date.now() - clock,
    },
  };
}

/**
 * From the server's risks to the extension's findings.
 *
 * A category appears once only: if the server quotes several passages, the one
 * with the highest confidence stays and the others go into `quotes`. Categories
 * the extension doesn't know are ignored: without a severity there is no way to
 * weigh them.
 */
export function fromServer(serverFindings = []) {
  const byCategory = new Map();
  for (const f of serverFindings) {
    const def = RISK_CATEGORIES[f?.category];
    if (!def || typeof f.quote !== 'string' || !f.quote.trim()) continue;
    const confidence = clamp01(Number(f.confidence));
    const item = {
      category: f.category,
      label: t(def.label),
      severity: def.base,
      confidence,
      quote: f.quote.trim(),
      span: f.span || null,
      why: (typeof f.why === 'string' && f.why.trim()) || t(def.why),
      plain: (typeof f.why === 'string' && f.why.trim()) || t(def.why),
      source: 'ai',
      sources: ['ai'],
      quotes: [],
    };
    const prev = byCategory.get(f.category);
    if (!prev) {
      byCategory.set(f.category, item);
    } else if (confidence > prev.confidence) {
      byCategory.set(f.category, { ...item, quotes: [prev.quote, ...prev.quotes] });
    } else {
      prev.quotes.push(item.quote);
    }
  }
  /**
   * Confidence only moves severity downwards, and only a little: a quoted but
   * uncertain risk weighs less than a certain one, but doesn't disappear. The
   * server already verified the sentence is there.
   */
  return [...byCategory.values()]
    .map((f) => ({ ...f, severity: Math.round(f.severity * (0.8 + 0.2 * f.confidence)) }))
    .sort((a, b) => b.severity - a.severity);
}

// ── testi del verdetto ───────────────────────────────────────────────────────

function headlineFor({ level, cost, actionType }) {
  if (cost.understated && cost.worstCaseLabel) {
    return t('seeButCommittingUpB', { a: cost.displayed, b: cost.worstCaseLabel });
  }
  if (cost.worstCaseLabel) {
    return t('aboutTakeFinancialCommitmentEstimatedX', { x: cost.worstCaseLabel });
  }
  const byAction = {
    accept_terms: 'acceptingContractTermsWorthChecking',
    subscribe: 'startingSubscription2',
    purchase: 'confirmingPurchase',
    sign: 'signingBindingDocument',
    signup: 'creatingAccountAcceptingItsTerms',
    consent: 'authorisingUseData',
    oauth: 'givingServiceAccessAnotherAccounts',
    manual: 'documentAnalysis',
  };
  return byAction[actionType] ? t(byAction[actionType]) : t(level.headline);
}

function summaryFor({ findings, cost, consumer }) {
  const bits = [];
  if (findings.length) {
    const top = findings.slice(0, 3).map((f) => f.label.toLowerCase());
    bits.push(tn(findings.length, 'textContainsOneRelevantTermList', 'textContainsNRelevantTermsList', { list: top.join(', ') }));
  } else {
    bits.push(t('noBindingClausesWereFoundAvailable'));
  }
  if (cost.worstCaseLabel) {
    bits.push(t('estimatedPotentialFinancialCommitmentX', { x: cost.worstCaseLabel + (cost.horizonReason ? ` (${cost.horizonReason})` : '') }));
  }
  if (consumer.flags?.length) {
    bits.push(tn(consumer.flags.length, 'nTermWorthCheckingAgainstConsumer', 'nTermsWorthCheckingAgainstConsumer'));
  }
  return bits.join(' ');
}

function mustRememberFor(cost, timeline) {
  const deadline = timeline.find((s) => s.kind === 'deadline');
  if (deadline) return `${deadline.when}: ${deadline.items[0]}`;
  if (cost.hasAutoRenewal && cost.horizonMonths) {
    return t('contractRenewsItselfNMonthsPut', { n: Math.round(cost.horizonMonths) });
  }
  return null;
}

function clamp01(n) {
  return Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0.5;
}

function safeHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export { RISK_CATEGORIES };

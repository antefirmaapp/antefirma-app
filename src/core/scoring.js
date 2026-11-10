/**
 * Decision Risk Score.
 *
 * Not the score of the *document*: the score of the *decision* the user is
 * about to make. So three ingredients a plain Terms analyser lacks come in: the
 * type of action, the concrete economic exposure and the personal profile.
 */

import { levelForScore, ACTION_TYPES } from './constants.js';
import { t, tn } from '../i18n/index.js';

/** How much the type of action raises the risk floor. */
const ACTION_FLOOR = {
  [ACTION_TYPES.PURCHASE]: 12,
  [ACTION_TYPES.SUBSCRIBE]: 18,
  [ACTION_TYPES.SIGN]: 20,
  [ACTION_TYPES.OAUTH]: 10,
  [ACTION_TYPES.CONSENT]: 6,
  [ACTION_TYPES.SIGNUP]: 5,
  [ACTION_TYPES.ACCEPT_TERMS]: 4,
  [ACTION_TYPES.MANUAL]: 0,
};

/**
 * Contribution of economic exposure, on a logarithmic scale: €50 weighs
 * little, €500 weighs, €5,000 weighs a lot but not infinitely.
 *
 * The cap is 42, and the slope is tuned so it is reached around €130,000. With
 * the previous slope saturation came at €14,400: a €15,000 loan and a €200,000
 * mortgage gave exactly the same contribution, i.e. the scale stopped measuring
 * exactly on the amounts where mistakes cost most.
 */
export function moneyPressure(worstCase) {
  if (!worstCase || worstCase <= 0) return 0;
  const v = Math.log10(worstCase / 20) * 11;
  return Math.max(0, Math.min(42, Math.round(v)));
}

/**
 * How much all clauses other than the worst can add, together.
 *
 * The cap is the important part: without it, a contract with eight ordinary
 * conditions outranked one with a single devastating clause. But a decision's
 * risk is set by its worst consequence, not by the number of lines.
 *
 * Cap and decay must be tuned together, though. With cap 15 and decay 0.35 the
 * second finding at severity 45 was already worth 15.75, i.e. the cap: from
 * there on the third, fourth and eighth clause changed nothing. "Diminishing
 * returns" was in fact a binary step, and a contract with seven conditions
 * weighed as much as one with two.
 */
const RESIDUAL_CAP = 30;

/**
 * Aggregates severities: **the worst sets the level**, the others add with
 * diminishing returns and an overall cap.
 *
 * Returns a value not limited to 100: a raw sum that also tells a bad contract
 * from a very bad one. `compressSeverity` brings it back onto the scale.
 */
export function aggregateSeverity(findings = []) {
  if (!findings.length) return 0;
  const sorted = findings.map((f) => f.severity).sort((a, b) => b - a);
  let residual = 0;
  for (let i = 1; i < sorted.length; i++) {
    residual += sorted[i] * Math.pow(0.45, i);
  }
  return Math.round(sorted[0] + Math.min(RESIDUAL_CAP, residual));
}

/** Below this threshold the score stays linear: the zone where precision matters. */
const KNEE = 50;
/** How fast it compresses above the knee. Higher = gentler compression. */
const SPAN = 45;
/**
 * Clauses alone cannot reach 100: the top must be earned.
 *
 * Keep an eye on this value together with the highest reachable raw value
 * (maximum severity 95 after personalisation, plus RESIDUAL_CAP): if the raw
 * maximum compresses well below this cap, the high bands become unreachable for
 * clauses alone. That used to be the case: the maximum compressed to 75, so HIGH
 * RISK (76) and CRITICAL (87) were structurally out of reach for a contract
 * without an extractable price — for example a full assignment of copyright
 * read by a user outside the EU. `test/calibration.test.mjs` checks it with a
 * dedicated assertion.
 */
const CLAUSE_CEILING = 95;

/**
 * Compresses the raw sum onto the 0-100 scale, monotonically and asymptotically.
 *
 * Without this step four ordinary clauses are enough to hit the cap, and from
 * there on the score stops distinguishing: an honest yearly subscription and a
 * predatory loan both give 100, the user always sees red and learns not to look.
 * Compression gives back resolution exactly where it is needed, at the top.
 */
export function compressSeverity(raw) {
  if (raw <= KNEE) return Math.round(raw);
  const headroom = CLAUSE_CEILING - KNEE;
  return Math.round(KNEE + headroom * (1 - Math.exp(-(raw - KNEE) / SPAN)));
}

/**
 * Computes the final score and level.
 *
 * @returns {{score:number, level:object, components:object, drivers:Array}}
 */
export function computeScore({ findings = [], cost = {}, consumer = {}, actionType = 'manual', analyzed = true } = {}) {
  const raw = aggregateSeverity(findings);
  const base = Math.max(ACTION_FLOOR[actionType] ?? 0, compressSeverity(raw));

  const money = moneyPressure(cost.worstCase);
  const euBoost = consumer.boost || 0;
  // If the price shown underestimates the commitment, that is exactly the case
  // this product exists to catch.
  const understatedBoost = cost.understated ? 10 : 0;

  /**
   * Pressures don't add to the score: they apply to the **remaining room**. An
   * economic exposure of 26 points on a base of 85 adds 26% of the 15 points
   * left, not 26 full points.
   *
   * That is the difference between an indicator that orders and one that
   * saturates: by adding, any contract with two clauses and a price ended at 100.
   */
  const pressure = Math.min(70, money + euBoost + understatedBoost);
  let score = base + (100 - base) * (pressure / 100);

  // A single weak clue must not trigger a red alert.
  if (findings.length === 1 && findings[0].confidence < 0.8 && !cost.worstCase) {
    score = Math.min(score, 44);
  }
  if (!analyzed) score = Math.min(score, 30);

  score = Math.max(0, Math.min(100, Math.round(score)));

  const drivers = buildDrivers({ findings, cost, consumer, money, euBoost, understatedBoost, base, actionType });

  return {
    score,
    level: levelForScore(score),
    components: { raw, base, floor: ACTION_FLOOR[actionType] ?? 0, money, euBoost, understatedBoost, pressure },
    drivers,
  };
}

function buildDrivers({ findings, cost, consumer, money, euBoost, understatedBoost }) {
  const drivers = [];

  for (const f of findings.slice(0, 3)) {
    drivers.push({
      kind: 'clause',
      weight: f.severity,
      label: f.label,
      detail: f.personalized && f.personalReasons?.length
        ? `${f.why} ${t('mattersMoreProfileX', { x: f.personalReasons.join(', ') })}`
        : f.why,
    });
  }
  if (understatedBoost) {
    drivers.push({
      kind: 'money',
      weight: understatedBoost,
      label: t('priceShownNotCostCommitment'),
      detail: t('seeButEstimatedPotentialCommitmentB', { a: cost.displayed, b: cost.worstCaseLabel }),
    });
  } else if (money >= 12) {
    drivers.push({
      kind: 'money',
      weight: money,
      label: t('significantFinancialExposure'),
      detail: t('estimatedPotentialCommitmentX', { x: cost.worstCaseLabel }),
    });
  }
  if (euBoost >= 8 && consumer.flags?.length) {
    drivers.push({
      kind: 'law',
      weight: euBoost,
      label: consumer.jurisdiction === 'IT'
        ? tn(consumer.flags.length, 'nTermCheckAgainstItalianConsumer', 'nTermsCheckAgainstItalianConsumer')
        : tn(consumer.flags.length, 'nTermCheckAgainstEuConsumer', 'nTermsCheckAgainstEuConsumer'),
      detail: consumer.flags.map((f) => f.title).join(' · '),
    });
  }

  return drivers.sort((a, b) => b.weight - a.weight);
}

/**
 * Decides whether the action must actually be blocked, based on the threshold
 * the user chose in settings.
 */
export function shouldBlock(levelId, blockFrom = 'commitment') {
  const order = ['safe', 'review', 'commitment', 'high_risk', 'critical'];
  const li = order.indexOf(levelId);
  const bi = order.indexOf(blockFrom);
  if (li < 0 || bi < 0) return false;
  return li >= bi;
}

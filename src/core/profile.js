/**
 * Personal Risk Profile.
 *
 * The same clause doesn't weigh the same for everyone: "you grant a worldwide
 * licence on uploaded content" is a nuisance for someone uploading holiday
 * photos and a serious problem for a photographer who lives off those images.
 *
 * This module turns the areas the user wants to protect into multipliers
 * applied to each category's severity.
 */

import { RISK_CATEGORIES, PROTECTION_LABELS, DEFAULT_SETTINGS } from './constants.js';
import { t } from '../i18n/index.js';

/** How much an active area amplifies the categories it touches. */
const AREA_WEIGHT = {
  money: 1.25,
  privacy: 1.25,
  ip: 1.45,
  freelance: 1.4,
  business: 1.35,
  minors: 1.3,
  identity: 1.2,
};

/**
 * Cap on the overall multiplier.
 *
 * The profile must *order* clauses by what you care about, not inflate them:
 * if it multiplies too much, an already high severity hits the cap and
 * personalisation stops distinguishing exactly in the cases it matters for.
 */
const MAX_MULTIPLIER = 1.55;

/** If no area of the category is active, the severity is damped. */
const UNSELECTED_DAMPENER = 0.85;

/**
 * Above this base severity the dampener does not apply.
 *
 * The logic used to confuse two very different things: "the user said this area
 * doesn't matter to them" and "the user never thought about it". The second is
 * the normal case — nobody opens settings — and the default profile (money,
 * privacy, identity) contains neither `ip` nor `freelance`. Result:
 * `ip_assignment`, the most serious category in the dictionary, was
 * **downgraded** by 15% for exactly the installation almost every user has, and
 * a full assignment of copyright dropped one band.
 *
 * Above 65 the harm is objective and irreversible, not a preference: rights
 * assignment (85), sale of data (70), biometric data (70), exit fee (65). The
 * profile can order, it cannot absolve.
 */
const DAMPENER_EXEMPT_BASE = 65;

/**
 * Computes the multiplier for a category given the profile.
 * @returns {{multiplier:number, reasons:string[]}}
 */
export function multiplierFor(category, profile = DEFAULT_SETTINGS.profile) {
  const meta = RISK_CATEGORIES[category];
  if (!meta) return { multiplier: 1, reasons: [] };

  const active = (meta.areas || []).filter((a) => profile?.[a]);
  if (!active.length) {
    const dampenable = (meta.areas || []).length && (meta.base ?? 0) < DAMPENER_EXEMPT_BASE;
    return { multiplier: dampenable ? UNSELECTED_DAMPENER : 1, reasons: [] };
  }

  // The first active area counts fully, the next ones with diminishing
  // returns: two active areas must not double the risk.
  let multiplier = 1;
  const sorted = active.slice().sort((a, b) => (AREA_WEIGHT[b] || 1) - (AREA_WEIGHT[a] || 1));
  sorted.forEach((area, i) => {
    const w = AREA_WEIGHT[area] || 1;
    multiplier *= i === 0 ? w : 1 + (w - 1) * 0.25;
  });

  return {
    multiplier: Math.min(MAX_MULTIPLIER, Math.round(multiplier * 100) / 100),
    reasons: sorted.map((a) => (PROTECTION_LABELS[a] ? t(PROTECTION_LABELS[a]) : a)),
  };
}

/**
 * Applies the profile to a list of findings.
 * Does not mutate the input objects.
 */
export function personalize(findings = [], profile = DEFAULT_SETTINGS.profile) {
  return findings
    .map((f) => {
      const { multiplier, reasons } = multiplierFor(f.category, profile);
      // 95, not 100: the top is reserved for what is serious in itself.
      const personalSeverity = Math.max(0, Math.min(95, Math.round(f.severity * multiplier)));
      return {
        ...f,
        baseSeverity: f.severity,
        severity: personalSeverity,
        personalMultiplier: multiplier,
        personalReasons: reasons,
        personalized: multiplier !== 1,
      };
    })
    .sort((a, b) => b.severity - a.severity);
}

/**
 * A readable summary of the profile, for the UI.
 */
export function describeProfile(profile = DEFAULT_SETTINGS.profile) {
  const active = Object.entries(profile || {})
    .filter(([, v]) => v)
    .map(([k]) => PROTECTION_LABELS[k] || k);
  if (!active.length) return 'Nessuna area di protezione selezionata';
  return active.join(' · ');
}

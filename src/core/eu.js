/**
 * EU / Italian Consumer Risk Engine.
 *
 * Many competitors were born for the US market and judge clauses by a yardstick
 * that doesn't apply in Europe. Here the question is not only "is this clause
 * unfavourable?" but "does this condition hold up against the protections EU
 * and Italian consumers have?".
 *
 * ⚠️ This module produces **automated information, not legal advice**. Legal
 * references help the user know where to look, not decide whether a clause is
 * valid in a specific case: that depends on the contract, the parties and
 * whether the user is a consumer.
 */

import { t } from '../i18n/index.js';

export const DISCLAIMER =
  'automaticAnalysisInformationOnlyNotLegal2';

/**
 * Each check links a risk category to the legal reference that makes it at
 * least questionable for EU/Italian consumers.
 */
const CHECKS = [
  {
    id: 'eu.arbitration',
    categories: ['arbitration'],
    scopes: ['IT', 'EU'],
    title: 'mandatoryArbitrationImposedConsumer',
    note: 'consumerContractsClausesForceArbitrationTake',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. t)', 'Direttiva 93/13/CEE'],
    boost: 12,
  },
  {
    id: 'eu.jurisdiction',
    categories: ['jurisdiction'],
    scopes: ['IT', 'EU'],
    title: 'courtOtherThanConsumerSOwn',
    note: 'ruleConsumersCanSueSuedCourts',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. u)', 'Reg. UE 1215/2012, artt. 17-19'],
    boost: 12,
  },
  {
    id: 'eu.class_action',
    categories: ['class_action_waiver'],
    scopes: ['IT', 'EU'],
    title: 'advanceWaiverCollectiveActions',
    note: 'euLawHasIntroducedRepresentativeActions',
    refs: ['Direttiva UE 2020/1828', 'Codice del Consumo, art. 140-ter e ss.'],
    boost: 8,
  },
  {
    id: 'eu.unilateral',
    categories: ['unilateral_change', 'price_change'],
    scopes: ['IT', 'EU'],
    title: 'unilateralChangeTermsPrice',
    note: 'clausesLettingTraderChangeContractPrice',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. m) e o)', 'Direttiva 93/13/CEE, allegato punto 1 lett. j) e l)'],
    boost: 12,
  },
  {
    id: 'eu.liability',
    categories: ['liability_limitation'],
    scopes: ['IT', 'EU'],
    title: 'exclusionLimitationLiability',
    note: 'excludingLimitingTraderSLiabilityPersonal',
    refs: ['Codice del Consumo, artt. 33 c. 2 lett. a)-b) e 36 c. 2', 'Codice civile, art. 1229'],
    boost: 10,
  },
  {
    id: 'eu.withdrawal',
    categories: [],
    scopes: ['IT', 'EU'],
    title: 'n14DayRightWithdrawalNotMentioned',
    note: 'distancePurchasesConsumersNormallyHave14',
    refs: ['Codice del Consumo, artt. 52-59', 'Direttiva 2011/83/UE'],
    boost: 10,
    test: ({ text, actionType, findings }) => {
      const isCommerce = ['purchase', 'subscribe'].includes(actionType) || findings.some((f) => ['auto_renewal', 'no_refund'].includes(f.category));
      if (!isCommerce) return false;
      // The word "withdrawal" appearing is not enough: the *right* to change
      // your mind, with its deadline, is needed. A contract can talk at length
      // about early termination and say nothing about the 14 days.
      return !/\bdiritto\s+di\s+recesso\b|\bripensamento\b|\bright\s+(?:of|to)\s+withdraw\w*|\b14\s*(?:giorni|days)\b|\bcooling.?off\b|\brecesso\s+entro\b/i.test(text);
    },
  },
  {
    id: 'eu.no_refund',
    categories: ['no_refund'],
    scopes: ['IT', 'EU'],
    title: 'blanketExclusionRefunds',
    note: 'absoluteNoRefundRuleSitsBadly',
    refs: ['Codice del Consumo, artt. 52-59 e 128-135', 'Direttiva UE 2019/771'],
    boost: 10,
  },
  {
    id: 'eu.tacit_renewal',
    categories: ['auto_renewal'],
    scopes: ['IT', 'EU'],
    title: 'tacitRenewalLongNotice',
    note: 'clausesProvidingTacitRenewalWhileRequiring',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. i)'],
    boost: 10,
    test: ({ cost }) => Boolean(cost?.notice && cost.notice.months >= 1),
  },
  {
    id: 'eu.vexatious_form',
    categories: [],
    scopes: ['IT'],
    title: 'onerousClausesWithoutSpecificApproval',
    note: 'standardTermsDrawnUpOneParty',
    refs: ['Codice civile, art. 1341 c. 2'],
    boost: 6,
    test: ({ findings, ctx }) => {
      const onerous = findings.filter((f) => ['arbitration', 'jurisdiction', 'liability_limitation', 'early_termination_penalty', 'unilateral_change'].includes(f.category));
      return onerous.length >= 2 && !ctx?.form?.hasSpecificApproval;
    },
  },
  {
    id: 'eu.consent_bundled',
    categories: ['profiling', 'data_sharing', 'data_sale', 'ai_training'],
    scopes: ['IT', 'EU'],
    title: 'bundledPreTickedConsent',
    note: 'consentDataProcessingMustFreeSpecific',
    refs: ['GDPR, artt. 4(11), 7 e cons. 32/43', 'Linee guida EDPB 05/2020'],
    boost: 12,
    test: ({ ctx }) => Boolean(ctx?.form?.precheckedConsents) || Boolean(ctx?.form?.bundledConsent),
  },
  {
    id: 'eu.transfer',
    categories: ['third_party_transfer'],
    scopes: ['IT', 'EU'],
    title: 'dataTransferOutsideEea',
    note: 'transfersThirdCountriesNeedSpecificBasis',
    refs: ['GDPR, artt. 44-49'],
    boost: 8,
  },
  {
    id: 'eu.data_sale',
    categories: ['data_sale'],
    scopes: ['IT', 'EU'],
    title: 'sellingDataMoney',
    note: 'euLawHasNoSimpleOpt',
    refs: ['GDPR, artt. 6, 13 e 14'],
    boost: 10,
  },
  {
    id: 'eu.ai_training',
    categories: ['ai_training'],
    scopes: ['IT', 'EU'],
    title: 'usingContentTrainAiModels',
    note: 'ifContentIncludesPersonalDataSpecific',
    refs: ['GDPR, artt. 6 e 13', 'Direttiva UE 2019/790, art. 4', 'Reg. UE 2024/1689 (AI Act)'],
    boost: 8,
  },
  {
    id: 'eu.dark_pattern',
    categories: ['dark_pattern'],
    scopes: ['IT', 'EU'],
    title: 'potentiallyDeceptiveInterface',
    note: 'commercialPracticesAppreciablyImpairConsumerS',
    refs: ['Codice del Consumo, artt. 20-26', 'Reg. UE 2022/2065 (DSA), art. 25'],
    boost: 8,
  },
];

/**
 * Esegue i controlli consumer.
 *
 * @param {object} p
 * @param {string} p.text
 * @param {Array}  p.findings
 * @param {object} p.ctx
 * @param {object} p.cost
 * @param {string} p.actionType
 * @param {string} p.jurisdiction  'IT' | 'EU' | 'UK' | 'US' | 'OTHER'
 */
export function runConsumerChecks({ text = '', findings = [], ctx = {}, cost = {}, actionType = 'accept_terms', jurisdiction = 'IT' } = {}) {
  /**
   * Spain is in the EU: the directives quoted apply, the articles of the Italian
   * Consumer Code and Civil Code don't. Normalising `ES` to `EU` gives exactly
   * that — the thirteen EU-level checks stay, the one with `scopes: ['IT']`
   * (art. 1341 of the Civil Code, unfair terms requiring a double signature)
   * stays out.
   */
  if (jurisdiction === 'ES') jurisdiction = 'EU';
  const applicable = jurisdiction === 'IT' || jurisdiction === 'EU';
  if (!applicable) {
    return { applicable: false, jurisdiction, flags: [], boost: 0, disclaimer: t(DISCLAIMER) };
  }

  const found = new Set(findings.map((f) => f.category));
  const flags = [];

  for (const check of CHECKS) {
    if (!check.scopes.includes(jurisdiction)) continue;

    const categoryHit = check.categories.length > 0 && check.categories.some((c) => found.has(c));
    let customHit = true;
    if (check.test) {
      try {
        customHit = Boolean(check.test({ text, findings, ctx, cost, actionType, jurisdiction }));
      } catch {
        customHit = false;
      }
    }
    // With categories, both are needed; without, the test is enough.
    const hit = check.categories.length ? categoryHit && customHit : customHit;
    if (!hit) continue;

    flags.push({
      id: check.id,
      title: check.title,
      note: check.note,
      refs: check.refs,
      categories: check.categories,
      boost: check.boost,
    });
  }

  // The contribution to the score is damped *and* capped: with the old cap any
  // contract with three findings hit the maximum, and the consumer engine
  // stopped telling a nuisance from an abuse.
  const raw = flags.reduce((s, f) => s + f.boost, 0);
  const boost = Math.round(Math.min(25, raw * 0.35));

  return {
    applicable: true, jurisdiction, boost, disclaimer: t(DISCLAIMER),
    flags: flags.map((f) => ({ ...f, title: t(f.title), note: t(f.note) })),
  };
}

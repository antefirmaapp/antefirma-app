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
    national: {
      DE: ['BGB § 309 Nr. 14 (Schiedsklauseln in AGB)'], AT: ['KSchG § 6 Abs. 2 Z 7'],
      FR: ['Code de la consommation, art. R212-2, 10°'], BE: ['Code de droit économique, art. VI.83, 23°'], NL: ['Burgerlijk Wetboek, art. 6:236 sub n'], PL: ['Kodeks cywilny, art. 385³ pkt 23'], PT: ['Decreto-Lei n.º 446/85, art. 21.º, alínea h)'],
      SE: ['Lag (1999:116) om skiljeförfarande, 6 §'], RO: ['Legea nr. 193/2000 privind clauzele abuzive, art. 4 și anexa'], CZ: ['Zákon č. 216/1994 Sb., o rozhodčím řízení, § 2 odst. 3'],
      DK: ['Voldgiftsloven, § 7'], FI: ['Kuluttajansuojalaki (38/1978), 12 luku 1 c §'], NO: ['Voldgiftsloven, § 11'],
      SK: ['Občiansky zákonník, § 53 ods. 1 a 4'], HU: ['Ptk. 6:102–6:104. §'], GR: ['Ν. 2251/1994, άρθρο 2 παρ. 6 και 7'], IE: ['Consumer Rights Act 2022, Part 4 and Schedule 3'], MT: ['Consumer Affairs Act (Cap. 378), arts. 44–47'], CY: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή), καταχρηστικές ρήτρες'], LU: ['Code de la consommation, art. L. 211-2 et L. 211-3'] },
    boost: 12,
  },
  {
    id: 'eu.jurisdiction',
    categories: ['jurisdiction'],
    scopes: ['IT', 'EU'],
    title: 'courtOtherThanConsumerSOwn',
    note: 'ruleConsumersCanSueSuedCourts',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. u)', 'Reg. UE 1215/2012, artt. 17-19'],
    national: { AT: ['KSchG § 14'], FR: ['Code de la consommation, art. R212-2, 10°'], BE: ['Code de droit économique, art. VI.83, 23°'], NL: ['Burgerlijk Wetboek, art. 6:236 sub n'], PL: ['Kodeks cywilny, art. 385³ pkt 23'], PT: ['Decreto-Lei n.º 446/85, art. 19.º, alínea g)'],
      SE: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 §'], RO: ['Legea nr. 193/2000 privind clauzele abuzive, art. 4 și anexa'], CZ: ['Občanský zákoník (zákon č. 89/2012 Sb.), § 1813–1815'],
      DK: ['Retsplejeloven, § 245, stk. 2'], FI: ['Kuluttajansuojalaki (38/1978), 12 luku 1 d §'], NO: ['Tvisteloven, § 4-6'],
      SK: ['Občiansky zákonník, § 53 ods. 1 a 4'], HU: ['Ptk. 6:102–6:104. §'], GR: ['Ν. 2251/1994, άρθρο 2 παρ. 6 και 7'], IE: ['Consumer Rights Act 2022, Part 4 and Schedule 3'], MT: ['Consumer Affairs Act (Cap. 378), arts. 44–47'], CY: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή), καταχρηστικές ρήτρες'], LU: ['Code de la consommation, art. L. 211-2 et L. 211-3'] },
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
    national: {
      DE: ['BGB § 308 Nr. 4 und § 307'], AT: ['KSchG § 6 Abs. 1 Z 5 und Abs. 2 Z 3'],
      FR: ['Code de la consommation, art. R212-1, 3° et 4°'], BE: ['Code de droit économique, art. VI.83, 1° et 3°'], NL: ['Burgerlijk Wetboek, art. 6:236 sub i en 6:237 sub c'], PL: ['Kodeks cywilny, art. 385³ pkt 19 i 20'], PT: ['Decreto-Lei n.º 446/85, art. 22.º, n.º 1, alíneas c) e d)'],
      SE: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 §'], RO: ['Legea nr. 193/2000, anexa, lit. a)'], CZ: ['Občanský zákoník (zákon č. 89/2012 Sb.), § 1752 a § 1814'],
      DK: ['Aftaleloven, §§ 36 og 38 c'], FI: ['Kuluttajansuojalaki (38/1978), 3 luku 1 § ja 4 luku 1 §'], NO: ['Avtaleloven § 36 og markedsføringsloven § 22'],
      SK: ['Občiansky zákonník, § 53 ods. 1 a 4'], HU: ['Ptk. 6:102–6:104. §'], GR: ['Ν. 2251/1994, άρθρο 2 παρ. 6 και 7'], IE: ['Consumer Rights Act 2022, Part 4 and Schedule 3'], MT: ['Consumer Affairs Act (Cap. 378), arts. 44–47'], CY: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή), καταχρηστικές ρήτρες'], LU: ['Code de la consommation, art. L. 211-2 et L. 211-3'] },
    boost: 12,
  },
  {
    id: 'eu.liability',
    categories: ['liability_limitation'],
    scopes: ['IT', 'EU'],
    title: 'exclusionLimitationLiability',
    note: 'excludingLimitingTraderSLiabilityPersonal',
    refs: ['Codice del Consumo, artt. 33 c. 2 lett. a)-b) e 36 c. 2', 'Codice civile, art. 1229'],
    national: {
      DE: ['BGB § 309 Nr. 7'], AT: ['KSchG § 6 Abs. 1 Z 9'],
      FR: ['Code de la consommation, art. R212-1, 6°'], BE: ['Code de droit économique, art. VI.83, 13°'], NL: ['Burgerlijk Wetboek, art. 6:237 sub f'], PL: ['Kodeks cywilny, art. 385³ pkt 2'], PT: ['Decreto-Lei n.º 446/85, art. 18.º, alíneas a) a d)'],
      SE: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 §'], RO: ['Legea nr. 193/2000 privind clauzele abuzive, art. 4 și anexa'], CZ: ['Občanský zákoník (zákon č. 89/2012 Sb.), § 1814 a § 2898'],
      DK: ['Aftaleloven, §§ 36 og 38 c'], FI: ['Kuluttajansuojalaki (38/1978), 3 luku 1 § ja 4 luku 1 §'], NO: ['Avtaleloven § 36 og markedsføringsloven § 22'],
      SK: ['Občiansky zákonník, § 53 ods. 1 a 4'], HU: ['Ptk. 6:102–6:104. §'], GR: ['Ν. 2251/1994, άρθρο 2 παρ. 6 και 7'], IE: ['Consumer Rights Act 2022, Part 4 and Schedule 3'], MT: ['Consumer Affairs Act (Cap. 378), arts. 44–47'], CY: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή), καταχρηστικές ρήτρες'], LU: ['Code de la consommation, art. L. 211-2 et L. 211-3'] },
    boost: 10,
  },
  {
    id: 'eu.withdrawal',
    categories: [],
    scopes: ['IT', 'EU'],
    title: 'n14DayRightWithdrawalNotMentioned',
    note: 'distancePurchasesConsumersNormallyHave14',
    refs: ['Codice del Consumo, artt. 52-59', 'Direttiva 2011/83/UE'],
    national: {
      DE: ['BGB §§ 312g, 355, 356'], AT: ['FAGG §§ 11-16'],
      FR: ['Code de la consommation, art. L221-18 à L221-28'], BE: ['Code de droit économique, art. VI.47 à VI.53'], NL: ['Burgerlijk Wetboek, art. 6:230o-6:230s'], PL: ['Ustawa o prawach konsumenta, art. 27–38'], PT: ['Decreto-Lei n.º 24/2014, arts. 10.º a 17.º'],
      SE: ['Lag (2005:59) om distansavtal och avtal utanför affärslokaler, 2 kap. 10–15 §§'], RO: ['OUG nr. 34/2014, art. 9–16'], CZ: ['Občanský zákoník (zákon č. 89/2012 Sb.), § 1829–1837'],
      DK: ['Forbrugeraftaleloven, §§ 17–24'], FI: ['Kuluttajansuojalaki (38/1978), 6 luku 14–16 §'], NO: ['Angrerettloven, §§ 20–26'],
      SK: ['Zákon č. 108/2024 Z. z. o ochrane spotrebiteľa'], HU: ['45/2014. (II. 26.) Korm. rendelet, 20–23. §'], GR: ['Ν. 2251/1994, άρθρο 3ε'], IE: ['Consumer Rights Act 2022, Part 3'], MT: ['Consumer Rights Regulations (S.L. 378.17)'], CY: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή), δικαίωμα υπαναχώρησης'], LU: ['Code de la consommation, art. L. 222-9 et suivants'] },
    boost: 10,
    test: ({ text, actionType, findings }) => {
      const isCommerce = ['purchase', 'subscribe'].includes(actionType) || findings.some((f) => ['auto_renewal', 'no_refund'].includes(f.category));
      if (!isCommerce) return false;
      // The word "withdrawal" appearing is not enough: the *right* to change
      // your mind, with its deadline, is needed. A contract can talk at length
      // about early termination and say nothing about the 14 days.
      return !/\bdiritto\s+di\s+recesso\b|\bripensamento\b|\bright\s+(?:of|to)\s+withdraw\w*|\b14\s*(?:giorni|days)\b|\bcooling.?off\b|\brecesso\s+entro\b/i.test(text)
        && !/(?<![\wÀ-ɏ])(?:desistimiento|widerrufsrecht|widerrufsbelehrung|r(?:ü|ue)cktrittsrecht|droit\s+de\s+r(?:é|e)tractation|herroepingsrecht|bedenktijd|odst(?:ą|a)pi(?:enia|ć)\s+od\s+umowy|livre\s+resolu(?:ç|c)(?:ã|a)o|direito\s+de\s+arrependimento|(?:å|a)ngerr(?:ä|a)tt|(?:å|a)ngerfrist|dreptul\s+de\s+retragere|odstoupit\s+od\s+smlouvy|odstoupen(?:í|i)\s+od\s+smlouvy|fortrydelsesret|fortrydelsesfrist|peruuttamisoikeu\w*|peruutusoikeu\w*|angrerett(?:en)?|angrefrist|odst(?:ú|u)pi(?:ť|t)\s+od\s+zmluvy|odst(?:ú|u)penie\s+od\s+zmluvy|el(?:á|a)ll(?:á|a)s\w*|el(?:á|a)ll(?:á|a)si\s+jog\w*|υπαναχ(?:ω|ώ)ρ[\u0370-\u03ff]*|14\s*(?:d[ií]as|tage|tagen|jours|dagen|dni|dagar|zile|dn(?:ů|u)|dn(?:í|i)|dage|dager|p(?:ä|a)iv(?:ä|a)(?:ä|a)|p(?:ä|a)iv(?:ä|a)n|nap\w*|ημερ[\u0370-\u03ff]*))(?![\wÀ-ɏ])/i.test(text);
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
    national: {
      DE: ['BGB § 309 Nr. 9'], AT: ['KSchG § 6 Abs. 1 Z 2'],
      FR: ['Code de la consommation, art. L215-1'], BE: ['Code de droit économique, art. VI.83, 8°'], NL: ['Burgerlijk Wetboek, art. 6:236 sub j'], PL: ['Kodeks cywilny, art. 385³ pkt 18'], PT: ['Decreto-Lei n.º 446/85, art. 22.º, n.º 1, alínea a)'],
      SE: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 §'], RO: ['Legea nr. 193/2000 privind clauzele abuzive, art. 4 și anexa'], CZ: ['Občanský zákoník (zákon č. 89/2012 Sb.), § 1813–1815'],
      DK: ['Aftaleloven, §§ 36 og 38 c'], FI: ['Kuluttajansuojalaki (38/1978), 3 luku 1 § ja 4 luku 1 §'], NO: ['Avtaleloven § 36 og markedsføringsloven § 22'],
      SK: ['Občiansky zákonník, § 53 ods. 1 a 4'], HU: ['Ptk. 6:102–6:104. §'], GR: ['Ν. 2251/1994, άρθρο 2 παρ. 6 και 7'], IE: ['Consumer Rights Act 2022, Part 4 and Schedule 3'], MT: ['Consumer Affairs Act (Cap. 378), arts. 44–47'], CY: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή), καταχρηστικές ρήτρες'], LU: ['Code de la consommation, art. L. 211-2 et L. 211-3'] },
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
  /**
   * National rules that go beyond the directives. Germany and the Netherlands
   * cap what a tacit renewal may do: after the first term the contract may only
   * continue indefinitely, cancellable with at most one month's notice.
   */
  {
    id: 'national.monthly_after_term',
    categories: ['auto_renewal'],
    scopes: ['DE', 'NL'],
    title: 'renewsOnlyIndefinitelyMonthlyNotice',
    note: 'afterFirstTermMonthlyNotice',
    refs: [],
    national: { DE: ['BGB § 309 Nr. 9 Buchst. b und c'], NL: ['Burgerlijk Wetboek, art. 6:236 sub j'] },
    boost: 10,
    test: ({ cost }) => Boolean(cost?.notice && cost.notice.months > 1),
  },
  {
    id: 'national.max_initial_term',
    categories: [],
    scopes: ['DE'],
    title: 'initialTermOverTwoYears',
    note: 'germanyInitialTermMax24Months',
    refs: [],
    national: { DE: ['BGB § 309 Nr. 9 Buchst. a'] },
    boost: 10,
    test: ({ cost }) => Boolean(cost?.minTerm && cost.minTerm.months > 24),
  },
  /** France (loi Chatel) and Austria: the provider has to remind you before a tacit renewal. */
  {
    id: 'national.renewal_reminder',
    categories: ['auto_renewal'],
    scopes: ['FR', 'AT'],
    title: 'providerMustRemindBeforeRenewal',
    note: 'withoutReminderCanLeaveAnyTime',
    refs: [],
    national: { FR: ['Code de la consommation, art. L215-1'], AT: ['KSchG § 6 Abs. 1 Z 2'] },
    boost: 4,
  },
];

const NATIONAL = ['DE', 'AT', 'FR', 'BE', 'NL', 'PL', 'PT', 'SE', 'RO', 'CZ', 'DK', 'FI', 'NO', 'SK', 'HU', 'GR', 'IE', 'MT', 'CY', 'LU'];
/** References to Italian law, left out where it doesn't apply. */
const ITALIAN_SOURCE = /^(?:Codice|D\.Lgs)/;

/**
 * Runs the consumer checks.
 *
 * @param {object} p
 * @param {string} p.text
 * @param {Array}  p.findings
 * @param {object} p.ctx
 * @param {object} p.cost
 * @param {string} p.actionType
 * @param {string} p.jurisdiction  'IT' | 'ES' | 'DE' | 'AT' | 'FR' | 'BE' | 'NL' | 'PL' | 'PT' | 'SE' | 'RO' | 'CZ' | 'DK' | 'FI' | 'NO' | 'SK' | 'HU' | 'GR' | 'EU' | 'UK' | 'US' | 'OTHER'
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
  /**
   * Germany, Austria, France, Belgium, the Netherlands, Poland, Portugal,
   * Sweden, Romania, the Czech Republic, Denmark, Finland and Norway (EEA)
   * get the EU checks
   * plus their own: each reference list starts with the national article and
   * keeps the directives, never the Italian codes. Every national reference is
   * marked for review by a lawyer of that country (antefirma-content).
   */
  const national = NATIONAL.includes(jurisdiction) ? jurisdiction : null;
  const applicable = jurisdiction === 'IT' || jurisdiction === 'EU' || Boolean(national);
  if (!applicable) {
    return { applicable: false, jurisdiction, flags: [], boost: 0, disclaimer: t(DISCLAIMER) };
  }

  const found = new Set(findings.map((f) => f.category));
  const flags = [];

  for (const check of CHECKS) {
    if (!check.scopes.includes(jurisdiction) && !(national && check.scopes.includes('EU'))) continue;

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
      refs: national ? [...(check.national?.[national] || []), ...check.refs.filter((r) => !ITALIAN_SOURCE.test(r))] : check.refs,
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

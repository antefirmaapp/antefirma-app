/**
 * The engine's shared vocabulary: risk categories, protection areas of the
 * personal profile, verdict levels, types of intercepted action.
 *
 * The rest of the engine (server analysis, scoring, UI) speaks this language.
 */

/** Action types the detector treats as a "commitment". */
export const ACTION_TYPES = {
  ACCEPT_TERMS: 'accept_terms',
  SUBSCRIBE: 'subscribe',
  PURCHASE: 'purchase',
  SIGN: 'sign',
  SIGNUP: 'signup',
  CONSENT: 'consent',
  OAUTH: 'oauth',
  MANUAL: 'manual', // analysis started from the side panel
};

export const ACTION_LABELS = {
  accept_terms: 'acceptingTermsConditions',
  subscribe: 'startingSubscription',
  purchase: 'purchase',
  sign: 'signingDocument',
  signup: 'creatingAccount',
  consent: 'consentDataProcessing',
  oauth: 'grantingAccessAnotherService',
  manual: 'manualAnalysis',
};

/**
 * The areas the user can declare they want to protect.
 * They are the "weights" of the Personal Risk Profile.
 */
export const PROTECTION_AREAS = {
  MONEY: 'money',
  PRIVACY: 'privacy',
  IP: 'ip',
  FREELANCE: 'freelance',
  BUSINESS: 'business',
  MINORS: 'minors',
  IDENTITY: 'identity',
};

export const PROTECTION_LABELS = {
  money: 'money',
  privacy: 'privacy',
  ip: 'intellectualProperty',
  freelance: 'freelanceProfessionalWork',
  business: 'businessData',
  minors: 'childrenFamily',
  identity: 'digitalIdentity',
};

/**
 * Risk categories. `base` is the starting severity (0-100) before
 * personalisation; `areas` says which profile areas amplify it.
 *
 * How severities are calibrated: the yardstick is **expected harm**, not how
 * unpleasant the clause sounds. A liability limitation is in every contract in
 * the world and is worth 25; an assignment of copyright is irreversible and is
 * worth 85. If ordinary clauses start high, any normal contract ends up on red
 * alert and the user learns to ignore the warning — the quickest way to make a
 * firewall useless.
 *
 * Reference bands:
 *   85-100  irreversible or very costly to undo
 *   60-84   serious economic or legal consequence
 *   40-59   a real commitment, to read before accepting
 *   20-39   an ordinary condition, worth knowing
 */
export const RISK_CATEGORIES = {
  auto_renewal: {
    label: 'automaticRenewal',
    base: 45,
    areas: ['money'],
    why: 'contractRenewsItselfIfDonT',
  },
  minimum_term: {
    label: 'bindingMinimumTerm',
    base: 45,
    areas: ['money'],
    why: 'canTLeaveBeforeEndWithout',
  },
  early_termination_penalty: {
    label: 'earlyTerminationFee',
    base: 65,
    areas: ['money'],
    why: 'leavingEarlyHasExplicitCost',
  },
  notice_period: {
    label: 'mandatoryNoticeCancel',
    base: 30,
    areas: ['money'],
    why: 'mustRememberCancelAdvanceRenews',
  },
  no_refund: {
    label: 'noRefunds',
    base: 40,
    areas: ['money'],
    why: 'moneyPaidNotReturnedEvenIf',
  },
  hidden_costs: {
    label: 'extraVariableCosts',
    base: 40,
    areas: ['money'],
    why: 'priceShownIsnTTotalCost',
  },
  price_change: {
    label: 'unilateralPriceChanges',
    base: 50,
    areas: ['money'],
    why: 'providerCanRaisePriceDuringContract',
  },
  unilateral_change: {
    label: 'unilateralChangesTerms',
    base: 45,
    areas: ['money', 'privacy'],
    why: 'rulesAcceptTodayCanChangeWithout',
  },
  arbitration: {
    label: 'mandatoryArbitration',
    base: 55,
    areas: ['identity', 'business'],
    why: 'giveUpGoingOrdinaryCourtDispute',
  },
  class_action_waiver: {
    label: 'classActionWaiver',
    base: 40,
    areas: ['identity'],
    why: 'canTJoinOtherUsersClass',
  },
  jurisdiction: {
    label: 'foreignJurisdiction',
    base: 35,
    areas: ['identity', 'business'],
    why: 'enforceRightsDHaveGoDistant',
  },
  liability_limitation: {
    label: 'limitationLiability',
    base: 25,
    areas: ['business', 'money'],
    why: 'ifServiceCausesHarmCompensationHeavily',
  },
  ip_license: {
    label: 'licenceOverContent',
    base: 45,
    areas: ['ip', 'freelance'],
    why: 'grantServiceRightsUseWhatUpload',
  },
  ip_assignment: {
    label: 'transferRights',
    base: 85,
    areas: ['ip', 'freelance', 'business'],
    why: 'sNotLicenceTransferOwnershipRights',
  },
  data_sharing: {
    label: 'dataSharingThirdParties',
    base: 30,
    areas: ['privacy', 'business'],
    why: 'dataLeavesServiceReUsing',
  },
  data_sale: {
    label: 'saleData',
    base: 70,
    areas: ['privacy', 'identity'],
    why: 'dataTreatedSomethingSell',
  },
  ai_training: {
    label: 'useContentTrainAi',
    base: 45,
    // Not 'privacy': what you upload is yours before it is personal, and for
    // personal data there are already data_sharing and profiling. With 'privacy'
    // among the areas, this category became the main risk even for people who
    // had not said they cared about their content.
    areas: ['ip', 'freelance', 'business'],
    why: 'whatUploadCanEndUpInside',
  },
  profiling: {
    label: 'profilingTargetedAds',
    base: 20,
    areas: ['privacy', 'minors'],
    why: 'behaviourAnalysedCommercialPurposes',
  },
  biometric: {
    label: 'biometricData',
    base: 70,
    areas: ['privacy', 'identity', 'minors'],
    why: 'dataCanTChangeIfS',
  },
  data_retention: {
    label: 'longIndefiniteDataRetention',
    base: 30,
    areas: ['privacy'],
    why: 'dataStaysStoredEvenAfterClose',
  },
  account_termination: {
    label: 'accountClosureProviderSDiscretion',
    base: 35,
    areas: ['identity', 'business'],
    why: 'canLoseAccessContentWithoutNotice',
  },
  third_party_transfer: {
    label: 'dataTransfersOutsideEu',
    base: 30,
    areas: ['privacy', 'business'],
    why: 'dataMayProcessedCountriesDifferentProtections',
  },
  dark_pattern: {
    label: 'deceptiveInterfaceDesign',
    base: 45,
    areas: ['money', 'privacy'],
    why: 'pageBuiltMakeAcceptMoreThan',
  },
};

/**
 * Verdict levels, from the most harmless to the most serious.
 *
 * The thresholds are not round numbers picked by heart: they come from the
 * reference set in `test/fixtures/corpus.mjs` and sit in the *gaps* of the
 * distribution, where the labelled cases naturally separate.
 *
 * They should be revised when texts from real sites arrive: nine hand-written
 * examples are enough to remove saturation, not to have the last word.
 */
export const LEVELS = [
  {
    id: 'safe',
    label: 'allClear',
    headline: 'noSignificantConsequencesFound',
    min: 0,
    color: '#1a7f52',
    icon: '🟢',
    blocking: false,
  },
  {
    id: 'review',
    label: 'worthLook',
    headline: 'someTermsDeserveAttention',
    min: 22,
    color: '#b8860b',
    icon: '🟡',
    blocking: false,
  },
  {
    id: 'commitment',
    label: 'commitment',
    headline: 'takingSignificantFinancialLegalObligation',
    min: 55,
    color: '#c2620f',
    icon: '🟠',
    blocking: true,
  },
  {
    id: 'high_risk',
    label: 'highRisk',
    headline: 'therePotentiallyVeryUnfavourableClauses',
    min: 86,
    color: '#c0392b',
    icon: '🔴',
    blocking: true,
  },
  {
    id: 'critical',
    label: 'critical',
    headline: 'actionCanHaveSeriousConsequencesHard',
    min: 92,
    color: '#7d0a0a',
    icon: '⛔',
    blocking: true,
  },
];

/** Returns the level matching a 0-100 score. */
export function levelForScore(score) {
  let match = LEVELS[0];
  for (const level of LEVELS) {
    if (score >= level.min) match = level;
  }
  return match;
}

export const DEFAULT_SETTINGS = {
  enabled: true,
  /** Commitment register and deadline reminders. */
  trackCommitments: true,
  reminders: true,
  /** Periodic check of terms already accepted. */
  watchChanges: true,
  /**
   * May the automatic check have the server re-read terms already accepted?
   * Only when their public text changed, and only with consent to analysis.
   * Yes by default: without it, the check can only say "the text changed",
   * which for a copyright year is a false alarm.
   */
  watchUsesRemote: true,
  /**
   * When explicit consent to send text to the AnteFirma server was given.
   *
   * `null` means "never given": while it stays so no text leaves the browser,
   * and the warning asks for permission at the first analysis. The Chrome Web
   * Store policy requires not only declaring the transfer in the privacy policy
   * but a disclosure *inside the interface* and an explicit act of acceptance
   * before collection. Recording the date also serves the second duty: telling
   * the user if practices change after installation.
   */
  remoteConsentAt: null,
  /** Data used to pre-fill cancellation letters. It stays local. */
  identity: { name: '', address: '', email: '', customerId: '' },
  blockFrom: 'commitment', // minimum level that really blocks the click
  jurisdiction: 'IT', // IT | ES | DE | AT | FR | BE | NL | PL | PT | EU | UK | US | OTHER (set from the browser language at install)
  uiLang: 'auto', // auto (browser language) | it | en | es
  minBlockAmount: 0, // below this commitment (€) the click is not blocked, except critical cases
  profile: {
    money: true,
    privacy: true,
    ip: false,
    freelance: false,
    business: false,
    minors: false,
    identity: true,
  },
  allowlist: [],
  cacheTtlHours: 72,
  historyLimit: 100,
};

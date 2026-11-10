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
  MANUAL: 'manual', // analisi lanciata dal side panel
};

export const ACTION_LABELS = {
  accept_terms: 'Accettazione di termini e condizioni',
  subscribe: 'Attivazione di un abbonamento',
  purchase: 'Acquisto',
  sign: 'Firma di un documento',
  signup: 'Creazione di un account',
  consent: 'Consenso al trattamento dei dati',
  oauth: 'Autorizzazione di accesso a un altro servizio',
  manual: 'Analisi manuale',
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
  money: 'Denaro',
  privacy: 'Privacy',
  ip: 'Proprietà intellettuale',
  freelance: 'Lavoro freelance / professionale',
  business: 'Dati aziendali',
  minors: 'Minori / famiglia',
  identity: 'Identità digitale',
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
    label: 'Rinnovo automatico',
    base: 45,
    areas: ['money'],
    why: 'Il contratto si rinnova da solo: se non disdici entro i termini, ti impegni per un nuovo periodo.',
  },
  minimum_term: {
    label: 'Durata minima vincolante',
    base: 45,
    areas: ['money'],
    why: 'Non puoi uscire prima della scadenza senza conseguenze.',
  },
  early_termination_penalty: {
    label: 'Penale di recesso',
    base: 65,
    areas: ['money'],
    why: 'Uscire in anticipo ha un costo esplicito.',
  },
  notice_period: {
    label: 'Preavviso obbligatorio per disdire',
    base: 30,
    areas: ['money'],
    why: 'Devi ricordarti di disdire con anticipo, altrimenti scatta il rinnovo.',
  },
  no_refund: {
    label: 'Nessun rimborso',
    base: 40,
    areas: ['money'],
    why: 'I soldi versati non tornano indietro, nemmeno in caso di mancato utilizzo.',
  },
  hidden_costs: {
    label: 'Costi aggiuntivi o variabili',
    base: 40,
    areas: ['money'],
    why: 'Il prezzo mostrato non è il costo totale: ci sono voci ulteriori.',
  },
  price_change: {
    label: 'Modifica unilaterale del prezzo',
    base: 50,
    areas: ['money'],
    why: 'Il fornitore può aumentare il prezzo durante il rapporto.',
  },
  unilateral_change: {
    label: 'Modifica unilaterale delle condizioni',
    base: 45,
    areas: ['money', 'privacy'],
    why: 'Le regole che accetti oggi possono cambiare senza il tuo consenso.',
  },
  arbitration: {
    label: 'Arbitrato obbligatorio',
    base: 55,
    areas: ['identity', 'business'],
    why: 'Rinunci a rivolgerti al giudice ordinario in caso di controversia.',
  },
  class_action_waiver: {
    label: 'Rinuncia alle azioni collettive',
    base: 40,
    areas: ['identity'],
    why: 'Non potrai unirti ad altri utenti in una causa collettiva.',
  },
  jurisdiction: {
    label: 'Foro competente estero',
    base: 35,
    areas: ['identity', 'business'],
    why: 'Per far valere i tuoi diritti dovresti agire in un tribunale lontano.',
  },
  liability_limitation: {
    label: 'Limitazione di responsabilità',
    base: 25,
    areas: ['business', 'money'],
    why: 'Se il servizio ti causa un danno, il risarcimento è fortemente limitato.',
  },
  ip_license: {
    label: 'Licenza sui tuoi contenuti',
    base: 45,
    areas: ['ip', 'freelance'],
    why: 'Concedi al servizio diritti d’uso sui contenuti che carichi.',
  },
  ip_assignment: {
    label: 'Cessione di diritti',
    base: 85,
    areas: ['ip', 'freelance', 'business'],
    why: 'Non concedi una licenza: trasferisci la titolarità dei diritti.',
  },
  data_sharing: {
    label: 'Condivisione dati con terze parti',
    base: 30,
    areas: ['privacy', 'business'],
    why: 'I tuoi dati escono dal perimetro del servizio che stai usando.',
  },
  data_sale: {
    label: 'Vendita dei dati',
    base: 70,
    areas: ['privacy', 'identity'],
    why: 'I tuoi dati sono trattati come un bene commerciabile.',
  },
  ai_training: {
    label: 'Uso dei contenuti per addestrare AI',
    base: 45,
    // Not 'privacy': what you upload is yours before it is personal, and for
    // personal data there are already data_sharing and profiling. With 'privacy'
    // among the areas, this category became the main risk even for people who
    // had not said they cared about their content.
    areas: ['ip', 'freelance', 'business'],
    why: 'Ciò che carichi può finire dentro modelli di intelligenza artificiale.',
  },
  profiling: {
    label: 'Profilazione e pubblicità mirata',
    base: 20,
    areas: ['privacy', 'minors'],
    why: 'Il tuo comportamento viene analizzato per fini commerciali.',
  },
  biometric: {
    label: 'Dati biometrici',
    base: 70,
    areas: ['privacy', 'identity', 'minors'],
    why: 'Dati che non puoi cambiare se vengono compromessi.',
  },
  data_retention: {
    label: 'Conservazione dati prolungata o indefinita',
    base: 30,
    areas: ['privacy'],
    why: 'I dati restano archiviati anche dopo la chiusura dell’account.',
  },
  account_termination: {
    label: 'Chiusura dell’account a discrezione del fornitore',
    base: 35,
    areas: ['identity', 'business'],
    why: 'Puoi perdere l’accesso — e i contenuti — senza preavviso.',
  },
  third_party_transfer: {
    label: 'Trasferimento dati fuori dall’UE',
    base: 30,
    areas: ['privacy', 'business'],
    why: 'I dati possono essere trattati in Paesi con tutele diverse.',
  },
  dark_pattern: {
    label: 'Schema ingannevole nell’interfaccia',
    base: 45,
    areas: ['money', 'privacy'],
    why: 'La pagina è costruita per farti accettare più di quanto vorresti.',
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
    label: 'Tranquillo',
    headline: 'Nessuna conseguenza significativa rilevata',
    min: 0,
    color: '#1a7f52',
    icon: '🟢',
    blocking: false,
  },
  {
    id: 'review',
    label: 'Da rivedere',
    headline: 'Ci sono condizioni che meritano attenzione',
    min: 22,
    color: '#b8860b',
    icon: '🟡',
    blocking: false,
  },
  {
    id: 'commitment',
    label: 'Impegno',
    headline: 'Stai assumendo un obbligo economico o legale significativo',
    min: 55,
    color: '#c2620f',
    icon: '🟠',
    blocking: true,
  },
  {
    id: 'high_risk',
    label: 'Rischio alto',
    headline: 'Sono presenti clausole potenzialmente molto sfavorevoli',
    min: 86,
    color: '#c0392b',
    icon: '🔴',
    blocking: true,
  },
  {
    id: 'critical',
    label: 'Critico',
    headline: 'L’azione può creare conseguenze rilevanti e difficili da annullare',
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
  jurisdiction: 'IT', // IT | ES | EU | UK | US | OTHER
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

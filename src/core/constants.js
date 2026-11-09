/**
 * Vocabolario condiviso del motore: categorie di rischio, aree di protezione
 * del profilo personale, livelli di verdetto, tipi di azione intercettata.
 *
 * Tutto il resto del motore (analisi del server, scoring, UI) parla questa lingua.
 */

/** Tipi di azione che il detector considera un "commitment". */
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
 * Le aree che l'utente può dichiarare di voler proteggere.
 * Sono i "pesi" del Personal Risk Profile.
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
 * Categorie di rischio. `base` è la severità di partenza (0-100) prima della
 * personalizzazione; `areas` indica quali aree del profilo la amplificano.
 *
 * Come sono tarate le severità: il metro è il **danno atteso**, non quanto la
 * clausola suoni sgradevole. Una limitazione di responsabilità sta in ogni
 * contratto del mondo e vale 25; una cessione dei diritti d'autore è
 * irreversibile e vale 85. Se le clausole ordinarie partono alte, qualsiasi
 * contratto normale finisce in allarme rosso e l'utente impara a ignorare
 * l'avviso — che è il modo più rapido per rendere inutile un firewall.
 *
 * Le fasce di riferimento:
 *   85-100  irreversibile o molto costoso da annullare
 *   60-84   conseguenza economica o giuridica seria
 *   40-59   impegno reale, da leggere prima di accettare
 *   20-39   condizione ordinaria, da sapere
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
    // Non 'privacy': ciò che carichi è tuo prima ancora che personale, e per i
    // dati personali ci sono già data_sharing e profiling. Con 'privacy' fra le
    // aree, questa categoria diventava il rischio principale anche per chi non
    // ha dichiarato di tenere ai propri contenuti.
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
 * Livelli di verdetto, dal più innocuo al più grave.
 *
 * Le soglie non sono numeri tondi scelti a mente: vengono dall'insieme di
 * riferimento in `test/fixtures/corpus.mjs` e sono collocate nei *vuoti* della
 * distribuzione, cioè dove i casi etichettati si separano naturalmente.
 *
 * Vanno riviste quando arriveranno testi presi da siti veri: nove esempi
 * scritti a mano bastano a togliere la saturazione, non a dire l'ultima parola.
 */
export const LEVELS = [
  {
    id: 'safe',
    label: 'SAFE',
    headline: 'Nessuna conseguenza significativa rilevata',
    min: 0,
    color: '#1a7f52',
    icon: '🟢',
    blocking: false,
  },
  {
    id: 'review',
    label: 'REVIEW',
    headline: 'Ci sono condizioni che meritano attenzione',
    min: 22,
    color: '#b8860b',
    icon: '🟡',
    blocking: false,
  },
  {
    id: 'commitment',
    label: 'COMMITMENT',
    headline: 'Stai assumendo un obbligo economico o legale significativo',
    min: 55,
    color: '#c2620f',
    icon: '🟠',
    blocking: true,
  },
  {
    id: 'high_risk',
    label: 'HIGH RISK',
    headline: 'Sono presenti clausole potenzialmente molto sfavorevoli',
    min: 86,
    color: '#c0392b',
    icon: '🔴',
    blocking: true,
  },
  {
    id: 'critical',
    label: 'CRITICAL',
    headline: 'L’azione può creare conseguenze rilevanti e difficili da annullare',
    min: 92,
    color: '#7d0a0a',
    icon: '⛔',
    blocking: true,
  },
];

/** Restituisce il livello corrispondente a un punteggio 0-100. */
export function levelForScore(score) {
  let match = LEVELS[0];
  for (const level of LEVELS) {
    if (score >= level.min) match = level;
  }
  return match;
}

export const DEFAULT_SETTINGS = {
  enabled: true,
  /** Registro degli impegni e promemoria delle scadenze. */
  trackCommitments: true,
  reminders: true,
  /** Controllo periodico delle condizioni già accettate. */
  watchChanges: true,
  /**
   * Il controllo automatico può far rileggere al server le condizioni già
   * accettate? Solo quando il loro testo pubblico è cambiato, e solo con il
   * consenso all'analisi. Sì per difetto: senza, il controllo può dire soltanto
   * «il testo è cambiato», che per un anno di copyright è un falso allarme.
   */
  watchUsesRemote: true,
  /**
   * Istante del consenso esplicito all'invio del testo al server di AnteFirma.
   *
   * `null` significa «mai dato»: finché resta così nessun testo esce dal
   * browser e l'avviso, alla prima analisi, chiede il permesso. La policy del Chrome Web
   * Store non chiede solo di dichiarare il trasferimento nella privacy policy,
   * chiede una disclosure *dentro l'interfaccia* e un atto esplicito di
   * accettazione prima della raccolta. Registrare la data serve anche al
   * secondo obbligo: avvisare se le pratiche cambiano dopo l'installazione.
   */
  remoteConsentAt: null,
  /** Dati usati per precompilare le lettere di disdetta. Restano in locale. */
  identity: { name: '', address: '', email: '', customerId: '' },
  blockFrom: 'commitment', // livello minimo che blocca davvero il click
  jurisdiction: 'IT', // IT | ES | EU | UK | US | OTHER
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

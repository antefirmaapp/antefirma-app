/**
 * EU / Italian Consumer Risk Engine.
 *
 * Molti concorrenti sono nati per il mercato americano e valutano le clausole
 * con un metro che in Europa non si applica. Qui la domanda non è solo
 * "questa clausola è sfavorevole?" ma "questa condizione regge davanti alle
 * tutele previste per i consumatori UE/italiani?".
 *
 * ⚠️ Questo modulo produce **informazione automatizzata, non consulenza
 * legale**. I riferimenti normativi servono a far capire all'utente dove
 * guardare, non a stabilire la validità di una clausola nel caso concreto:
 * dipende dal contratto, dalle parti e dalla qualifica di consumatore.
 */

import { t } from '../i18n/index.js';

export const DISCLAIMER =
  'Analisi automatica a scopo informativo. Non è un parere legale: la validità di una clausola dipende dal contratto specifico e dalla qualifica delle parti.';

/**
 * Ogni check collega una categoria di rischio al riferimento normativo che
 * la rende quantomeno discutibile in ambito consumer UE/IT.
 */
const CHECKS = [
  {
    id: 'eu.arbitration',
    categories: ['arbitration'],
    scopes: ['IT', 'EU'],
    title: 'Arbitrato obbligatorio imposto al consumatore',
    note: 'Nei contratti con i consumatori le clausole che impongono il ricorso obbligatorio ad arbitrato, sottraendo la controversia al giudice ordinario, sono elencate tra quelle presunte vessatorie.',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. t)', 'Direttiva 93/13/CEE'],
    boost: 12,
  },
  {
    id: 'eu.jurisdiction',
    categories: ['jurisdiction'],
    scopes: ['IT', 'EU'],
    title: 'Foro diverso da quello del consumatore',
    note: 'Il consumatore può di regola agire ed essere convenuto davanti al giudice del proprio domicilio; le clausole che spostano la competenza altrove sono presunte vessatorie.',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. u)', 'Reg. UE 1215/2012, artt. 17-19'],
    boost: 12,
  },
  {
    id: 'eu.class_action',
    categories: ['class_action_waiver'],
    scopes: ['IT', 'EU'],
    title: 'Rinuncia preventiva alle azioni collettive',
    note: 'L’ordinamento UE ha introdotto un meccanismo di azione rappresentativa a tutela degli interessi collettivi dei consumatori; una rinuncia preventiva imposta con clausola standard va valutata con attenzione.',
    refs: ['Direttiva UE 2020/1828', 'Codice del Consumo, art. 140-ter e ss.'],
    boost: 8,
  },
  {
    id: 'eu.unilateral',
    categories: ['unilateral_change', 'price_change'],
    scopes: ['IT', 'EU'],
    title: 'Modifica unilaterale di condizioni o prezzo',
    note: 'Le clausole che consentono al professionista di modificare unilateralmente il contratto o il prezzo senza un giustificato motivo indicato nel contratto, e senza diritto di recesso per il consumatore, sono presunte vessatorie.',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. m) e o)', 'Direttiva 93/13/CEE, allegato punto 1 lett. j) e l)'],
    boost: 12,
  },
  {
    id: 'eu.liability',
    categories: ['liability_limitation'],
    scopes: ['IT', 'EU'],
    title: 'Esclusione o limitazione di responsabilità',
    note: 'Escludere o limitare la responsabilità del professionista per danno alla persona, o per inadempimento, rientra tra le clausole presunte vessatorie; alcune sono nulle anche se trattate individualmente.',
    refs: ['Codice del Consumo, artt. 33 c. 2 lett. a)-b) e 36 c. 2', 'Codice civile, art. 1229'],
    boost: 10,
  },
  {
    id: 'eu.withdrawal',
    categories: [],
    scopes: ['IT', 'EU'],
    title: 'Diritto di recesso di 14 giorni non menzionato',
    note: 'Negli acquisti a distanza il consumatore ha di norma 14 giorni per recedere senza motivazione, con obblighi informativi precisi a carico del venditore. Il testo analizzato non sembra menzionarlo.',
    refs: ['Codice del Consumo, artt. 52-59', 'Direttiva 2011/83/UE'],
    boost: 10,
    test: ({ text, actionType, findings }) => {
      const isCommerce = ['purchase', 'subscribe'].includes(actionType) || findings.some((f) => ['auto_renewal', 'no_refund'].includes(f.category));
      if (!isCommerce) return false;
      // Non basta che compaia la parola "recesso": serve il *diritto* di
      // ripensamento con il suo termine. Un contratto può parlare a lungo di
      // recesso anticipato e tacere completamente sui 14 giorni.
      return !/\bdiritto\s+di\s+recesso\b|\bripensamento\b|\bright\s+(?:of|to)\s+withdraw\w*|\b14\s*(?:giorni|days)\b|\bcooling.?off\b|\brecesso\s+entro\b/i.test(text);
    },
  },
  {
    id: 'eu.no_refund',
    categories: ['no_refund'],
    scopes: ['IT', 'EU'],
    title: 'Esclusione generalizzata dei rimborsi',
    note: 'Un divieto assoluto di rimborso mal si concilia con il diritto di recesso e con la garanzia legale di conformità, che non possono essere esclusi per contratto con un consumatore.',
    refs: ['Codice del Consumo, artt. 52-59 e 128-135', 'Direttiva UE 2019/771'],
    boost: 10,
  },
  {
    id: 'eu.tacit_renewal',
    categories: ['auto_renewal'],
    scopes: ['IT', 'EU'],
    title: 'Rinnovo tacito con preavviso lungo',
    note: 'Le clausole che prevedono il rinnovo tacito imponendo al consumatore un termine di disdetta eccessivamente anticipato rispetto alla scadenza sono presunte vessatorie.',
    refs: ['Codice del Consumo, art. 33 c. 2 lett. i)'],
    boost: 10,
    test: ({ cost }) => Boolean(cost?.notice && cost.notice.months >= 1),
  },
  {
    id: 'eu.vexatious_form',
    categories: [],
    scopes: ['IT'],
    title: 'Clausole onerose senza approvazione specifica',
    note: 'Nelle condizioni generali predisposte da una parte, alcune clausole particolarmente onerose non hanno effetto se non specificamente approvate per iscritto: una singola spunta cumulativa può non bastare.',
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
    title: 'Consenso non granulare o precompilato',
    note: 'Il consenso al trattamento dei dati deve essere libero, specifico, informato e inequivocabile: caselle pre-spuntate o consenso "a pacchetto" insieme all’accettazione del contratto non soddisfano questi requisiti.',
    refs: ['GDPR, artt. 4(11), 7 e cons. 32/43', 'Linee guida EDPB 05/2020'],
    boost: 12,
    test: ({ ctx }) => Boolean(ctx?.form?.precheckedConsents) || Boolean(ctx?.form?.bundledConsent),
  },
  {
    id: 'eu.transfer',
    categories: ['third_party_transfer'],
    scopes: ['IT', 'EU'],
    title: 'Trasferimento dati fuori dallo SEE',
    note: 'Il trasferimento verso Paesi terzi richiede una base specifica (decisione di adeguatezza, clausole contrattuali tipo o altre garanzie). Verifica che l’informativa la indichi.',
    refs: ['GDPR, artt. 44-49'],
    boost: 8,
  },
  {
    id: 'eu.data_sale',
    categories: ['data_sale'],
    scopes: ['IT', 'EU'],
    title: 'Cessione dei dati a titolo oneroso',
    note: 'Nel quadro UE non esiste un semplice "opt-out dalla vendita" come in alcuni Stati USA: ogni comunicazione a terzi richiede una base giuridica e informazione preventiva.',
    refs: ['GDPR, artt. 6, 13 e 14'],
    boost: 10,
  },
  {
    id: 'eu.ai_training',
    categories: ['ai_training'],
    scopes: ['IT', 'EU'],
    title: 'Uso dei contenuti per addestrare modelli AI',
    note: 'Se i contenuti includono dati personali serve una base giuridica specifica e informazione trasparente; per le opere protette rileva anche la riserva sui text and data mining.',
    refs: ['GDPR, artt. 6 e 13', 'Direttiva UE 2019/790, art. 4', 'Reg. UE 2024/1689 (AI Act)'],
    boost: 8,
  },
  {
    id: 'eu.dark_pattern',
    categories: ['dark_pattern'],
    scopes: ['IT', 'EU'],
    title: 'Interfaccia potenzialmente ingannevole',
    note: 'Le pratiche commerciali che alterano in modo apprezzabile la libertà di scelta del consumatore sono vietate; per le piattaforme online il DSA vieta esplicitamente le interfacce che ingannano o manipolano.',
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
   * La Spagna è UE: le direttive citate valgono, gli articoli del Codice del
   * Consumo e del codice civile italiano no. Normalizzando `ES` a `EU` si
   * ottiene esattamente questo — i tredici controlli di livello europeo
   * restano, quello con `scopes: ['IT']` (art. 1341 c.c., clausole vessatorie
   * con doppia sottoscrizione) resta fuori.
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
    // Se ha categorie, servono entrambe; se non ne ha, basta il test.
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

  // Il contributo al punteggio è smorzato *e* limitato: con il tetto precedente
  // qualsiasi contratto con tre segnalazioni arrivava al massimo, e il motore
  // consumer smetteva di distinguere fra un fastidio e un abuso.
  const raw = flags.reduce((s, f) => s + f.boost, 0);
  const boost = Math.round(Math.min(25, raw * 0.35));

  return {
    applicable: true, jurisdiction, boost, disclaimer: t(DISCLAIMER),
    flags: flags.map((f) => ({ ...f, title: t(f.title), note: t(f.note) })),
  };
}

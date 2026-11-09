/**
 * Decision Risk Score.
 *
 * Non è il punteggio del *documento*: è il punteggio della *decisione* che
 * l'utente sta per prendere. Entrano quindi tre ingredienti che un semplice
 * analizzatore di Terms non ha: il tipo di azione, l'esposizione economica
 * concreta e il profilo personale.
 */

import { levelForScore, ACTION_TYPES } from './constants.js';
import { t, tn } from '../i18n/index.js';

/** Quanto il tipo di azione alza il pavimento del rischio. */
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
 * Contributo dell'esposizione economica, su scala logaritmica:
 * 50 € pesano poco, 500 € pesano, 5.000 € pesano molto ma non infinitamente.
 *
 * Il tetto è a 42, e la pendenza è tarata perché ci si arrivi verso i
 * 130.000 €. Con la pendenza precedente la saturazione cadeva a 14.400 €: un
 * finanziamento da 15.000 € e un mutuo da 200.000 € davano lo stesso identico
 * contributo, cioè la scala smetteva di misurare proprio sugli importi in cui
 * sbagliare costa di più.
 */
export function moneyPressure(worstCase) {
  if (!worstCase || worstCase <= 0) return 0;
  const v = Math.log10(worstCase / 20) * 11;
  return Math.max(0, Math.min(42, Math.round(v)));
}

/**
 * Quanto possono aggiungere, tutte insieme, le clausole diverse dalla peggiore.
 *
 * Il tetto è la parte importante: senza, un contratto con otto condizioni
 * ordinarie superava uno con una sola clausola devastante. Ma il rischio di una
 * decisione lo determina la conseguenza peggiore, non il numero di righe.
 *
 * Tetto e decadimento vanno però tarati insieme. Con tetto 15 e decadimento
 * 0,35 il secondo finding a severità 45 valeva già 15,75, cioè il tetto: da lì
 * in poi la terza, la quarta e l'ottava clausola non cambiavano più niente. Il
 * «rendimento decrescente» era di fatto un gradino binario, e un contratto con
 * sette condizioni pesava quanto uno con due.
 */
const RESIDUAL_CAP = 30;

/**
 * Aggrega le severità: **la peggiore determina il livello**, le altre
 * aggiungono con rendimento decrescente e con un tetto complessivo.
 *
 * Restituisce un valore non limitato a 100: è una somma grezza che serve anche
 * a distinguere fra un contratto brutto e uno bruttissimo. È `compressSeverity`
 * a riportarla sulla scala.
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

/** Sotto questa soglia il punteggio resta lineare: è la zona in cui serve precisione. */
const KNEE = 50;
/** Quanto in fretta si comprime sopra il ginocchio. Più alto = compressione più dolce. */
const SPAN = 45;
/**
 * Le sole clausole non possono arrivare a 100: il vertice va guadagnato.
 *
 * Il valore va tenuto d'occhio insieme al massimo grezzo raggiungibile
 * (severità massima 95 dopo la personalizzazione, più RESIDUAL_CAP): se il
 * grezzo massimo si comprime molto sotto questo tetto, le fasce alte diventano
 * irraggiungibili per le sole clausole. Era il caso di prima: il massimo
 * comprimeva a 75, quindi HIGH RISK (76) e CRITICAL (87) erano strutturalmente
 * fuori portata per un contratto senza prezzo estraibile — per esempio una
 * cessione totale dei diritti d'autore letta da un utente fuori dall'UE.
 * `test/calibration.test.mjs` lo verifica con un'asserzione apposita.
 */
const CLAUSE_CEILING = 95;

/**
 * Comprime la somma grezza sulla scala 0-100 in modo monotono e asintotico.
 *
 * Senza questo passaggio bastano quattro clausole ordinarie per toccare il
 * tetto, e da lì in poi il punteggio smette di distinguere: un abbonamento
 * annuale onesto e un finanziamento predatorio danno entrambi 100, l'utente
 * vede sempre rosso e impara a non guardare. La compressione restituisce
 * risoluzione proprio dove serve, cioè in alto.
 */
export function compressSeverity(raw) {
  if (raw <= KNEE) return Math.round(raw);
  const headroom = CLAUSE_CEILING - KNEE;
  return Math.round(KNEE + headroom * (1 - Math.exp(-(raw - KNEE) / SPAN)));
}

/**
 * Calcola il punteggio finale e il livello.
 *
 * @returns {{score:number, level:object, components:object, drivers:Array}}
 */
export function computeScore({ findings = [], cost = {}, consumer = {}, actionType = 'manual', analyzed = true } = {}) {
  const raw = aggregateSeverity(findings);
  const base = Math.max(ACTION_FLOOR[actionType] ?? 0, compressSeverity(raw));

  const money = moneyPressure(cost.worstCase);
  const euBoost = consumer.boost || 0;
  // Se il prezzo mostrato sottostima l'impegno, è esattamente il caso che
  // questo prodotto esiste per intercettare.
  const understatedBoost = cost.understated ? 10 : 0;

  /**
   * Le pressioni non si sommano al punteggio: si applicano allo **spazio che
   * resta**. Un'esposizione economica di 26 punti su una base di 85 aggiunge il
   * 26% dei 15 punti rimasti, non 26 punti pieni.
   *
   * È la differenza fra un indicatore che ordina e uno che satura: sommando,
   * qualsiasi contratto con due clausole e un prezzo finiva a 100.
   */
  const pressure = Math.min(70, money + euBoost + understatedBoost);
  let score = base + (100 - base) * (pressure / 100);

  // Un solo indizio debole non deve far scattare un allarme rosso.
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
        ? `${f.why} ${t('Pesa di più per il tuo profilo: {x}.', { x: f.personalReasons.join(', ') })}`
        : f.why,
    });
  }
  if (understatedBoost) {
    drivers.push({
      kind: 'money',
      weight: understatedBoost,
      label: t('Il prezzo mostrato non è il costo dell’impegno'),
      detail: t('Vedi {a}, ma l’impegno potenziale stimato è {b}.', { a: cost.displayed, b: cost.worstCaseLabel }),
    });
  } else if (money >= 12) {
    drivers.push({
      kind: 'money',
      weight: money,
      label: t('Esposizione economica rilevante'),
      detail: t('Impegno potenziale stimato: {x}.', { x: cost.worstCaseLabel }),
    });
  }
  if (euBoost >= 8 && consumer.flags?.length) {
    drivers.push({
      kind: 'law',
      weight: euBoost,
      label: consumer.jurisdiction === 'IT'
        ? tn(consumer.flags.length, '{n} condizione da verificare rispetto alle tutele italiane', '{n} condizioni da verificare rispetto alle tutele italiane')
        : tn(consumer.flags.length, '{n} condizione da verificare rispetto alle tutele UE', '{n} condizioni da verificare rispetto alle tutele UE'),
      detail: consumer.flags.map((f) => f.title).join(' · '),
    });
  }

  return drivers.sort((a, b) => b.weight - a.weight);
}

/**
 * Decide se l'azione va effettivamente bloccata, in base alla soglia scelta
 * dall'utente nelle impostazioni.
 */
export function shouldBlock(levelId, blockFrom = 'commitment') {
  const order = ['safe', 'review', 'commitment', 'high_risk', 'critical'];
  const li = order.indexOf(levelId);
  const bi = order.indexOf(blockFrom);
  if (li < 0 || bi < 0) return false;
  return li >= bi;
}

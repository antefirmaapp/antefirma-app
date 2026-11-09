/**
 * Personal Risk Profile.
 *
 * La stessa clausola non pesa uguale per tutti: "concedi una licenza mondiale
 * sui contenuti caricati" è un fastidio per chi carica foto delle vacanze e un
 * problema serio per un fotografo che vive di quelle immagini.
 *
 * Questo modulo trasforma le aree che l'utente dichiara di voler proteggere in
 * moltiplicatori applicati alla severità di ciascuna categoria.
 */

import { RISK_CATEGORIES, PROTECTION_LABELS, DEFAULT_SETTINGS } from './constants.js';
import { t } from '../i18n/index.js';

/** Quanto un'area attiva amplifica le categorie che la toccano. */
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
 * Tetto al moltiplicatore complessivo.
 *
 * Il profilo deve *ordinare* le clausole secondo ciò che ti sta a cuore, non
 * gonfiarle: se moltiplica troppo, una severità già alta tocca il tetto e la
 * personalizzazione smette di distinguere proprio nei casi che le interessano.
 */
const MAX_MULTIPLIER = 1.55;

/** Se nessuna area della categoria è attiva, la severità viene attenuata. */
const UNSELECTED_DAMPENER = 0.85;

/**
 * Sopra questa severità di base il dampener non si applica.
 *
 * La logica confondeva due cose molto diverse: «l'utente ha dichiarato che
 * quest'area non gli interessa» e «l'utente non ci ha pensato». La seconda è il
 * caso normale — nessuno apre le impostazioni — e il profilo predefinito
 * (denaro, privacy, identità) non contiene né `ip` né `freelance`. Risultato:
 * `ip_assignment`, la categoria più grave del dizionario, veniva **declassata**
 * del 15% proprio per l'installazione che avrà quasi tutti gli utenti, e la
 * cessione totale dei diritti d'autore scendeva di una fascia.
 *
 * Sopra 65 il danno è oggettivo e irreversibile, non una preferenza:
 * cessione dei diritti (85), vendita dei dati (70), dati biometrici (70),
 * penale di recesso (65). Il profilo può ordinare, non può assolvere.
 */
const DAMPENER_EXEMPT_BASE = 65;

/**
 * Calcola il moltiplicatore per una categoria dato il profilo.
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

  // La prima area attiva pesa per intero, le successive con rendimento
  // decrescente: due aree attive non devono raddoppiare il rischio.
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
 * Applica il profilo a una lista di finding.
 * Non muta gli oggetti in ingresso.
 */
export function personalize(findings = [], profile = DEFAULT_SETTINGS.profile) {
  return findings
    .map((f) => {
      const { multiplier, reasons } = multiplierFor(f.category, profile);
      // 95 e non 100: il vertice resta riservato a ciò che è grave di suo.
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
 * Riepilogo leggibile del profilo, per la UI.
 */
export function describeProfile(profile = DEFAULT_SETTINGS.profile) {
  const active = Object.entries(profile || {})
    .filter(([, v]) => v)
    .map(([k]) => PROTECTION_LABELS[k] || k);
  if (!active.length) return 'Nessuna area di protezione selezionata';
  return active.join(' · ');
}

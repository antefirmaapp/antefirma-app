/**
 * Lettera di uscita, precompilata.
 *
 * Sapere che devi disdire entro il 15 giugno non basta: il costo vero è
 * scrivere la lettera, trovare i riferimenti, capire se è recesso o disdetta.
 * Qui il documento esce già scritto, con la norma giusta in calce.
 *
 * Tre casi distinti, perché non sono la stessa cosa:
 *  - RECESSO       — i 14 giorni del contratto a distanza (ripensamento)
 *  - DISDETTA      — evitare il rinnovo tacito, rispettando il preavviso
 *  - RECESSO_MOD   — uscire perché il fornitore ha cambiato le condizioni
 */

import { formatMoney } from './text.js';
import { formatDate } from './commitments.js';

export const LETTER_KINDS = {
  WITHDRAWAL: 'withdrawal',
  CANCELLATION: 'cancellation',
  CHANGE: 'change_withdrawal',
};

/**
 * Il nome del file è rivolto all'utente, non al codice: lo salva sul disco e
 * magari lo allega a una PEC. «disdetta-streampro-2028-04-19.txt» gli dice cosa
 * ha in mano; «cancellation-…» no. Resta quindi in italiano anche se l'id
 * interno è inglese.
 */
const FILE_SLUGS = {
  withdrawal: 'recesso',
  cancellation: 'disdetta',
  change_withdrawal: 'recesso-modifica',
};

export const LETTER_LABELS = {
  withdrawal: 'Recesso entro 14 giorni (ripensamento)',
  cancellation: 'Disdetta per evitare il rinnovo automatico',
  change_withdrawal: 'Recesso per modifica unilaterale delle condizioni',
};

/**
 * Sceglie da sé il tipo di lettera più adatto allo stato dell'impegno.
 */
export function suggestKind(commitment, now = Date.now()) {
  const created = commitment?.createdAt ? new Date(commitment.createdAt).getTime() : null;
  const days = created ? (now - created) / 86_400_000 : Infinity;
  if (days <= 14 && ['purchase', 'subscribe', 'sign'].includes(commitment?.actionType)) {
    return LETTER_KINDS.WITHDRAWAL;
  }
  if ((commitment?.changes || []).some((c) => c.severity === 'major')) {
    return LETTER_KINDS.CHANGE;
  }
  return LETTER_KINDS.CANCELLATION;
}

/**
 * @param {object} commitment
 * @param {object} identity  { name, address, email, customerId }
 * @param {string} kind      uno dei LETTER_KINDS
 */
export function buildLetter(commitment = {}, identity = {}, kind = null, now = Date.now()) {
  const type = kind || suggestKind(commitment, now);
  const you = {
    name: identity.name?.trim() || '[Nome e cognome]',
    address: identity.address?.trim() || '[Indirizzo]',
    email: identity.email?.trim() || '[Email]',
    customerId: identity.customerId?.trim() || '',
  };
  const provider = commitment.provider || commitment.host || '[Fornitore]';
  const today = formatDate(new Date(now));

  const body =
    type === LETTER_KINDS.WITHDRAWAL
      ? withdrawal(commitment, you, provider, today)
      : type === LETTER_KINDS.CHANGE
        ? changeWithdrawal(commitment, you, provider, today)
        : cancellation(commitment, you, provider, today);

  return {
    kind: type,
    label: LETTER_LABELS[type],
    subject: subjectFor(type, provider),
    text: body,
    filename: `${FILE_SLUGS[type] || type}-${slug(provider)}-${new Date(now).toISOString().slice(0, 10)}.txt`,
    checklist: checklistFor(type, commitment),
    references: referencesFor(type),
  };
}

// ── i tre testi ─────────────────────────────────────────────────────────────

function withdrawal(c, you, provider, today) {
  // Ricalca il modulo di recesso tipo dell'Allegato I, parte B, del Codice del
  // Consumo: usarlo non è obbligatorio, ma toglie ogni discussione sulla forma.
  return [
    header(you, provider, today),
    '',
    `Oggetto: esercizio del diritto di recesso`,
    '',
    'Spettabile ' + provider + ',',
    '',
    'con la presente comunico il mio recesso dal contratto avente ad oggetto la fornitura',
    `del servizio ${serviceLine(c)}, concluso in data ${orderDate(c)}.`,
    '',
    'Esercito il diritto di recesso previsto per i contratti a distanza, entro il termine di',
    'quattordici giorni dalla conclusione del contratto, senza necessità di motivazione e',
    'senza alcun onere a mio carico.',
    '',
    'Chiedo pertanto:',
    '  1. la cessazione immediata del servizio e di ogni addebito collegato;',
    `  2. il rimborso di quanto eventualmente già corrisposto${amountLine(c)}, entro quattordici`,
    '     giorni dal ricevimento della presente, con lo stesso mezzo di pagamento utilizzato;',
    '  3. conferma scritta della ricezione della presente comunicazione.',
    '',
    identityBlock(you, c),
    '',
    signature(you, today),
    '',
    footer(referencesFor(LETTER_KINDS.WITHDRAWAL)),
  ].join('\n');
}

function cancellation(c, you, provider, today) {
  const notice = c.noticeMonths ? Math.round(c.noticeMonths * 30) : null;
  const deadline = c.deadlineAt ? formatDate(new Date(c.deadlineAt)) : null;
  const renewal = c.renewalAt ? formatDate(new Date(c.renewalAt)) : null;

  return [
    header(you, provider, today),
    '',
    'Oggetto: disdetta del contratto — esclusione del rinnovo automatico',
    '',
    'Spettabile ' + provider + ',',
    '',
    `con la presente comunico la disdetta del contratto relativo a ${serviceLine(c)},`,
    `attivato in data ${orderDate(c)}.`,
    '',
    renewal
      ? `La presente disdetta è inviata affinché il contratto non si rinnovi alla scadenza del ${renewal},`
      : 'La presente disdetta è inviata affinché il contratto non si rinnovi tacitamente alla scadenza,',
    notice
      ? `nel rispetto del termine di preavviso di ${notice} giorni previsto dalle condizioni contrattuali${deadline ? ` (termine ultimo: ${deadline})` : ''}.`
      : 'nel rispetto del termine di preavviso previsto dalle condizioni contrattuali.',
    '',
    'Chiedo pertanto:',
    '  1. conferma scritta della ricezione della presente e della data di efficacia della disdetta;',
    '  2. la cessazione di ogni addebito a decorrere dalla scadenza indicata;',
    '  3. l’indicazione di eventuali importi ritenuti dovuti, con il relativo titolo contrattuale.',
    '',
    'Preciso che nessun addebito ulteriore potrà considerarsi legittimo per periodi successivi',
    'alla scadenza sopra indicata.',
    '',
    identityBlock(you, c),
    '',
    signature(you, today),
    '',
    footer(referencesFor(LETTER_KINDS.CANCELLATION)),
  ].join('\n');
}

function changeWithdrawal(c, you, provider, today) {
  const change = (c.changes || []).slice(-1)[0];
  return [
    header(you, provider, today),
    '',
    'Oggetto: recesso a seguito di modifica unilaterale delle condizioni contrattuali',
    '',
    'Spettabile ' + provider + ',',
    '',
    `ho rilevato una modifica delle condizioni contrattuali relative a ${serviceLine(c)},`,
    `rispetto a quelle da me accettate in data ${orderDate(c)}.`,
    '',
    change?.summary ? `In particolare: ${change.summary}` : 'La modifica incide sulle condizioni economiche e/o normative del rapporto.',
    '',
    'Non intendendo accettare le nuove condizioni, comunico il mio recesso dal contratto con',
    'effetto immediato, senza penali né spese di disattivazione, trattandosi di recesso',
    'esercitato a fronte di una modifica unilaterale non da me richiesta.',
    '',
    'Chiedo pertanto:',
    '  1. conferma scritta della cessazione del rapporto e della data di efficacia;',
    '  2. la cessazione di ogni addebito;',
    '  3. il rimborso di eventuali importi corrisposti per periodi successivi alla cessazione.',
    '',
    identityBlock(you, c),
    '',
    signature(you, today),
    '',
    footer(referencesFor(LETTER_KINDS.CHANGE)),
  ].join('\n');
}

// ── blocchi comuni ──────────────────────────────────────────────────────────

function header(you, provider, today) {
  return [
    `${you.name}`,
    `${you.address}`,
    `${you.email}`,
    '',
    `Spett.le ${provider}`,
    '[Indirizzo del fornitore / PEC / email indicata nelle condizioni]',
    '',
    `Luogo e data: ______________, ${today}`,
    '',
    'Trasmessa a mezzo: ☐ PEC   ☐ raccomandata A/R   ☐ modulo online   ☐ email',
  ].join('\n');
}

function identityBlock(you, c) {
  const rows = [
    `Intestatario del contratto: ${you.name}`,
    `Indirizzo: ${you.address}`,
    `Email di contatto: ${you.email}`,
  ];
  rows.push(`Codice cliente / numero contratto: ${you.customerId || '[da indicare]'}`);
  if (c.url) rows.push(`Sottoscritto tramite: ${c.url}`);
  if (c.snapshot?.hash) {
    rows.push(`Impronta del testo accettato (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`);
  }
  return rows.join('\n');
}

function signature(you, today) {
  return ['Distinti saluti,', '', `${you.name}`, '', 'Firma _______________________', `Data ${today}`].join('\n');
}

function footer(refs) {
  return ['—', 'Riferimenti normativi utili:', ...refs.map((r) => `  · ${r}`), '',
    'Documento generato automaticamente da Vincolo a partire dalle condizioni',
    'contrattuali analizzate. Verifica i dati fra parentesi quadre prima di inviarlo. Non',
    'costituisce consulenza legale.'].join('\n');
}

function serviceLine(c) {
  const parts = [];
  if (c.title) parts.push(`"${c.title}"`);
  else if (c.provider) parts.push(c.provider);
  if (c.recurringTotal != null && c.horizonMonths) {
    parts.push(`(impegno stimato ${formatMoney(c.worstCase ?? c.recurringTotal, c.currency)})`);
  }
  return parts.join(' ') || '[descrizione del servizio]';
}

function orderDate(c) {
  return c.createdAt ? formatDate(new Date(c.createdAt)) : '[data]';
}

function amountLine(c) {
  return c.worstCase != null ? '' : '';
}

function subjectFor(kind, provider) {
  return {
    withdrawal: `Esercizio del diritto di recesso — ${provider}`,
    cancellation: `Disdetta contratto — ${provider}`,
    change_withdrawal: `Recesso per modifica unilaterale — ${provider}`,
  }[kind];
}

function checklistFor(kind, c) {
  const list = [
    'Completa i campi fra parentesi quadre (indirizzo del fornitore, codice cliente).',
    'Invia con un mezzo che lasci prova della data: PEC o raccomandata A/R.',
    'Conserva la ricevuta di invio insieme allo snapshot delle condizioni.',
  ];
  if (kind === LETTER_KINDS.WITHDRAWAL) {
    list.unshift('Verifica di essere entro i 14 giorni dalla conclusione del contratto.');
  }
  if (kind === LETTER_KINDS.CANCELLATION && c?.deadlineAt) {
    list.unshift(`Invia entro il ${formatDate(new Date(c.deadlineAt))}: è il termine di preavviso.`);
  }
  return list;
}

function referencesFor(kind) {
  return {
    withdrawal: [
      'D.Lgs. 206/2005 (Codice del Consumo), artt. 52-59 — diritto di recesso nei contratti a distanza',
      'Allegato I, parte B, del Codice del Consumo — modulo di recesso tipo',
      'Direttiva 2011/83/UE',
    ],
    cancellation: [
      'D.Lgs. 206/2005, art. 33 c. 2 lett. i) — rinnovo tacito con preavviso eccessivo',
      'Codice civile, artt. 1373 e 1341',
    ],
    change_withdrawal: [
      'D.Lgs. 206/2005, art. 33 c. 2 lett. m) e o) — modifica unilaterale senza giustificato motivo',
      'Direttiva 93/13/CEE, allegato punto 1 lett. j) e l)',
    ],
  }[kind] || [];
}

function slug(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'fornitore';
}

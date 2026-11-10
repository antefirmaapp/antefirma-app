/**
 * The exit letter, pre-filled.
 *
 * Knowing you must cancel by 15 June is not enough: the real cost is writing the letter,
 * finding the references, working out whether it is a withdrawal or a cancellation.
 * Here the document comes out already written, with the right law at the bottom.
 *
 * Three distinct cases, because they are not the same thing:
 *  - WITHDRAWAL    — the 14 days of a distance contract (change of mind)
 *  - CANCELLATION  — stopping tacit renewal, respecting the notice period
 *  - CHANGE        — leaving because the provider changed the terms
 */

import { formatMoney as fm } from './text.js';
import { formatDate as fd } from './commitments.js';
import { t, locale } from '../i18n/index.js';

/**
 * The letter's language is the provider's, not the extension's: Italian for
 * Italy, Spanish for Spain, English elsewhere. Each with its country's laws and
 * habits (PEC and registered letter, burofax, recorded delivery). Dates and
 * amounts follow the letter's language.
 */
export const LETTER_LANGS = ['it', 'es', 'en'];
const LOCALE = { it: 'it-IT', es: 'es-ES', en: 'en-GB' };
export const letterLangFor = (jurisdiction) => (jurisdiction === 'IT' ? 'it' : jurisdiction === 'ES' ? 'es' : 'en');

export const LETTER_KINDS = {
  WITHDRAWAL: 'withdrawal',
  CANCELLATION: 'cancellation',
  CHANGE: 'change_withdrawal',
};

/**
 * The file name is for the user, not the code: they save it to disk and maybe
 * attach it to a PEC. "disdetta-streampro-2028-04-19.txt" tells them what they
 * have; "cancellation-…" doesn't. So it stays in the letter's language even
 * though the internal id is English.
 */
const FILE_SLUGS = {
  it: { withdrawal: 'recesso', cancellation: 'disdetta', change_withdrawal: 'recesso-modifica' },
  es: { withdrawal: 'desistimiento', cancellation: 'baja', change_withdrawal: 'baja-por-modificacion' },
  en: { withdrawal: 'withdrawal', cancellation: 'cancellation', change_withdrawal: 'withdrawal-after-changes' },
};

export const LETTER_LABELS = {
  withdrawal: 'withdrawalWithin14DaysChangeMind',
  cancellation: 'cancellationAvoidAutomaticRenewal',
  change_withdrawal: 'withdrawalDueUnilateralChangeTerms',
};

/**
 * Picks the letter type that best fits the commitment's state.
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
 * @param {string} kind      one of LETTER_KINDS
 * @param {number} now
 * @param {string} lang      'it' | 'es' | 'en': the provider's language
 */
export function buildLetter(commitment = {}, identity = {}, kind = null, now = Date.now(), lang = 'it') {
  const L = TEXT[lang] ? lang : 'it';
  const X = TEXT[L];
  const type = kind || suggestKind(commitment, now);
  const fmt = { date: (d) => fd(d, LOCALE[L]), money: (a, c) => fm(a, c, LOCALE[L]) };
  const you = {
    name: identity.name?.trim() || X.ph.name,
    address: identity.address?.trim() || X.ph.address,
    email: identity.email?.trim() || X.ph.email,
    customerId: identity.customerId?.trim() || '',
  };
  // "Fornitore" was the fallback name in earlier versions: it counts as a missing name.
  const named = commitment.provider && commitment.provider !== 'Fornitore' ? commitment.provider : null;
  const provider = named || commitment.host || X.ph.provider;
  const ctx = { c: commitment, you, provider, today: fmt.date(new Date(now)), fmt, X };
  const lines = type === LETTER_KINDS.WITHDRAWAL ? X.withdrawal(ctx) : type === LETTER_KINDS.CHANGE ? X.change(ctx) : X.cancellation(ctx);
  const refs = X.refs[type] || [];
  const text = [X.header(ctx), '', ...lines, '', X.identity(ctx), '', X.signature(ctx), '', X.footer(refs)].join('\n');

  return {
    kind: type,
    lang: L,
    label: LETTER_LABELS[type],
    subject: X.subject[type](provider),
    text,
    filename: `${FILE_SLUGS[L][type] || type}-${slug(provider)}-${new Date(now).toISOString().slice(0, 10)}.txt`,
    checklist: checklistFor(type, commitment, L),
    references: refs,
  };
}

// ── the texts, per language ────────────────────────────────────────────────────

const service = ({ c, fmt, X }) => {
  const parts = [];
  if (c.title) parts.push(`"${c.title}"`);
  else if (c.provider) parts.push(c.provider);
  if (c.recurringTotal != null && c.horizonMonths) parts.push(X.estimated(fmt.money(c.worstCase ?? c.recurringTotal, c.currency)));
  return parts.join(' ') || X.ph.service;
};
const orderDate = ({ c, fmt, X }) => (c.createdAt ? fmt.date(new Date(c.createdAt)) : X.ph.date);
const noticeOf = (c) => (c.noticeMonths ? Math.round(c.noticeMonths * 30) : null);
const when = (iso, fmt) => (iso ? fmt.date(new Date(iso)) : null);

const TEXT = {
  // Follows the model withdrawal form of Annex I, part B, of the Italian Consumer Code.
  it: {
    ph: { name: '[Nome e cognome]', address: '[Indirizzo]', email: '[Email]', provider: '[Fornitore]', service: '[descrizione del servizio]', date: '[data]' },
    estimated: (x) => `(impegno stimato ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Spett.le ${provider}`,
      '[Indirizzo del fornitore / PEC / email indicata nelle condizioni]', '', `Luogo e data: ______________, ${today}`, '',
      'Trasmessa a mezzo: ☐ PEC   ☐ raccomandata A/R   ☐ modulo online   ☐ email'].join('\n'),
    withdrawal: (k) => ['Oggetto: esercizio del diritto di recesso', '', `Spettabile ${k.provider},`, '',
      'con la presente comunico il mio recesso dal contratto avente ad oggetto la fornitura',
      `del servizio ${service(k)}, concluso in data ${orderDate(k)}.`, '',
      'Esercito il diritto di recesso previsto per i contratti a distanza, entro il termine di',
      'quattordici giorni dalla conclusione del contratto, senza necessità di motivazione e',
      'senza alcun onere a mio carico.', '', 'Chiedo pertanto:',
      '  1. la cessazione immediata del servizio e di ogni addebito collegato;',
      '  2. il rimborso di quanto eventualmente già corrisposto, entro quattordici',
      '     giorni dal ricevimento della presente, con lo stesso mezzo di pagamento utilizzato;',
      '  3. conferma scritta della ricezione della presente comunicazione.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Oggetto: disdetta del contratto — esclusione del rinnovo automatico', '', `Spettabile ${k.provider},`, '',
        `con la presente comunico la disdetta del contratto relativo a ${service(k)},`, `attivato in data ${orderDate(k)}.`, '',
        renewal ? `La presente disdetta è inviata affinché il contratto non si rinnovi alla scadenza del ${renewal},`
          : 'La presente disdetta è inviata affinché il contratto non si rinnovi tacitamente alla scadenza,',
        notice ? `nel rispetto del termine di preavviso di ${notice} giorni previsto dalle condizioni contrattuali${deadline ? ` (termine ultimo: ${deadline})` : ''}.`
          : 'nel rispetto del termine di preavviso previsto dalle condizioni contrattuali.', '',
        'Chiedo pertanto:', '  1. conferma scritta della ricezione della presente e della data di efficacia della disdetta;',
        '  2. la cessazione di ogni addebito a decorrere dalla scadenza indicata;',
        '  3. l’indicazione di eventuali importi ritenuti dovuti, con il relativo titolo contrattuale.', '',
        'Preciso che nessun addebito ulteriore potrà considerarsi legittimo per periodi successivi', 'alla scadenza sopra indicata.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Oggetto: recesso a seguito di modifica unilaterale delle condizioni contrattuali', '', `Spettabile ${k.provider},`, '',
        `ho rilevato una modifica delle condizioni contrattuali relative a ${service(k)},`, `rispetto a quelle da me accettate in data ${orderDate(k)}.`, '',
        ch?.summary ? `In particolare: ${ch.summary}` : 'La modifica incide sulle condizioni economiche e/o normative del rapporto.', '',
        'Non intendendo accettare le nuove condizioni, comunico il mio recesso dal contratto con',
        'effetto immediato, senza penali né spese di disattivazione, trattandosi di recesso',
        'esercitato a fronte di una modifica unilaterale non da me richiesta.', '', 'Chiedo pertanto:',
        '  1. conferma scritta della cessazione del rapporto e della data di efficacia;', '  2. la cessazione di ogni addebito;',
        '  3. il rimborso di eventuali importi corrisposti per periodi successivi alla cessazione.'];
    },
    identity: ({ you, c }) => [`Intestatario del contratto: ${you.name}`, `Indirizzo: ${you.address}`, `Email di contatto: ${you.email}`,
      `Codice cliente / numero contratto: ${you.customerId || '[da indicare]'}`,
      ...(c.url ? [`Sottoscritto tramite: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Impronta del testo accettato (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Distinti saluti,', '', you.name, '', 'Firma _______________________', `Data ${today}`].join('\n'),
    footer: (refs) => ['—', 'Riferimenti normativi utili:', ...refs.map((r) => `  · ${r}`), '',
      'Documento generato automaticamente da AnteFirma a partire dalle condizioni',
      'contrattuali analizzate. Verifica i dati fra parentesi quadre prima di inviarlo. Non', 'costituisce consulenza legale.'].join('\n'),
    subject: { withdrawal: (p) => `Esercizio del diritto di recesso — ${p}`, cancellation: (p) => `Disdetta contratto — ${p}`, change_withdrawal: (p) => `Recesso per modifica unilaterale — ${p}` },
    refs: {
      withdrawal: ['D.Lgs. 206/2005 (Codice del Consumo), artt. 52-59 — diritto di recesso nei contratti a distanza',
        'Allegato I, parte B, del Codice del Consumo — modulo di recesso tipo', 'Direttiva 2011/83/UE'],
      cancellation: ['D.Lgs. 206/2005, art. 33 c. 2 lett. i) — rinnovo tacito con preavviso eccessivo', 'Codice civile, artt. 1373 e 1341'],
      change_withdrawal: ['D.Lgs. 206/2005, art. 33 c. 2 lett. m) e o) — modifica unilaterale senza giustificato motivo',
        'Direttiva 93/13/CEE, allegato punto 1 lett. j) e l)'],
    },
  },

  // Spain: Royal Legislative Decree 1/2007 (TRLGDCU); burofax is the most used proof of sending.
  es: {
    ph: { name: '[Nombre y apellidos]', address: '[Dirección]', email: '[Email]', provider: '[Empresa]', service: '[descripción del servicio]', date: '[fecha]' },
    estimated: (x) => `(compromiso estimado ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `A la atención de ${provider}`,
      '[Dirección de la empresa / email indicado en las condiciones]', '', `Lugar y fecha: ______________, ${today}`, '',
      'Enviada por: ☐ burofax   ☐ correo certificado con acuse de recibo   ☐ formulario online   ☐ email'].join('\n'),
    withdrawal: (k) => ['Asunto: ejercicio del derecho de desistimiento', '', `Estimados señores de ${k.provider}:`, '',
      'Por la presente les comunico que desisto del contrato de prestación', `del servicio ${service(k)}, celebrado el ${orderDate(k)}.`, '',
      'Ejerzo el derecho de desistimiento previsto para los contratos a distancia, dentro del plazo',
      'de catorce días naturales desde la celebración del contrato, sin necesidad de justificación',
      'y sin penalización alguna.', '', 'Por ello les solicito:',
      '  1. el cese inmediato del servicio y de cualquier cargo asociado;',
      '  2. la devolución de las cantidades abonadas en un plazo máximo de catorce días desde',
      '     la recepción de esta comunicación, por el mismo medio de pago utilizado;',
      '  3. la confirmación por escrito de la recepción de esta comunicación.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Asunto: baja del contrato — no renovación automática', '', `Estimados señores de ${k.provider}:`, '',
        `Por la presente les comunico mi baja del contrato relativo a ${service(k)},`, `dado de alta el ${orderDate(k)}.`, '',
        renewal ? `Esta comunicación se envía para que el contrato no se renueve en el vencimiento del ${renewal},`
          : 'Esta comunicación se envía para que el contrato no se renueve tácitamente a su vencimiento,',
        notice ? `respetando el preaviso de ${notice} días previsto en las condiciones${deadline ? ` (fecha límite: ${deadline})` : ''}.`
          : 'respetando el preaviso previsto en las condiciones del contrato.', '',
        'Por ello les solicito:', '  1. la confirmación por escrito de la recepción de esta comunicación y de la fecha de efecto de la baja;',
        '  2. el cese de cualquier cargo a partir del vencimiento indicado;',
        '  3. el detalle de las cantidades que consideren pendientes, indicando la cláusula de la que derivan.', '',
        'Les recuerdo que la baja no puede someterse a requisitos más gravosos que el alta,',
        'y que no se considerará legítimo ningún cargo por periodos posteriores al vencimiento indicado.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Asunto: baja por modificación unilateral de las condiciones del contrato', '', `Estimados señores de ${k.provider}:`, '',
        `He detectado una modificación de las condiciones del contrato relativo a ${service(k)},`, `respecto a las que acepté el ${orderDate(k)}.`, '',
        ch?.summary ? `En concreto: ${ch.summary}` : 'La modificación afecta a las condiciones económicas o de prestación del servicio.', '',
        'Al no aceptar las nuevas condiciones, les comunico la baja del contrato con efecto inmediato,',
        'sin penalización ni gastos de desconexión, por tratarse de una modificación unilateral',
        'que no he solicitado.', '', 'Por ello les solicito:',
        '  1. la confirmación por escrito de la baja y de su fecha de efecto;', '  2. el cese de cualquier cargo;',
        '  3. la devolución de las cantidades abonadas por periodos posteriores a la baja.'];
    },
    identity: ({ you, c }) => [`Titular del contrato: ${you.name}`, `Dirección: ${you.address}`, `Email de contacto: ${you.email}`,
      `Código de cliente / número de contrato: ${you.customerId || '[a indicar]'}`,
      ...(c.url ? [`Contratado en: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Huella del texto aceptado (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Atentamente,', '', you.name, '', 'Firma _______________________', `Fecha ${today}`].join('\n'),
    footer: (refs) => ['—', 'Normativa de referencia:', ...refs.map((r) => `  · ${r}`), '',
      'Documento generado automáticamente por AnteFirma a partir de las condiciones',
      'analizadas. Revisa los datos entre corchetes antes de enviarlo. No constituye', 'asesoramiento legal.'].join('\n'),
    subject: { withdrawal: (p) => `Ejercicio del derecho de desistimiento — ${p}`, cancellation: (p) => `Baja del contrato — ${p}`, change_withdrawal: (p) => `Baja por modificación unilateral — ${p}` },
    refs: {
      withdrawal: ['Real Decreto Legislativo 1/2007 (TRLGDCU), arts. 102-108 — derecho de desistimiento en contratos a distancia',
        'Anexo B del TRLGDCU — modelo de formulario de desistimiento', 'Directiva 2011/83/UE'],
      cancellation: ['Real Decreto Legislativo 1/2007, art. 62 — la baja, sin obstáculos y por el mismo medio que el alta',
        'Real Decreto Legislativo 1/2007, arts. 85-87 — cláusulas abusivas sobre duración y prórroga'],
      change_withdrawal: ['Real Decreto Legislativo 1/2007, art. 85.3 — modificación unilateral sin motivos válidos',
        'Directiva 93/13/CEE, anexo, punto 1, letras j) y l)'],
    },
  },

  // English: the European directives and, for the United Kingdom, the equivalent rules.
  en: {
    ph: { name: '[Full name]', address: '[Address]', email: '[Email]', provider: '[Provider]', service: '[description of the service]', date: '[date]' },
    estimated: (x) => `(estimated commitment ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `To: ${provider}`,
      '[Provider address / email given in the terms]', '', `Place and date: ______________, ${today}`, '',
      'Sent by: ☐ recorded delivery   ☐ email   ☐ online form   ☐ other: ________'].join('\n'),
    withdrawal: (k) => ['Subject: notice of withdrawal', '', `Dear ${k.provider},`, '',
      'I hereby give notice that I withdraw from my contract for the supply',
      `of the service ${service(k)}, concluded on ${orderDate(k)}.`, '',
      'I am exercising the right of withdrawal for distance contracts, within fourteen days of',
      'the conclusion of the contract, without giving any reason and without any cost to me.', '',
      'I therefore ask you to:', '  1. stop the service and any related charges immediately;',
      '  2. refund any amount already paid within fourteen days of receiving this notice,',
      '     using the same means of payment;', '  3. confirm in writing that you have received this notice.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Subject: cancellation — no automatic renewal', '', `Dear ${k.provider},`, '',
        `I hereby give notice that I am cancelling my contract for ${service(k)},`, `started on ${orderDate(k)}.`, '',
        renewal ? `This notice is given so that the contract does not renew at the end of the term on ${renewal},`
          : 'This notice is given so that the contract does not renew automatically at the end of the term,',
        notice ? `in accordance with the ${notice}-day notice period set out in the terms${deadline ? ` (last day: ${deadline})` : ''}.`
          : 'in accordance with the notice period set out in the terms.', '',
        'I therefore ask you to:', '  1. confirm in writing that you have received this notice and the date the cancellation takes effect;',
        '  2. stop all charges from the end date stated above;', '  3. itemise any amount you consider still due, stating the clause it is based on.', '',
        'Please note that no further charge will be accepted for any period after the end date stated above.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Subject: withdrawal following a unilateral change to the terms', '', `Dear ${k.provider},`, '',
        `I have noticed a change to the terms of my contract for ${service(k)},`, `compared with the terms I accepted on ${orderDate(k)}.`, '',
        ch?.summary ? `In particular: ${ch.summary}` : 'The change affects the price or the conditions of the service.', '',
        'As I do not accept the new terms, I hereby end the contract with immediate effect,',
        'without any fee or disconnection charge, since the change was made unilaterally and', 'not at my request.', '',
        'I therefore ask you to:', '  1. confirm in writing that the contract has ended and the date it takes effect;', '  2. stop all charges;',
        '  3. refund any amount paid for periods after the end of the contract.'];
    },
    identity: ({ you, c }) => [`Account holder: ${you.name}`, `Address: ${you.address}`, `Contact email: ${you.email}`,
      `Customer / contract number: ${you.customerId || '[to be completed]'}`,
      ...(c.url ? [`Signed up at: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Fingerprint of the accepted terms (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Yours faithfully,', '', you.name, '', 'Signature _______________________', `Date ${today}`].join('\n'),
    footer: (refs) => ['—', 'Useful legal references:', ...refs.map((r) => `  · ${r}`), '',
      'Document generated automatically by AnteFirma from the terms it analysed.',
      'Check the details in square brackets before sending it. It is not legal advice.'].join('\n'),
    subject: { withdrawal: (p) => `Notice of withdrawal — ${p}`, cancellation: (p) => `Cancellation — ${p}`, change_withdrawal: (p) => `Withdrawal following changes to the terms — ${p}` },
    refs: {
      withdrawal: ['Directive 2011/83/EU on consumer rights, arts. 9-16 — right of withdrawal from distance contracts',
        'Directive 2011/83/EU, Annex I(B) — model withdrawal form',
        'UK: Consumer Contracts (Information, Cancellation and Additional Charges) Regulations 2013'],
      cancellation: ['Directive 93/13/EEC on unfair terms, annex, point 1(h) — automatic extension with an unreasonably early deadline',
        'UK: Consumer Rights Act 2015, Part 2 — unfair terms'],
      change_withdrawal: ['Directive 93/13/EEC, annex, point 1(j) and (l) — unilateral changes to terms and price',
        'UK: Consumer Rights Act 2015, Schedule 2, paras 11 and 15'],
    },
  },
};

/** The advice next to the letter: in the user's language, with the sending method of the letter's country. */
function checklistFor(kind, c, lang) {
  const list = [
    t('fillFieldsSquareBracketsProviderAddress'),
    lang === 'es' ? t('sendWayProvesDateBurofaxRegistered')
      : lang === 'en' ? t('sendWayProvesDateRecordedDelivery')
        : t('sendWayProvesDateCertifiedEmail'),
    t('keepProofSendingTogetherSnapshotTerms'),
  ];
  if (kind === LETTER_KINDS.WITHDRAWAL) list.unshift(t('checkWithin14DaysConcludingContract'));
  if (kind === LETTER_KINDS.CANCELLATION && c?.deadlineAt) list.unshift(t('sendDSNoticeDeadline', { d: fd(new Date(c.deadlineAt), locale()) }));
  return list;
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

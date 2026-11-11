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
 * Italy, Spanish for Spain, German for Germany and Austria, French for France,
 * Dutch for the Netherlands, French or Dutch for Belgium (the user's language
 * decides), Polish for Poland, Portuguese for Portugal, Swedish for Sweden,
 * Romanian for Romania, Czech for the Czech Republic, English elsewhere. Each with its country's laws and habits (PEC,
 * burofax, Einschreiben, lettre recommandée, aangetekende brief). A variant
 * such as 'de-AT' is the same text with the other country's laws. Dates and
 * amounts follow the variant's locale.
 */
export const LETTER_LANGS = ['it', 'es', 'en', 'de', 'fr', 'nl', 'pl', 'pt', 'sv', 'ro', 'cs'];
export const LETTER_VARIANTS = [...LETTER_LANGS, 'de-AT', 'fr-BE', 'nl-BE'];
const LOCALE = { it: 'it-IT', es: 'es-ES', en: 'en-GB', de: 'de-DE', 'de-AT': 'de-AT', fr: 'fr-FR', 'fr-BE': 'fr-BE', nl: 'nl-NL', 'nl-BE': 'nl-BE', pl: 'pl-PL', pt: 'pt-PT', sv: 'sv-SE', ro: 'ro-RO', cs: 'cs-CZ' };
const BY_COUNTRY = { IT: 'it', ES: 'es', DE: 'de', AT: 'de-AT', FR: 'fr', NL: 'nl', PL: 'pl', PT: 'pt', SE: 'sv', RO: 'ro', CZ: 'cs' };
export const letterLangFor = (jurisdiction, uiLang = '') => (jurisdiction === 'BE' ? (uiLang === 'nl' ? 'nl-BE' : 'fr-BE') : BY_COUNTRY[jurisdiction] || 'en');

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
  de: { withdrawal: 'widerruf', cancellation: 'kuendigung', change_withdrawal: 'kuendigung-nach-aenderung' },
  fr: { withdrawal: 'retractation', cancellation: 'resiliation', change_withdrawal: 'resiliation-apres-modification' },
  nl: { withdrawal: 'herroeping', cancellation: 'opzegging', change_withdrawal: 'opzegging-na-wijziging' },
  pl: { withdrawal: 'odstapienie', cancellation: 'wypowiedzenie', change_withdrawal: 'wypowiedzenie-po-zmianie' },
  pt: { withdrawal: 'livre-resolucao', cancellation: 'denuncia', change_withdrawal: 'resolucao-por-alteracao' },
  sv: { withdrawal: 'angerratt', cancellation: 'uppsagning', change_withdrawal: 'uppsagning-efter-andring' },
  ro: { withdrawal: 'retragere', cancellation: 'denuntare', change_withdrawal: 'incetare-dupa-modificare' },
  cs: { withdrawal: 'odstoupeni', cancellation: 'vypoved', change_withdrawal: 'vypoved-po-zmene' },
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
 * @param {string} lang      one of LETTER_VARIANTS: the provider's language and country
 */
export function buildLetter(commitment = {}, identity = {}, kind = null, now = Date.now(), lang = 'it') {
  const variant = LETTER_VARIANTS.includes(lang) ? lang : 'it';
  const L = variant.slice(0, 2);
  const X = TEXT[L];
  const type = kind || suggestKind(commitment, now);
  const fmt = { date: (d) => fd(d, LOCALE[variant]), money: (a, c) => fm(a, c, LOCALE[variant]) };
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
  const refs = (COUNTRY_REFS[variant] || X.refs)[type] || [];
  const text = [X.header(ctx), '', ...lines, '', X.identity(ctx), '', X.signature(ctx), '', X.footer(refs)].join('\n');

  return {
    kind: type,
    lang: L,
    variant,
    label: LETTER_LABELS[type],
    subject: X.subject[type](provider),
    text,
    filename: `${FILE_SLUGS[L][type] || type}-${slug(provider)}-${new Date(now).toISOString().slice(0, 10)}.txt`,
    checklist: checklistFor(type, commitment, L, variant),
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
  // Germany: BGB. Austria uses the same texts with its own laws (see COUNTRY_REFS).
  // "Ordentlich und fristgerecht zum nächstmöglichen Zeitpunkt" is the standard
  // phrase: it holds even when the exact end date is unknown.
  de: {
    ph: { name: '[Vor- und Nachname]', address: '[Anschrift]', email: '[E-Mail]', provider: '[Anbieter]', service: '[Beschreibung der Leistung]', date: '[Datum]' },
    estimated: (x) => `(geschätzte Verpflichtung ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `An ${provider}`,
      '[Anschrift des Anbieters / in den Bedingungen genannte E-Mail]', '', `Ort, Datum: ______________, ${today}`, '',
      'Versandart: ☐ Einschreiben mit Rückschein   ☐ Kündigungsbutton der Website   ☐ Online-Formular   ☐ E-Mail'].join('\n'),
    withdrawal: (k) => ['Betreff: Widerruf des Vertrags', '', 'Sehr geehrte Damen und Herren,', '',
      'hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die Erbringung',
      `der Dienstleistung ${service(k)}, geschlossen am ${orderDate(k)}.`, '',
      'Ich übe das Widerrufsrecht für Fernabsatzverträge innerhalb von vierzehn Tagen nach',
      'Vertragsschluss aus, ohne Angabe von Gründen und ohne Kosten für mich.', '', 'Ich bitte Sie daher:',
      '  1. die Leistung und alle damit verbundenen Abbuchungen sofort einzustellen;',
      '  2. bereits geleistete Zahlungen binnen vierzehn Tagen nach Eingang dieses Schreibens',
      '     über dasselbe Zahlungsmittel zu erstatten;', '  3. mir den Eingang dieses Widerrufs schriftlich zu bestätigen.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Betreff: Kündigung des Vertrags — keine automatische Verlängerung', '', 'Sehr geehrte Damen und Herren,', '',
        `hiermit kündige ich den Vertrag über ${service(k)},`, `abgeschlossen am ${orderDate(k)}, ordentlich und fristgerecht zum nächstmöglichen Zeitpunkt.`, '',
        renewal ? `Die Kündigung erfolgt, damit sich der Vertrag zum ${renewal} nicht verlängert,`
          : 'Die Kündigung erfolgt, damit sich der Vertrag zum Laufzeitende nicht stillschweigend verlängert,',
        notice ? `unter Einhaltung der vertraglichen Kündigungsfrist von ${notice} Tagen${deadline ? ` (letzter Tag: ${deadline})` : ''}.`
          : 'unter Einhaltung der vertraglichen Kündigungsfrist.', '',
        'Ich bitte Sie daher:', '  1. mir den Eingang dieser Kündigung und den Zeitpunkt ihrer Wirksamkeit schriftlich zu bestätigen;',
        '  2. alle Abbuchungen ab dem genannten Zeitpunkt einzustellen;',
        '  3. etwaige noch offene Beträge mit der zugrunde liegenden Vertragsklausel aufzuschlüsseln.', '',
        'Abbuchungen für Zeiträume nach dem genannten Vertragsende werde ich nicht akzeptieren.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Betreff: Kündigung wegen einseitiger Änderung der Vertragsbedingungen', '', 'Sehr geehrte Damen und Herren,', '',
        `mir ist eine Änderung der Bedingungen meines Vertrags über ${service(k)} aufgefallen,`, `gegenüber den Bedingungen, die ich am ${orderDate(k)} akzeptiert habe.`, '',
        ch?.summary ? `Insbesondere: ${ch.summary}` : 'Die Änderung betrifft den Preis oder die Bedingungen der Leistung.', '',
        'Da ich den neuen Bedingungen nicht zustimme, beende ich den Vertrag mit sofortiger Wirkung,',
        'ohne Vertragsstrafe und ohne Kosten, da die Änderung einseitig und nicht auf meinen', 'Wunsch erfolgt ist.', '',
        'Ich bitte Sie daher:', '  1. mir die Beendigung des Vertrags und deren Zeitpunkt schriftlich zu bestätigen;', '  2. alle Abbuchungen einzustellen;',
        '  3. Beträge für Zeiträume nach Vertragsende zu erstatten.'];
    },
    identity: ({ you, c }) => [`Vertragsinhaber: ${you.name}`, `Anschrift: ${you.address}`, `Kontakt-E-Mail: ${you.email}`,
      `Kunden- / Vertragsnummer: ${you.customerId || '[bitte angeben]'}`,
      ...(c.url ? [`Abgeschlossen über: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Fingerabdruck der akzeptierten Bedingungen (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Mit freundlichen Grüßen', '', you.name, '', 'Unterschrift _______________________', `Datum ${today}`].join('\n'),
    footer: (refs) => ['—', 'Nützliche Rechtsgrundlagen:', ...refs.map((r) => `  · ${r}`), '',
      'Von AnteFirma automatisch aus den analysierten Bedingungen erstelltes Dokument.',
      'Prüfen Sie die Angaben in eckigen Klammern vor dem Versand. Keine Rechtsberatung.'].join('\n'),
    subject: { withdrawal: (p) => `Widerruf — ${p}`, cancellation: (p) => `Kündigung — ${p}`, change_withdrawal: (p) => `Kündigung wegen Vertragsänderung — ${p}` },
    refs: {
      withdrawal: ['BGB §§ 312g, 355, 356 — Widerrufsrecht bei Fernabsatzverträgen',
        'EGBGB Anlage 2 — Muster-Widerrufsformular', 'Richtlinie 2011/83/EU'],
      cancellation: ['BGB § 309 Nr. 9 — Laufzeit, stillschweigende Verlängerung und Kündigungsfrist von höchstens einem Monat',
        'BGB § 312k — Kündigungsbutton bei online geschlossenen Verträgen'],
      change_withdrawal: ['BGB §§ 307, 308 Nr. 4 — einseitige Änderungsvorbehalte',
        'Richtlinie 93/13/EWG, Anhang Nr. 1 Buchst. j und l'],
    },
  },

  // France: Code de la consommation. Belgium uses the same texts with its own laws.
  fr: {
    ph: { name: '[Prénom et nom]', address: '[Adresse]', email: '[E-mail]', provider: '[Fournisseur]', service: '[description du service]', date: '[date]' },
    estimated: (x) => `(engagement estimé ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `À l’attention de ${provider}`,
      '[Adresse du fournisseur / e-mail indiqué dans les conditions]', '', `Lieu et date : ______________, ${today}`, '',
      'Envoyée par : ☐ lettre recommandée avec AR   ☐ fonction de résiliation en ligne   ☐ formulaire en ligne   ☐ e-mail'].join('\n'),
    withdrawal: (k) => ['Objet : exercice du droit de rétractation', '', 'Madame, Monsieur,', '',
      'Par la présente, je vous notifie ma rétractation du contrat portant sur la fourniture',
      `du service ${service(k)}, conclu le ${orderDate(k)}.`, '',
      'J’exerce le droit de rétractation prévu pour les contrats à distance, dans le délai de',
      'quatorze jours suivant la conclusion du contrat, sans avoir à motiver ma décision et sans frais.', '',
      'Je vous demande donc :', '  1. l’arrêt immédiat du service et de tout prélèvement associé ;',
      '  2. le remboursement des sommes versées dans les quatorze jours suivant la réception',
      '     de ce courrier, par le même moyen de paiement ;', '  3. la confirmation écrite de la réception de ce courrier.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Objet : résiliation du contrat — refus de la reconduction tacite', '', 'Madame, Monsieur,', '',
        `Par la présente, je résilie le contrat relatif à ${service(k)},`, `souscrit le ${orderDate(k)}.`, '',
        renewal ? `Cette résiliation est adressée afin que le contrat ne soit pas reconduit à l’échéance du ${renewal},`
          : 'Cette résiliation est adressée afin que le contrat ne soit pas reconduit tacitement à son échéance,',
        notice ? `dans le respect du préavis de ${notice} jours prévu par les conditions${deadline ? ` (date limite : ${deadline})` : ''}.`
          : 'dans le respect du préavis prévu par les conditions du contrat.', '',
        'Je vous demande donc :', '  1. la confirmation écrite de la réception de ce courrier et de la date d’effet de la résiliation ;',
        '  2. l’arrêt de tout prélèvement à compter de l’échéance indiquée ;',
        '  3. le détail des sommes que vous estimeriez encore dues, avec la clause correspondante.', '',
        'Aucun prélèvement pour une période postérieure à l’échéance indiquée ne sera accepté.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Objet : résiliation suite à une modification unilatérale des conditions', '', 'Madame, Monsieur,', '',
        `J’ai constaté une modification des conditions de mon contrat relatif à ${service(k)},`, `par rapport à celles que j’ai acceptées le ${orderDate(k)}.`, '',
        ch?.summary ? `En particulier : ${ch.summary}` : 'La modification porte sur le prix ou sur les conditions du service.', '',
        'N’acceptant pas les nouvelles conditions, je résilie le contrat avec effet immédiat,',
        'sans pénalité ni frais de résiliation, la modification ayant été décidée unilatéralement', 'et non à ma demande.', '',
        'Je vous demande donc :', '  1. la confirmation écrite de la fin du contrat et de sa date d’effet ;', '  2. l’arrêt de tout prélèvement ;',
        '  3. le remboursement des sommes versées pour les périodes postérieures à la résiliation.'];
    },
    identity: ({ you, c }) => [`Titulaire du contrat : ${you.name}`, `Adresse : ${you.address}`, `E-mail de contact : ${you.email}`,
      `Numéro client / contrat : ${you.customerId || '[à compléter]'}`,
      ...(c.url ? [`Souscrit sur : ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Empreinte des conditions acceptées (SHA-256) : ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Veuillez agréer, Madame, Monsieur, mes salutations distinguées.', '', you.name, '', 'Signature _______________________', `Date ${today}`].join('\n'),
    footer: (refs) => ['—', 'Références juridiques utiles :', ...refs.map((r) => `  · ${r}`), '',
      'Document généré automatiquement par AnteFirma à partir des conditions analysées.',
      'Vérifiez les données entre crochets avant l’envoi. Ce n’est pas un conseil juridique.'].join('\n'),
    subject: { withdrawal: (p) => `Exercice du droit de rétractation — ${p}`, cancellation: (p) => `Résiliation du contrat — ${p}`, change_withdrawal: (p) => `Résiliation suite à modification unilatérale — ${p}` },
    refs: {
      withdrawal: ['Code de la consommation, art. L221-18 à L221-28 — droit de rétractation dans les contrats à distance',
        'Code de la consommation, annexe à l’art. R221-1 — formulaire type de rétractation', 'Directive 2011/83/UE'],
      cancellation: ['Code de la consommation, art. L215-1 — information sur la reconduction tacite (loi Chatel)',
        'Code de la consommation, art. L215-1-1 — résiliation par voie électronique'],
      change_withdrawal: ['Code de la consommation, art. R212-1 et R212-2 — clauses abusives (modification unilatérale)',
        'Directive 93/13/CEE, annexe, point 1 j) et l)'],
    },
  },

  // The Netherlands: Burgerlijk Wetboek. Flemish Belgium uses the same texts with its own laws.
  nl: {
    ph: { name: '[Voor- en achternaam]', address: '[Adres]', email: '[E-mail]', provider: '[Aanbieder]', service: '[omschrijving van de dienst]', date: '[datum]' },
    estimated: (x) => `(geschatte verplichting ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Aan ${provider}`,
      '[Adres van de aanbieder / e-mailadres uit de voorwaarden]', '', `Plaats en datum: ______________, ${today}`, '',
      'Verzonden per: ☐ aangetekende brief   ☐ online opzegformulier   ☐ e-mail   ☐ anders: ________'].join('\n'),
    withdrawal: (k) => ['Onderwerp: herroeping van de overeenkomst', '', 'Geachte heer, mevrouw,', '',
      'Hierbij deel ik u mee dat ik de overeenkomst voor de levering',
      `van de dienst ${service(k)}, gesloten op ${orderDate(k)}, herroep.`, '',
      'Ik maak gebruik van het herroepingsrecht voor overeenkomsten op afstand, binnen veertien',
      'dagen na het sluiten van de overeenkomst, zonder opgave van redenen en zonder kosten.', '',
      'Ik verzoek u daarom:', '  1. de dienst en alle bijbehorende afschrijvingen onmiddellijk te stoppen;',
      '  2. reeds betaalde bedragen binnen veertien dagen na ontvangst van deze brief terug te',
      '     betalen via hetzelfde betaalmiddel;', '  3. de ontvangst van deze brief schriftelijk te bevestigen.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Onderwerp: opzegging van de overeenkomst — geen automatische verlenging', '', 'Geachte heer, mevrouw,', '',
        `Hierbij zeg ik de overeenkomst voor ${service(k)} op,`, `afgesloten op ${orderDate(k)}.`, '',
        renewal ? `Deze opzegging is bedoeld om te voorkomen dat de overeenkomst op ${renewal} wordt verlengd,`
          : 'Deze opzegging is bedoeld om te voorkomen dat de overeenkomst aan het einde van de looptijd stilzwijgend wordt verlengd,',
        notice ? `met inachtneming van de opzegtermijn van ${notice} dagen uit de voorwaarden${deadline ? ` (uiterste datum: ${deadline})` : ''}.`
          : 'met inachtneming van de opzegtermijn uit de voorwaarden.', '',
        'Ik verzoek u daarom:', '  1. de ontvangst van deze opzegging en de datum waarop zij ingaat schriftelijk te bevestigen;',
        '  2. alle afschrijvingen vanaf de genoemde einddatum te stoppen;',
        '  3. eventuele bedragen die u nog verschuldigd acht te specificeren, met het bijbehorende beding.', '',
        'Afschrijvingen voor perioden na de genoemde einddatum zal ik niet accepteren.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Onderwerp: opzegging wegens eenzijdige wijziging van de voorwaarden', '', 'Geachte heer, mevrouw,', '',
        `Ik heb een wijziging opgemerkt in de voorwaarden van mijn overeenkomst voor ${service(k)},`, `ten opzichte van de voorwaarden die ik op ${orderDate(k)} accepteerde.`, '',
        ch?.summary ? `In het bijzonder: ${ch.summary}` : 'De wijziging betreft de prijs of de voorwaarden van de dienst.', '',
        'Omdat ik niet akkoord ga met de nieuwe voorwaarden, beëindig ik de overeenkomst met',
        'onmiddellijke ingang, zonder boete of opzegkosten, omdat de wijziging eenzijdig en niet', 'op mijn verzoek is doorgevoerd.', '',
        'Ik verzoek u daarom:', '  1. de beëindiging van de overeenkomst en de ingangsdatum schriftelijk te bevestigen;', '  2. alle afschrijvingen te stoppen;',
        '  3. bedragen voor perioden na de beëindiging terug te betalen.'];
    },
    identity: ({ you, c }) => [`Contracthouder: ${you.name}`, `Adres: ${you.address}`, `Contact-e-mail: ${you.email}`,
      `Klant- / contractnummer: ${you.customerId || '[in te vullen]'}`,
      ...(c.url ? [`Afgesloten via: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Vingerafdruk van de geaccepteerde voorwaarden (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Met vriendelijke groet,', '', you.name, '', 'Handtekening _______________________', `Datum ${today}`].join('\n'),
    footer: (refs) => ['—', 'Nuttige wettelijke verwijzingen:', ...refs.map((r) => `  · ${r}`), '',
      'Document automatisch opgesteld door AnteFirma op basis van de geanalyseerde voorwaarden.',
      'Controleer de gegevens tussen vierkante haken voor verzending. Dit is geen juridisch advies.'].join('\n'),
    subject: { withdrawal: (p) => `Herroeping — ${p}`, cancellation: (p) => `Opzegging — ${p}`, change_withdrawal: (p) => `Opzegging wegens wijziging van de voorwaarden — ${p}` },
    refs: {
      withdrawal: ['Burgerlijk Wetboek, art. 6:230o-6:230s — ontbindingsrecht bij overeenkomsten op afstand',
        'Richtlijn 2011/83/EU, bijlage I, deel B — modelformulier voor herroeping', 'Richtlijn 2011/83/EU'],
      cancellation: ['Burgerlijk Wetboek, art. 6:236 sub j — stilzwijgende verlenging alleen voor onbepaalde tijd, opzegtermijn ten hoogste één maand',
        'Burgerlijk Wetboek, art. 6:237 sub l — opzeggen op dezelfde wijze als de overeenkomst is gesloten'],
      change_withdrawal: ['Burgerlijk Wetboek, art. 6:236 sub i en 6:237 sub c — eenzijdige wijziging van prijs en prestatie',
        'Richtlijn 93/13/EEG, bijlage, punt 1 j) en l)'],
    },
  },
  // Poland: Ustawa o prawach konsumenta (2014) and the Civil Code on unfair terms.
  pl: {
    ph: { name: '[Imię i nazwisko]', address: '[Adres]', email: '[E-mail]', provider: '[Dostawca]', service: '[opis usługi]', date: '[data]' },
    estimated: (x) => `(szacowane zobowiązanie ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Do: ${provider}`,
      '[Adres dostawcy / e-mail wskazany w regulaminie]', '', `Miejscowość i data: ______________, ${today}`, '',
      'Wysłano: ☐ listem poleconym za potwierdzeniem odbioru   ☐ formularzem online   ☐ e-mailem'].join('\n'),
    withdrawal: (k) => ['Dotyczy: odstąpienie od umowy', '', 'Szanowni Państwo,', '',
      'niniejszym informuję o odstąpieniu od umowy o świadczenie',
      `usługi ${service(k)}, zawartej dnia ${orderDate(k)}.`, '',
      'Korzystam z prawa odstąpienia od umowy zawartej na odległość, w terminie czternastu dni',
      'od jej zawarcia, bez podawania przyczyny i bez ponoszenia kosztów.', '', 'W związku z tym proszę o:',
      '  1. natychmiastowe zaprzestanie świadczenia usługi i wszelkich związanych z nią obciążeń;',
      '  2. zwrot wszystkich dokonanych płatności w terminie czternastu dni od otrzymania',
      '     niniejszego pisma, przy użyciu tego samego sposobu płatności;', '  3. pisemne potwierdzenie otrzymania niniejszego oświadczenia.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Dotyczy: wypowiedzenie umowy — brak automatycznego przedłużenia', '', 'Szanowni Państwo,', '',
        `niniejszym wypowiadam umowę dotyczącą ${service(k)},`, `zawartą dnia ${orderDate(k)}.`, '',
        renewal ? `Wypowiedzenie składam, aby umowa nie przedłużyła się z dniem ${renewal},`
          : 'Wypowiedzenie składam, aby umowa nie przedłużyła się automatycznie z końcem okresu,',
        notice ? `z zachowaniem przewidzianego w regulaminie ${notice}-dniowego okresu wypowiedzenia${deadline ? ` (ostatni dzień: ${deadline})` : ''}.`
          : 'z zachowaniem okresu wypowiedzenia przewidzianego w regulaminie.', '',
        'W związku z tym proszę o:', '  1. pisemne potwierdzenie otrzymania wypowiedzenia i daty jego skuteczności;',
        '  2. zaprzestanie wszelkich obciążeń od wskazanej daty;',
        '  3. wskazanie ewentualnych kwot uznanych za należne, wraz z postanowieniem umowy, z którego wynikają.', '',
        'Nie zaakceptuję żadnych obciążeń za okres po wskazanej dacie zakończenia umowy.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Dotyczy: wypowiedzenie umowy w związku z jednostronną zmianą warunków', '', 'Szanowni Państwo,', '',
        `zauważyłem zmianę warunków umowy dotyczącej ${service(k)}`, `w stosunku do warunków zaakceptowanych przeze mnie dnia ${orderDate(k)}.`, '',
        ch?.summary ? `W szczególności: ${ch.summary}` : 'Zmiana dotyczy ceny lub warunków świadczenia usługi.', '',
        'Nie akceptując nowych warunków, wypowiadam umowę ze skutkiem natychmiastowym,',
        'bez kar i opłat, ponieważ zmiana została wprowadzona jednostronnie,', 'a nie na moją prośbę.', '',
        'W związku z tym proszę o:', '  1. pisemne potwierdzenie rozwiązania umowy i daty jego skuteczności;', '  2. zaprzestanie wszelkich obciążeń;',
        '  3. zwrot kwot zapłaconych za okres po rozwiązaniu umowy.'];
    },
    identity: ({ you, c }) => [`Strona umowy: ${you.name}`, `Adres: ${you.address}`, `E-mail kontaktowy: ${you.email}`,
      `Numer klienta / umowy: ${you.customerId || '[do uzupełnienia]'}`,
      ...(c.url ? [`Zawarta przez: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Odcisk zaakceptowanych warunków (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Z poważaniem', '', you.name, '', 'Podpis _______________________', `Data ${today}`].join('\n'),
    footer: (refs) => ['—', 'Przydatne podstawy prawne:', ...refs.map((r) => `  · ${r}`), '',
      'Dokument wygenerowany automatycznie przez AnteFirma na podstawie przeanalizowanych warunków.',
      'Sprawdź dane w nawiasach kwadratowych przed wysłaniem. To nie jest porada prawna.'].join('\n'),
    subject: { withdrawal: (p) => `Odstąpienie od umowy — ${p}`, cancellation: (p) => `Wypowiedzenie umowy — ${p}`, change_withdrawal: (p) => `Wypowiedzenie po zmianie warunków — ${p}` },
    refs: {
      withdrawal: ['Ustawa z dnia 30 maja 2014 r. o prawach konsumenta, art. 27–38 — prawo odstąpienia od umowy zawartej na odległość',
        'Załącznik nr 2 do ustawy o prawach konsumenta — wzór formularza odstąpienia od umowy', 'Dyrektywa 2011/83/UE'],
      cancellation: ['Kodeks cywilny, art. 385¹–385³ — niedozwolone postanowienia umowne',
        'Dyrektywa 93/13/EWG, załącznik, pkt 1 lit. h) — automatyczne przedłużenie z nadmiernie wczesnym terminem'],
      change_withdrawal: ['Kodeks cywilny, art. 385³ pkt 19 i 20 — jednostronna zmiana umowy lub ceny',
        'Dyrektywa 93/13/EWG, załącznik, pkt 1 lit. j) i l)'],
    },
  },

  // Portugal: Decreto-Lei 24/2014 (distance contracts) and the general contract terms law.
  pt: {
    ph: { name: '[Nome completo]', address: '[Morada]', email: '[E-mail]', provider: '[Fornecedor]', service: '[descrição do serviço]', date: '[data]' },
    estimated: (x) => `(compromisso estimado ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Ao cuidado de ${provider}`,
      '[Morada do fornecedor / e-mail indicado nas condições]', '', `Local e data: ______________, ${today}`, '',
      'Enviada por: ☐ carta registada com aviso de receção   ☐ formulário online   ☐ e-mail'].join('\n'),
    withdrawal: (k) => ['Assunto: exercício do direito de livre resolução', '', 'Exmos. Senhores,', '',
      'Venho por este meio comunicar que resolvo o contrato de prestação',
      `do serviço ${service(k)}, celebrado em ${orderDate(k)}.`, '',
      'Exerço o direito de livre resolução previsto para os contratos celebrados à distância, no prazo',
      'de catorze dias a contar da celebração do contrato, sem necessidade de indicar o motivo e sem custos.', '',
      'Solicito, por isso:', '  1. a cessação imediata do serviço e de qualquer cobrança associada;',
      '  2. o reembolso de todos os pagamentos recebidos no prazo de catorze dias a contar da receção',
      '     desta comunicação, pelo mesmo meio de pagamento;', '  3. a confirmação por escrito da receção desta comunicação.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Assunto: denúncia do contrato — oposição à renovação automática', '', 'Exmos. Senhores,', '',
        `Venho por este meio denunciar o contrato relativo a ${service(k)},`, `celebrado em ${orderDate(k)}.`, '',
        renewal ? `Esta comunicação destina-se a impedir a renovação do contrato em ${renewal},`
          : 'Esta comunicação destina-se a impedir a renovação automática do contrato no seu termo,',
        notice ? `respeitando o pré-aviso de ${notice} dias previsto nas condições${deadline ? ` (data limite: ${deadline})` : ''}.`
          : 'respeitando o pré-aviso previsto nas condições do contrato.', '',
        'Solicito, por isso:', '  1. a confirmação por escrito da receção desta comunicação e da data em que produz efeitos;',
        '  2. a cessação de qualquer cobrança a partir dessa data;',
        '  3. o detalhe dos montantes que considerem ainda devidos, com indicação da cláusula de que resultam.', '',
        'Não aceitarei qualquer cobrança relativa a períodos posteriores à data indicada.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Assunto: resolução do contrato por alteração unilateral das condições', '', 'Exmos. Senhores,', '',
        `Verifiquei uma alteração das condições do contrato relativo a ${service(k)},`, `face às que aceitei em ${orderDate(k)}.`, '',
        ch?.summary ? `Em particular: ${ch.summary}` : 'A alteração incide sobre o preço ou as condições do serviço.', '',
        'Não aceitando as novas condições, resolvo o contrato com efeitos imediatos,',
        'sem penalizações nem encargos, por se tratar de uma alteração unilateral', 'que não solicitei.', '',
        'Solicito, por isso:', '  1. a confirmação por escrito da cessação do contrato e da respetiva data;', '  2. a cessação de qualquer cobrança;',
        '  3. o reembolso dos montantes pagos por períodos posteriores à cessação.'];
    },
    identity: ({ you, c }) => [`Titular do contrato: ${you.name}`, `Morada: ${you.address}`, `E-mail de contacto: ${you.email}`,
      `Número de cliente / contrato: ${you.customerId || '[a preencher]'}`,
      ...(c.url ? [`Contratado em: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Impressão digital das condições aceites (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Com os melhores cumprimentos,', '', you.name, '', 'Assinatura _______________________', `Data ${today}`].join('\n'),
    footer: (refs) => ['—', 'Referências legais úteis:', ...refs.map((r) => `  · ${r}`), '',
      'Documento gerado automaticamente pelo AnteFirma a partir das condições analisadas.',
      'Verifique os dados entre parênteses retos antes de enviar. Não constitui aconselhamento jurídico.'].join('\n'),
    subject: { withdrawal: (p) => `Exercício do direito de livre resolução — ${p}`, cancellation: (p) => `Denúncia do contrato — ${p}`, change_withdrawal: (p) => `Resolução por alteração unilateral — ${p}` },
    refs: {
      withdrawal: ['Decreto-Lei n.º 24/2014, arts. 10.º a 17.º — direito de livre resolução nos contratos à distância',
        'Decreto-Lei n.º 24/2014, Anexo, parte B — formulário de livre resolução', 'Diretiva 2011/83/UE'],
      cancellation: ['Decreto-Lei n.º 446/85 (cláusulas contratuais gerais), arts. 21.º e 22.º — cláusulas proibidas',
        'Lei n.º 24/96 (Lei de Defesa do Consumidor), art. 9.º — proteção dos interesses económicos'],
      change_withdrawal: ['Decreto-Lei n.º 446/85, art. 22.º, n.º 1, alíneas c) e d) — alteração unilateral das condições ou do preço',
        'Diretiva 93/13/CEE, anexo, ponto 1, alíneas j) e l)'],
    },
  },

  // Sweden: Distance Contracts Act (2005:59) and the Consumer Contract Terms Act (1994:1512).
  sv: {
    ph: { name: '[För- och efternamn]', address: '[Adress]', email: '[E-post]', provider: '[Leverantör]', service: '[beskrivning av tjänsten]', date: '[datum]' },
    estimated: (x) => `(uppskattat åtagande ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Till: ${provider}`,
      '[Leverantörens adress / e-post som anges i villkoren]', '', `Ort och datum: ______________, ${today}`, '',
      'Skickat med: ☐ rekommenderat brev med mottagningsbevis   ☐ onlineformulär   ☐ e-post'].join('\n'),
    withdrawal: (k) => ['Ärende: utövande av ångerrätt', '', 'Hej,', '',
      'härmed meddelar jag att jag frånträder avtalet om',
      `tjänsten ${service(k)}, ingånget den ${orderDate(k)}.`, '',
      'Jag utövar ångerrätten för avtal som ingåtts på distans, inom fjorton dagar',
      'från det att avtalet ingicks, utan att ange skäl och utan kostnad.', '', 'Jag ber därför om:',
      '  1. att tjänsten och alla tillhörande debiteringar upphör omedelbart;',
      '  2. återbetalning av alla mottagna betalningar inom fjorton dagar från det att',
      '     detta meddelande mottagits, med samma betalningsmetod;', '  3. skriftlig bekräftelse på att detta meddelande har mottagits.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Ärende: uppsägning av avtalet — ingen automatisk förlängning', '', 'Hej,', '',
        `härmed säger jag upp avtalet om ${service(k)},`, `ingånget den ${orderDate(k)}.`, '',
        renewal ? `Uppsägningen görs för att avtalet inte ska förlängas den ${renewal},`
          : 'Uppsägningen görs för att avtalet inte ska förlängas automatiskt när perioden löper ut,',
        notice ? `med iakttagande av den uppsägningstid på ${notice} dagar som anges i villkoren${deadline ? ` (sista dag: ${deadline})` : ''}.`
          : 'med iakttagande av den uppsägningstid som anges i villkoren.', '',
        'Jag ber därför om:', '  1. skriftlig bekräftelse på att uppsägningen mottagits och från vilket datum den gäller;',
        '  2. att alla debiteringar upphör från det datumet;',
        '  3. en specifikation av eventuella belopp ni anser vara skyldiga, med det avtalsvillkor de grundar sig på.', '',
        'Jag godtar inga debiteringar för perioder efter det angivna slutdatumet.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Ärende: frånträde av avtalet på grund av ensidig ändring av villkoren', '', 'Hej,', '',
        `jag har noterat en ändring av villkoren i avtalet om ${service(k)}`, `jämfört med de villkor jag godkände den ${orderDate(k)}.`, '',
        ch?.summary ? `Särskilt: ${ch.summary}` : 'Ändringen gäller priset eller villkoren för tjänsten.', '',
        'Eftersom jag inte godtar de nya villkoren säger jag upp avtalet med omedelbar verkan,',
        'utan avgifter eller kostnader, eftersom ändringen gjorts ensidigt', 'och inte på min begäran.', '',
        'Jag ber därför om:', '  1. skriftlig bekräftelse på att avtalet upphört och från vilket datum;', '  2. att alla debiteringar upphör;',
        '  3. återbetalning av belopp som betalats för perioder efter att avtalet upphört.'];
    },
    identity: ({ you, c }) => [`Avtalspart: ${you.name}`, `Adress: ${you.address}`, `Kontakt-e-post: ${you.email}`,
      `Kund- / avtalsnummer: ${you.customerId || '[fyll i]'}`,
      ...(c.url ? [`Ingånget via: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Fingeravtryck av godkända villkor (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Med vänlig hälsning', '', you.name, '', 'Underskrift _______________________', `Datum ${today}`].join('\n'),
    footer: (refs) => ['—', 'Användbara rättsliga hänvisningar:', ...refs.map((r) => `  · ${r}`), '',
      'Dokument skapat automatiskt av AnteFirma utifrån de analyserade villkoren.',
      'Kontrollera uppgifterna inom hakparentes innan du skickar. Detta är inte juridisk rådgivning.'].join('\n'),
    subject: { withdrawal: (p) => `Utövande av ångerrätt — ${p}`, cancellation: (p) => `Uppsägning av avtalet — ${p}`, change_withdrawal: (p) => `Frånträde efter ändrade villkor — ${p}` },
    refs: {
      withdrawal: ['Lag (2005:59) om distansavtal och avtal utanför affärslokaler, 2 kap. 10–15 §§ — ångerrätt vid distansavtal',
        'Direktiv 2011/83/EU, bilaga I del B — standardformulär för utövande av ångerrätt', 'Direktiv 2011/83/EU'],
      cancellation: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 § — oskäliga avtalsvillkor',
        'Direktiv 93/13/EEG, bilaga, punkt 1 h — automatisk förlängning med orimligt tidig uppsägningsfrist'],
      change_withdrawal: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 § — ensidig ändring av pris eller villkor',
        'Direktiv 93/13/EEG, bilaga, punkt 1 j och l'],
    },
  },

  // Romania: GEO 34/2014 (distance contracts) and Law 193/2000 on unfair terms.
  ro: {
    ph: { name: '[Nume și prenume]', address: '[Adresă]', email: '[E-mail]', provider: '[Furnizor]', service: '[descrierea serviciului]', date: '[data]' },
    estimated: (x) => `(angajament estimat ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Către: ${provider}`,
      '[Adresa furnizorului / e-mailul indicat în condiții]', '', `Localitatea și data: ______________, ${today}`, '',
      'Trimisă prin: ☐ scrisoare recomandată cu confirmare de primire   ☐ formular online   ☐ e-mail'].join('\n'),
    withdrawal: (k) => ['Subiect: exercitarea dreptului de retragere', '', 'Stimate doamne și stimați domni,', '',
      'prin prezenta vă notific retragerea din contractul de prestare',
      `a serviciului ${service(k)}, încheiat la data de ${orderDate(k)}.`, '',
      'Îmi exercit dreptul de retragere din contractele încheiate la distanță, în termen de paisprezece zile',
      'de la încheierea contractului, fără a invoca vreun motiv și fără costuri.', '', 'Vă solicit, prin urmare:',
      '  1. încetarea imediată a serviciului și a oricăror debitări aferente;',
      '  2. rambursarea tuturor plăților primite în termen de paisprezece zile de la primirea',
      '     prezentei notificări, prin aceeași metodă de plată;', '  3. confirmarea în scris a primirii prezentei notificări.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Subiect: denunțarea contractului — fără reînnoire automată', '', 'Stimate doamne și stimați domni,', '',
        `prin prezenta denunț contractul privind ${service(k)},`, `încheiat la data de ${orderDate(k)}.`, '',
        renewal ? `Denunțarea are scopul de a împiedica reînnoirea contractului la data de ${renewal},`
          : 'Denunțarea are scopul de a împiedica reînnoirea automată a contractului la expirarea perioadei,',
        notice ? `cu respectarea preavizului de ${notice} zile prevăzut în condiții${deadline ? ` (ultima zi: ${deadline})` : ''}.`
          : 'cu respectarea preavizului prevăzut în condițiile contractului.', '',
        'Vă solicit, prin urmare:', '  1. confirmarea în scris a primirii denunțării și a datei de la care produce efecte;',
        '  2. încetarea oricăror debitări de la acea dată;',
        '  3. detalierea eventualelor sume pe care le considerați datorate, cu clauza contractuală din care rezultă.', '',
        'Nu voi accepta nicio debitare pentru perioade ulterioare datei de încetare indicate.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Subiect: încetarea contractului ca urmare a modificării unilaterale a condițiilor', '', 'Stimate doamne și stimați domni,', '',
        `am constatat o modificare a condițiilor contractului privind ${service(k)},`, `față de cele acceptate de mine la data de ${orderDate(k)}.`, '',
        ch?.summary ? `În special: ${ch.summary}` : 'Modificarea privește prețul sau condițiile serviciului.', '',
        'Întrucât nu accept noile condiții, denunț contractul cu efect imediat,',
        'fără penalități sau costuri, deoarece modificarea a fost făcută unilateral', 'și nu la cererea mea.', '',
        'Vă solicit, prin urmare:', '  1. confirmarea în scris a încetării contractului și a datei acesteia;', '  2. încetarea oricăror debitări;',
        '  3. rambursarea sumelor plătite pentru perioade ulterioare încetării.'];
    },
    identity: ({ you, c }) => [`Titularul contractului: ${you.name}`, `Adresă: ${you.address}`, `E-mail de contact: ${you.email}`,
      `Număr de client / contract: ${you.customerId || '[de completat]'}`,
      ...(c.url ? [`Încheiat prin: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Amprenta condițiilor acceptate (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['Cu stimă,', '', you.name, '', 'Semnătura _______________________', `Data ${today}`].join('\n'),
    footer: (refs) => ['—', 'Referințe legale utile:', ...refs.map((r) => `  · ${r}`), '',
      'Document generat automat de AnteFirma pe baza condițiilor analizate.',
      'Verifică datele dintre parantezele drepte înainte de trimitere. Nu constituie consultanță juridică.'].join('\n'),
    subject: { withdrawal: (p) => `Exercitarea dreptului de retragere — ${p}`, cancellation: (p) => `Denunțarea contractului — ${p}`, change_withdrawal: (p) => `Încetare după modificarea condițiilor — ${p}` },
    refs: {
      withdrawal: ['OUG nr. 34/2014, art. 9–16 — dreptul de retragere din contractele la distanță',
        'OUG nr. 34/2014, anexa nr. 2 — formularul tip de retragere', 'Directiva 2011/83/UE'],
      cancellation: ['Legea nr. 193/2000 privind clauzele abuzive, art. 4 și anexa — clauze abuzive',
        'Codul civil, art. 1203 — clauzele neuzuale din condițiile generale trebuie acceptate expres în scris'],
      change_withdrawal: ['Legea nr. 193/2000, anexa, lit. a) — modificarea unilaterală a clauzelor contractului',
        'Directiva 93/13/CEE, anexa, punctul 1 literele (j) și (l)'],
    },
  },

  // Czech Republic: the Civil Code (Act 89/2012) on distance contracts and consumer terms.
  cs: {
    ph: { name: '[Jméno a příjmení]', address: '[Adresa]', email: '[E-mail]', provider: '[Poskytovatel]', service: '[popis služby]', date: '[datum]' },
    estimated: (x) => `(odhadovaný závazek ${x})`,
    header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Komu: ${provider}`,
      '[Adresa poskytovatele / e-mail uvedený v podmínkách]', '', `Místo a datum: ______________, ${today}`, '',
      'Odesláno: ☐ doporučeným dopisem s dodejkou   ☐ datovou schránkou   ☐ online formulářem   ☐ e-mailem'].join('\n'),
    withdrawal: (k) => ['Věc: odstoupení od smlouvy', '', 'Vážení,', '',
      'tímto oznamuji, že odstupuji od smlouvy o poskytování',
      `služby ${service(k)}, uzavřené dne ${orderDate(k)}.`, '',
      'Využívám práva odstoupit od smlouvy uzavřené distančním způsobem ve lhůtě čtrnácti dnů',
      'od jejího uzavření, bez uvedení důvodu a bez nákladů.', '', 'Žádám proto o:',
      '  1. okamžité ukončení služby a všech souvisejících plateb;',
      '  2. vrácení všech přijatých plateb do čtrnácti dnů od doručení',
      '     tohoto oznámení, stejným platebním prostředkem;', '  3. písemné potvrzení přijetí tohoto oznámení.'],
    cancellation: (k) => {
      const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
      return ['Věc: výpověď smlouvy — bez automatického prodloužení', '', 'Vážení,', '',
        `tímto vypovídám smlouvu týkající se ${service(k)},`, `uzavřenou dne ${orderDate(k)}.`, '',
        renewal ? `Výpověď podávám, aby se smlouva neprodloužila dne ${renewal},`
          : 'Výpověď podávám, aby se smlouva po skončení období automaticky neprodloužila,',
        notice ? `s dodržením výpovědní lhůty ${notice} dnů stanovené v podmínkách${deadline ? ` (poslední den: ${deadline})` : ''}.`
          : 's dodržením výpovědní lhůty stanovené v podmínkách smlouvy.', '',
        'Žádám proto o:', '  1. písemné potvrzení přijetí výpovědi a data její účinnosti;',
        '  2. ukončení všech plateb od tohoto data;',
        '  3. vyčíslení případných částek, které považujete za dlužné, s uvedením ujednání, z něhož vyplývají.', '',
        'Nepřijmu žádné platby za období po uvedeném datu ukončení.'];
    },
    change: (k) => {
      const ch = (k.c.changes || []).slice(-1)[0];
      return ['Věc: výpověď smlouvy z důvodu jednostranné změny podmínek', '', 'Vážení,', '',
        `zjistil(a) jsem změnu podmínek smlouvy týkající se ${service(k)}`, `oproti podmínkám, které jsem přijal(a) dne ${orderDate(k)}.`, '',
        ch?.summary ? `Konkrétně: ${ch.summary}` : 'Změna se týká ceny nebo podmínek služby.', '',
        'Nové podmínky nepřijímám a smlouvu vypovídám s okamžitou účinností,',
        'bez sankcí a poplatků, protože změna byla provedena jednostranně', 'a nikoli na mou žádost.', '',
        'Žádám proto o:', '  1. písemné potvrzení ukončení smlouvy a jeho data;', '  2. ukončení všech plateb;',
        '  3. vrácení částek zaplacených za období po ukončení smlouvy.'];
    },
    identity: ({ you, c }) => [`Smluvní strana: ${you.name}`, `Adresa: ${you.address}`, `Kontaktní e-mail: ${you.email}`,
      `Zákaznické číslo / číslo smlouvy: ${you.customerId || '[doplňte]'}`,
      ...(c.url ? [`Uzavřeno přes: ${c.url}`] : []),
      ...(c.snapshot?.hash ? [`Otisk přijatých podmínek (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
    signature: ({ you, today }) => ['S pozdravem', '', you.name, '', 'Podpis _______________________', `Datum ${today}`].join('\n'),
    footer: (refs) => ['—', 'Užitečné právní odkazy:', ...refs.map((r) => `  · ${r}`), '',
      'Dokument vytvořený automaticky službou AnteFirma na základě analyzovaných podmínek.',
      'Před odesláním zkontrolujte údaje v hranatých závorkách. Nejde o právní poradenství.'].join('\n'),
    subject: { withdrawal: (p) => `Odstoupení od smlouvy — ${p}`, cancellation: (p) => `Výpověď smlouvy — ${p}`, change_withdrawal: (p) => `Výpověď po změně podmínek — ${p}` },
    refs: {
      withdrawal: ['Zákon č. 89/2012 Sb., občanský zákoník, § 1829–1837 — odstoupení od smlouvy uzavřené distančním způsobem',
        'Nařízení vlády č. 363/2013 Sb. — vzorový formulář pro odstoupení od smlouvy', 'Směrnice 2011/83/EU'],
      cancellation: ['Zákon č. 89/2012 Sb., občanský zákoník, § 1813–1815 — zakázaná ujednání ve spotřebitelských smlouvách',
        'Směrnice 93/13/EHS, příloha, bod 1 písm. h) — automatické prodloužení s nepřiměřeně časnou lhůtou'],
      change_withdrawal: ['Zákon č. 89/2012 Sb., občanský zákoník, § 1752 — změna obchodních podmínek a právo smlouvu vypovědět',
        'Směrnice 93/13/EHS, příloha, bod 1 písm. j) a l)'],
    },
  },

};

/**
 * Countries that share a letter language but not its laws: the text stays the
 * same, the references at the bottom change. Belgium has both a French and a
 * Dutch version. Every reference here, like those above, is marked for review
 * by a lawyer of that country before launch (antefirma-content, legal review).
 */
const COUNTRY_REFS = {
  'de-AT': {
    withdrawal: ['FAGG §§ 11-16 — Rücktrittsrecht bei Fernabsatzverträgen',
      'FAGG Anhang I Teil B — Muster-Widerrufsformular', 'Richtlinie 2011/83/EU'],
    cancellation: ['KSchG § 6 Abs. 1 Z 2 — stillschweigende Verlängerung nur mit Hinweis und angemessener Frist',
      'KSchG § 15 — Kündigung von Dauerschuldverhältnissen'],
    change_withdrawal: ['KSchG § 6 Abs. 1 Z 5 und Abs. 2 Z 3 — einseitige Preis- und Leistungsänderungen',
      'Richtlinie 93/13/EWG, Anhang Nr. 1 Buchst. j und l'],
  },
  'fr-BE': {
    withdrawal: ['Code de droit économique, art. VI.47 à VI.53 — droit de rétractation dans les contrats à distance',
      'Code de droit économique, annexe 2 au livre VI — formulaire de rétractation', 'Directive 2011/83/UE'],
    cancellation: ['Code de droit économique, art. VI.82 et VI.83 — clauses abusives (durée et prorogation tacite)'],
    change_withdrawal: ['Code de droit économique, art. VI.83, 1° et 3° — modification unilatérale du prix et des conditions',
      'Directive 93/13/CEE, annexe, point 1 j) et l)'],
  },
  'nl-BE': {
    withdrawal: ['Wetboek van economisch recht, art. VI.47 tot VI.53 — herroepingsrecht bij overeenkomsten op afstand',
      'Wetboek van economisch recht, bijlage 2 bij boek VI — modelformulier voor herroeping', 'Richtlijn 2011/83/EU'],
    cancellation: ['Wetboek van economisch recht, art. VI.82 en VI.83 — onrechtmatige bedingen (looptijd en stilzwijgende verlenging)'],
    change_withdrawal: ['Wetboek van economisch recht, art. VI.83, 1° en 3° — eenzijdige wijziging van prijs en voorwaarden',
      'Richtlijn 93/13/EEG, bijlage, punt 1 j) en l)'],
  },

};

const SENDING = {
  it: 'sendWayProvesDateCertifiedEmail', es: 'sendWayProvesDateBurofaxRegistered', en: 'sendWayProvesDateRecordedDelivery',
  de: 'sendWayProvesDateEinschreiben', fr: 'sendWayProvesDateLettreRecommandee', nl: 'sendWayProvesDateAangetekend',
  pl: 'sendWayProvesDateListPolecony', pt: 'sendWayProvesDateCartaRegistada', sv: 'sendWayProvesDateRekommenderat',
  ro: 'sendWayProvesDateScrisoareRecomandata', cs: 'sendWayProvesDateDoporucenyDopis',
};

/** The advice next to the letter: in the user's language, with the sending method of the letter's country. */
function checklistFor(kind, c, lang, variant = lang) {
  const list = [
    t('fillFieldsSquareBracketsProviderAddress'),
    t(SENDING[lang] || SENDING.it),
    t('keepProofSendingTogetherSnapshotTerms'),
  ];
  if (kind === LETTER_KINDS.WITHDRAWAL) list.unshift(t('checkWithin14DaysConcludingContract'));
  // Germany and France require an online cancellation path for contracts made online.
  if (kind !== LETTER_KINDS.WITHDRAWAL && variant === 'de') list.push(t('germanySitesMustOfferCancelButton'));
  if (kind !== LETTER_KINDS.WITHDRAWAL && variant === 'fr') list.push(t('franceSitesMustOfferOnlineCancellation'));
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

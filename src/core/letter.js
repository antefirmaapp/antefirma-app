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
import { LANGS, localeOf } from './languages.js';
import { TEXT } from './letters/index.js';

/**
 * The letter's language is the provider's, not the extension's: Italian for
 * Italy, Spanish for Spain, German for Germany and Austria, French for France,
 * Dutch for the Netherlands, French or Dutch for Belgium (the user's language
 * decides), Polish for Poland, Portuguese for Portugal, Swedish for Sweden,
 * Romanian for Romania, Czech for the Czech Republic, Danish for Denmark,
 * Finnish for Finland, Norwegian (Bokmål) for Norway, Slovak for Slovakia,
 * Hungarian for Hungary, Greek for Greece, English elsewhere. Each with its country's laws and habits (PEC,
 * burofax, Einschreiben, lettre recommandée, aangetekende brief). A variant
 * such as 'de-AT' is the same text with the other country's laws. Dates and
 * amounts follow the variant's locale.
 */
export const LETTER_LANGS = LANGS;
export const LETTER_VARIANTS = [...LETTER_LANGS, 'de-AT', 'fr-BE', 'nl-BE', 'en-IE', 'en-MT', 'el-CY', 'fr-LU', 'de-LU'];
// A country variant ('de-AT', 'el-CY') is already a locale; a language takes the interface's.
const localeFor = (variant) => localeOf(variant) || variant;
const BY_COUNTRY = { IT: 'it', ES: 'es', DE: 'de', AT: 'de-AT', FR: 'fr', NL: 'nl', PL: 'pl', PT: 'pt', SE: 'sv', RO: 'ro', CZ: 'cs', DK: 'da', FI: 'fi', NO: 'no', SK: 'sk', HU: 'hu', GR: 'el', IE: 'en-IE', MT: 'en-MT', CY: 'el-CY', HR: 'hr', SI: 'sl', BG: 'bg', LT: 'lt', LV: 'lv', EE: 'et' };
// Belgium and Luxembourg have more than one language: the letter follows the person's own.
export const letterLangFor = (jurisdiction, uiLang = '') => {
  if (jurisdiction === 'BE') return uiLang === 'nl' ? 'nl-BE' : 'fr-BE';
  if (jurisdiction === 'LU') return uiLang === 'de' ? 'de-LU' : 'fr-LU';
  return BY_COUNTRY[jurisdiction] || 'en';
};

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
  da: { withdrawal: 'fortrydelse', cancellation: 'opsigelse', change_withdrawal: 'opsigelse-efter-aendring' },
  fi: { withdrawal: 'peruuttaminen', cancellation: 'irtisanominen', change_withdrawal: 'irtisanominen-muutoksen-vuoksi' },
  no: { withdrawal: 'angrerett', cancellation: 'oppsigelse', change_withdrawal: 'oppsigelse-etter-endring' },
  sk: { withdrawal: 'odstupenie', cancellation: 'vypoved', change_withdrawal: 'vypoved-po-zmene' },
  hu: { withdrawal: 'elallas', cancellation: 'felmondas', change_withdrawal: 'felmondas-modositas-miatt' },
  el: { withdrawal: 'yparaxorisi', cancellation: 'kataggelia', change_withdrawal: 'kataggelia-meta-allagi' },
  hr: { withdrawal: 'jednostrani-raskid', cancellation: 'otkaz', change_withdrawal: 'raskid-zbog-promjene' },
  sl: { withdrawal: 'odstop', cancellation: 'odpoved', change_withdrawal: 'odpoved-po-spremembi' },
  bg: { withdrawal: 'otkaz', cancellation: 'prekratyavane', change_withdrawal: 'prekratyavane-sled-promyana' },
  lt: { withdrawal: 'atsisakymas', cancellation: 'nutraukimas', change_withdrawal: 'nutraukimas-del-pakeitimu' },
  lv: { withdrawal: 'atteikums', cancellation: 'uzteikums', change_withdrawal: 'uzteikums-pec-izmainam' },
  et: { withdrawal: 'taganemine', cancellation: 'ulesutlemine', change_withdrawal: 'ulesutlemine-muudatuse-tottu' },
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
  const fmt = { date: (d) => fd(d, localeFor(variant)), money: (a, c) => fm(a, c, localeFor(variant)) };
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
  'en-IE': {
    withdrawal: ['Consumer Rights Act 2022, Part 3 — cancellation of distance contracts within 14 days',
      'Directive 2011/83/EU, Annex I, Part B — model withdrawal form', 'Directive 2011/83/EU'],
    cancellation: ['Consumer Rights Act 2022, Part 4 and Schedule 3 — unfair terms (automatic extension, long notice)'],
    change_withdrawal: ['Consumer Rights Act 2022, Schedule 3 — unilateral change of price or terms',
      'Directive 93/13/EEC, Annex, points 1(j) and (l)'],
  },
  'en-MT': {
    withdrawal: ['Consumer Rights Regulations (S.L. 378.17) — right of withdrawal from distance contracts',
      'Directive 2011/83/EU, Annex I, Part B — model withdrawal form', 'Directive 2011/83/EU'],
    cancellation: ['Consumer Affairs Act (Cap. 378), arts. 44–47 — unfair terms (automatic extension, long notice)'],
    change_withdrawal: ['Consumer Affairs Act (Cap. 378), arts. 44–47 — unilateral change of price or terms',
      'Directive 93/13/EEC, Annex, points 1(j) and (l)'],
  },
  'el-CY': {
    withdrawal: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή) — δικαίωμα υπαναχώρησης από συμβάσεις εξ αποστάσεως',
      'Οδηγία 2011/83/ΕΕ, παράρτημα I, μέρος Β — υπόδειγμα εντύπου υπαναχώρησης', 'Οδηγία 2011/83/ΕΕ'],
    cancellation: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή) — καταχρηστικές ρήτρες (σιωπηρή ανανέωση, μεγάλη προθεσμία)'],
    change_withdrawal: ['Ν. 112(I)/2021 (περί Προστασίας του Καταναλωτή) — μονομερής αλλαγή τιμής ή όρων',
      'Οδηγία 93/13/ΕΟΚ, παράρτημα, σημείο 1 στοιχεία ι) και ιβ)'],
  },
  'fr-LU': {
    withdrawal: ['Code de la consommation (Luxembourg), art. L. 222-9 et suivants — droit de rétractation dans les contrats à distance',
      'Directive 2011/83/UE, annexe I, partie B — formulaire de rétractation', 'Directive 2011/83/UE'],
    cancellation: ['Code de la consommation (Luxembourg), art. L. 211-2 et L. 211-3 — clauses abusives (reconduction tacite, préavis)'],
    change_withdrawal: ['Code de la consommation (Luxembourg), art. L. 211-3 — modification unilatérale du prix et des conditions',
      'Directive 93/13/CEE, annexe, point 1 j) et l)'],
  },
  'de-LU': {
    withdrawal: ['Code de la consommation (Luxemburg), Art. L. 222-9 ff. — Widerrufsrecht bei Fernabsatzverträgen',
      'Richtlinie 2011/83/EU, Anhang I Teil B — Muster-Widerrufsformular', 'Richtlinie 2011/83/EU'],
    cancellation: ['Code de la consommation (Luxemburg), Art. L. 211-2 und L. 211-3 — missbräuchliche Klauseln (stillschweigende Verlängerung, Kündigungsfrist)'],
    change_withdrawal: ['Code de la consommation (Luxemburg), Art. L. 211-3 — einseitige Preis- und Leistungsänderungen',
      'Richtlinie 93/13/EWG, Anhang Nr. 1 Buchst. j und l'],
  },
};

const SENDING = {
  it: 'sendWayProvesDateCertifiedEmail', es: 'sendWayProvesDateBurofaxRegistered', en: 'sendWayProvesDateRecordedDelivery',
  de: 'sendWayProvesDateEinschreiben', fr: 'sendWayProvesDateLettreRecommandee', nl: 'sendWayProvesDateAangetekend',
  pl: 'sendWayProvesDateListPolecony', pt: 'sendWayProvesDateCartaRegistada', sv: 'sendWayProvesDateRekommenderat',
  ro: 'sendWayProvesDateScrisoareRecomandata', cs: 'sendWayProvesDateDoporucenyDopis', da: 'sendWayProvesDateAnbefaletBrev',
  fi: 'sendWayProvesDateKirjattuKirje', no: 'sendWayProvesDateRekommandertBrev',
  sk: 'sendWayProvesDateDoporucenyList', hu: 'sendWayProvesDateTertivevenyes', el: 'sendWayProvesDateSystimeni',
  hr: 'sendWayProvesDatePreporucenoPismo', sl: 'sendWayProvesDatePriporocenoPismo', bg: 'sendWayProvesDatePreporachanoPismo',
  lt: 'sendWayProvesDateRegistruotasLaiskas', lv: 'sendWayProvesDateIerakstitaVestule', et: 'sendWayProvesDateTahitudKiri',
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

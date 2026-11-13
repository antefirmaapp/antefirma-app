/**
 * The letters in "de": see ../letter.js for how they are put together.
 *
 * Germany: BGB. Austria uses the same texts with its own laws (see COUNTRY_REFS).
 * "Ordentlich und fristgerecht zum nächstmöglichen Zeitpunkt" is the standard
 * phrase: it holds even when the exact end date is unknown.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
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
};

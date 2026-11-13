/**
 * The letters in "nl": see ../letter.js for how they are put together.
 *
 * The Netherlands: Burgerlijk Wetboek. Flemish Belgium uses the same texts with its own laws.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
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
};

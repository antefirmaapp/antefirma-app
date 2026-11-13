/**
 * The letters in "da": see ../letter.js for how they are put together.
 *
 * Denmark: Consumer Contracts Act (forbrugeraftaleloven) and the Contracts Act (aftaleloven).
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[For- og efternavn]', address: '[Adresse]', email: '[E-mail]', provider: '[Udbyder]', service: '[beskrivelse af tjenesten]', date: '[dato]' },
  estimated: (x) => `(anslået forpligtelse ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Til: ${provider}`,
    '[Udbyderens adresse / e-mail angivet i vilkårene]', '', `Sted og dato: ______________, ${today}`, '',
    'Sendt med: ☐ anbefalet brev med kvittering   ☐ onlineformular   ☐ e-mail'].join('\n'),
  withdrawal: (k) => ['Vedrørende: udnyttelse af fortrydelsesretten', '', 'Hej,', '',
    'jeg meddeler hermed, at jeg fortryder aftalen om',
    `tjenesten ${service(k)}, indgået den ${orderDate(k)}.`, '',
    'Jeg udnytter fortrydelsesretten for aftaler indgået ved fjernsalg, inden for fjorten dage',
    'fra aftalens indgåelse, uden begrundelse og uden omkostninger.', '', 'Jeg beder derfor om:',
    '  1. at tjenesten og alle tilknyttede opkrævninger ophører straks;',
    '  2. tilbagebetaling af alle modtagne betalinger senest fjorten dage efter modtagelsen',
    '     af denne meddelelse, med samme betalingsmiddel;', '  3. skriftlig bekræftelse på modtagelsen af denne meddelelse.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Vedrørende: opsigelse af aftalen — ingen automatisk fornyelse', '', 'Hej,', '',
      `jeg opsiger hermed aftalen om ${service(k)},`, `indgået den ${orderDate(k)}.`, '',
      renewal ? `Opsigelsen sker, for at aftalen ikke fornyes den ${renewal},`
        : 'Opsigelsen sker, for at aftalen ikke fornyes automatisk ved periodens udløb,',
      notice ? `med det opsigelsesvarsel på ${notice} dage, der står i vilkårene${deadline ? ` (sidste dag: ${deadline})` : ''}.`
        : 'med det opsigelsesvarsel, der står i aftalens vilkår.', '',
      'Jeg beder derfor om:', '  1. skriftlig bekræftelse på modtagelsen af opsigelsen og datoen for dens virkning;',
      '  2. at alle opkrævninger ophører fra den dato;',
      '  3. en specifikation af eventuelle beløb, I mener er skyldige, med det aftalevilkår, de bygger på.', '',
      'Jeg accepterer ingen opkrævninger for perioder efter den angivne ophørsdato.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Vedrørende: ophævelse af aftalen på grund af ensidig ændring af vilkårene', '', 'Hej,', '',
      `jeg har bemærket en ændring af vilkårene i aftalen om ${service(k)}`, `i forhold til de vilkår, jeg accepterede den ${orderDate(k)}.`, '',
      ch?.summary ? `Navnlig: ${ch.summary}` : 'Ændringen vedrører prisen eller vilkårene for tjenesten.', '',
      'Da jeg ikke accepterer de nye vilkår, opsiger jeg aftalen med øjeblikkelig virkning,',
      'uden gebyrer eller omkostninger, da ændringen er foretaget ensidigt', 'og ikke på min anmodning.', '',
      'Jeg beder derfor om:', '  1. skriftlig bekræftelse på aftalens ophør og datoen herfor;', '  2. at alle opkrævninger ophører;',
      '  3. tilbagebetaling af beløb betalt for perioder efter ophøret.'];
  },
  identity: ({ you, c }) => [`Aftalepart: ${you.name}`, `Adresse: ${you.address}`, `Kontakt-e-mail: ${you.email}`,
    `Kunde- / aftalenummer: ${you.customerId || '[udfyldes]'}`,
    ...(c.url ? [`Indgået via: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Fingeraftryk af accepterede vilkår (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Med venlig hilsen', '', you.name, '', 'Underskrift _______________________', `Dato ${today}`].join('\n'),
  footer: (refs) => ['—', 'Nyttige retsregler:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument genereret automatisk af AnteFirma ud fra de analyserede vilkår.',
    'Tjek oplysningerne i kantede parenteser, før du sender. Dette er ikke juridisk rådgivning.'].join('\n'),
  subject: { withdrawal: (p) => `Udnyttelse af fortrydelsesretten — ${p}`, cancellation: (p) => `Opsigelse af aftalen — ${p}`, change_withdrawal: (p) => `Ophævelse efter ændrede vilkår — ${p}` },
  refs: {
    withdrawal: ['Forbrugeraftaleloven, §§ 17–24 — fortrydelsesret ved fjernsalgsaftaler',
      'Forbrugeraftaleloven, bilag 2 — standardfortrydelsesformular', 'Direktiv 2011/83/EU'],
    cancellation: ['Aftaleloven, §§ 36 og 38 c — urimelige aftalevilkår i forbrugeraftaler',
      'Direktiv 93/13/EØF, bilag, punkt 1 h — automatisk fornyelse med urimeligt tidlig frist'],
    change_withdrawal: ['Aftaleloven, §§ 36 og 38 c — ensidig ændring af pris eller vilkår',
      'Direktiv 93/13/EØF, bilag, punkt 1 j og l'],
  },
};

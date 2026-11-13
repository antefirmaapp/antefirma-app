/**
 * The letters in "no": see ../letter.js for how they are put together.
 *
 * Norway (EEA): Right of Withdrawal Act (angrerettloven), Contracts Act § 36 and Marketing Control Act § 22.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[For- og etternavn]', address: '[Adresse]', email: '[E-post]', provider: '[Leverandør]', service: '[beskrivelse av tjenesten]', date: '[dato]' },
  estimated: (x) => `(anslått forpliktelse ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Til: ${provider}`,
    '[Leverandørens adresse / e-post oppgitt i vilkårene]', '', `Sted og dato: ______________, ${today}`, '',
    'Sendt med: ☐ rekommandert brev med mottakskvittering   ☐ nettskjema   ☐ e-post'].join('\n'),
  withdrawal: (k) => ['Gjelder: bruk av angreretten', '', 'Hei,', '',
    'jeg meddeler herved at jeg går fra avtalen om',
    `tjenesten ${service(k)}, inngått ${orderDate(k)}.`, '',
    'Jeg bruker angreretten for avtaler inngått ved fjernsalg, innen fjorten dager',
    'fra avtalen ble inngått, uten å oppgi grunn og uten kostnader.', '', 'Jeg ber derfor om:',
    '  1. at tjenesten og alle tilknyttede belastninger opphører straks;',
    '  2. tilbakebetaling av alle mottatte betalinger senest fjorten dager etter at',
    '     denne meldingen er mottatt, med samme betalingsmiddel;', '  3. skriftlig bekreftelse på at denne meldingen er mottatt.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Gjelder: oppsigelse av avtalen — ingen automatisk fornyelse', '', 'Hei,', '',
      `jeg sier herved opp avtalen om ${service(k)},`, `inngått ${orderDate(k)}.`, '',
      renewal ? `Oppsigelsen gjøres for at avtalen ikke skal fornyes ${renewal},`
        : 'Oppsigelsen gjøres for at avtalen ikke skal fornyes automatisk når perioden utløper,',
      notice ? `med den oppsigelsestiden på ${notice} dager som står i vilkårene${deadline ? ` (siste dag: ${deadline})` : ''}.`
        : 'med den oppsigelsestiden som står i avtalens vilkår.', '',
      'Jeg ber derfor om:', '  1. skriftlig bekreftelse på at oppsigelsen er mottatt, og fra hvilken dato den gjelder;',
      '  2. at alle belastninger opphører fra den datoen;',
      '  3. en spesifikasjon av eventuelle beløp dere mener er skyldige, med avtalevilkåret de bygger på.', '',
      'Jeg godtar ingen belastninger for perioder etter den oppgitte sluttdatoen.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Gjelder: oppsigelse av avtalen på grunn av ensidig endring av vilkårene', '', 'Hei,', '',
      `jeg har merket meg en endring av vilkårene i avtalen om ${service(k)}`, `sammenlignet med vilkårene jeg godtok ${orderDate(k)}.`, '',
      ch?.summary ? `Særlig: ${ch.summary}` : 'Endringen gjelder prisen eller vilkårene for tjenesten.', '',
      'Siden jeg ikke godtar de nye vilkårene, sier jeg opp avtalen med umiddelbar virkning,',
      'uten gebyrer eller kostnader, fordi endringen er gjort ensidig', 'og ikke på min forespørsel.', '',
      'Jeg ber derfor om:', '  1. skriftlig bekreftelse på at avtalen er avsluttet, og datoen for dette;', '  2. at alle belastninger opphører;',
      '  3. tilbakebetaling av beløp betalt for perioder etter avslutningen.'];
  },
  identity: ({ you, c }) => [`Avtalepart: ${you.name}`, `Adresse: ${you.address}`, `Kontakt-e-post: ${you.email}`,
    `Kunde- / avtalenummer: ${you.customerId || '[fylles ut]'}`,
    ...(c.url ? [`Inngått via: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Fingeravtrykk av godtatte vilkår (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Med vennlig hilsen', '', you.name, '', 'Signatur _______________________', `Dato ${today}`].join('\n'),
  footer: (refs) => ['—', 'Nyttige rettsregler:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument generert automatisk av AnteFirma ut fra de analyserte vilkårene.',
    'Sjekk opplysningene i hakeparentes før du sender. Dette er ikke juridisk rådgivning.'].join('\n'),
  subject: { withdrawal: (p) => `Bruk av angreretten — ${p}`, cancellation: (p) => `Oppsigelse av avtalen — ${p}`, change_withdrawal: (p) => `Oppsigelse etter endrede vilkår — ${p}` },
  refs: {
    withdrawal: ['Angrerettloven, §§ 20–26 — angrerett ved fjernsalg',
      'Angrerettloven, vedlegg — standard angrerettskjema', 'Direktiv 2011/83/EU (EØS)'],
    cancellation: ['Avtaleloven, § 36 — urimelige avtalevilkår',
      'Markedsføringsloven, § 22 — urimelige avtalevilkår i forbrukerforhold'],
    change_withdrawal: ['Avtaleloven, § 36, og markedsføringsloven, § 22 — ensidig endring av pris eller vilkår',
      'Direktiv 93/13/EØF, vedlegg, punkt 1 j og l'],
  },
};

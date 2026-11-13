/**
 * The letters in "hr": see ../letter.js for how they are put together.
 *
 * Croatia: Consumer Protection Act (Zakon o zaštiti potrošača, NN 19/22). Croatian long dates end with
 * a full stop ("15. kolovoza 2026."), so dates stay inside brackets and never close a sentence.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Ime i prezime]', address: '[Adresa]', email: '[E-pošta]', provider: '[Pružatelj]', service: '[opis usluge]', date: '[datum]' },
  estimated: (x) => `(procijenjena obveza ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Primatelj: ${provider}`,
    '[Adresa / e-pošta pružatelja navedena u uvjetima]', '', `Mjesto i datum: ______________, ${today}`, '',
    'Poslano: ☐ preporučenom pošiljkom s povratnicom   ☐ internetskim obrascem   ☐ e-poštom'].join('\n'),
  withdrawal: (k) => ['Predmet: jednostrani raskid ugovora', '', 'Poštovani,', '',
    'ovime vas obavješćujem da jednostrano raskidam ugovor o usluzi',
    `${service(k)} (sklopljen: ${orderDate(k)}).`, '',
    'Koristim pravo na jednostrani raskid ugovora sklopljenog na daljinu u roku od četrnaest dana',
    'od njegova sklapanja, bez navođenja razloga i bez ikakvih troškova.', '', 'Stoga tražim:',
    '  1. trenutačni prestanak pružanja usluge i svih povezanih terećenja;',
    '  2. povrat svih izvršenih plaćanja najkasnije u roku od četrnaest dana od primitka',
    '     ove obavijesti, istim načinom plaćanja;', '  3. pisanu potvrdu primitka ove obavijesti.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Predmet: otkaz ugovora — bez automatskog obnavljanja', '', 'Poštovani,', '',
      `ovime otkazujem ugovor o usluzi ${service(k)}`, `(sklopljen: ${orderDate(k)}).`, '',
      renewal ? `Otkaz dajem kako se ugovor ne bi automatski obnovio (datum obnove: ${renewal}),`
        : 'Otkaz dajem kako se ugovor ne bi automatski obnovio na kraju razdoblja,',
      notice ? `uz poštivanje otkaznog roka od ${notice} dana navedenog u uvjetima${deadline ? ` (posljednji dan: ${deadline})` : ''}.`
        : 'uz poštivanje otkaznog roka navedenog u ugovornim uvjetima.', '',
      'Stoga tražim:', '  1. pisanu potvrdu primitka otkaza i datuma njegova stupanja na snagu;',
      '  2. prestanak svih terećenja od tog datuma;',
      '  3. specifikaciju eventualnih iznosa koje smatrate dugovanima, uz navođenje ugovorne odredbe na kojoj se temelje.', '',
      'Ne prihvaćam nikakva terećenja za razdoblja nakon navedenog datuma prestanka.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Predmet: raskid ugovora zbog jednostrane promjene uvjeta', '', 'Poštovani,', '',
      `utvrdio/utvrdila sam da se ugovor o usluzi ${service(k)} promijenio`, `u odnosu na uvjete koje sam prihvatio/prihvatila (${orderDate(k)}).`, '',
      ch?.summary ? `Konkretno: ${ch.summary}` : 'Promjena se odnosi na cijenu ili uvjete usluge.', '',
      'Budući da ne prihvaćam nove uvjete, raskidam ugovor s trenutačnim učinkom,',
      'bez naknada i troškova, jer je promjena izvršena jednostrano', 'i ne na moj zahtjev.', '',
      'Stoga tražim:', '  1. pisanu potvrdu prestanka ugovora i njegova datuma;', '  2. prestanak svih terećenja;',
      '  3. povrat iznosa plaćenih za razdoblja nakon prestanka ugovora.'];
  },
  identity: ({ you, c }) => [`Ugovorna strana: ${you.name}`, `Adresa: ${you.address}`, `Kontaktna e-pošta: ${you.email}`,
    `Broj korisnika / ugovora: ${you.customerId || '[upisati]'}`,
    ...(c.url ? [`Sklopljen putem: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Otisak prihvaćenih uvjeta (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['S poštovanjem,', '', you.name, '', 'Potpis _______________________', `Datum: ${today}`].join('\n'),
  footer: (refs) => ['—', 'Korisni propisi:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument je automatski izradila AnteFirma na temelju analiziranih uvjeta.',
    'Prije slanja provjerite podatke u uglatim zagradama. Ovo nije pravni savjet.'].join('\n'),
  subject: { withdrawal: (p) => `Jednostrani raskid ugovora — ${p}`, cancellation: (p) => `Otkaz ugovora — ${p}`, change_withdrawal: (p) => `Raskid zbog promjene uvjeta — ${p}` },
  refs: {
    withdrawal: ['Zakon o zaštiti potrošača (NN 19/22) — pravo na jednostrani raskid ugovora sklopljenog na daljinu',
      'Direktiva 2011/83/EU, Prilog I. dio B — obrazac za jednostrani raskid', 'Direktiva 2011/83/EU'],
    cancellation: ['Zakon o zaštiti potrošača (NN 19/22) — nepoštene ugovorne odredbe',
      'Direktiva 93/13/EEZ, Prilog, točka 1. podtočka (h) — automatsko produljenje s nerazumno ranim rokom'],
    change_withdrawal: ['Zakon o zaštiti potrošača (NN 19/22) — jednostrana promjena cijene ili uvjeta',
      'Direktiva 93/13/EEZ, Prilog, točka 1. podtočke (j) i (l)'],
  },
};

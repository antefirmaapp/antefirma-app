/**
 * The letters in "sl": see ../letter.js for how they are put together.
 *
 * Slovenia: Consumer Protection Act (Zakon o varstvu potrošnikov, ZVPot-1).
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Ime in priimek]', address: '[Naslov]', email: '[E-pošta]', provider: '[Ponudnik]', service: '[opis storitve]', date: '[datum]' },
  estimated: (x) => `(ocenjena obveznost ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Naslovnik: ${provider}`,
    '[Naslov / e-pošta ponudnika, naveden v pogojih]', '', `Kraj in datum: ______________, ${today}`, '',
    'Poslano: ☐ s priporočenim pismom s povratnico   ☐ s spletnim obrazcem   ☐ po e-pošti'].join('\n'),
  withdrawal: (k) => ['Zadeva: odstop od pogodbe', '', 'Spoštovani,', '',
    's tem vas obveščam, da odstopam od pogodbe o storitvi',
    `${service(k)}, sklenjene ${orderDate(k)}.`, '',
    'Uveljavljam pravico do odstopa od pogodbe, sklenjene na daljavo, v roku štirinajstih dni',
    'od njene sklenitve, brez navedbe razloga in brez kakršnih koli stroškov.', '', 'Zato zahtevam:',
    '  1. takojšnjo prekinitev storitve in vseh povezanih bremenitev;',
    '  2. vračilo vseh opravljenih plačil najpozneje v štirinajstih dneh od prejema',
    '     tega obvestila, na enak način, kot so bila plačana;', '  3. pisno potrdilo o prejemu tega obvestila.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Zadeva: odpoved pogodbe — brez samodejnega podaljšanja', '', 'Spoštovani,', '',
      `s tem odpovedujem pogodbo o storitvi ${service(k)},`, `sklenjeno ${orderDate(k)}.`, '',
      renewal ? `Odpoved podajam, da se pogodba ${renewal} ne podaljša,`
        : 'Odpoved podajam, da se pogodba ob koncu obdobja samodejno ne podaljša,',
      notice ? `ob upoštevanju odpovednega roka ${notice} dni, navedenega v pogojih${deadline ? ` (zadnji dan: ${deadline})` : ''}.`
        : 'ob upoštevanju odpovednega roka, navedenega v pogodbenih pogojih.', '',
      'Zato zahtevam:', '  1. pisno potrdilo o prejemu odpovedi in datumu, ko začne učinkovati;',
      '  2. prenehanje vseh bremenitev od tega datuma;',
      '  3. specifikacijo morebitnih zneskov, ki jih štejete za dolgovane, z navedbo pogodbenega določila, na katerem temeljijo.', '',
      'Ne sprejemam nobenih bremenitev za obdobja po navedenem datumu prenehanja.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Zadeva: prekinitev pogodbe zaradi enostranske spremembe pogojev', '', 'Spoštovani,', '',
      `ugotovil(a) sem, da se je pogodba o storitvi ${service(k)} spremenila`, `glede na pogoje, ki sem jih sprejel(a) ${orderDate(k)}.`, '',
      ch?.summary ? `Konkretno: ${ch.summary}` : 'Sprememba zadeva ceno ali pogoje storitve.', '',
      'Ker novih pogojev ne sprejemam, pogodbo odpovedujem s takojšnjim učinkom,',
      'brez nadomestil in stroškov, saj je bila sprememba izvedena enostransko', 'in ne na mojo zahtevo.', '',
      'Zato zahtevam:', '  1. pisno potrdilo o prenehanju pogodbe in njegovem datumu;', '  2. prenehanje vseh bremenitev;',
      '  3. vračilo zneskov, plačanih za obdobja po prenehanju pogodbe.'];
  },
  identity: ({ you, c }) => [`Pogodbena stranka: ${you.name}`, `Naslov: ${you.address}`, `Kontaktna e-pošta: ${you.email}`,
    `Številka stranke / pogodbe: ${you.customerId || '[izpolniti]'}`,
    ...(c.url ? [`Sklenjena prek: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Prstni odtis sprejetih pogojev (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Lep pozdrav,', '', you.name, '', 'Podpis _______________________', `Datum: ${today}`].join('\n'),
  footer: (refs) => ['—', 'Koristni predpisi:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument je samodejno pripravila AnteFirma na podlagi analiziranih pogojev.',
    'Pred pošiljanjem preverite podatke v oglatih oklepajih. To ni pravni nasvet.'].join('\n'),
  subject: { withdrawal: (p) => `Odstop od pogodbe — ${p}`, cancellation: (p) => `Odpoved pogodbe — ${p}`, change_withdrawal: (p) => `Prekinitev zaradi spremembe pogojev — ${p}` },
  refs: {
    withdrawal: ['Zakon o varstvu potrošnikov (ZVPot-1) — pravica do odstopa od pogodbe, sklenjene na daljavo',
      'Direktiva 2011/83/EU, Priloga I, del B — obrazec za odstop od pogodbe', 'Direktiva 2011/83/EU'],
    cancellation: ['Zakon o varstvu potrošnikov (ZVPot-1) — nedopustni pogodbeni pogoji',
      'Direktiva 93/13/EGS, Priloga, točka 1(h) — samodejno podaljšanje z nerazumno zgodnjim rokom'],
    change_withdrawal: ['Zakon o varstvu potrošnikov (ZVPot-1) — enostranska sprememba cene ali pogojev',
      'Direktiva 93/13/EGS, Priloga, točka 1(j) in (l)'],
  },
};

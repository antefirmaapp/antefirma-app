/**
 * The letters in "lt": see ../letter.js for how they are put together.
 *
 * Lithuania: Civil Code (Civilinis kodeksas), art. 6.228¹⁰ (withdrawal) and 6.188 (unfair terms).
 * Lithuanian long dates end with "d." ("2026 m. rugpjūčio 15 d."), so dates stay inside brackets.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Vardas ir pavardė]', address: '[Adresas]', email: '[El. paštas]', provider: '[Paslaugų teikėjas]', service: '[paslaugos aprašymas]', date: '[data]' },
  estimated: (x) => `(įvertintas įsipareigojimas ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Kam: ${provider}`,
    '[Paslaugų teikėjo adresas / sąlygose nurodytas el. paštas]', '', `Vieta ir data: ______________, ${today}`, '',
    'Išsiųsta: ☐ registruotu laišku su įteikimo patvirtinimu   ☐ internetine forma   ☐ el. paštu'].join('\n'),
  withdrawal: (k) => ['Dėl: sutarties atsisakymo', '', 'Gerbiamieji,', '',
    'šiuo pranešu, kad atsisakau paslaugos sutarties',
    `${service(k)} (sudaryta: ${orderDate(k)}).`, '',
    'Pasinaudoju teise atsisakyti nuotolinės sutarties per keturiolika dienų',
    'nuo jos sudarymo, nenurodydamas (-a) priežasties ir be jokių išlaidų.', '', 'Todėl prašau:',
    '  1. nedelsiant nutraukti paslaugos teikimą ir visus susijusius mokėjimus;',
    '  2. grąžinti visas sumokėtas sumas ne vėliau kaip per keturiolika dienų nuo šio pranešimo',
    '     gavimo, tuo pačiu mokėjimo būdu;', '  3. raštu patvirtinti, kad šį pranešimą gavote.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Dėl: sutarties nutraukimo — be automatinio pratęsimo', '', 'Gerbiamieji,', '',
      `šiuo nutraukiu paslaugos sutartį ${service(k)}`, `(sudaryta: ${orderDate(k)}).`, '',
      renewal ? `Nutraukiu ją, kad sutartis nebūtų automatiškai pratęsta (pratęsimo data: ${renewal}),`
        : 'Nutraukiu ją, kad sutartis nebūtų automatiškai pratęsta pasibaigus laikotarpiui,',
      notice ? `laikydamasis (-i) sąlygose nurodyto ${notice} d. įspėjimo termino${deadline ? ` (paskutinė diena: ${deadline})` : ''}.`
        : 'laikydamasis (-i) sutarties sąlygose nurodyto įspėjimo termino.', '',
      'Todėl prašau:', '  1. raštu patvirtinti nutraukimo gavimą ir datą, nuo kurios jis įsigalioja;',
      '  2. nuo tos datos nutraukti visus mokėjimus;',
      '  3. nurodyti sumas, kurias laikote mokėtinomis, ir sutarties sąlygą, kuria jos grindžiamos.', '',
      'Nesutinku su jokiais mokėjimais už laikotarpius po nurodytos pabaigos datos.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Dėl: sutarties nutraukimo dėl vienašalio sąlygų pakeitimo', '', 'Gerbiamieji,', '',
      `nustačiau, kad paslaugos sutartis ${service(k)} pasikeitė`, `palyginti su sąlygomis, su kuriomis sutikau (${orderDate(k)}).`, '',
      ch?.summary ? `Konkrečiai: ${ch.summary}` : 'Pakeitimas susijęs su paslaugos kaina ar sąlygomis.', '',
      'Kadangi nesutinku su naujomis sąlygomis, nutraukiu sutartį nedelsiant,',
      'be netesybų ir išlaidų, nes pakeitimas padarytas vienašališkai', 'ir ne mano prašymu.', '',
      'Todėl prašau:', '  1. raštu patvirtinti sutarties pabaigą ir jos datą;', '  2. nutraukti visus mokėjimus;',
      '  3. grąžinti sumas, sumokėtas už laikotarpius po sutarties pabaigos.'];
  },
  identity: ({ you, c }) => [`Sutarties šalis: ${you.name}`, `Adresas: ${you.address}`, `Kontaktinis el. paštas: ${you.email}`,
    `Kliento / sutarties numeris: ${you.customerId || '[įrašyti]'}`,
    ...(c.url ? [`Sudaryta per: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Priimtų sąlygų atspaudas (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Pagarbiai', '', you.name, '', 'Parašas _______________________', `Data: ${today}`].join('\n'),
  footer: (refs) => ['—', 'Naudingi teisės aktai:', ...refs.map((r) => `  · ${r}`), '',
    'Dokumentą automatiškai parengė AnteFirma pagal išanalizuotas sąlygas.',
    'Prieš siųsdami patikrinkite duomenis laužtiniuose skliaustuose. Tai ne teisinė konsultacija.'].join('\n'),
  subject: { withdrawal: (p) => `Sutarties atsisakymas — ${p}`, cancellation: (p) => `Sutarties nutraukimas — ${p}`, change_withdrawal: (p) => `Nutraukimas dėl sąlygų pakeitimo — ${p}` },
  refs: {
    withdrawal: ['Civilinis kodeksas, 6.228¹⁰ str. — teisė atsisakyti nuotolinės sutarties',
      'Direktyva 2011/83/ES, I priedo B dalis — sutarties atsisakymo formos pavyzdys', 'Direktyva 2011/83/ES'],
    cancellation: ['Civilinis kodeksas, 6.188 str. — nesąžiningos vartojimo sutarčių sąlygos',
      'Direktyva 93/13/EEB, priedas, 1 punkto h papunktis — automatinis pratęsimas su nepagrįstai ankstyvu terminu'],
    change_withdrawal: ['Civilinis kodeksas, 6.188 str. — vienašalis kainos ar sąlygų keitimas',
      'Direktyva 93/13/EEB, priedas, 1 punkto j ir l papunkčiai'],
  },
};

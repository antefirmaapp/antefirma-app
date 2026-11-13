/**
 * The letters in "hu": see ../letter.js for how they are put together.
 *
 * Hungary: Government Decree 45/2014 (II. 26.) and Civil Code (Ptk.) 6:102–6:104 §.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Teljes név]', address: '[Cím]', email: '[E-mail]', provider: '[Szolgáltató]', service: '[a szolgáltatás leírása]', date: '[dátum]' },
  estimated: (x) => `(becsült kötelezettség: ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Címzett: ${provider}`,
    '[A szolgáltató címe / a feltételekben megadott e-mail-cím]', '', `Kelt: ______________, ${today}`, '',
    'Küldés módja: ☐ tértivevényes ajánlott levél   ☐ online űrlap   ☐ e-mail'].join('\n'),
  withdrawal: (k) => ['Tárgy: elállási jog gyakorlása', '', 'Tisztelt Hölgyem/Uram!', '',
    'Ezúton bejelentem, hogy elállok a következő szolgáltatásra',
    `vonatkozó szerződéstől: ${service(k)} (megkötve: ${orderDate(k)}).`, '',
    'A távollévők között kötött szerződésekre vonatkozó elállási jogomat a szerződés',
    'megkötésétől számított tizennégy napon belül, indoklás nélkül és költségmentesen gyakorlom.', '', 'Ezért kérem:',
    '  1. a szolgáltatás és minden kapcsolódó terhelés azonnali megszüntetését;',
    '  2. valamennyi befizetett összeg visszatérítését legkésőbb az e nyilatkozat',
    '     kézhezvételétől számított tizennégy napon belül, az eredeti fizetési móddal;', '  3. e nyilatkozat kézhezvételének írásbeli visszaigazolását.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Tárgy: a szerződés felmondása — automatikus megújítás nélkül', '', 'Tisztelt Hölgyem/Uram!', '',
      `Ezúton felmondom a következőre vonatkozó szerződést: ${service(k)}`, `(megkötve: ${orderDate(k)}).`, '',
      renewal ? `A felmondás célja, hogy a szerződés ${renewal} napján ne újuljon meg,`
        : 'A felmondás célja, hogy a szerződés az időszak végén ne újuljon meg automatikusan,',
      notice ? `a feltételekben meghatározott ${notice} napos felmondási idő betartásával${deadline ? ` (utolsó nap: ${deadline})` : ''}.`
        : 'a szerződési feltételekben meghatározott felmondási idő betartásával.', '',
      'Ezért kérem:', '  1. a felmondás kézhezvételének és hatálybalépése napjának írásbeli visszaigazolását;',
      '  2. minden terhelés megszüntetését ettől a naptól;',
      '  3. az esetlegesen követelt összegek részletezését, annak a szerződési kikötésnek a megjelölésével, amelyen alapulnak.', '',
      'A megjelölt megszűnési időpontot követő időszakra semmilyen terhelést nem fogadok el.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Tárgy: a szerződés megszüntetése a feltételek egyoldalú módosítása miatt', '', 'Tisztelt Hölgyem/Uram!', '',
      `Észleltem, hogy a következőre vonatkozó szerződés megváltozott: ${service(k)},`, `a ${orderDate(k)} napján elfogadott feltételekhez képest.`, '',
      ch?.summary ? `Konkrétan: ${ch.summary}` : 'A módosítás a szolgáltatás árát vagy feltételeit érinti.', '',
      'Mivel az új feltételeket nem fogadom el, a szerződést azonnali hatállyal felmondom,',
      'kötbér és költségek nélkül, mivel a módosítás egyoldalúan', 'és nem az én kérésemre történt.', '',
      'Ezért kérem:', '  1. a szerződés megszűnésének és időpontjának írásbeli visszaigazolását;', '  2. minden terhelés megszüntetését;',
      '  3. a megszűnést követő időszakokra befizetett összegek visszatérítését.'];
  },
  identity: ({ you, c }) => [`Szerződő fél: ${you.name}`, `Cím: ${you.address}`, `Kapcsolattartási e-mail: ${you.email}`,
    `Ügyfél- / szerződésszám: ${you.customerId || '[kitöltendő]'}`,
    ...(c.url ? [`Megkötés helye: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Az elfogadott feltételek ujjlenyomata (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Tisztelettel:', '', you.name, '', 'Aláírás _______________________', `Dátum: ${today}`].join('\n'),
  footer: (refs) => ['—', 'Hasznos jogszabályok:', ...refs.map((r) => `  · ${r}`), '',
    'A dokumentumot az AnteFirma automatikusan készítette az elemzett feltételek alapján.',
    'Elküldés előtt ellenőrizd a szögletes zárójelben lévő adatokat. Ez nem jogi tanácsadás.'].join('\n'),
  subject: { withdrawal: (p) => `Elállási jog gyakorlása — ${p}`, cancellation: (p) => `A szerződés felmondása — ${p}`, change_withdrawal: (p) => `Megszüntetés a feltételek módosítása miatt — ${p}` },
  refs: {
    withdrawal: ['45/2014. (II. 26.) Korm. rendelet, 20–23. § — elállási jog távollévők között kötött szerződésnél',
      '45/2014. (II. 26.) Korm. rendelet, 2. melléklet — elállási nyilatkozatminta', '2011/83/EU irányelv'],
    cancellation: ['Ptk. 6:102–6:104. § — tisztességtelen általános szerződési feltételek',
      '93/13/EGK irányelv, melléklet, 1. pont h) — automatikus megújítás ésszerűtlenül korai határidővel'],
    change_withdrawal: ['Ptk. 6:104. § — az ár vagy a feltételek egyoldalú módosítása',
      '93/13/EGK irányelv, melléklet, 1. pont j) és l)'],
  },
};

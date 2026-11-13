/**
 * The letters in "sk": see ../letter.js for how they are put together.
 *
 * Slovakia: Consumer Protection Act (zákon č. 108/2024 Z. z.) and Civil Code § 53.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Meno a priezvisko]', address: '[Adresa]', email: '[E-mail]', provider: '[Poskytovateľ]', service: '[opis služby]', date: '[dátum]' },
  estimated: (x) => `(odhadovaný záväzok ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Adresát: ${provider}`,
    '[Adresa / e-mail poskytovateľa uvedený v podmienkach]', '', `Miesto a dátum: ______________, ${today}`, '',
    'Odoslané: ☐ doporučeným listom s doručenkou   ☐ online formulárom   ☐ e-mailom'].join('\n'),
  withdrawal: (k) => ['Vec: odstúpenie od zmluvy', '', 'Vážení,', '',
    'týmto oznamujem, že odstupujem od zmluvy, ktorej predmetom je',
    `služba ${service(k)}, uzavretej ${orderDate(k)}.`, '',
    'Uplatňujem právo na odstúpenie od zmluvy uzavretej na diaľku v lehote štrnástich dní',
    'od jej uzavretia, bez uvedenia dôvodu a bez akýchkoľvek nákladov.', '', 'Preto žiadam:',
    '  1. okamžité ukončenie služby a všetkých súvisiacich platieb;',
    '  2. vrátenie všetkých prijatých platieb najneskôr do štrnástich dní od doručenia',
    '     tohto oznámenia, rovnakým spôsobom, akým boli zaplatené;', '  3. písomné potvrdenie doručenia tohto oznámenia.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Vec: výpoveď zmluvy — bez automatického predĺženia', '', 'Vážení,', '',
      `týmto vypovedám zmluvu, ktorej predmetom je ${service(k)},`, `uzavretú ${orderDate(k)}.`, '',
      renewal ? `Výpoveď podávam, aby sa zmluva nepredĺžila ${renewal},`
        : 'Výpoveď podávam, aby sa zmluva po uplynutí obdobia automaticky nepredĺžila,',
      notice ? `s dodržaním výpovednej lehoty ${notice} dní uvedenej v podmienkach${deadline ? ` (posledný deň: ${deadline})` : ''}.`
        : 's dodržaním výpovednej lehoty uvedenej v zmluvných podmienkach.', '',
      'Preto žiadam:', '  1. písomné potvrdenie doručenia výpovede a dátumu jej účinnosti;',
      '  2. ukončenie všetkých platieb od tohto dátumu;',
      '  3. vyčíslenie prípadných súm, ktoré považujete za dlžné, s uvedením ustanovenia zmluvy, z ktorého vyplývajú.', '',
      'Nesúhlasím so žiadnymi platbami za obdobia po uvedenom dátume skončenia.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Vec: ukončenie zmluvy pre jednostrannú zmenu podmienok', '', 'Vážení,', '',
      `zistil(a) som zmenu zmluvy, ktorej predmetom je ${service(k)},`, `oproti podmienkam, ktoré som prijal(a) ${orderDate(k)}.`, '',
      ch?.summary ? `Konkrétne: ${ch.summary}` : 'Zmena sa týka ceny alebo podmienok služby.', '',
      'Keďže s novými podmienkami nesúhlasím, zmluvu vypovedám s okamžitou účinnosťou,',
      'bez sankcií a nákladov, pretože zmena bola vykonaná jednostranne', 'a nie na moju žiadosť.', '',
      'Preto žiadam:', '  1. písomné potvrdenie skončenia zmluvy a jeho dátumu;', '  2. ukončenie všetkých platieb;',
      '  3. vrátenie súm zaplatených za obdobia po skončení zmluvy.'];
  },
  identity: ({ you, c }) => [`Zmluvná strana: ${you.name}`, `Adresa: ${you.address}`, `Kontaktný e-mail: ${you.email}`,
    `Zákaznícke číslo / číslo zmluvy: ${you.customerId || '[doplniť]'}`,
    ...(c.url ? [`Uzavretá prostredníctvom: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Odtlačok prijatých podmienok (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['S pozdravom', '', you.name, '', 'Podpis _______________________', `Dátum ${today}`].join('\n'),
  footer: (refs) => ['—', 'Užitočné právne predpisy:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument automaticky vytvorený aplikáciou AnteFirma na základe analyzovaných podmienok.',
    'Pred odoslaním skontrolujte údaje v hranatých zátvorkách. Nejde o právne poradenstvo.'].join('\n'),
  subject: { withdrawal: (p) => `Odstúpenie od zmluvy — ${p}`, cancellation: (p) => `Výpoveď zmluvy — ${p}`, change_withdrawal: (p) => `Ukončenie pre zmenu podmienok — ${p}` },
  refs: {
    withdrawal: ['Zákon č. 108/2024 Z. z. o ochrane spotrebiteľa — právo na odstúpenie od zmluvy uzavretej na diaľku',
      'Zákon č. 108/2024 Z. z., príloha — vzorový formulár na odstúpenie od zmluvy', 'Smernica 2011/83/EÚ'],
    cancellation: ['Občiansky zákonník, § 53 — neprijateľné podmienky v spotrebiteľských zmluvách',
      'Smernica 93/13/EHS, príloha, bod 1 písm. h — automatické predĺženie s neprimerane skorou lehotou'],
    change_withdrawal: ['Občiansky zákonník, § 53 — jednostranná zmena ceny alebo podmienok',
      'Smernica 93/13/EHS, príloha, bod 1 písm. j a l'],
  },
};

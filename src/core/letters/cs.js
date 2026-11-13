/**
 * The letters in "cs": see ../letter.js for how they are put together.
 *
 * Czech Republic: the Civil Code (Act 89/2012) on distance contracts and consumer terms.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Jméno a příjmení]', address: '[Adresa]', email: '[E-mail]', provider: '[Poskytovatel]', service: '[popis služby]', date: '[datum]' },
  estimated: (x) => `(odhadovaný závazek ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Komu: ${provider}`,
    '[Adresa poskytovatele / e-mail uvedený v podmínkách]', '', `Místo a datum: ______________, ${today}`, '',
    'Odesláno: ☐ doporučeným dopisem s dodejkou   ☐ datovou schránkou   ☐ online formulářem   ☐ e-mailem'].join('\n'),
  withdrawal: (k) => ['Věc: odstoupení od smlouvy', '', 'Vážení,', '',
    'tímto oznamuji, že odstupuji od smlouvy o poskytování',
    `služby ${service(k)}, uzavřené dne ${orderDate(k)}.`, '',
    'Využívám práva odstoupit od smlouvy uzavřené distančním způsobem ve lhůtě čtrnácti dnů',
    'od jejího uzavření, bez uvedení důvodu a bez nákladů.', '', 'Žádám proto o:',
    '  1. okamžité ukončení služby a všech souvisejících plateb;',
    '  2. vrácení všech přijatých plateb do čtrnácti dnů od doručení',
    '     tohoto oznámení, stejným platebním prostředkem;', '  3. písemné potvrzení přijetí tohoto oznámení.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Věc: výpověď smlouvy — bez automatického prodloužení', '', 'Vážení,', '',
      `tímto vypovídám smlouvu týkající se ${service(k)},`, `uzavřenou dne ${orderDate(k)}.`, '',
      renewal ? `Výpověď podávám, aby se smlouva neprodloužila dne ${renewal},`
        : 'Výpověď podávám, aby se smlouva po skončení období automaticky neprodloužila,',
      notice ? `s dodržením výpovědní lhůty ${notice} dnů stanovené v podmínkách${deadline ? ` (poslední den: ${deadline})` : ''}.`
        : 's dodržením výpovědní lhůty stanovené v podmínkách smlouvy.', '',
      'Žádám proto o:', '  1. písemné potvrzení přijetí výpovědi a data její účinnosti;',
      '  2. ukončení všech plateb od tohoto data;',
      '  3. vyčíslení případných částek, které považujete za dlužné, s uvedením ujednání, z něhož vyplývají.', '',
      'Nepřijmu žádné platby za období po uvedeném datu ukončení.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Věc: výpověď smlouvy z důvodu jednostranné změny podmínek', '', 'Vážení,', '',
      `zjistil(a) jsem změnu podmínek smlouvy týkající se ${service(k)}`, `oproti podmínkám, které jsem přijal(a) dne ${orderDate(k)}.`, '',
      ch?.summary ? `Konkrétně: ${ch.summary}` : 'Změna se týká ceny nebo podmínek služby.', '',
      'Nové podmínky nepřijímám a smlouvu vypovídám s okamžitou účinností,',
      'bez sankcí a poplatků, protože změna byla provedena jednostranně', 'a nikoli na mou žádost.', '',
      'Žádám proto o:', '  1. písemné potvrzení ukončení smlouvy a jeho data;', '  2. ukončení všech plateb;',
      '  3. vrácení částek zaplacených za období po ukončení smlouvy.'];
  },
  identity: ({ you, c }) => [`Smluvní strana: ${you.name}`, `Adresa: ${you.address}`, `Kontaktní e-mail: ${you.email}`,
    `Zákaznické číslo / číslo smlouvy: ${you.customerId || '[doplňte]'}`,
    ...(c.url ? [`Uzavřeno přes: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Otisk přijatých podmínek (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['S pozdravem', '', you.name, '', 'Podpis _______________________', `Datum ${today}`].join('\n'),
  footer: (refs) => ['—', 'Užitečné právní odkazy:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument vytvořený automaticky službou AnteFirma na základě analyzovaných podmínek.',
    'Před odesláním zkontrolujte údaje v hranatých závorkách. Nejde o právní poradenství.'].join('\n'),
  subject: { withdrawal: (p) => `Odstoupení od smlouvy — ${p}`, cancellation: (p) => `Výpověď smlouvy — ${p}`, change_withdrawal: (p) => `Výpověď po změně podmínek — ${p}` },
  refs: {
    withdrawal: ['Zákon č. 89/2012 Sb., občanský zákoník, § 1829–1837 — odstoupení od smlouvy uzavřené distančním způsobem',
      'Nařízení vlády č. 363/2013 Sb. — vzorový formulář pro odstoupení od smlouvy', 'Směrnice 2011/83/EU'],
    cancellation: ['Zákon č. 89/2012 Sb., občanský zákoník, § 1813–1815 — zakázaná ujednání ve spotřebitelských smlouvách',
      'Směrnice 93/13/EHS, příloha, bod 1 písm. h) — automatické prodloužení s nepřiměřeně časnou lhůtou'],
    change_withdrawal: ['Zákon č. 89/2012 Sb., občanský zákoník, § 1752 — změna obchodních podmínek a právo smlouvu vypovědět',
      'Směrnice 93/13/EHS, příloha, bod 1 písm. j) a l)'],
  },
};

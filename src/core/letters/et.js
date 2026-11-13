/**
 * The letters in "et": see ../letter.js for how they are put together.
 *
 * Estonia: Law of Obligations Act (võlaõigusseadus), §§ 53–56 (withdrawal) and §§ 42–44 (unfair standard terms).
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Ees- ja perekonnanimi]', address: '[Aadress]', email: '[E-post]', provider: '[Teenusepakkuja]', service: '[teenuse kirjeldus]', date: '[kuupäev]' },
  estimated: (x) => `(hinnanguline kohustus ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Saaja: ${provider}`,
    '[Teenusepakkuja aadress / tingimustes märgitud e-post]', '', `Koht ja kuupäev: ______________, ${today}`, '',
    'Saadetud: ☐ tähitud kirjaga väljastusteatega   ☐ veebivormiga   ☐ e-postiga'].join('\n'),
  withdrawal: (k) => ['Teema: lepingust taganemine', '', 'Lugupeetud pakkuja', '',
    'Käesolevaga teatan, et taganen teenuse lepingust',
    `${service(k)}, mis on sõlmitud ${orderDate(k)}.`, '',
    'Kasutan õigust taganeda kauglepingust neljateistkümne päeva jooksul',
    'selle sõlmimisest, põhjust esitamata ja ilma kuludeta.', '', 'Seetõttu palun:',
    '  1. lõpetada viivitamata teenuse osutamine ja kõik sellega seotud maksed;',
    '  2. tagastada kõik makstud summad hiljemalt neljateistkümne päeva jooksul käesoleva teate',
    '     kättesaamisest, sama makseviisiga;', '  3. kinnitada kirjalikult käesoleva teate kättesaamist.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Teema: lepingu ülesütlemine — ilma automaatse pikendamiseta', '', 'Lugupeetud pakkuja', '',
      `Käesolevaga ütlen üles teenuse lepingu ${service(k)},`, `mis on sõlmitud ${orderDate(k)}.`, '',
      renewal ? `Ütlen lepingu üles, et see ei pikeneks ${renewal},`
        : 'Ütlen lepingu üles, et see ei pikeneks perioodi lõpus automaatselt,',
      notice ? `järgides tingimustes ette nähtud ${notice}-päevast etteteatamistähtaega${deadline ? ` (viimane päev: ${deadline})` : ''}.`
        : 'järgides lepingutingimustes ette nähtud etteteatamistähtaega.', '',
      'Seetõttu palun:', '  1. kinnitada kirjalikult ülesütlemise kättesaamist ja selle jõustumise kuupäeva;',
      '  2. lõpetada sellest kuupäevast kõik maksed;',
      '  3. märkida summad, mida peate tasumisele kuuluvaks, koos lepingutingimusega, millel need põhinevad.', '',
      'Ma ei nõustu ühegi maksega pärast märgitud lõppkuupäeva järgnevate perioodide eest.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Teema: lepingu lõpetamine tingimuste ühepoolse muutmise tõttu', '', 'Lugupeetud pakkuja', '',
      `Tuvastasin, et teenuse leping ${service(k)} on muutunud`, `võrreldes tingimustega, millega nõustusin ${orderDate(k)}.`, '',
      ch?.summary ? `Täpsemalt: ${ch.summary}` : 'Muudatus puudutab teenuse hinda või tingimusi.', '',
      'Kuna ma uute tingimustega ei nõustu, lõpetan lepingu viivitamata,',
      'ilma leppetrahvi ja kuludeta, sest muudatus tehti ühepoolselt', 'ja mitte minu soovil.', '',
      'Seetõttu palun:', '  1. kinnitada kirjalikult lepingu lõppemist ja selle kuupäeva;', '  2. lõpetada kõik maksed;',
      '  3. tagastada summad, mis on makstud lepingu lõppemise järgsete perioodide eest.'];
  },
  identity: ({ you, c }) => [`Lepingupool: ${you.name}`, `Aadress: ${you.address}`, `Kontakt-e-post: ${you.email}`,
    `Kliendi- / lepingunumber: ${you.customerId || '[täita]'}`,
    ...(c.url ? [`Sõlmitud kaudu: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Aktsepteeritud tingimuste sõrmejälg (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Lugupidamisega', '', you.name, '', 'Allkiri _______________________', `Kuupäev: ${today}`].join('\n'),
  footer: (refs) => ['—', 'Kasulikud õigusaktid:', ...refs.map((r) => `  · ${r}`), '',
    'Dokumendi koostas automaatselt AnteFirma analüüsitud tingimuste põhjal.',
    'Enne saatmist kontrollige nurksulgudes andmeid. See ei ole õigusnõu.'].join('\n'),
  subject: { withdrawal: (p) => `Lepingust taganemine — ${p}`, cancellation: (p) => `Lepingu ülesütlemine — ${p}`, change_withdrawal: (p) => `Lõpetamine tingimuste muutmise tõttu — ${p}` },
  refs: {
    withdrawal: ['Võlaõigusseadus, §§ 53–56 — kauglepingust taganemise õigus',
      'Direktiiv 2011/83/EL, I lisa B osa — taganemisavalduse näidisvorm', 'Direktiiv 2011/83/EL'],
    cancellation: ['Võlaõigusseadus, §§ 42–44 — ebamõistlikult kahjustavad tüüptingimused',
      'Direktiiv 93/13/EMÜ, lisa, punkt 1 alapunkt h — automaatne pikenemine ebamõistlikult varase tähtajaga'],
    change_withdrawal: ['Võlaõigusseadus, § 42 — hinna või tingimuste ühepoolne muutmine',
      'Direktiiv 93/13/EMÜ, lisa, punkt 1 alapunktid j ja l'],
  },
};

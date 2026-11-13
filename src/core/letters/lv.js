/**
 * The letters in "lv": see ../letter.js for how they are put together.
 *
 * Latvia: Consumer Rights Protection Law (Patērētāju tiesību aizsardzības likums) and Cabinet Regulation No. 255.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Vārds un uzvārds]', address: '[Adrese]', email: '[E-pasts]', provider: '[Pakalpojuma sniedzējs]', service: '[pakalpojuma apraksts]', date: '[datums]' },
  estimated: (x) => `(novērtētās saistības ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Adresāts: ${provider}`,
    '[Pakalpojuma sniedzēja adrese / noteikumos norādītais e-pasts]', '', `Vieta un datums: ______________, ${today}`, '',
    'Nosūtīts: ☐ ierakstītā vēstulē ar paziņojumu par saņemšanu   ☐ tiešsaistes veidlapā   ☐ pa e-pastu'].join('\n'),
  withdrawal: (k) => ['Par: atteikumu no līguma', '', 'Godātie kungi un kundzes!', '',
    'Ar šo paziņoju, ka atsakos no pakalpojuma līguma',
    `${service(k)}, kas noslēgts ${orderDate(k)}.`, '',
    'Izmantoju tiesības atteikties no distances līguma četrpadsmit dienu laikā',
    'kopš tā noslēgšanas, nenorādot iemeslu un bez jebkādām izmaksām.', '', 'Tāpēc lūdzu:',
    '  1. nekavējoties pārtraukt pakalpojuma sniegšanu un visus saistītos maksājumus;',
    '  2. atmaksāt visas samaksātās summas ne vēlāk kā četrpadsmit dienu laikā pēc šī paziņojuma',
    '     saņemšanas, izmantojot to pašu maksājuma veidu;', '  3. rakstiski apstiprināt šī paziņojuma saņemšanu.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Par: līguma uzteikumu — bez automātiskas pagarināšanas', '', 'Godātie kungi un kundzes!', '',
      `Ar šo uzteicu pakalpojuma līgumu ${service(k)},`, `kas noslēgts ${orderDate(k)}.`, '',
      renewal ? `Uzteicu to, lai līgums netiktu pagarināts ${renewal},`
        : 'Uzteicu to, lai līgums netiktu automātiski pagarināts perioda beigās,',
      notice ? `ievērojot noteikumos paredzēto ${notice} dienu uzteikuma termiņu${deadline ? ` (pēdējā diena: ${deadline})` : ''}.`
        : 'ievērojot līguma noteikumos paredzēto uzteikuma termiņu.', '',
      'Tāpēc lūdzu:', '  1. rakstiski apstiprināt uzteikuma saņemšanu un datumu, kad tas stājas spēkā;',
      '  2. pārtraukt visus maksājumus no šī datuma;',
      '  3. norādīt summas, kuras uzskatāt par maksājamām, un līguma noteikumu, uz kuru tās balstās.', '',
      'Nepiekrītu nekādiem maksājumiem par periodiem pēc norādītā beigu datuma.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Par: līguma izbeigšanu vienpusēju noteikumu izmaiņu dēļ', '', 'Godātie kungi un kundzes!', '',
      `Esmu konstatējis(-usi), ka pakalpojuma līgums ${service(k)} ir mainīts`, `salīdzinājumā ar noteikumiem, kurus pieņēmu ${orderDate(k)}.`, '',
      ch?.summary ? `Konkrēti: ${ch.summary}` : 'Izmaiņas attiecas uz pakalpojuma cenu vai noteikumiem.', '',
      'Tā kā jaunajiem noteikumiem nepiekrītu, izbeidzu līgumu ar tūlītēju spēku,',
      'bez līgumsodiem un izmaksām, jo izmaiņas veiktas vienpusēji', 'un nevis pēc mana lūguma.', '',
      'Tāpēc lūdzu:', '  1. rakstiski apstiprināt līguma izbeigšanu un tās datumu;', '  2. pārtraukt visus maksājumus;',
      '  3. atmaksāt summas, kas samaksātas par periodiem pēc līguma izbeigšanas.'];
  },
  identity: ({ you, c }) => [`Līgumslēdzēja puse: ${you.name}`, `Adrese: ${you.address}`, `Kontaktu e-pasts: ${you.email}`,
    `Klienta / līguma numurs: ${you.customerId || '[jāaizpilda]'}`,
    ...(c.url ? [`Noslēgts, izmantojot: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Pieņemto noteikumu nospiedums (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Ar cieņu', '', you.name, '', 'Paraksts _______________________', `Datums: ${today}`].join('\n'),
  footer: (refs) => ['—', 'Noderīgi tiesību akti:', ...refs.map((r) => `  · ${r}`), '',
    'Dokumentu automātiski sagatavoja AnteFirma, pamatojoties uz analizētajiem noteikumiem.',
    'Pirms nosūtīšanas pārbaudiet datus kvadrātiekavās. Tas nav juridisks padoms.'].join('\n'),
  subject: { withdrawal: (p) => `Atteikums no līguma — ${p}`, cancellation: (p) => `Līguma uzteikums — ${p}`, change_withdrawal: (p) => `Izbeigšana noteikumu izmaiņu dēļ — ${p}` },
  refs: {
    withdrawal: ['Patērētāju tiesību aizsardzības likums, 12. pants — atteikuma tiesības distances līgumos',
      'MK noteikumi Nr. 255 «Noteikumi par distances līgumu» — atteikuma veidlapa', 'Direktīva 2011/83/ES'],
    cancellation: ['Patērētāju tiesību aizsardzības likums, 6. pants — netaisnīgi līguma noteikumi',
      'Direktīva 93/13/EEK, pielikums, 1. punkta h) apakšpunkts — automātiska pagarināšana ar nesamērīgi agru termiņu'],
    change_withdrawal: ['Patērētāju tiesību aizsardzības likums, 6. pants — vienpusēja cenas vai noteikumu maiņa',
      'Direktīva 93/13/EEK, pielikums, 1. punkta j) un l) apakšpunkts'],
  },
};

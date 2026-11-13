/**
 * The letters in "sv": see ../letter.js for how they are put together.
 *
 * Sweden: Distance Contracts Act (2005:59) and the Consumer Contract Terms Act (1994:1512).
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[För- och efternamn]', address: '[Adress]', email: '[E-post]', provider: '[Leverantör]', service: '[beskrivning av tjänsten]', date: '[datum]' },
  estimated: (x) => `(uppskattat åtagande ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Till: ${provider}`,
    '[Leverantörens adress / e-post som anges i villkoren]', '', `Ort och datum: ______________, ${today}`, '',
    'Skickat med: ☐ rekommenderat brev med mottagningsbevis   ☐ onlineformulär   ☐ e-post'].join('\n'),
  withdrawal: (k) => ['Ärende: utövande av ångerrätt', '', 'Hej,', '',
    'härmed meddelar jag att jag frånträder avtalet om',
    `tjänsten ${service(k)}, ingånget den ${orderDate(k)}.`, '',
    'Jag utövar ångerrätten för avtal som ingåtts på distans, inom fjorton dagar',
    'från det att avtalet ingicks, utan att ange skäl och utan kostnad.', '', 'Jag ber därför om:',
    '  1. att tjänsten och alla tillhörande debiteringar upphör omedelbart;',
    '  2. återbetalning av alla mottagna betalningar inom fjorton dagar från det att',
    '     detta meddelande mottagits, med samma betalningsmetod;', '  3. skriftlig bekräftelse på att detta meddelande har mottagits.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Ärende: uppsägning av avtalet — ingen automatisk förlängning', '', 'Hej,', '',
      `härmed säger jag upp avtalet om ${service(k)},`, `ingånget den ${orderDate(k)}.`, '',
      renewal ? `Uppsägningen görs för att avtalet inte ska förlängas den ${renewal},`
        : 'Uppsägningen görs för att avtalet inte ska förlängas automatiskt när perioden löper ut,',
      notice ? `med iakttagande av den uppsägningstid på ${notice} dagar som anges i villkoren${deadline ? ` (sista dag: ${deadline})` : ''}.`
        : 'med iakttagande av den uppsägningstid som anges i villkoren.', '',
      'Jag ber därför om:', '  1. skriftlig bekräftelse på att uppsägningen mottagits och från vilket datum den gäller;',
      '  2. att alla debiteringar upphör från det datumet;',
      '  3. en specifikation av eventuella belopp ni anser vara skyldiga, med det avtalsvillkor de grundar sig på.', '',
      'Jag godtar inga debiteringar för perioder efter det angivna slutdatumet.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Ärende: frånträde av avtalet på grund av ensidig ändring av villkoren', '', 'Hej,', '',
      `jag har noterat en ändring av villkoren i avtalet om ${service(k)}`, `jämfört med de villkor jag godkände den ${orderDate(k)}.`, '',
      ch?.summary ? `Särskilt: ${ch.summary}` : 'Ändringen gäller priset eller villkoren för tjänsten.', '',
      'Eftersom jag inte godtar de nya villkoren säger jag upp avtalet med omedelbar verkan,',
      'utan avgifter eller kostnader, eftersom ändringen gjorts ensidigt', 'och inte på min begäran.', '',
      'Jag ber därför om:', '  1. skriftlig bekräftelse på att avtalet upphört och från vilket datum;', '  2. att alla debiteringar upphör;',
      '  3. återbetalning av belopp som betalats för perioder efter att avtalet upphört.'];
  },
  identity: ({ you, c }) => [`Avtalspart: ${you.name}`, `Adress: ${you.address}`, `Kontakt-e-post: ${you.email}`,
    `Kund- / avtalsnummer: ${you.customerId || '[fyll i]'}`,
    ...(c.url ? [`Ingånget via: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Fingeravtryck av godkända villkor (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Med vänlig hälsning', '', you.name, '', 'Underskrift _______________________', `Datum ${today}`].join('\n'),
  footer: (refs) => ['—', 'Användbara rättsliga hänvisningar:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument skapat automatiskt av AnteFirma utifrån de analyserade villkoren.',
    'Kontrollera uppgifterna inom hakparentes innan du skickar. Detta är inte juridisk rådgivning.'].join('\n'),
  subject: { withdrawal: (p) => `Utövande av ångerrätt — ${p}`, cancellation: (p) => `Uppsägning av avtalet — ${p}`, change_withdrawal: (p) => `Frånträde efter ändrade villkor — ${p}` },
  refs: {
    withdrawal: ['Lag (2005:59) om distansavtal och avtal utanför affärslokaler, 2 kap. 10–15 §§ — ångerrätt vid distansavtal',
      'Direktiv 2011/83/EU, bilaga I del B — standardformulär för utövande av ångerrätt', 'Direktiv 2011/83/EU'],
    cancellation: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 § — oskäliga avtalsvillkor',
      'Direktiv 93/13/EEG, bilaga, punkt 1 h — automatisk förlängning med orimligt tidig uppsägningsfrist'],
    change_withdrawal: ['Lag (1994:1512) om avtalsvillkor i konsumentförhållanden, 11 § — ensidig ändring av pris eller villkor',
      'Direktiv 93/13/EEG, bilaga, punkt 1 j och l'],
  },
};

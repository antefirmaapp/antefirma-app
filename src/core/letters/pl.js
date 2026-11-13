/**
 * The letters in "pl": see ../letter.js for how they are put together.
 *
 * Poland: Ustawa o prawach konsumenta (2014) and the Civil Code on unfair terms.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Imię i nazwisko]', address: '[Adres]', email: '[E-mail]', provider: '[Dostawca]', service: '[opis usługi]', date: '[data]' },
  estimated: (x) => `(szacowane zobowiązanie ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Do: ${provider}`,
    '[Adres dostawcy / e-mail wskazany w regulaminie]', '', `Miejscowość i data: ______________, ${today}`, '',
    'Wysłano: ☐ listem poleconym za potwierdzeniem odbioru   ☐ formularzem online   ☐ e-mailem'].join('\n'),
  withdrawal: (k) => ['Dotyczy: odstąpienie od umowy', '', 'Szanowni Państwo,', '',
    'niniejszym informuję o odstąpieniu od umowy o świadczenie',
    `usługi ${service(k)}, zawartej dnia ${orderDate(k)}.`, '',
    'Korzystam z prawa odstąpienia od umowy zawartej na odległość, w terminie czternastu dni',
    'od jej zawarcia, bez podawania przyczyny i bez ponoszenia kosztów.', '', 'W związku z tym proszę o:',
    '  1. natychmiastowe zaprzestanie świadczenia usługi i wszelkich związanych z nią obciążeń;',
    '  2. zwrot wszystkich dokonanych płatności w terminie czternastu dni od otrzymania',
    '     niniejszego pisma, przy użyciu tego samego sposobu płatności;', '  3. pisemne potwierdzenie otrzymania niniejszego oświadczenia.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Dotyczy: wypowiedzenie umowy — brak automatycznego przedłużenia', '', 'Szanowni Państwo,', '',
      `niniejszym wypowiadam umowę dotyczącą ${service(k)},`, `zawartą dnia ${orderDate(k)}.`, '',
      renewal ? `Wypowiedzenie składam, aby umowa nie przedłużyła się z dniem ${renewal},`
        : 'Wypowiedzenie składam, aby umowa nie przedłużyła się automatycznie z końcem okresu,',
      notice ? `z zachowaniem przewidzianego w regulaminie ${notice}-dniowego okresu wypowiedzenia${deadline ? ` (ostatni dzień: ${deadline})` : ''}.`
        : 'z zachowaniem okresu wypowiedzenia przewidzianego w regulaminie.', '',
      'W związku z tym proszę o:', '  1. pisemne potwierdzenie otrzymania wypowiedzenia i daty jego skuteczności;',
      '  2. zaprzestanie wszelkich obciążeń od wskazanej daty;',
      '  3. wskazanie ewentualnych kwot uznanych za należne, wraz z postanowieniem umowy, z którego wynikają.', '',
      'Nie zaakceptuję żadnych obciążeń za okres po wskazanej dacie zakończenia umowy.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Dotyczy: wypowiedzenie umowy w związku z jednostronną zmianą warunków', '', 'Szanowni Państwo,', '',
      `zauważyłem zmianę warunków umowy dotyczącej ${service(k)}`, `w stosunku do warunków zaakceptowanych przeze mnie dnia ${orderDate(k)}.`, '',
      ch?.summary ? `W szczególności: ${ch.summary}` : 'Zmiana dotyczy ceny lub warunków świadczenia usługi.', '',
      'Nie akceptując nowych warunków, wypowiadam umowę ze skutkiem natychmiastowym,',
      'bez kar i opłat, ponieważ zmiana została wprowadzona jednostronnie,', 'a nie na moją prośbę.', '',
      'W związku z tym proszę o:', '  1. pisemne potwierdzenie rozwiązania umowy i daty jego skuteczności;', '  2. zaprzestanie wszelkich obciążeń;',
      '  3. zwrot kwot zapłaconych za okres po rozwiązaniu umowy.'];
  },
  identity: ({ you, c }) => [`Strona umowy: ${you.name}`, `Adres: ${you.address}`, `E-mail kontaktowy: ${you.email}`,
    `Numer klienta / umowy: ${you.customerId || '[do uzupełnienia]'}`,
    ...(c.url ? [`Zawarta przez: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Odcisk zaakceptowanych warunków (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Z poważaniem', '', you.name, '', 'Podpis _______________________', `Data ${today}`].join('\n'),
  footer: (refs) => ['—', 'Przydatne podstawy prawne:', ...refs.map((r) => `  · ${r}`), '',
    'Dokument wygenerowany automatycznie przez AnteFirma na podstawie przeanalizowanych warunków.',
    'Sprawdź dane w nawiasach kwadratowych przed wysłaniem. To nie jest porada prawna.'].join('\n'),
  subject: { withdrawal: (p) => `Odstąpienie od umowy — ${p}`, cancellation: (p) => `Wypowiedzenie umowy — ${p}`, change_withdrawal: (p) => `Wypowiedzenie po zmianie warunków — ${p}` },
  refs: {
    withdrawal: ['Ustawa z dnia 30 maja 2014 r. o prawach konsumenta, art. 27–38 — prawo odstąpienia od umowy zawartej na odległość',
      'Załącznik nr 2 do ustawy o prawach konsumenta — wzór formularza odstąpienia od umowy', 'Dyrektywa 2011/83/UE'],
    cancellation: ['Kodeks cywilny, art. 385¹–385³ — niedozwolone postanowienia umowne',
      'Dyrektywa 93/13/EWG, załącznik, pkt 1 lit. h) — automatyczne przedłużenie z nadmiernie wczesnym terminem'],
    change_withdrawal: ['Kodeks cywilny, art. 385³ pkt 19 i 20 — jednostronna zmiana umowy lub ceny',
      'Dyrektywa 93/13/EWG, załącznik, pkt 1 lit. j) i l)'],
  },
};

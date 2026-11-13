/**
 * The letters in "ro": see ../letter.js for how they are put together.
 *
 * Romania: GEO 34/2014 (distance contracts) and Law 193/2000 on unfair terms.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Nume și prenume]', address: '[Adresă]', email: '[E-mail]', provider: '[Furnizor]', service: '[descrierea serviciului]', date: '[data]' },
  estimated: (x) => `(angajament estimat ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Către: ${provider}`,
    '[Adresa furnizorului / e-mailul indicat în condiții]', '', `Localitatea și data: ______________, ${today}`, '',
    'Trimisă prin: ☐ scrisoare recomandată cu confirmare de primire   ☐ formular online   ☐ e-mail'].join('\n'),
  withdrawal: (k) => ['Subiect: exercitarea dreptului de retragere', '', 'Stimate doamne și stimați domni,', '',
    'prin prezenta vă notific retragerea din contractul de prestare',
    `a serviciului ${service(k)}, încheiat la data de ${orderDate(k)}.`, '',
    'Îmi exercit dreptul de retragere din contractele încheiate la distanță, în termen de paisprezece zile',
    'de la încheierea contractului, fără a invoca vreun motiv și fără costuri.', '', 'Vă solicit, prin urmare:',
    '  1. încetarea imediată a serviciului și a oricăror debitări aferente;',
    '  2. rambursarea tuturor plăților primite în termen de paisprezece zile de la primirea',
    '     prezentei notificări, prin aceeași metodă de plată;', '  3. confirmarea în scris a primirii prezentei notificări.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Subiect: denunțarea contractului — fără reînnoire automată', '', 'Stimate doamne și stimați domni,', '',
      `prin prezenta denunț contractul privind ${service(k)},`, `încheiat la data de ${orderDate(k)}.`, '',
      renewal ? `Denunțarea are scopul de a împiedica reînnoirea contractului la data de ${renewal},`
        : 'Denunțarea are scopul de a împiedica reînnoirea automată a contractului la expirarea perioadei,',
      notice ? `cu respectarea preavizului de ${notice} zile prevăzut în condiții${deadline ? ` (ultima zi: ${deadline})` : ''}.`
        : 'cu respectarea preavizului prevăzut în condițiile contractului.', '',
      'Vă solicit, prin urmare:', '  1. confirmarea în scris a primirii denunțării și a datei de la care produce efecte;',
      '  2. încetarea oricăror debitări de la acea dată;',
      '  3. detalierea eventualelor sume pe care le considerați datorate, cu clauza contractuală din care rezultă.', '',
      'Nu voi accepta nicio debitare pentru perioade ulterioare datei de încetare indicate.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Subiect: încetarea contractului ca urmare a modificării unilaterale a condițiilor', '', 'Stimate doamne și stimați domni,', '',
      `am constatat o modificare a condițiilor contractului privind ${service(k)},`, `față de cele acceptate de mine la data de ${orderDate(k)}.`, '',
      ch?.summary ? `În special: ${ch.summary}` : 'Modificarea privește prețul sau condițiile serviciului.', '',
      'Întrucât nu accept noile condiții, denunț contractul cu efect imediat,',
      'fără penalități sau costuri, deoarece modificarea a fost făcută unilateral', 'și nu la cererea mea.', '',
      'Vă solicit, prin urmare:', '  1. confirmarea în scris a încetării contractului și a datei acesteia;', '  2. încetarea oricăror debitări;',
      '  3. rambursarea sumelor plătite pentru perioade ulterioare încetării.'];
  },
  identity: ({ you, c }) => [`Titularul contractului: ${you.name}`, `Adresă: ${you.address}`, `E-mail de contact: ${you.email}`,
    `Număr de client / contract: ${you.customerId || '[de completat]'}`,
    ...(c.url ? [`Încheiat prin: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Amprenta condițiilor acceptate (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Cu stimă,', '', you.name, '', 'Semnătura _______________________', `Data ${today}`].join('\n'),
  footer: (refs) => ['—', 'Referințe legale utile:', ...refs.map((r) => `  · ${r}`), '',
    'Document generat automat de AnteFirma pe baza condițiilor analizate.',
    'Verifică datele dintre parantezele drepte înainte de trimitere. Nu constituie consultanță juridică.'].join('\n'),
  subject: { withdrawal: (p) => `Exercitarea dreptului de retragere — ${p}`, cancellation: (p) => `Denunțarea contractului — ${p}`, change_withdrawal: (p) => `Încetare după modificarea condițiilor — ${p}` },
  refs: {
    withdrawal: ['OUG nr. 34/2014, art. 9–16 — dreptul de retragere din contractele la distanță',
      'OUG nr. 34/2014, anexa nr. 2 — formularul tip de retragere', 'Directiva 2011/83/UE'],
    cancellation: ['Legea nr. 193/2000 privind clauzele abuzive, art. 4 și anexa — clauze abuzive',
      'Codul civil, art. 1203 — clauzele neuzuale din condițiile generale trebuie acceptate expres în scris'],
    change_withdrawal: ['Legea nr. 193/2000, anexa, lit. a) — modificarea unilaterală a clauzelor contractului',
      'Directiva 93/13/CEE, anexa, punctul 1 literele (j) și (l)'],
  },
};

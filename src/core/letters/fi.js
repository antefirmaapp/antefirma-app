/**
 * The letters in "fi": see ../letter.js for how they are put together.
 *
 * Finland: Consumer Protection Act (kuluttajansuojalaki 38/1978).
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Etu- ja sukunimi]', address: '[Osoite]', email: '[Sähköposti]', provider: '[Palveluntarjoaja]', service: '[palvelun kuvaus]', date: '[päivämäärä]' },
  estimated: (x) => `(arvioitu sitoumus ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Vastaanottaja: ${provider}`,
    '[Palveluntarjoajan osoite / ehdoissa ilmoitettu sähköposti]', '', `Paikka ja päivämäärä: ______________, ${today}`, '',
    'Lähetetty: ☐ kirjattuna kirjeenä vastaanottokuittauksella   ☐ verkkolomakkeella   ☐ sähköpostilla'].join('\n'),
  withdrawal: (k) => ['Asia: peruuttamisoikeuden käyttäminen', '', 'Hyvä vastaanottaja,', '',
    'ilmoitan täten peruuttavani sopimuksen, joka koskee',
    `palvelua ${service(k)} ja on tehty ${orderDate(k)}.`, '',
    'Käytän etäsopimuksiin liittyvää peruuttamisoikeutta neljäntoista päivän kuluessa',
    'sopimuksen tekemisestä, syytä ilmoittamatta ja ilman kuluja.', '', 'Pyydän siksi:',
    '  1. palvelun ja kaikkien siihen liittyvien veloitusten lopettamista välittömästi;',
    '  2. kaikkien vastaanotettujen maksujen palauttamista neljäntoista päivän kuluessa',
    '     tämän ilmoituksen vastaanottamisesta samalla maksutavalla;', '  3. kirjallista vahvistusta tämän ilmoituksen vastaanottamisesta.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Asia: sopimuksen irtisanominen — ei automaattista jatkumista', '', 'Hyvä vastaanottaja,', '',
      `irtisanon täten sopimuksen, joka koskee ${service(k)}`, `ja on tehty ${orderDate(k)}.`, '',
      renewal ? `Irtisanon sopimuksen, jotta se ei jatku ${renewal},`
        : 'Irtisanon sopimuksen, jotta se ei jatku automaattisesti kauden päättyessä,',
      notice ? `noudattaen ehdoissa mainittua ${notice} päivän irtisanomisaikaa${deadline ? ` (viimeinen päivä: ${deadline})` : ''}.`
        : 'noudattaen sopimusehdoissa mainittua irtisanomisaikaa.', '',
      'Pyydän siksi:', '  1. kirjallista vahvistusta irtisanomisen vastaanottamisesta ja sen voimaantulopäivästä;',
      '  2. kaikkien veloitusten lopettamista tuosta päivästä alkaen;',
      '  3. erittelyä mahdollisista summista, joita katsotte minun olevan velkaa, sekä sopimusehtoa, johon ne perustuvat.', '',
      'En hyväksy mitään veloituksia ilmoitetun päättymispäivän jälkeiseltä ajalta.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Asia: sopimuksen päättäminen ehtojen yksipuolisen muutoksen vuoksi', '', 'Hyvä vastaanottaja,', '',
      `olen havainnut muutoksen sopimuksessa, joka koskee ${service(k)},`, `verrattuna ehtoihin, jotka hyväksyin ${orderDate(k)}.`, '',
      ch?.summary ? `Erityisesti: ${ch.summary}` : 'Muutos koskee palvelun hintaa tai ehtoja.', '',
      'Koska en hyväksy uusia ehtoja, irtisanon sopimuksen päättymään välittömästi',
      'ilman seuraamuksia tai kuluja, sillä muutos on tehty yksipuolisesti', 'eikä minun pyynnöstäni.', '',
      'Pyydän siksi:', '  1. kirjallista vahvistusta sopimuksen päättymisestä ja sen päivämäärästä;', '  2. kaikkien veloitusten lopettamista;',
      '  3. päättymisen jälkeiseltä ajalta maksettujen summien palauttamista.'];
  },
  identity: ({ you, c }) => [`Sopimusosapuoli: ${you.name}`, `Osoite: ${you.address}`, `Yhteyssähköposti: ${you.email}`,
    `Asiakas- / sopimusnumero: ${you.customerId || '[täydennä]'}`,
    ...(c.url ? [`Tehty osoitteessa: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Hyväksyttyjen ehtojen sormenjälki (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Ystävällisin terveisin', '', you.name, '', 'Allekirjoitus _______________________', `Päivämäärä ${today}`].join('\n'),
  footer: (refs) => ['—', 'Hyödyllisiä oikeuslähteitä:', ...refs.map((r) => `  · ${r}`), '',
    'AnteFirman analysoitujen ehtojen perusteella automaattisesti laatima asiakirja.',
    'Tarkista hakasulkeissa olevat tiedot ennen lähettämistä. Tämä ei ole oikeudellista neuvontaa.'].join('\n'),
  subject: { withdrawal: (p) => `Peruuttamisoikeuden käyttäminen — ${p}`, cancellation: (p) => `Sopimuksen irtisanominen — ${p}`, change_withdrawal: (p) => `Päättäminen ehtojen muutoksen vuoksi — ${p}` },
  refs: {
    withdrawal: ['Kuluttajansuojalaki (38/1978), 6 luku 14–16 § — peruuttamisoikeus etämyynnissä',
      'Kuluttajansuojalaki, 6 luku — peruuttamislomakkeen malli', 'Direktiivi 2011/83/EU'],
    cancellation: ['Kuluttajansuojalaki, 3 luku 1 § ja 4 luku 1 § — kohtuuttomat sopimusehdot',
      'Direktiivi 93/13/ETY, liite, 1 kohdan h alakohta — automaattinen jatkuminen kohtuuttoman aikaisella määräajalla'],
    change_withdrawal: ['Kuluttajansuojalaki, 3 luku 1 § ja 4 luku 1 § — hinnan tai ehtojen yksipuolinen muuttaminen',
      'Direktiivi 93/13/ETY, liite, 1 kohdan j ja l alakohta'],
  },
};

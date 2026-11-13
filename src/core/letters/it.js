/**
 * The letters in "it": see ../letter.js for how they are put together.
 *
 * Follows the model withdrawal form of Annex I, part B, of the Italian Consumer Code.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Nome e cognome]', address: '[Indirizzo]', email: '[Email]', provider: '[Fornitore]', service: '[descrizione del servizio]', date: '[data]' },
  estimated: (x) => `(impegno stimato ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Spett.le ${provider}`,
    '[Indirizzo del fornitore / PEC / email indicata nelle condizioni]', '', `Luogo e data: ______________, ${today}`, '',
    'Trasmessa a mezzo: ☐ PEC   ☐ raccomandata A/R   ☐ modulo online   ☐ email'].join('\n'),
  withdrawal: (k) => ['Oggetto: esercizio del diritto di recesso', '', `Spettabile ${k.provider},`, '',
    'con la presente comunico il mio recesso dal contratto avente ad oggetto la fornitura',
    `del servizio ${service(k)}, concluso in data ${orderDate(k)}.`, '',
    'Esercito il diritto di recesso previsto per i contratti a distanza, entro il termine di',
    'quattordici giorni dalla conclusione del contratto, senza necessità di motivazione e',
    'senza alcun onere a mio carico.', '', 'Chiedo pertanto:',
    '  1. la cessazione immediata del servizio e di ogni addebito collegato;',
    '  2. il rimborso di quanto eventualmente già corrisposto, entro quattordici',
    '     giorni dal ricevimento della presente, con lo stesso mezzo di pagamento utilizzato;',
    '  3. conferma scritta della ricezione della presente comunicazione.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Oggetto: disdetta del contratto — esclusione del rinnovo automatico', '', `Spettabile ${k.provider},`, '',
      `con la presente comunico la disdetta del contratto relativo a ${service(k)},`, `attivato in data ${orderDate(k)}.`, '',
      renewal ? `La presente disdetta è inviata affinché il contratto non si rinnovi alla scadenza del ${renewal},`
        : 'La presente disdetta è inviata affinché il contratto non si rinnovi tacitamente alla scadenza,',
      notice ? `nel rispetto del termine di preavviso di ${notice} giorni previsto dalle condizioni contrattuali${deadline ? ` (termine ultimo: ${deadline})` : ''}.`
        : 'nel rispetto del termine di preavviso previsto dalle condizioni contrattuali.', '',
      'Chiedo pertanto:', '  1. conferma scritta della ricezione della presente e della data di efficacia della disdetta;',
      '  2. la cessazione di ogni addebito a decorrere dalla scadenza indicata;',
      '  3. l’indicazione di eventuali importi ritenuti dovuti, con il relativo titolo contrattuale.', '',
      'Preciso che nessun addebito ulteriore potrà considerarsi legittimo per periodi successivi', 'alla scadenza sopra indicata.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Oggetto: recesso a seguito di modifica unilaterale delle condizioni contrattuali', '', `Spettabile ${k.provider},`, '',
      `ho rilevato una modifica delle condizioni contrattuali relative a ${service(k)},`, `rispetto a quelle da me accettate in data ${orderDate(k)}.`, '',
      ch?.summary ? `In particolare: ${ch.summary}` : 'La modifica incide sulle condizioni economiche e/o normative del rapporto.', '',
      'Non intendendo accettare le nuove condizioni, comunico il mio recesso dal contratto con',
      'effetto immediato, senza penali né spese di disattivazione, trattandosi di recesso',
      'esercitato a fronte di una modifica unilaterale non da me richiesta.', '', 'Chiedo pertanto:',
      '  1. conferma scritta della cessazione del rapporto e della data di efficacia;', '  2. la cessazione di ogni addebito;',
      '  3. il rimborso di eventuali importi corrisposti per periodi successivi alla cessazione.'];
  },
  identity: ({ you, c }) => [`Intestatario del contratto: ${you.name}`, `Indirizzo: ${you.address}`, `Email di contatto: ${you.email}`,
    `Codice cliente / numero contratto: ${you.customerId || '[da indicare]'}`,
    ...(c.url ? [`Sottoscritto tramite: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Impronta del testo accettato (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Distinti saluti,', '', you.name, '', 'Firma _______________________', `Data ${today}`].join('\n'),
  footer: (refs) => ['—', 'Riferimenti normativi utili:', ...refs.map((r) => `  · ${r}`), '',
    'Documento generato automaticamente da AnteFirma a partire dalle condizioni',
    'contrattuali analizzate. Verifica i dati fra parentesi quadre prima di inviarlo. Non', 'costituisce consulenza legale.'].join('\n'),
  subject: { withdrawal: (p) => `Esercizio del diritto di recesso — ${p}`, cancellation: (p) => `Disdetta contratto — ${p}`, change_withdrawal: (p) => `Recesso per modifica unilaterale — ${p}` },
  refs: {
    withdrawal: ['D.Lgs. 206/2005 (Codice del Consumo), artt. 52-59 — diritto di recesso nei contratti a distanza',
      'Allegato I, parte B, del Codice del Consumo — modulo di recesso tipo', 'Direttiva 2011/83/UE'],
    cancellation: ['D.Lgs. 206/2005, art. 33 c. 2 lett. i) — rinnovo tacito con preavviso eccessivo', 'Codice civile, artt. 1373 e 1341'],
    change_withdrawal: ['D.Lgs. 206/2005, art. 33 c. 2 lett. m) e o) — modifica unilaterale senza giustificato motivo',
      'Direttiva 93/13/CEE, allegato punto 1 lett. j) e l)'],
  },
};

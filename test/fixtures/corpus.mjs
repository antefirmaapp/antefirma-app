/**
 * Insieme di riferimento per la calibrazione del punteggio.
 *
 * Nove testi che coprono la scala, etichettati a mano con la **fascia** attesa
 * — non con un numero. È una scelta deliberata: i test sul numero esatto si
 * rompono a ogni ritocco del motore e finiscono per essere aggiornati
 * meccanicamente, cioè per non verificare più niente. I test sulla fascia e
 * sull'ordinamento reggono, perché descrivono ciò che il prodotto promette:
 * che un contratto peggiore risulti peggiore.
 *
 * Le etichette sono un giudizio, non una verità. Vanno discusse e riviste
 * quando arriveranno i testi presi da siti veri.
 */

export const CORPUS = [
  {
    id: 'newsletter',
    label: 'Iscrizione a una newsletter',
    band: 'safe',
    actionType: 'signup',
    pricing: {},
    text: `Iscriviti alla nostra newsletter settimanale. Ogni martedì mattina ricevi tre
articoli scelti dalla redazione e una selezione di letture consigliate. Il servizio è
gratuito e non prevede alcun costo, né ora né in futuro. Puoi annullare l'iscrizione in
qualsiasi momento dal link presente in fondo a ogni messaggio, senza doverci contattare.
Usiamo il tuo indirizzo email esclusivamente per l'invio della newsletter. Non condividiamo
il tuo indirizzo con nessuno e non vendiamo i tuoi dati. Se annulli l'iscrizione, il tuo
indirizzo viene rimosso dai nostri archivi entro trenta giorni.`,
  },

  {
    id: 'cookie_banner',
    label: 'Banner dei cookie con profilazione',
    band: 'review',
    actionType: 'consent',
    pricing: {},
    text: `Questo sito utilizza cookie tecnici necessari al funzionamento e, previo tuo
consenso, cookie di profilazione propri e di terze parti. I cookie di profilazione servono
a mostrarti pubblicità personalizzata in base alla tua navigazione e ai tuoi interessi.
I dati raccolti attraverso questi strumenti potranno essere condivisi con terze parti
appartenenti al circuito pubblicitario a fini di profilazione e pubblicità mirata.
Puoi modificare le tue preferenze in qualsiasi momento dalla pagina dedicata. I cookie di
profilazione hanno una durata massima di dodici mesi dalla loro installazione.`,
  },

  {
    id: 'saas_fair',
    label: 'SaaS mensile senza vincoli',
    band: 'review',
    actionType: 'subscribe',
    pricing: { amount: 12, currency: 'EUR', period: 'month', recurring: true },
    text: `Il servizio è offerto in abbonamento mensile al prezzo di 12,00 euro al mese.
Non è prevista alcuna durata minima: puoi disdire in qualsiasi momento senza penali, con
effetto dalla fine del periodo già pagato. Non sono previsti costi di attivazione né costi
aggiuntivi di alcun tipo. I contenuti che carichi restano di tua esclusiva proprietà e non
vengono utilizzati per finalità diverse dall'erogazione del servizio.
Il fornitore non sarà responsabile per danni indiretti derivanti da interruzioni del
servizio dovute a cause di forza maggiore. Il servizio è fornito secondo la legislazione
italiana e il foro competente è quello del consumatore.`,
  },

  {
    id: 'ecommerce',
    label: 'Acquisto una tantum con rimborsi esclusi',
    // Etichettato inizialmente 'review' e corretto dopo la prima misurazione:
    // un divieto assoluto di rimborso più un termine di otto giorni per
    // contestare la conformità — contro i due anni di garanzia legale — non è
    // una condizione "da rivedere", è un impegno che vale la pena fermare.
    band: 'commitment',
    actionType: 'purchase',
    pricing: { amount: 89.9, currency: 'EUR', period: null, recurring: false },
    text: `Confermando l'ordine acquisti il prodotto selezionato al prezzo indicato di
89,90 euro, comprensivo di IVA. La spedizione avviene entro cinque giorni lavorativi.
I prodotti personalizzati non sono rimborsabili in alcun caso, nemmeno in caso di mancato
utilizzo. Il venditore non sarà in alcun modo responsabile per ritardi imputabili al
corriere. Eventuali contestazioni sulla conformità del prodotto devono essere comunicate
entro otto giorni dal ricevimento della merce.`,
  },

  {
    id: 'social_ip',
    label: 'Piattaforma social con licenza sui contenuti',
    band: 'commitment',
    actionType: 'signup',
    pricing: {},
    text: `Creando un account accetti le presenti condizioni d'uso. Caricando contenuti sulla
piattaforma, l'utente concede alla società una licenza mondiale, gratuita, perpetua e
irrevocabile di usare, riprodurre, modificare, adattare e distribuire tali contenuti,
anche per l'addestramento di modelli di intelligenza artificiale.
I dati raccolti potranno essere condivisi con terze parti a fini di profilazione e
pubblicità personalizzata, e potranno essere trasferiti al di fuori dell'Unione Europea.
I dati vengono conservati anche dopo la chiusura dell'account.
La società può sospendere o chiudere l'account in qualsiasi momento a proprio insindacabile
giudizio. Ci riserviamo il diritto di modificare in qualsiasi momento i presenti termini.`,
  },

  {
    id: 'saas_annual',
    label: 'Abbonamento annuale con rinnovo tacito',
    band: 'commitment',
    actionType: 'subscribe',
    pricing: { amount: 240, currency: 'EUR', period: 'year', recurring: true },
    text: `L'abbonamento ha un costo di 240,00 euro all'anno. Il contratto ha una durata
minima di 12 mesi. Alla scadenza il contratto si rinnova automaticamente per un uguale
periodo, salvo disdetta da comunicarsi con preavviso di almeno 30 giorni prima della
scadenza. Gli importi versati non sono rimborsabili in caso di recesso anticipato.
Il fornitore si riserva il diritto di modificare le condizioni economiche dandone
comunicazione con congruo preavviso. Il servizio è fornito così com'è, nei limiti massimi
consentiti dalla legge.`,
  },

  {
    id: 'telco_24m',
    label: 'Telefonia con vincolo di 24 mesi e penale',
    band: 'high_risk',
    actionType: 'subscribe',
    pricing: { amount: 29.9, currency: 'EUR', period: 'month', recurring: true },
    text: `Il canone mensile è pari a 29,90 euro, oltre a spese di attivazione una tantum di
49,00 euro. Il contratto ha una durata minima di 24 mesi a decorrere dalla data di
attivazione. Alla scadenza il contratto si rinnova automaticamente per un uguale periodo,
salvo disdetta da comunicarsi con preavviso di almeno 60 giorni.
In caso di recesso prima della scadenza del periodo minimo è dovuta una penale pari a
120,00 euro, oltre al rimborso degli sconti già goduti. Gli importi versati non sono
rimborsabili. Il fornitore può modificare unilateralmente il prezzo del servizio dandone
comunicazione sul proprio sito. Il fornitore non sarà in alcun modo responsabile per
interruzioni del servizio.`,
  },

  {
    id: 'freelance_assignment',
    label: 'Piattaforma di lavoro con cessione dei diritti',
    band: 'high_risk',
    actionType: 'sign',
    pricing: {},
    profile: { money: true, privacy: true, identity: true, ip: true, freelance: true },
    text: `Sottoscrivendo il presente accordo il professionista cede alla società tutti i
diritti di utilizzazione economica sulle opere realizzate nell'ambito degli incarichi
ricevuti tramite la piattaforma. La cessione dei diritti è definitiva e comprende il
diritto di modificare, adattare e sublicenziare le opere a terzi senza ulteriore compenso.
I contenuti potranno essere utilizzati per l'addestramento di modelli di intelligenza
artificiale. Il professionista rinuncia a partecipare ad azioni collettive nei confronti
della società. Ogni controversia sarà devoluta ad arbitrato rituale e il foro competente
esclusivo è quello di Dublino. La società non sarà responsabile per il mancato pagamento
da parte dei committenti.`,
  },

  {
    id: 'predatory_loan',
    label: 'Finanziamento con penali e foro estero',
    band: 'critical',
    actionType: 'sign',
    pricing: { amount: 189, currency: 'EUR', period: 'month', recurring: true },
    text: `Il finanziamento prevede il rimborso in 60 rate mensili da 189,00 euro ciascuna,
oltre a spese di istruttoria una tantum di 350,00 euro e spese di incasso di 4,00 euro per
ogni rata. Il contratto ha una durata minima di 60 mesi.
In caso di estinzione anticipata è dovuta una penale pari a 900,00 euro. Il mancato
pagamento anche di una sola rata comporta la decadenza dal beneficio del termine e
l'obbligo di restituire immediatamente l'intero importo residuo.
Gli importi versati non sono rimborsabili in alcun caso. Il finanziatore può modificare
unilateralmente il tasso applicato e le condizioni economiche del contratto.
Ogni controversia sarà devoluta ad arbitrato rituale vincolante; l'utente rinuncia a
partecipare ad azioni collettive. Il foro competente esclusivo è quello di Dublino.
Il finanziatore non sarà in alcun modo responsabile per danni derivanti dall'esecuzione
del contratto.`,
  },
];

/**
 * Catene di ordinamento che devono valere sempre.
 * Sono asserzioni sul *comportamento promesso*: un contratto peggiore deve
 * risultare peggiore. Solo confronti difendibili — non si mette in fila tutto
 * con tutto, perché fra un banner di cookie e un acquisto una tantum l'ordine
 * è opinabile e il test diventerebbe arbitrario.
 */
/**
 * Lo stesso contratto — telco_24m — nelle tre forme in cui una pagina reale lo
 * presenta: prosa, elenco puntato, tabella di riepilogo.
 *
 * Sta fuori da CORPUS di proposito. CORPUS misura la *distribuzione* del
 * punteggio e aggiungerci tre varianti dello stesso caso la falserebbe; qui si
 * misura una proprietà diversa e altrettanto importante: **le stesse condizioni
 * devono dare lo stesso verdetto comunque siano impaginate**.
 *
 * È la classe di errore che i nove testi non potevano far emergere, perché
 * sono tutti prosa in paragrafi: innerText mette ogni voce di elenco e ogni
 * cella su una riga a sé, e prima dell'accorpamento delle righe corte il
 * motore su queste due forme non vedeva assolutamente nulla.
 */
export const LAYOUTS = [
  {
    id: 'telco_prosa',
    layout: 'prosa',
    text: byId('telco_24m').text,
  },
  {
    id: 'telco_elenco',
    layout: 'elenco puntato',
    text: `Riepilogo dell'offerta
• Canone mensile 29,90 euro
• Spese di attivazione 49,00 euro
• Durata minima 24 mesi
• Rinnovo automatico alla scadenza
• Preavviso di disdetta 60 giorni
• Penale di recesso pari a 120,00 euro
• Nessun rimborso degli importi versati`,
  },
  {
    id: 'telco_tabella',
    layout: 'tabella',
    text: `Voce\tCondizione
Canone\t29,90 €/mese
Attivazione\t49,00 €
Durata minima\t24 mesi
Rinnovo\tautomatico alla scadenza
Preavviso di disdetta\t60 giorni
Penale di recesso\t120,00 €
Rimborsi\tnessun rimborso`,
  },
];

/** Condizioni che ogni impaginazione deve far emergere. */
export const LAYOUT_CORE_CATEGORIES = [
  'auto_renewal',
  'minimum_term',
  'early_termination_penalty',
  'no_refund',
];

/** Il contesto economico della pagina è lo stesso nelle tre forme. */
export const LAYOUT_PRICING = { amount: 29.9, currency: 'EUR', period: 'month', recurring: true };

export const ORDERING = [
  ['newsletter', 'cookie_banner'],
  ['newsletter', 'saas_fair'],
  ['saas_fair', 'saas_annual'],
  ['saas_annual', 'telco_24m'],
  ['telco_24m', 'predatory_loan'],
  ['ecommerce', 'telco_24m'],
  ['cookie_banner', 'social_ip'],
];

export const BAND_ORDER = ['safe', 'review', 'commitment', 'high_risk', 'critical'];

export function byId(id) {
  return CORPUS.find((c) => c.id === id);
}

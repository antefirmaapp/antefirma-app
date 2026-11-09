# Vincolo

**Prima di accettare, sai a cosa ti leghi.**

[vincolo.app](https://vincolo.app) · estensione Chrome (Manifest V3) · versione 0.4.0

Si frappone fra te e un impegno digitale. Non è l'ennesimo riassuntore di
Termini e Condizioni — quel mercato è pieno. Vincolo intercetta **l'azione**,
non il documento, e risponde a due domande che i concorrenti non pongono:

1. **Quanto mi può costare veramente questo click?**
2. **Che cosa cambia se lo faccio?**

Il risultato non è `Risk score 73/100`, ma:

> **Vedi 19,99 €/mese, ma stai impegnando fino a 648,76 €**
> 19,99 € × 24 cicli + penale 120,00 € + attivazione 49,00 €
> 📌 Entro il 15 giugno 2028 devi inviare la disdetta.

---

## Indice

- [Installazione](#installazione)
- [Primo avvio: cosa configurare](#primo-avvio-cosa-configurare)
- [Come si usa](#come-si-usa)
- [Come funziona: la pipeline](#come-funziona-la-pipeline)
- [Il motore in dettaglio](#il-motore-in-dettaglio)
  - [1. Action Detector](#1-action-detector--quando-scatta)
  - [2. Context Engine](#2-context-engine--cosa-guarda-nella-pagina)
  - [3. Risk Engine](#3-risk-engine--le-23-categorie)
  - [4. Consequence Engine](#4-consequence-engine--il-numero)
  - [5. Personal Risk Profile](#5-personal-risk-profile--la-stessa-clausola-non-pesa-uguale)
  - [6. Motore consumer UE/IT](#6-motore-consumer-ueit)
  - [7. Decision Risk Score](#7-decision-risk-score--come-nasce-il-numero)
- [I tre gradini dei modelli](#i-tre-gradini-dei-modelli)
- [Analisi speculativa](#analisi-speculativa)
- [Kit di uscita](#kit-di-uscita)
- [Prova di cosa hai accettato](#prova-di-cosa-hai-accettato)
- [Controllo delle modifiche a tre cancelli](#controllo-delle-modifiche-a-tre-cancelli)
- [Privacy: cosa esce e cosa no](#privacy-cosa-esce-e-cosa-no)
- [Permessi richiesti e perché](#permessi-richiesti-e-perché)
- [Dati salvati](#dati-salvati)
- [Impostazioni](#impostazioni)
- [Limiti noti](#limiti-noti)
- [Test](#test)
- [Struttura del codice](#struttura-del-codice)
- [Marchio](#marchio)
- [Prossimi passi](#prossimi-passi)
- [Prima della pubblicazione](#prima-della-pubblicazione)
- [Funzionalità valutate](#funzionalità-valutate)
- [Avvertenza legale](#avvertenza-legale)

---

## Installazione

Vincolo non è ancora sul Chrome Web Store: si installa come estensione non
pacchettizzata. Servono Chrome (o Edge/Brave) **versione 116 o successiva**.

1. Scarica e scompatta la cartella del progetto in una posizione stabile —
   Chrome la rilegge a ogni avvio, quindi non metterla nei Download temporanei.
2. Apri `chrome://extensions`.
3. Attiva **Modalità sviluppatore**, in alto a destra.
4. Premi **Carica estensione non pacchettizzata** e seleziona la cartella che
   contiene `manifest.json` (la cartella, non il file).
5. Comparirà **Vincolo** con l'icona a monogramma. Fissala alla barra con
   l'icona a puntina, così hai il pannello a portata di click.

Al primo caricamento si apre da sola la pagina delle impostazioni.

**Verifica che funzioni**: apri `demo/checkout.html` con un doppio click e prova
a premere «Conferma abbonamento». Deve comparire l'avviso rosso con l'impegno
stimato. Il pulsante «Iscriviti alla newsletter» più sotto **non** deve far
scattare niente: è la controprova sui falsi allarmi.

> Le pagine locali aperte con `file://` funzionano solo se in
> `chrome://extensions` → Vincolo → **Dettagli** attivi *Consenti accesso agli
> URL dei file*. In alternativa servi la cartella `demo/` con un server locale.

### Aggiornare

Sovrascrivi i file e premi **Aggiorna** (l'icona a freccia circolare) nella
scheda dell'estensione. Impostazioni, impegni registrati e prove restano.

### Disinstallare

Tasto destro sull'icona → **Rimuovi da Chrome**. Vengono cancellati anche tutti
i dati locali, comprese le prove e le scadenze: **esportale prima** se ti
servono (dal pannello, pulsante *Prova* su ciascun impegno).

---

## Primo avvio: cosa configurare

Vincolo funziona **da subito e senza configurare niente**: il motore a regole
gira offline e non manda nulla fuori dal browser. Le tre cose che vale la pena
sistemare in due minuti:

1. **Cosa vuoi proteggere** — le sette aree del profilo personale. Di default
   sono attive *Denaro*, *Privacy* e *Identità digitale*. Se sei un fotografo,
   un traduttore, uno sviluppatore freelance, attiva anche *Proprietà
   intellettuale* e *Lavoro freelance*: cambia il peso delle clausole sui
   contenuti in modo sostanziale.
2. **I tuoi dati per le lettere** — nome, indirizzo, email. Servono solo a
   precompilare le lettere di disdetta e restano su questo dispositivo. Se li
   lasci vuoti la lettera esce comunque, con i segnaposto fra parentesi quadre.
3. **La chiave API**, se la vuoi — facoltativa. Senza, hai regole locali e (dove
   disponibile) il modello integrato in Chrome.

---

## Come si usa

Vincolo ha **un modo automatico e cinque manuali**.

| Modo | Come si attiva |
|---|---|
| **Intercettazione** | Automatica. Clicchi Accetta / Abbonati / Acquista / Firma / Autorizza su qualsiasi sito |
| **Pagina corrente** | Pannello laterale → *Pagina corrente* |
| **Incolla testo** | Pannello laterale → *Incolla testo*, con prezzo e periodicità facoltativi |
| **PDF** | Trascina il file nel pannello: viene letto in locale, non caricato |
| **Da URL** | Pannello laterale → *Da URL*, per termini o policy raggiungibili via link |
| **Menu contestuale** | Tasto destro su una selezione, su una pagina o su un link |

Quando l'avviso compare hai tre scelte: **Torna indietro** (o `Esc`), **Continua
comunque**, oppure **Non avvisarmi su questo sito**, che aggiunge il dominio
all'elenco delle esclusioni.

Se prosegui, l'impegno finisce nella scheda **Impegni** con la sua scadenza.

---

## Come funziona: la pipeline

```
                    BROWSER
                       │
             ┌─────────▼─────────┐
             │  ACTION DETECTOR  │  Accetta · Abbonati · Acquista · Firma · Autorizza
             │  sospende il click│  in modo sincrono, prima che il browser agisca
             └─────────┬─────────┘
                       │
             ┌─────────▼─────────┐
             │  CONTEXT ENGINE   │  prezzo · ricorrenza · prova gratuita
             │                   │  consensi precompilati · dove sono i termini
             └─────────┬─────────┘
                       │
          ┌────────────▼────────────┐
          │  RISK ENGINE            │  23 categorie · 69 regole IT/EN/ES
          │  regole → on-device → AI│  ogni gradino solo se serve davvero
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  CONSEQUENCE ENGINE     │  € totali · durata · scadenze · timeline
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  PERSONAL RISK PROFILE  │  la stessa clausola non pesa uguale per tutti
          └────────────┬────────────┘
                       │
          ┌────────────▼────────────┐
          │  EU/IT CONSUMER ENGINE  │  Codice del Consumo · GDPR · DSA
          └────────────┬────────────┘
                       │
                ┌──────▼──────┐
                │  DECISION   │   🟢 SAFE   🟡 REVIEW   🟠 COMMITMENT
                │  RISK SCORE │   🔴 HIGH RISK   ⛔ CRITICAL
                └──────┬──────┘
                       │  se l'utente prosegue
          ┌────────────▼────────────┐
          │  REGISTRO DEGLI IMPEGNI │  snapshot · scadenze · promemoria
          │  → kit di uscita        │  lettera · calendario · diff nel tempo
          └─────────────────────────┘
```

L'analisi vive nel **service worker**, non nella pagina: nessuno script del sito
può leggerla, alterarla o intercettare la chiave API. Il content script si
limita a osservare, sospendere e mostrare.

---

## Il motore in dettaglio

### 1. Action Detector — quando scatta

Riconosce sette tipi di azione, con un peso che risolve le sovrapposizioni
(«Accetta e firma» contiene entrambe le parole, ma è la firma a determinare la
posta in gioco):

| Peso | Tipo | Esempi |
|---|---|---|
| 5 | `sign` | Firma il contratto · Accetta e firma · Sign document |
| 4 | `subscribe` | Abbonati · Attiva il piano · Inizia la prova · Start free trial |
| 4 | `purchase` | Acquista · Procedi al pagamento · Conferma ordine · Buy now |
| 3 | `oauth` | Autorizza · Continua con Google · Allow access |
| 3 | `consent` | Accetta tutti i cookie · Consenti tutto · Accept all |
| 2 | `accept_terms` | Accetto · Ho letto e accetto · I agree |
| 1 | `signup` | Crea un account · Registrati · Sign up |

**Il rifiuto ha sempre la precedenza.** «Rifiuta tutti i cookie», «Continua
senza accettare», «Solo i necessari», «Annulla», «Disdici» non vengono mai
intercettati: bloccare un opt-out sarebbe l'esatto contrario dello scopo.

#### Il dettaglio che fa la differenza

L'intercettazione è **sincrona per costruzione**. `preventDefault()` ha effetto
solo mentre l'evento è ancora in dispatch: basta un `await` prima — anche solo
per leggere le impostazioni — e il browser ha già inviato il form. Vincolo
decide e sospende senza attese; analisi, rete e interfaccia vengono dopo.

Era il primo bug che lo smoke test ha trovato, ed è quello che avrebbe reso
inutile l'intero prodotto lasciandolo apparentemente funzionante.

Copre sia il `click` sia il `submit` — quest'ultimo serve per i moduli inviati
con Invio da tastiera, dove il click non arriva mai.

#### L'avviso resiste alla pagina

L'avviso vive in uno shadow root con un `MutationObserver` che lo rimette al suo
posto se il sito prova a rimuoverlo, e riscrive i propri stili inline in
`!important` se il sito prova a nasconderlo con il CSS. Uno shadow root *chiuso*
darebbe solo l'illusione della protezione: la pagina non ne leggerebbe il
contenuto, ma potrebbe comunque cancellare l'elemento dal DOM.

Il pulsante «Continua comunque» si arma dopo tre secondi. Non è attrito fine a
sé stesso: il click che stiamo intercettando era già partito e la mano è ancora
in movimento.

### 2. Context Engine — cosa guarda nella pagina

- **Il prezzo**, risalendo dal pulsante al contenitore che con più probabilità
  lo contiene. Il prezzo "vero" è quello **ricorrente**: è lui a generare
  l'impegno. In mancanza di ricorrenza prende l'importo più alto **fra quelli
  che non sono chiaramente penali o spese accessorie** — meglio nessun prezzo
  che il prezzo sbagliato.
- **La prova gratuita** e la sua durata.
- **Il modulo**: caselle di consenso già spuntate, consenso "a pacchetto",
  campi password/carta, e condizioni economiche scritte in un carattere più
  piccolo del 75% del resto.
- **I termini**: se sono nella pagina li legge, se sono un link lo scarica.

Da qui nascono i **dark pattern**, che non vengono dal testo legale ma dalla
struttura della pagina: consensi precompilati, prova gratuita che si trasforma
in abbonamento, contratto presente solo come link, caratteri minuscoli.

### 3. Risk Engine — le 23 categorie

69 regole in italiano, inglese e **spagnolo**, con **negatori** che evitano i
falsi positivi: «nessun rinnovo automatico», «puoi disdire in qualsiasi momento
senza penali», «il foro competente è quello del consumatore» — quest'ultima è una
tutela, e segnalarla sarebbe il contrario di quello che serve.

La negazione si valuta **per frase, non per paragrafo**, e in due modi: una lista
di formule fatte riconosce le tutele più comuni, e un rilevatore strutturale
guarda la finestra che precede ogni singolo match. La lista da sola non bastava —
non è un rilevatore di negazione, è un elenco di frasi: «Il recesso non comporta
alcuna penale» non ci sarebbe mai stata dentro, e usciva a severità 65.

Valutarla sul paragrafo era il difetto peggiore delle due facce: una frase
rassicurante di sette parole in testa a un capoverso spegneva tutte le regole su
tutto il resto.

Le severità sono tarate sul **danno atteso**, non su quanto la clausola suoni
sgradevole:

| Severità | Categoria | Aree del profilo che la amplificano |
|---|---|---|
| 85 | `ip_assignment` — cessione di diritti | ip, freelance, business |
| 70 | `data_sale` — vendita dei dati | privacy, identity |
| 70 | `biometric` — dati biometrici | privacy, identity, minors |
| 65 | `early_termination_penalty` — penale di recesso | money |
| 55 | `arbitration` — arbitrato obbligatorio | identity, business |
| 50 | `price_change` — modifica unilaterale del prezzo | money |
| 45 | `auto_renewal` — rinnovo automatico | money |
| 45 | `minimum_term` — durata minima vincolante | money |
| 45 | `unilateral_change` — modifica delle condizioni | money, privacy |
| 45 | `ip_license` — licenza sui tuoi contenuti | ip, freelance |
| 45 | `ai_training` — uso dei contenuti per addestrare AI | ip, freelance, business |
| 45 | `dark_pattern` — interfaccia ingannevole | money, privacy |
| 40 | `no_refund` — nessun rimborso | money |
| 40 | `hidden_costs` — costi aggiuntivi | money |
| 40 | `class_action_waiver` — rinuncia alle azioni collettive | identity |
| 35 | `jurisdiction` — foro competente estero | identity, business |
| 35 | `account_termination` — chiusura arbitraria dell'account | identity, business |
| 30 | `notice_period` — preavviso obbligatorio | money |
| 30 | `data_sharing` — condivisione con terze parti | privacy, business |
| 30 | `data_retention` — conservazione prolungata | privacy |
| 30 | `third_party_transfer` — trasferimento fuori dall'UE | privacy, business |
| 25 | `liability_limitation` — limitazione di responsabilità | business, money |
| 20 | `profiling` — profilazione e pubblicità mirata | privacy, minors |

Le fasce di riferimento: **85-100** irreversibile o molto costoso da annullare ·
**60-84** conseguenza seria · **40-59** impegno reale · **20-39** condizione
ordinaria da sapere.

Una limitazione di responsabilità sta in ogni contratto del mondo e vale 25; una
cessione dei diritti d'autore è irreversibile e vale 85. **Se le clausole
ordinarie partono alte, qualsiasi contratto normale finisce in allarme rosso e
l'utente impara a ignorare l'avviso** — che è il modo più rapido per rendere
inutile un firewall.

Ogni segnalazione porta con sé la **citazione testuale**: niente affermazioni
senza la riga che le sostiene.

### 4. Consequence Engine — il numero

Trasforma il linguaggio legale in due cose che una persona capisce senza
mediazione: quanto può costare e cosa succede se clicca.

**L'orizzonte dell'impegno**: la durata minima dichiarata; in mancanza, con
rinnovo automatico, un orizzonte prudenziale di 12 mesi; altrimenti un ciclo di
fatturazione.

**La formula** è sempre mostrata, così puoi giudicare da te:

```
19,99 € × 24 cicli = 479,76 €  +  Penale di recesso = 120,00 €  +  Attivazione = 49,00 €
```

Gli importi vengono attribuiti alla causale giusta con una finestra stretta che
**non scavalca mai l'importo precedente**: in «il canone è € 19,99 al mese,
oltre a spese di attivazione di € 49,00» una finestra larga farebbe passare
anche 19,99 per costo di attivazione.

**La timeline** proietta le conseguenze: cosa succede ora, quando finisce la
prova, entro quando devi disdire, quando scatta il rinnovo, quanto paghi se
esci prima.

### 5. Personal Risk Profile — la stessa clausola non pesa uguale

Sette aree: Denaro, Privacy, Proprietà intellettuale, Lavoro freelance, Dati
aziendali, Minori, Identità digitale.

Una licenza mondiale sui contenuti è un dettaglio per chi carica foto delle
vacanze e un problema serio per chi vive del proprio lavoro creativo. Il
moltiplicatore è limitato a **1,55**, con rendimento decrescente sulle aree
successive alla prima: il profilo deve *ordinare* le clausole secondo ciò che ti
sta a cuore, non gonfiarle.

### 6. Motore consumer UE/IT

Tredici controlli che collegano una categoria di rischio al riferimento
normativo che la rende quantomeno discutibile: arbitrato imposto, foro diverso
da quello del consumatore, modifica unilaterale, esclusione di responsabilità,
diritto di recesso di 14 giorni non menzionato, divieto assoluto di rimborso,
rinnovo tacito con preavviso lungo, clausole onerose senza approvazione
specifica (art. 1341 c.c.), consenso non granulare, trasferimento extra-SEE,
cessione dati a titolo oneroso, addestramento AI, dark pattern.

Riferimenti citati: **Codice del Consumo** (artt. 33, 36, 52-59, 128-135),
**Codice civile** (artt. 1229, 1341, 1373), **GDPR** (artt. 4, 6, 7, 13, 14,
44-49), **DSA** art. 25, direttive 93/13/CEE, 2011/83/UE, 2019/770-771,
2019/2161, 2020/1828, 2019/790 art. 4, Reg. UE 1215/2012, Reg. UE 2024/1689.

Si attiva solo con giurisdizione **Italia** o **UE**. Il contributo al punteggio
è smorzato e limitato a 15 punti: con un tetto più alto qualsiasi contratto con
tre segnalazioni arrivava al massimo, e il motore smetteva di distinguere fra un
fastidio e un abuso.

### 7. Decision Risk Score — come nasce il numero

Non è il punteggio del *documento*: è il punteggio della *decisione*.

1. **Aggregazione** — la clausola peggiore determina il livello; le altre
   aggiungono con rendimento decrescente e con un tetto complessivo di 15 punti.
   Il rischio di una decisione lo determina la conseguenza peggiore, non il
   numero di righe.
2. **Compressione** — la somma grezza viene riportata sulla scala in modo
   monotono e asintotico: lineare fino a 50, poi si avvicina a 88 senza
   arrivarci. Le sole clausole non possono toccare 100.
3. **Pavimento dell'azione** — firmare parte da 20, abbonarsi da 18, comprare da
   12, autorizzare da 10, consentire da 6, registrarsi da 5, accettare da 4.
4. **Pressioni sullo spazio residuo** — esposizione economica (logaritmica, fino
   a 40), tutele consumer (fino a 15), prezzo che sottostima l'impegno (10). Non
   si sommano: si applicano a quello che resta. Un'esposizione di 26 punti su una
   base di 85 aggiunge il 26% dei 15 punti rimasti, non 26 punti pieni.

Le soglie dei livelli vengono dall'insieme di riferimento e sono collocate nei
**vuoti della distribuzione**:

| Livello | Da | Comportamento predefinito |
|---|---|---|
| 🟢 SAFE | 0 | nessun avviso |
| 🟡 REVIEW | 22 | notifica discreta, nessuna interruzione |
| 🟠 COMMITMENT | 55 | **blocca il click** |
| 🔴 HIGH RISK | 86 | blocca il click |
| ⛔ CRITICAL | 92 | blocca il click |

Sul corpus di riferimento la distribuzione è questa:

| Caso | Punteggio | Fascia |
|---|---|---|
| Iscrizione a una newsletter | 5 | 🟢 SAFE |
| SaaS mensile senza vincoli | 34 | 🟡 REVIEW |
| Banner cookie con profilazione | 48 | 🟡 REVIEW |
| Acquisto con rimborsi esclusi | 68 | 🟠 COMMITMENT |
| Social con licenza sui contenuti | 78 | 🟠 COMMITMENT |
| Abbonamento annuale con rinnovo tacito | 84 | 🟠 COMMITMENT |
| Piattaforma con cessione dei diritti | 89 | 🔴 HIGH RISK |
| Telefonia 24 mesi con penale | 91 | 🔴 HIGH RISK |
| Finanziamento con penali e foro estero | 94 | ⛔ CRITICAL |

---

## I tre gradini dei modelli

Ogni gradino costa più del precedente, e si sale solo se serve.

| Gradino | Costo | Privacy | Quando |
|---|---|---|---|
| **Regole locali** | nullo | niente esce | sempre |
| **Modello on-device** | nullo | niente esce | se disponibile in Chrome e c'è materia |
| **Modello remoto** | crediti API | il testo esce | solo se configurato e sopra la soglia |

Il modello on-device usa la **Prompt API integrata in Chrome**. Ha un contesto
piccolo, quindi non riceve il contratto intero: riceve ciò che le regole hanno
già trovato e fa il salto che le regole non sanno fare — spiegare in italiano
corrente e quantificare. Se non è disponibile non è un errore: si degrada al
motore a regole, e lo dice nelle impostazioni.

Il modello remoto supporta **Anthropic** e **OpenAI**, con la chiave dell'utente.
Viene interpellato solo se il punteggio locale supera la soglia configurata
(predefinita 15) oppure se stai per pagare, abbonarti o firmare.

Quando entrambe le sorgenti vedono la stessa clausola, la severità e la fiducia
salgono: la concordanza vale.

---

## Analisi speculativa

L'analisi non parte al click: parte quando il pulsante **entra nel campo visivo**
o al primo passaggio del mouse. Al momento del click il verdetto è già in cache
e l'avviso è immediato.

Costa poco perché in modalità speculativa girano **solo regole locali e modello
on-device**: nessuna chiamata di rete, nessun credito. Se c'è anche un modello
remoto configurato, il verdetto speculativo si dichiara *parziale*: viene
mostrato subito e raffinato in place mentre lo leggi, con un indicatore discreto
invece di tre secondi di clessidra.

Limiti di sicurezza: al massimo **tre pre-analisi per pagina**, una sola per
elemento, mai a pagina nascosta, mai su domini esclusi.

---

## Kit di uscita

Sapere che devi disdire entro il 15 giugno 2028 è metà del lavoro. L'altra metà
è farlo.

- **La scadenza reale** — data di rinnovo meno il preavviso contrattuale.
- **Il calendario (`.ics`)** è l'azione principale, e non per caso: è il
  meccanismo affidabile. L'estensione non può avvisarti a Chrome chiuso.
- **I promemoria a 30, 7 e 1 giorno** sono il secondo livello. Non sono allarmi
  programmati a due anni di distanza — quelli si perdono — ma un piano salvato
  con l'impegno che una **passata quotidiana** consuma. Se un giorno salta, il
  giorno dopo recupera. Ne parte **uno solo per volta**, il più urgente: tre
  notifiche di fila sullo stesso contratto si disattivano, non si leggono.
- **La finestra chiusa** mentre il browser era spento viene comunque segnalata.
  È sgradevole da leggere, ma il silenzio fa scoprire il rinnovo dall'estratto
  conto.
- **La lettera già scritta**, in tre varianti che non sono la stessa cosa:

| Variante | Quando | Base normativa citata |
|---|---|---|
| **Recesso** | entro 14 giorni dall'acquisto a distanza | Cod. Cons. artt. 52-59, modulo tipo Allegato I parte B |
| **Disdetta** | per evitare il rinnovo tacito | Cod. Cons. art. 33 c. 2 lett. i), c.c. artt. 1341 e 1373 |
| **Recesso per modifica** | il fornitore ha cambiato le condizioni | Cod. Cons. art. 33 c. 2 lett. m) e o) |

La variante giusta viene proposta da sé in base a quanto tempo è passato e a
cosa è cambiato. La lettera riporta il preavviso reale letto dal contratto, i
tuoi dati, l'impronta dello snapshot, e una lista di controllo (inviare con PEC
o raccomandata A/R, conservare la ricevuta).

- **Quanto costa non fare niente**: «Se non disdici, parte un nuovo periodo da
  479,76 €».

---

## Prova di cosa hai accettato

Nel momento in cui prosegui viene fissata un'impronta **SHA-256** del testo
esatto, con data, estratto e i numeri del verdetto. Il testo integrale resta in
locale (fino a 200.000 caratteri).

Serve a due cose:

- sei mesi dopo, quando il fornitore sostiene che avevi accettato altro, hai lo
  snapshot di quel giorno con un'**attestazione esportabile**: chiunque può
  ricalcolare lo SHA-256 del testo e ottenere la stessa impronta;
- il confronto nel tempo non dice *«i termini sono cambiati»* — che non
  significa niente — ma **«il tuo impegno potenziale è salito da 648,76 € a
  828,76 €»**, elencando le condizioni comparse.

L'attestazione dichiara onestamente cosa non è: **non è una certificazione con
valore legale autonomo**, documenta ciò che il browser ha ricevuto in quel
momento.

---

## Controllo delle modifiche a tre cancelli

Il controllo automatico è settimanale e attraversa tre cancelli, in ordine di
costo crescente. Nella maggior parte dei casi si ferma al primo.

1. **Richiesta condizionale** — con `ETag` / `Last-Modified`: un `304` significa
   "identico" senza trasferire un byte, e alleggerisce anche il sito
   interrogato.
2. **Impronta** — hash del testo normalizzato, tutto in locale.
3. **Regole locali** — un hash diverso non basta: cambia anche per un anno di
   copyright. Quello che conta sono i fatti derivati — costo, durata, preavviso,
   penale, categorie — e per ricavarli le regole bastano.

Si sale al modello solo se qualcosa di **sostanziale** si è mosso, e con una
regola precisa: **un controllo che parte da solo non usa mai il modello remoto**
— al massimo quello on-device. L'API a pagamento entra in gioco quando sei tu a
premere «Verifica modifiche», o se attivi l'opzione apposita.

Il ricontrollo riusa il prezzo dell'analisi originale: confrontare un verdetto
calcolato con il prezzo contro uno calcolato senza è un falso allarme garantito,
e per giunta rassicurante — segnalerebbe un calo inesistente.

---

## Privacy: cosa esce e cosa no

| Cosa | Dove va |
|---|---|
| Testo delle pagine e dei contratti | resta nel browser, salvo analisi AI remota |
| Chiave API | `chrome.storage.local`, mai sincronizzata sull'account Google |
| PDF trascinati | letti dentro l'estensione, mai caricati |
| Impegni, prove, storico | solo su questo dispositivo |
| I tuoi dati per le lettere | solo su questo dispositivo |
| Telemetria, analytics, statistiche d'uso | **nessuna** |

Le uniche uscite di rete sono: il **download dei termini** collegati dalla
pagina che stai guardando (senza cookie, `credentials: 'omit'`), e — se la
configuri — la **chiamata all'API del modello remoto**.

L'analisi gira nel service worker, non nella pagina: nessuno script del sito può
leggerla o intercettare la chiave.

---

## Permessi richiesti e perché

Sono molti e vale la pena sapere a cosa servono, anche perché sono la ragione
per cui una pubblicazione sullo store richiederebbe una motivazione scritta.

| Permesso | A cosa serve |
|---|---|
| `<all_urls>` | l'intercettazione deve funzionare su qualsiasi sito: non si sa in anticipo dove firmerai |
| `activeTab` | leggere la scheda attiva solo dopo un'azione esplicita, invece di una host permission permanente |
| `storage` + `unlimitedStorage` | impostazioni, cache, impegni e **il testo integrale delle prove**, che è voluminoso |
| `alarms` | la passata quotidiana e il controllo settimanale |
| `notifications` | i promemoria delle scadenze |
| `sidePanel` | il pannello con analisi manuali, impegni e storico |
| `contextMenus` | «Analizza il testo selezionato» |
| `scripting` | leggere la pagina corrente quando lo chiedi dal pannello |

---

## Dati salvati

In `chrome.storage.local`, tutto su questo dispositivo:

| Chiave | Contenuto |
|---|---|
| `settings` | impostazioni, profilo, identità, chiave API |
| `analysisCache` | verdetti recenti, max 60, scadenza 72 ore |
| `history` | ultime 100 azioni intercettate e la decisione presa |
| `commitments` | gli impegni registrati, con scadenze e promemoria |
| `snapshots` | il testo integrale delle prove |

In `chrome.storage.session`, cancellati alla chiusura del browser: il verdetto in
attesa di decisione e le richieste in arrivo dal menu contestuale.

Due allarmi: `vincolo-passata-quotidiana` (ogni 12 ore) e
`vincolo-controllo-condizioni` (settimanale).

---

## Impostazioni

| Impostazione | Predefinito | Effetto |
|---|---|---|
| Firewall attivo | sì | interruttore generale |
| Blocca a partire da | 🟠 COMMITMENT | sotto questa soglia solo notifica discreta |
| Giurisdizione | 🇮🇹 Italia | attiva il motore consumer UE/IT |
| Profilo | Denaro, Privacy, Identità | quali clausole pesano di più |
| Modello on-device | sì | primo gradino, se Chrome lo offre |
| Pre-analisi prima del click | sì | avviso istantaneo, nessuna chiamata remota |
| Analisi AI remota | sì, ma senza chiave è inattiva | secondo gradino |
| Provider / modello | Anthropic · claude-sonnet-4-5 | anche OpenAI |
| Soglia di attivazione AI | 15 | sotto, l'AI non viene chiamata |
| Registra gli impegni | sì | il kit di uscita |
| Promemoria | sì | notifiche a 30, 7 e 1 giorno |
| Sorveglia le condizioni | sì | controllo settimanale a tre cancelli |
| Controllo automatico con AI remota | **no** | lasciato spento, l'automatismo non spende né fa uscire testo |
| Siti esclusi | vuoto | un dominio per riga |

---

## Limiti noti

Elencati per onestà: sono cose che conviene sapere prima di fidarsi.

**Il limite che conta più di tutti.** Vincolo è stato provato su una pagina demo
scritta insieme al motore e su nove testi di riferimento scritti a mano — cioè
su bersagli che conoscono già le risposte. **Non è mai stato messo alla prova su
un checkout reale.** Aspettati falsi positivi e clausole non riconosciute su
siti veri.

**Il punteggio fuori dall'UE è più basso, e non dovrebbe.** Il motore consumer
alza il punteggio citando le tutele che rendono una clausola contestabile: fuori
da IT/UE quel contributo sparisce, quindi lo stesso contratto pesa *meno* proprio
dove l'utente è meno protetto. Le fasce alte restano raggiungibili dalle sole
clausole — c'è un test che lo verifica — ma l'asimmetria è concettualmente
rovesciata e va affrontata.

- **Le soglie dei livelli** derivano da nove esempi. Sono collocate nei vuoti
  della distribuzione, che è il modo corretto di farlo, ma restano l'ipotesi più
  fragile del progetto.
- **PDF**: l'estrattore legge PDF testuali con filtro Flate, compresi gli array
  `TJ` con crenatura e i dizionari con `/DecodeParms`. Scansioni, PDF cifrati e
  **catene di filtri** (`/Filter [/ASCII85Decode /FlateDecode]`, che reportlab
  usa spesso per fatture e contratti) restituiscono poco o nulla — e lo
  dichiarano, invece di produrre un'analisi su un testo illeggibile. Ora è
  coperto da 15 test su PDF generati dalle fixture.
- **Iframe**: l'avviso compare nel frame che ha ricevuto il click. Nei frame
  molto piccoli — certi widget di consenso — la resa è compressa.
- **Interazioni non standard**: pulsanti che agiscono su `mousedown`, su gesti
  personalizzati o su handler React che non passano da `click` possono sfuggire
  all'intercettazione.
- **Stima dei costi**: è un ordine di grandezza ricavato dal testo, non un
  preventivo. La formula è sempre mostrata proprio per questo.
- **L'interfaccia è solo italiana**: `_locales` (it/en/es) copre per ora solo le
  stringhe del manifest. Il *motore* invece riconosce italiano, inglese e
  spagnolo — regole, importi a parole, durate, periodicità, testi dei pulsanti —
  ma ciò che viene mostrato è in italiano. E `eu.js` e `letter.js` non sono
  italiani *di lingua* ma *di diritto*: con giurisdizione Spagna restano i
  riferimenti alle direttive europee e cadono gli articoli del Codice del Consumo,
  ma **la lettera di disdetta resta italiana** e va riscritta prima di poter
  essere usata in Spagna.
- **Modello on-device**: il collegamento è verificato con un modello simulato.
  Il modello vero di Chrome non è mai stato interpellato in questo progetto.
- **Notifiche**: se il sistema operativo le nega, il promemoria non compare. La
  scadenza resta nel pannello e nel calendario — un'altra ragione per usare
  l'`.ics`.
- **Non è ancora sullo store**: niente aggiornamenti automatici.

---

## Test

```bash
node --test test/*.mjs      # 169 test del motore, senza browser
python3 test/smoke.py       # 37 controlli end-to-end con l'estensione in Chromium
python3 demo/verify.py    # 24 scenari: che cosa decide, su ogni pagina di prova
```

I primi due verificano il **meccanismo** — il click viene sospeso, l'avviso
resiste, l'impegno nasce con la sua scadenza. Il terzo verifica il **giudizio**:
apre le pagine di `demo/`, preme i pulsanti e controlla che il verdetto sia
quello dichiarato in `demo/index.html`. Copre per costruzione i casi che i nove
testi del corpus non possono coprire — riepiloghi in elenco e in tabella, prezzi
promozionali, invio da tastiera, pulsanti generici, altre lingue.

Lo smoke test richiede Playwright. Carica davvero l'estensione, apre la pagina
demo e verifica che il click venga sospeso, che i numeri siano giusti, che
«Continua comunque» riproduca fedelmente l'azione, che l'avviso resista a una
pagina che prova a rimuoverlo o a nasconderlo, che la pre-analisi scaldi la cache
senza uscire in rete, che l'impegno nasca con la sua scadenza e che gli allarmi
muoiano insieme a lui.

### La calibrazione del punteggio

`test/fixtures/corpus.mjs` contiene i nove testi etichettati a mano. I test su di
essi sono scritti **in ordine di robustezza decrescente**, ed è voluto:

1. **nessuna saturazione** — la scala deve distinguere;
2. **ordinamento** — un contratto peggiore deve risultare peggiore;
3. **blocca / non blocca** — il comportamento che l'utente sperimenta;
4. **fascia esatta** — l'asserzione più debole, perché dipende da nove giudizi
   personali. Quando arriveranno testi presi da siti veri, è questa che andrà
   rivista per prima.

I test sul numero esatto si rompono a ogni ritocco del motore e finiscono per
essere aggiornati meccanicamente, cioè per non verificare più niente. Quelli
sull'ordine reggono.

### Difetti reali trovati dai test

- `preventDefault()` dopo un `await`: il form partiva comunque
- `default_locale` senza cartella `_locales`: l'estensione non si caricava
- la penale veniva scambiata per il prezzo del servizio
- la durata minima veniva scartata come se fosse un preavviso
- il canone veniva contato due volte come costo di attivazione
- «può modificare **unilateralmente** il prezzo» non veniva riconosciuto: la
  regola pretendeva verbo e complemento adiacenti
- «cessione **dei** diritti» sfuggiva alla clausola più grave del dizionario
- «il foro competente è quello **del consumatore**» — una tutela — veniva
  segnalata come rischio
- il ricontrollo periodico annunciava un calo dell'impegno che non esisteva
- registrando un impegno a dieci giorni dalla scadenza, il promemoria «mancano
  30 giorni» sarebbe partito dicendo una cosa falsa
- otto casi su nove del corpus uscivano CRITICAL, compreso un SaaS onesto

---

## Struttura del codice

```
manifest.json
src/
  core/                   motore puro — nessun DOM, nessuna API di Chrome
    constants.js            categorie, livelli, aree del profilo, impostazioni
    text.js                 importi, durate, clausole, HTML → testo
    rules.js                69 regole IT/EN/ES, negatori, dark pattern
    consequence.js          costo worst-case e timeline
    profile.js              personalizzazione sulle aree da proteggere
    eu.js                   tutele consumer UE/IT con riferimenti normativi
    scoring.js              aggregazione, compressione, Decision Risk Score
    llm.js                  client Anthropic/OpenAI + validazione output
    local-llm.js            modello integrato in Chrome (Prompt API)
    prompt.js               prompt e schema della risposta
    proof.js                impronta SHA-256, attestazione, confronto nel tempo
    sender.js               chi può chiedere che cosa al service worker
    commitments.js          registro, scadenze, piano dei promemoria
    ics.js                  esportazione calendario (RFC 5545)
    letter.js               lettere di recesso e disdetta precompilate
    analyzer.js             orchestratore della pipeline
    storage.js              impostazioni, cache, impegni, prove
  background/
    service-worker.js     router dei messaggi, allarmi, notifiche, fetch
  content/
    bridge.js               ponte verso il service worker + utilità DOM
    actions.js              quali pulsanti sono un impegno (testabile in Node)
    context.js              Context Engine lato pagina
    overlay.js              l'avviso, con guardiano anti-manomissione
    detector.js             intercettazione sincrona + analisi speculativa
  sidepanel/              pannello: 6 sorgenti, impegni, storico
    commitments-ui.js       il kit di uscita lato interfaccia
  options/                impostazioni, profilo, identità, chiave API
  lib/pdf-text.js         estrattore PDF senza dipendenze
demo/                     pagina di prova con tutte le trappole classiche
test/fixtures/corpus.mjs  i nove testi etichettati per la calibrazione
test/                     84 test unitari + 32 controlli end-to-end
brand/                    generatore delle icone e varianti
```

Il motore non importa mai `chrome.*` né tocca il DOM: è questo che permette di
verificarlo in Node senza browser, e di riusarlo altrove.

Il service worker espone i messaggi (`PREFETCH_ACTION`, `ANALYZE_ACTION`,
`BUILD_LETTER`, `CHECK_CHANGES`…): è l'unica superficie fra interfaccia e motore.
Quelli che portano dati sensibili — `GET_SETTINGS`, `SET_SETTINGS`, `TEST_API_KEY`,
`GET_PROOF`, `BUILD_LETTER` — sono riservati alle pagine dell'estensione: un
content script riceve solo `enabled`, `allowlist`, `blockFrom` e `speculative`
(`src/core/sender.js`).

---

## Marchio

`brand/icons.py` genera le icone. La variante attiva è il **monogramma V dentro
l'anello interrotto**: è l'unica delle tre che regge a 16 px, che è poi l'unica
dimensione che l'utente vede tutti i giorni.

Le altre due — l'anello di catena aperto e i due anelli intrecciati — restano in
`brand/variants/`. Per rigenerarle:

```bash
python3 brand/icons.py brand/variants
```

Due cose deliberatamente evitate nel segno: il **lucchetto**, che direbbe
sicurezza informatica invece che consapevolezza, e il **simbolo di divieto**,
perché Vincolo informa e non proibisce — chi vuole procedere procede.

Colori: inchiostro `#16191F`, accento ambra `#C2620F` (il livello COMMITMENT),
verde `#1A7F52`, rosso `#C0392B`, rosso scuro `#7D0A0A`.

---

## Prossimi passi

Il lavoro più importante resta **allargare il corpus** con l'HTML di 25-30
checkout reali. I nove testi attuali sono bastati a togliere la saturazione e a
far emergere quattro difetti veri nelle regole, ma restano un bersaglio che
conosce già le risposte.

Poi, in ordine:

- **misurare i falsi positivi in locale**: cliccare «Continua comunque» entro
  pochi secondi senza aprire i dettagli è il segnale di un allarme sbagliato, e
  dopo due volte sullo stesso dominio la soglia dovrebbe alzarsi da sola. Oggi lo
  storico non registra né quando l'avviso è comparso, né se i dettagli sono stati
  aperti, né quali regole hanno prodotto il verdetto: senza quei tre campi la
  misura non è calcolabile, e soprattutto non è *attribuibile* a una regola;
- **catene di filtri nei PDF** (`/ASCII85Decode`), che oggi restituiscono vuoto;
- **regole come dati**: oggi sono codice, quindi ogni aggiornamento passerebbe
  dalla revisione dello store. Manifest V3 vieta il codice remoto ma non i dati —
  con firma ECDSA, ruleset completo nel pacchetto e adozione condizionata a un
  self-test sul corpus;
- **`_locales` oltre il manifest**: il motore deve restituire chiavi e parametri
  invece di frasi già composte, altrimenti `core/` finisce per dipendere da
  `chrome.i18n` e smette di essere verificabile in Node;
- **benchmark di settore**: non «questa clausola è rischiosa» ma «questa clausola
  è anomala rispetto a servizi simili». Se durante la raccolta dei checkout reali
  si annotano durata, preavviso e penale, esce quasi gratis dallo stesso lavoro;
- **export e import del registro**: oggi disinstallare cancella tutto, ed è
  l'unica assenza il cui costo è la *perdita* di dati.

---

## Prima della pubblicazione

Quello che manca per lo store non è codice. Il codice remoto è pulito (nessun
`eval`, nessun `new Function`, nessun import da rete: l'unico `import()` dinamico
punta a un file del pacchetto), i permessi sono ridotti al necessario, la chiave
API non raggiunge più i content script e il consenso all'invio remoto è esplicito.
Restano cinque cose che dipendono da una persona:

1. **Privacy policy pubblicata** e le *data disclosure* nel Developer Dashboard.
   Servono anche a un'estensione che tratta tutto in locale: l'obbligo è
   dichiarare *come* si trattano i dati, non *dove*. Le categorie da spuntare,
   ancorate al codice: informazioni personali (`identity`), credenziali
   (`apiKey`), contenuto dei siti (`snapshots`), cronologia (`history`), attività
   dell'utente (le decisioni prese). Il punto delicato è la cronologia: la policy
   la consente solo se sostiene una funzione dichiarata e visibile — qui è il
   registro degli impegni, ma va **descritto nella scheda dello store e
   nell'interfaccia**, non dato per ovvio.

2. **Single purpose.** Elencate una per una, le funzioni sono tredici, e il
   rifiuto per «bundle di funzionalità scollegate» esiste. Non lo sono: sono una
   catena temporale sullo stesso oggetto — l'impegno contrattuale — prima del
   click, al momento del click, dopo. Da dire così, e con due accorgimenti: **non
   presentare l'estrattore PDF come una funzione** (è un formato di ingresso del
   pannello, non un lettore PDF) e nominare il generatore di lettere sempre come
   *kit di uscita dall'impegno registrato*, mai come strumento autonomo. Sono i
   due componenti che più sembrano prodotti a sé.

3. **Materiali**: screenshot 1280×800 (l'avviso che blocca un click con il numero
   grande, il registro con una scadenza, la lettera generata), il *promo tile*
   440×280 — obbligatorio, non opzionale — e uno script di impacchettamento con
   **allowlist esplicita** (`manifest.json`, `src/`, `_locales/`). Mai una
   blocklist: oggi lo zip conterrebbe `test/`, `demo/` e `_to_delete/`, e
   `demo/checkout.html` è per costruzione una pagina piena di dark pattern —
   letta fuori contesto da un revisore, lavora contro di te.

4. **Note al revisore.** Due comportamenti non violano nulla ma *somigliano* a
   ciò che le policy colpiscono, e vanno disinnescati prima che li interpreti: il
   `MutationObserver` che rimette a posto l'avviso con stili `!important` e
   z-index massimo è la firma tipica di un ad-injector, e il ritardo di tre
   secondi su «Continua comunque» su un checkout può sembrare interferenza.
   Spiegarli in due righe, e allegare `demo/checkout.html` come pagina di prova
   indicando che «Iscriviti alla newsletter» **non** deve far scattare nulla: la
   controprova sui falsi allarmi è la dimostrazione migliore che l'estensione non
   è invasiva.

5. **Il rischio più concreto non è normativo.** Il revisore proverà su siti veri,
   e un falso positivo che blocca un checkout reale è la causa di rifiuto più
   probabile di tutte — contro cui non esiste giustificazione scritta. Prima di
   sottomettere vanno fatti i 25-30 checkout reali. Vale la pena valutare, per la
   prima versione, un default più prudente (`blockFrom: 'high_risk'`, o una prima
   settimana in sola notifica): la protezione si alza dopo, con dati veri; una
   review fallita non si recupera in fretta.

---

## Funzionalità valutate

Tre di queste non sono funzionalità nuove: sono funzionalità esistenti che oggi
si fermano a metà. Vengono prima delle altre.

- **Cassaforte del registro** *(S/M)* — export e import verificato. È l'unica
  assenza il cui costo è la **perdita** di dati: disinstallare cancella prove,
  scadenze e snapshot, e non esiste un export del registro. All'import va
  ricalcolato lo SHA-256 di ogni snapshot, e gli impegni la cui impronta non
  torna vanno importati **marcati come non verificabili**, non accettati in
  silenzio. Il vincolo vero: il file che ne esce è l'oggetto più pericoloso che
  il prodotto possa produrre — testi contrattuali integrali, nome, indirizzo,
  email — e finirà su un disco condiviso. Cifratura opzionale con passphrase,
  non obbligatoria: un backup illeggibile è peggio di nessun backup.

- **Aggiungi un impegno a mano** *(S)* — oggi un impegno nasce solo da un
  verdetto, quindi la palestra firmata allo sportello, l'assicurazione dal
  broker, la luce firmata al telefono sono invisibili. Sono esattamente i
  contratti con le penali e i preavvisi peggiori.

- **Chiusura del ciclo** *(M)* — «hai disdetto, o è ripartito?». Nulla riscrive
  `renewalAt` dopo la creazione: passata la scadenza l'impegno si fossilizza,
  `dueReminder()` non può più scattare e chi ha subìto il rinnovo quest'anno non
  verrà avvisato l'anno prossimo. **Un anti-rinnovo che funziona solo per il
  primo rinnovo.** È l'unica proposta che chiede qualcosa all'utente, quindi va
  progettata per l'utente silenzioso: mai bloccare, mai insistere, e distinguere
  sempre un periodo confermato da uno presunto.

- **Panoramica** *(S/M)* — `portfolioSummary()` esiste ma somma orizzonti
  diversi: un acquisto una tantum da 49 € e una telefonia biennale da 648 €
  finiscono nella stessa cifra. Servono il *run-rate* mensile, la proiezione a
  12 mesi e le scadenze dei prossimi 90 giorni — più una riga di copertura
  sempre visibile («calcolato su 4 impegni su 7»), che è la parte non
  negoziabile: un cruscotto su dati parziali che *sembra* completo è peggio
  della lista attuale.

- **La finestra dei 14 giorni** *(S)* — `suggestKind()` sa già che entro 14
  giorni la lettera giusta è il recesso, ma niente lo dice all'utente. È l'unico
  momento in cui uscire non costa nulla, e scade in silenzio. Attenzione: i 14
  giorni non decorrono sempre dalla stessa data — dalla consegna per i beni,
  dalla conclusione per i servizi — e per i servizi digitali già eseguiti con
  consenso espresso il diritto si perde. Un countdown sbagliato qui è più
  dannoso di nessun countdown.

- **Come si disdice, non solo entro quando** *(S/M)* — la disdetta si manca
  perché si scopre a tre giorni dalla scadenza che serve una raccomandata A/R o
  una PEC che non si ha. Il canale è quasi sempre scritto nel contratto, in
  forme molto regolari. Mai presentarlo come verificato: «trovato nel testo,
  verifica prima di spedire», con la citazione a fianco.

- **Gli abbonamenti che hai già** *(M/L)* — import da estratto conto incollato,
  con la cadenza dedotta dagli intervalli fra addebiti. Risolve il problema del
  registro vuoto al primo avvio. Ma è il testo più sensibile che un utente possa
  incollare: va elaborato in memoria, mai messo in cache, mai passato a un
  modello — nemmeno a quello on-device — e va detto **prima** dell'incolla.

- **Confronto fra due offerte** *(M)* — è la conseguenza logica della tesi del
  prodotto: se il prezzo mostrato non è l'impegno, l'offerta a 14,99 può costare
  più di quella a 19,99. Obbligatorio un indicatore di completezza per colonna e
  il **rifiuto esplicito di dichiarare un vincitore** quando i dati non sono
  paragonabili. Ha senso solo dopo i checkout reali: è la funzione più esposta
  all'accuratezza del motore.

- **Benchmark di settore** *(L, ma il codice è S)* — «questo preavviso è il
  doppio di quello che ho visto in tutti gli altri contratti di telefonia» non lo
  dice nessuno, ed è l'unica affermazione che sposta davvero una decisione. Si fa
  senza server e senza telemetria, con un dataset statico spedito nel pacchetto,
  a patto di dire sempre su quanti contratti si basa e di quando è la raccolta.
  Il costo vero è ricorrente: il dataset invecchia. Conviene farlo uscire dalla
  raccolta dei checkout reali, annotando durata, preavviso e penale mentre la si
  fa. Una ricaduta funziona già da subito e senza dati esterni: il confronto con
  il registro dell'utente — «è il terzo servizio con rinnovo automatico che
  accetti, e ha il preavviso più lungo dei tre».

### Idee scartate, e perché

| Idea | Perché no |
|---|---|
| Modalità «prima di comprare» | Esiste già, con cinque vie d'ingresso. Se non viene usata è un problema di scoperta, non di funzionalità. |
| Rapporto «cosa è cambiato quest'anno» | Retrospettiva, non azione: si guarda una volta e non cambia una decisione. La versione utile è il calendario a 90 giorni, cioè la stessa cosa guardata in avanti. |
| Condivisione via link | Richiede un server e produce di fatto telemetria. Romperebbe l'unica affermazione assoluta del progetto per una funzione di cui non è dimostrata la domanda. Un file HTML autoconsistente copre il 90% del bisogno. |
| Benchmark federato fra utenti | Stesso motivo, aggravato: server, infrastruttura e una promessa nuova, per un guadagno che un dataset curato a mano dà già. |
| Sincronizzazione via `chrome.storage.sync` | Quota di 100 KB — un solo snapshot la fa saltare — e manderebbe contratti e identità sull'account Google. Il progetto ha già preso deliberatamente la posizione opposta. |
| Invio automatico della disdetta | Il salto da «documento pronto» ad «atto spedito dal software» cambia la natura del prodotto e la sua responsabilità: una disdetta inviata alla data sbagliata diventerebbe un danno causato da Vincolo. |
| Punteggio del fornitore | Trasforma l'analisi di un documento in un giudizio reputazionale costruito su uno o due contratti. Il benchmark di settore dà l'informazione utile senza nominare nessuno. |
| Rifiuto automatico dei cookie banner | Lo fanno già altri, meglio, ed è in contraddizione con il principio del marchio: Vincolo informa e non proibisce. |
| OCR sui PDF scansionati | Costruire in altezza sulle fondamenta più deboli. Prima le catene di filtri, che sono un problema più comune e molto più economico. |
| Pulsante «questo avviso era sbagliato» | Il segnale implicito — proseguire in pochi secondi senza aprire i dettagli — è migliore, perché non chiede nulla. Quello esplicito è una riga da aggiungere a quel lavoro, non una funzione a sé. |

---

## Avvertenza legale

Vincolo produce **analisi automatica a scopo informativo. Non è consulenza
legale.** I riferimenti normativi — Codice del Consumo, Codice civile, GDPR,
DSA, direttive UE — servono a indicare dove guardare, non a stabilire la
validità di una clausola nel caso concreto: dipende dal contratto, dalle parti e
dalla qualifica di consumatore.

Le lettere generate sono modelli da verificare e completare prima dell'invio.

Il calcolo dell'impegno è una stima ricavata dal testo, non un preventivo.

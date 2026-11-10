# AnteFirma*

**Prima di firmare, sai a che cosa ti impegni.**

[antefirma.app](https://antefirma.app) · estensione per Chrome ed Edge (Manifest V3) · versione 0.5.0

Si accende quando stai per premere un pulsante che ti impegna — Accetta,
Abbonati, Acquista, Firma — e ti dice in euro e in date a che cosa ti stai
impegnando: costo reale, durata minima, rinnovo automatico, penali, preavvisi,
arbitrato, licenze sui contenuti, uso dei dati. Il risultato non è
`Risk score 73/100`, ma:

> **Vedi 19,99 €/mese, ma stai impegnando fino a 648,76 €**
> 19,99 € × 24 cicli + penale 120,00 € + attivazione 49,00 €
> 📌 Entro il 16 giugno 2028 devi inviare la disdetta.

Ogni avviso cita la frase esatta della pagina da cui nasce: se la frase non c'è,
l'avviso non compare. Dopo il sì: promemoria prima dell'ultimo giorno utile per
disdire, lettera di disdetta già scritta (Italia e Spagna), elenco degli impegni
nel pannello laterale. Nessun account.

---

## Come funziona

```
pulsante premuto ──► content script (sospende il click, legge la pagina)
                          │
                          ▼
                    service worker ──► POST /v1/analyze ──► server di AnteFirma ──► Claude
                          │                                   (scarta ogni rischio la cui
                          │                                    citazione non è nel testo)
                          ▼
     severità ed etichette · costo · scadenze · profilo · tutele UE/IT · punteggio
                          │
                          ▼
                 avviso sulla pagina  →  Torna indietro / Continua comunque
```

- **L'analisi la fa il server** (`antefirma-server`): l'estensione non contiene
  nessuna chiave. Manda il testo della pagina, l'indirizzo, il tipo di azione,
  il testo del pulsante e il paese; riceve i rischi con la citazione e le
  condizioni economiche, ciascuna con il passo da cui nasce.
- **Severità, etichette e colori li decide l'estensione**
  (`src/core/constants.js`), non il modello. La fiducia del modello sposta la
  severità solo verso il basso, e di poco.
- **Il costo** si calcola soltanto con le cifre che il server ha verificato nel
  passo citato — canone, durata, preavviso, penale e costi accessori
  (`extra_fees`: attivazione, istruttoria, spese per rata moltiplicate per i
  cicli) — più il prezzo letto nella pagina vicino al pulsante (che vince
  su quello letto nel testo).
- **Profilo personale, tutele UE/IT, punteggio, scadenze**: tutto in locale,
  come prima.
- **Se il server non risponde**, l'avviso lo dice e lascia scegliere. Non c'è un
  verdetto di ripiego: fingere un «tutto a posto» sarebbe peggio.

Non c'è più il motore a regole locale né il modello sul dispositivo (fino alla
0.4). Non c'è più nemmeno la pre-analisi prima del click: con il server
consumerebbe una quota a ogni pulsante visto.

### Il consenso

Il testo della pagina parte verso il server solo dopo un sì esplicito, chiesto
alla prima analisi dentro l'avviso (o nel pannello, o nelle impostazioni). Il
Chrome Web Store chiede proprio questo: una spiegazione nell'interfaccia e un
atto di accettazione prima della raccolta. Il pulsante «Sì, analizza» accetta
solo click veri (`isTrusted`): l'avviso sta in uno shadow root aperto, e uno
script della pagina non deve poterlo premere al posto della persona.

Chi aggiorna dalla 0.4 perde il consenso dato allora (riguardava l'invio ad
Anthropic o OpenAI con la propria chiave) e la chiave viene cancellata dal
disco: cambia chi riceve il testo, quindi si chiede di nuovo.

### Il token

All'installazione l'estensione genera un id casuale (`crypto.randomUUID()`) e
chiede un token al server (`POST /v1/register`). Il token identifica
l'installazione, non la persona, e scade dopo 90 giorni: a un 401 se ne chiede
uno nuovo e si riprova una volta. Le quote giornaliere sono per installazione,
per indirizzo IP e globali.

---

## Installazione (sviluppo)

Servono Chrome, Edge o Brave **versione 116 o successiva**.

1. Apri `chrome://extensions` e attiva **Modalità sviluppatore**.
2. **Carica estensione non pacchettizzata** e seleziona questa cartella.
3. Al primo caricamento si apre la pagina delle impostazioni.

Prova: servi `demo/` con un server locale (`python3 -m http.server -d demo`) e
premi «Conferma abbonamento» in `checkout.html`. Il pulsante «Iscriviti alla
newsletter» **non** deve far scattare niente.

### Contro un server locale

L'indirizzo del server sta in un solo posto, `src/core/config.js`
(`https://api.antefirma.app`). Per provare con `npm start` di `antefirma-server`:

1. in `src/core/config.js` metti `http://localhost:8787`;
2. in `manifest.json` aggiungi `http://localhost:8787/*` a `host_permissions`;
3. avvia il server con `ALLOWED_ORIGINS` vuoto (accetta qualsiasi origine) o con
   l'id che l'estensione ha in `chrome://extensions`.

Non pubblicare questi due cambiamenti.

---

## Permessi richiesti e perché

| Permesso | A cosa serve |
|---|---|
| `https://api.antefirma.app/*` | il server di analisi |
| `<all_urls>` | l'intercettazione deve funzionare su qualsiasi sito; scaricare il documento dei termini collegato al pulsante |
| `activeTab`, `scripting` | leggere la pagina corrente quando lo chiedi dal pannello |
| `storage` + `unlimitedStorage` | impostazioni, cache, impegni e il testo integrale delle prove |
| `alarms` | la passata quotidiana e il controllo delle condizioni |
| `notifications` | i promemoria delle scadenze |
| `sidePanel` | il pannello con analisi manuali, impegni e storico |
| `contextMenus` | «Analizza il testo selezionato» |

## Che cosa esce dal browser

**Verso il server di AnteFirma, solo dopo il consenso:** il testo della pagina
(al massimo 80.000 caratteri), il suo indirizzo, il tipo di azione, il testo del
pulsante, la lingua e il paese scelto nelle impostazioni, il token
dell'installazione.

**Non esce:** la cronologia, i dati per le lettere di disdetta, gli impegni
registrati, le prove, il profilo personale.

Il controllo delle condizioni già accettate rilegge il documento pubblico e,
solo se il testo è cambiato, lo fa rileggere al server (si può spegnere nelle
impostazioni: allora dice soltanto che il testo è cambiato).

---

## Kit di uscita e prova

Invariati dalla 0.4: impegni registrati con scadenze e promemoria a 30, 7 e 1
giorno, file `.ics`, lettera di disdetta o di recesso (Italia e Spagna),
impronta SHA-256 del testo accettato con attestazione, controllo periodico delle
condizioni.

---

## Pacchetto per sviluppatori e tester

```bash
node tools/dev-zip.mjs     # → dist/antefirma-dev-<versione>.zip
```

Il pacchetto ha nel manifest una chiave pubblica fissa, quindi l'ID è sempre
`alfaikbfkaimaejlhghbjffihjgoigoh`, autorizzato nel server (`ALLOWED_ORIGINS`).
Lo ZIP si carica nel bucket R2 `antefirma-backup` (giurisdizione UE) sotto
`dev/` e si scarica dal pannello, **Strumenti → Estensione per sviluppatori**.
Il manifest del repository resta senza chiave: lo store assegna il suo ID.

## AnteFirma web (da installare sul computer)

```bash
node tools/web-build.mjs        # → dist/web, pubblicata su web.antefirma.app
node tools/web-build.mjs --icons   # solo se cambia il marchio: rigenera web/icons (serve Playwright)
```

Si pubblica da sola: il Worker **antefirma-web** (`wrangler.toml` in questa cartella) è
collegato a questo repository con Workers Builds (build `node tools/web-build.mjs`,
pubblicazione `npx wrangler deploy`). Ogni push aggiorna anche la versione web.
`dist/web/_headers` fissa le regole di sicurezza della pagina (CSP: solo i propri
file e api.antefirma.app).

Lo stesso codice di pannello, impostazioni e «sfondo», con `web/shim.js` che
imita le API di Chrome in una pagina normale (IndexedDB, timer, notifiche del
browser). È un'app installabile (PWA): manifest, icone, service worker.
Fa: testo incollato e PDF, impegni, scadenze, lettere, piano e chiave.
Non può: fermare i click sugli altri siti o leggere le altre schede (per quello
serve l'estensione). Il server deve ammettere l'origine `https://web.antefirma.app` (`APP_ORIGINS`).

## Guida, schermate e video

Il centro di aiuto è sul sito (`antefirma.app/aiuto/`, testi in `antefirma-site/help.mjs`).
Il «?» del pannello, delle impostazioni e dell'avviso ci porta con `src/core/help.js`
(stesse chiavi e stessi indirizzi: lo controlla `test/help.test.mjs`).

A ogni versione che cambia l'aspetto, si rifanno le immagini e il manuale:

    node tools/help-shots.mjs                  # schermate e video 15–20 s, it/en/es → ../antefirma-site/assets/help
    (cd ../antefirma-site && node tools/manual-pdf.mjs)   # pagina Team + manuale PDF nelle tre lingue

Entrambi usano un server finto e un sito inventato: nessuna analisi spesa, nessun dato vero.

## Safari (Mac)

```bash
node tools/safari-build.mjs     # → dist/safari: manifest senza pannello laterale e notifiche
```

Poi, **su un Mac con Xcode** (non si può fare da Linux):

```bash
xcrun safari-web-extension-converter dist/safari --project-location safari-xcode \
  --app-name AnteFirma --bundle-identifier app.antefirma.safari --macos-only --copy-resources
```

1. Apri il progetto in Xcode, scegli il tuo Team in *Signing & Capabilities*, premi Run.
2. In Safari: *Impostazioni → Avanzate → Mostra funzioni per sviluppatori*, poi
   *Sviluppo → Consenti estensioni non firmate*; attiva AnteFirma in *Impostazioni → Estensioni*.
3. Per pubblicarla serve l'Apple Developer Program (99 USD l'anno) e l'invio da
   App Store Connect, come per un'app.

In Safari il pannello si apre dal pulsante nella barra (finestrella) e dal menu
contestuale (scheda); le notifiche non ci sono, i promemoria restano nel pannello
e nel calendario (.ics). Il server accetta le origini `safari-web-extension://`
con `ALLOW_SAFARI=1`. Da provare su un Mac prima della pubblicazione: il service
worker come modulo richiede Safari 16.4 o successivo.

## Test

```bash
node --test test/*.test.mjs
```

| file | che cosa prova |
|---|---|
| `engine.test.mjs` | dalla risposta del server al verdetto: severità, costo, scadenze, profilo, tutele, punteggio; guardie dei messaggi |
| `server.test.mjs` | client del server: token, nuovo tentativo dopo un 401, errori |
| `calibration.test.mjs` | il punteggio resta tarato sui nove testi di `fixtures/corpus.mjs` |
| `features.test.mjs` | prova, impegni, promemoria, `.ics`, lettere |
| `actions.test.mjs` | quali pulsanti vengono intercettati |
| `pdf.test.mjs` | estrazione del testo dai PDF |
| `i18n.test.mjs` | ogni frase del codice e delle pagine ha la traduzione inglese e spagnola, con gli stessi segnaposti |

Il server è sostituito da risposte scritte a mano o registrate
(`fixtures/responses.mjs`, ricavate una volta dal vecchio motore a regole). La
bravura del modello si misura nel server con `npm run eval`.

`test/smoke.mjs` prova l'estensione in un Chromium vero, con il server finto: intercettazione del click, consenso, verdetto con il costo, «Continua comunque», il pulsante «Passa a Pro» a analisi finite, impostazioni in spagnolo, avviso e pannello in inglese. `node test/smoke.mjs` (con `SHOTS=cartella` salva anche le schermate).

---

## Struttura del codice

```
manifest.json, _locales/{it,en,es}   nome e descrizione nelle tre lingue
src/background/service-worker.js     messaggi, consenso, analisi, impegni, allarmi
src/content/                         detector, contesto della pagina, avviso
src/core/config.js                   indirizzo del server
src/core/server.js                   client del server: token, analisi, errori
src/core/analyzer.js                 dalla risposta del server al verdetto
src/core/consequence.js              costo e timeline dalle cifre verificate
src/core/{profile,eu,scoring}.js     profilo, tutele UE/IT, punteggio
src/core/{commitments,letter,ics,proof}.js  kit di uscita e prova
src/sidepanel/, src/options/         pannello e impostazioni (con la sezione Piano)
src/i18n/                            lingue: t(), dizionario it→en/es, traduzione delle pagine
```

Convenzioni: identificatori in inglese, commenti e testi per l'utente in
italiano. Nessun segreto nel codice.

**Lingue.** I testi si scrivono in italiano dentro `t('…')` (o `tn(n, '…', '…')`
per singolare e plurale); la traduzione inglese e spagnola va in
`src/i18n/dict.js`, con la frase italiana come chiave. Le pagine HTML restano
scritte in italiano e le traduce `src/i18n/dom.js` all'apertura. La lingua si
sceglie nelle impostazioni («Automatica» segue il browser; fuori da it/es,
inglese) e vale anche per le risposte del server. `test/i18n.test.mjs` fallisce
se una frase non ha la traduzione. Le lettere di disdetta restano in italiano:
sono documenti per i contratti italiani.

## Limiti noti

- **Le lettere di disdetta sono solo in italiano**, per i contratti italiani.
- **Il modello può tacere un rischio**: la verifica delle citazioni impedisce
  che ne inventi, non che ne ometta. Una pagina può provare a convincerlo a
  tacere.

## Avvertenza legale

AnteFirma produce **analisi automatica a scopo informativo. Non è consulenza
legale.** I riferimenti normativi servono a indicare dove guardare, non a
stabilire la validità di una clausola nel caso concreto. Le lettere generate
sono modelli da verificare prima dell'invio. Il calcolo dell'impegno è una stima
ricavata dal testo, non un preventivo.

/**
 * Test del riconoscimento delle azioni.
 *
 * actions.js è un classic script che si registra su globalThis: importarlo
 * qui lo esegue e basta, senza bisogno di DOM né di API di Chrome.
 *
 * Questi test valgono più di quanto sembri: ogni falso positivo qui è un
 * blocco su un pulsante innocuo, ed è il modo più rapido per far disinstallare
 * l'estensione. Ogni falso negativo è un impegno che passa senza avviso.
 */

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content/actions.js';

const { classifyText, ACTION_LABELS, ACTION_PATTERNS } = globalThis.__CF.actions;

test('riconosce i pulsanti di impegno in italiano', () => {
  const cases = {
    'Conferma abbonamento': 'subscribe',
    'Abbonati ora': 'subscribe',
    'Attiva il piano Premium': 'subscribe',
    'Inizia la prova gratuita': 'subscribe',
    'Procedi al pagamento': 'purchase',
    'Conferma ordine': 'purchase',
    'Acquista adesso': 'purchase',
    'Completa l’ordine': 'purchase',
    'Firma il contratto': 'sign',
    'Accetta e firma': 'sign',
    'Ho letto e accetto le condizioni': 'accept_terms',
    'Accetta tutti i cookie': 'consent',
    'Continua con Google': 'oauth',
    'Autorizza l’applicazione': 'oauth',
    'Crea un account': 'signup',
    'Registrati': 'signup',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" classificato male`);
  }
});

test('riconosce i pulsanti di impegno in inglese', () => {
  const cases = {
    'Subscribe now': 'subscribe',
    'Start free trial': 'subscribe',
    'Buy now': 'purchase',
    'Place your order': 'purchase',
    'Proceed to checkout': 'purchase',
    'Sign document': 'sign',
    'I agree': 'accept_terms',
    'Accept all cookies': 'consent',
    'Continue with Apple': 'oauth',
    'Create an account': 'signup',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" classificato male`);
  }
});

test('non blocca i pulsanti innocui', () => {
  const innocui = [
    'Iscriviti alla newsletter',
    'Scopri di più',
    'Cerca',
    'Aggiungi al carrello',
    'Salva bozza',
    'Condividi',
    'Filtra risultati',
    'Vedi tutti i piani',
    'Contattaci',
    'Search',
    'Learn more',
    'Add to cart',
    'Next',
    'Load more',
  ];
  for (const text of innocui) {
    assert.equal(classifyText(text), null, `falso positivo su "${text}"`);
  }
});

test('il rifiuto ha sempre la precedenza sull’accettazione', () => {
  const optOuts = [
    'Rifiuta tutti i cookie',
    'Continua senza accettare',
    'Solo i cookie necessari',
    'Non accetto',
    'Reject all',
    'Decline',
    'Gestisci preferenze',
    'Annulla abbonamento',
    'Disdici',
  ];
  for (const text of optOuts) {
    assert.equal(classifyText(text), null, `bloccato un opt-out: "${text}"`);
  }
});

test('a parità di match vince l’azione più impegnativa', () => {
  assert.equal(classifyText('Accetta e firma il contratto'), 'sign');
  assert.equal(classifyText('Accetta le condizioni e paga ora'), 'purchase');
  assert.equal(classifyText('Registrati e abbonati'), 'subscribe');
});

test('ogni tipo riconosciuto ha una sua etichetta leggibile', () => {
  for (const p of ACTION_PATTERNS) {
    assert.ok(ACTION_LABELS[p.type], `etichetta mancante per ${p.type}`);
  }
});

test('testo vuoto o assente non produce nulla', () => {
  assert.equal(classifyText(''), null);
  assert.equal(classifyText(null), null);
  assert.equal(classifyText(undefined), null);
});

// ── richiamo: etichette viste in produzione ─────────────────────────────────

test('riconosce le formule di pagamento che si trovano nei checkout veri', () => {
  const cases = {
    'Continua e paga': 'purchase',
    'Vai al pagamento': 'purchase',
    'Paga con carta': 'purchase',
    'Effettua il pagamento': 'purchase',
    'Concludi l’ordine': 'purchase',
    'Ordina ora': 'purchase',
    'Ordina e paga': 'purchase',
    'Conferma e procedi': 'purchase',
    'Confirm and pay': 'purchase',
    'Continue to payment': 'purchase',
    'Checkout': 'purchase',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" non riconosciuto`);
  }
});

test('riconosce le formule di attivazione di un abbonamento', () => {
  const cases = {
    'Attiva ora': 'subscribe',
    'Conferma e attiva': 'subscribe',
    'Provalo gratis': 'subscribe',
    'Prova gratis per 30 giorni': 'subscribe',
    'Passa a Premium': 'subscribe',
    'Iscriviti a Premium': 'subscribe',
    'Scegli questo piano': 'subscribe',
    'Get Premium': 'subscribe',
    'Upgrade': 'subscribe',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" non riconosciuto`);
  }
});

test('riconosce accesso delegato e consenso nelle forme brevi', () => {
  assert.equal(classifyText('Accedi con Google'), 'oauth');
  assert.equal(classifyText('Continua con l’account Google'), 'oauth');
  assert.equal(classifyText('Consenti'), 'consent');
  assert.equal(classifyText('Ho capito'), 'consent');
});

/**
 * La controprova del punto precedente: allargare le tabelle è utile solo se
 * non allarga anche i falsi allarmi. «Continua» da solo non deve bastare —
 * per quello c'è il fallback strutturale del detector, che chiede al DOM se
 * siamo in un checkout invece di indovinarlo dal testo.
 */
test('i pulsanti generici e quelli innocui restano fuori', () => {
  const outside = [
    'Continua', 'Avanti', 'Conferma', 'Procedi', 'Continue', 'Next', 'Ok',
    'Iscriviti alla newsletter', 'Passa alla modalità scura', 'Attiva le notifiche',
    'Vedi i dettagli del piano', 'Confronta i piani', 'Scarica la fattura',
    'Prova la ricerca', 'Aggiungi al carrello', 'Accedi', 'Login',
  ];
  for (const text of outside) {
    assert.equal(classifyText(text), null, `falso positivo su "${text}"`);
  }
});

// ── opt-out posizionale ────────────────────────────────────────────────────

/**
 * L'opt-out valutato come veto assoluto mangiava impegni veri: "cancel
 * anytime" è microcopy standard nei checkout in inglese, e cancellava
 * l'abbonamento che lo conteneva.
 */
test('un opt-out in coda non cancella l’azione che lo precede', () => {
  const cases = {
    'Subscribe — cancel anytime': 'subscribe',
    'Subscribe now, cancel anytime': 'subscribe',
    'Firma il contratto e chiudi': 'sign',
    'Paga ora e torna al carrello': 'purchase',
    'Conferma ordine e annulla il precedente': 'purchase',
    'Attiva ora e disdici quando vuoi': 'subscribe',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" cancellato da un opt-out in coda`);
  }
});

test('un opt-out in testa vince comunque', () => {
  const cases = [
    'Annulla e torna al carrello',
    'Chiudi senza pagare',
    'Cancel subscription',
    'Rifiuta e continua con l’acquisto',
    'Torna indietro e paga più tardi',
  ];
  for (const text of cases) {
    assert.equal(classifyText(text), null, `non ha vinto il rifiuto in testa: "${text}"`);
  }
});

/**
 * Il test «il rifiuto ha sempre la precedenza» resta verde per una ragione
 * precisa, e va verificata invece che data per scontata: in tutti e nove i
 * suoi casi il rifiuto è la prima parola dell'etichetta.
 */
test('nei nove casi di rifiuto storici il match cade nel primo terzo', () => {
  const optOuts = [
    'Rifiuta tutti i cookie', 'Continua senza accettare', 'Solo i cookie necessari',
    'Non accetto', 'Reject all', 'Decline', 'Gestisci preferenze',
    'Annulla abbonamento', 'Disdici',
  ];
  const { OPT_OUT } = globalThis.__CF.actions;
  for (const text of optOuts) {
    const m = OPT_OUT.exec(text);
    if (!m) {
      // «Gestisci preferenze» non è un opt-out riconosciuto: resta null perché
      // nessuna azione lo intercetta, ed è comunque il risultato giusto.
      assert.equal(classifyText(text), null, `"${text}" senza opt-out e senza azione`);
      continue;
    }
    assert.ok(m.index < Math.ceil(text.length / 3), `"${text}": opt-out a ${m.index}, fuori dal primo terzo`);
    assert.equal(classifyText(text), null, `"${text}" non più bloccato`);
  }
});

test('un’azione debole non regge il confronto con un opt-out, ovunque sia', () => {
  // signup pesa 1: "Registrati" più un rifiuto resta un rifiuto.
  assert.equal(classifyText('Registrati oppure annulla'), null);
  // sign pesa 5: la firma regge.
  assert.equal(classifyText('Sottoscrivi il documento oppure annulla'), 'sign');
});

test('classifyDetail distingue «non ho trovato niente» da «è un rifiuto»', () => {
  const { classifyDetail } = globalThis.__CF.actions;
  assert.deepEqual(classifyDetail('Cerca'), { type: null, weight: 0, vetoed: false });
  assert.equal(classifyDetail('Annulla').vetoed, true);
  assert.equal(classifyDetail('Abbonati ora').type, 'subscribe');
});

// ── spagnolo ───────────────────────────────────────────────────────────────

test('riconosce i pulsanti di impegno in spagnolo', () => {
  const cases = {
    'Firmar': 'sign',
    'Firmar el contrato': 'sign',
    'Aceptar y firmar': 'sign',
    'Firmar documento': 'sign',
    'Suscribirse': 'subscribe',
    'Suscríbete': 'subscribe',
    'Activar el plan': 'subscribe',
    'Activar ahora': 'subscribe',
    'Empezar prueba gratis': 'subscribe',
    'Comenzar prueba gratuita': 'subscribe',
    'Pasar a Premium': 'subscribe',
    'Elegir este plan': 'subscribe',
    'Mejorar plan': 'subscribe',
    'Comprar': 'purchase',
    'Comprar ahora': 'purchase',
    'Pagar': 'purchase',
    'Pagar ahora': 'purchase',
    'Ir al pago': 'purchase',
    'Continuar y pagar': 'purchase',
    'Finalizar compra': 'purchase',
    'Finalizar pedido': 'purchase',
    'Confirmar pedido': 'purchase',
    'Realizar pedido': 'purchase',
    'Tramitar pedido': 'purchase',
    'Autorizar': 'oauth',
    'Permitir acceso': 'oauth',
    'Continuar con Google': 'oauth',
    'Acceder con Google': 'oauth',
    'Iniciar sesión con Google': 'oauth',
    'Aceptar todas': 'consent',
    'Aceptar todas las cookies': 'consent',
    'Permitir todo': 'consent',
    'Consentir': 'consent',
    'Entendido': 'consent',
    'Acepto': 'accept_terms',
    'He leído y acepto': 'accept_terms',
    'Acepto los términos': 'accept_terms',
    'Estoy de acuerdo': 'accept_terms',
    'Crear cuenta': 'signup',
    'Registrarse': 'signup',
    'Regístrate': 'signup',
    'Darse de alta': 'signup',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" classificato male`);
  }
});

/**
 * Bloccare un opt-out è il contrario di ciò che serve: l'utente sta già
 * rifiutando, e l'unico effetto dell'avviso sarebbe rimandarlo indietro verso
 * il pulsante che accetta. Qui non basta che il risultato sia null: si
 * controlla anche che sia null *per veto*, perché è il veto a impedire agli
 * attributi HTML di rimettere in gioco l'azione (vedi classifyDetail).
 */
test('gli opt-out spagnoli non vengono mai intercettati', () => {
  const { classifyDetail } = globalThis.__CF.actions;
  const optOuts = [
    'Rechazar',
    'Rechazar todas',
    'Rechazar todas las cookies',
    'Solo las necesarias',
    'Sólo las necesarias',
    'Continuar sin aceptar',
    'Cancelar',
    'Volver',
    'Atrás',
    'Gestionar preferencias',
    'Configurar cookies',
    'Darse de baja',
    'Dar de baja',
    'No acepto',
    'Cancelar suscripción',
  ];
  for (const text of optOuts) {
    assert.equal(classifyText(text), null, `bloccato un opt-out: "${text}"`);
    assert.equal(classifyDetail(text).vetoed, true, `"${text}" è null per caso, non per veto`);
  }
});

/**
 * Molti siti spagnoli scrivono i pulsanti senza accenti, e chi ci clicca sopra
 * si impegna esattamente quanto chi clicca su quello del sito scritto bene.
 */
test('le forme accentate e quelle senza accento valgono uguale', () => {
  const pairs = [
    ['Suscríbete', 'Suscribete', 'subscribe'],
    ['Regístrate', 'Registrate', 'signup'],
    ['Sólo las necesarias', 'Solo las necesarias', null],
    ['Atrás', 'Atras', null],
    ['Iniciar sesión con Google', 'Iniciar sesion con Google', 'oauth'],
    ['Acepto los términos', 'Acepto los terminos', 'accept_terms'],
  ];
  for (const [accented, unaccented, wanted] of pairs) {
    assert.equal(classifyText(accented), wanted, `"${accented}" classificato male`);
    assert.equal(classifyText(unaccented), wanted, `"${unaccented}" classificato male`);
  }
});

/**
 * Il difetto che in questo progetto è già costato tre regole, dimostrato
 * invece che raccontato: `\b` in JavaScript è definito su [A-Za-z0-9_], e fra
 * uno spazio e una vocale accentata non c'è nessuna transizione da agganciare.
 * Una regola che ci si appoggia non fallisce con un errore: semplicemente non
 * scatta mai, e il pulsante passa.
 */
test('il confine di parola spagnolo non si appoggia a \\b', () => {
  assert.equal(/\bsuscr\w+\b/i.test('Suscríbete'), false, '\\w+ dovrebbe fermarsi davanti alla í');
  assert.equal(/\b(únete)\b/i.test('Únete ahora'), false, '\\b prima di un’accentata non dovrebbe agganciare');
  assert.equal(/(?<![\wÀ-ÿ])(únete)(?![\wÀ-ÿ])/i.test('Únete ahora'), true, 'il lookaround invece deve agganciare');

  // La controprova su ciò che spediamo davvero: nessun \b confina con una
  // lettera accentata, né prima né dopo.
  const { OPT_OUT } = globalThis.__CF.actions;
  const sources = [...ACTION_PATTERNS.map((p) => p.re.source), OPT_OUT.source];
  for (const src of sources) {
    assert.ok(!/\\b[^\x00-\x7F]/.test(src), `un \\b aggancia una lettera accentata: ${src.slice(0, 60)}`);
    assert.ok(!/[^\x00-\x7F]\\b/.test(src), `una lettera accentata precede un \\b: ${src.slice(0, 60)}`);
  }

  // E il comportamento che ne dipende, con l'accento in mezzo alla frase e
  // appiccicato alla punteggiatura, dove un confine rotto salterebbe fuori.
  assert.equal(classifyText('¡Suscríbete!'), 'subscribe');
  assert.equal(classifyText('Volver atrás'), null);
  assert.equal(classifyText('Sólo las necesarias, gracias'), null);
  assert.equal(classifyText('Regístrate gratis'), 'signup');
});

/**
 * L'equivalente spagnolo di «Subscribe — cancel anytime»: «cancela cuando
 * quieras» è la rassicurazione che accompagna l'abbonamento, non il pulsante
 * che lo disdice. Trattarla da veto cancellerebbe l'impegno vero.
 */
test('un opt-out spagnolo in coda non cancella l’azione che lo precede', () => {
  const cases = {
    'Suscribirse — cancela cuando quieras': 'subscribe',
    'Suscríbete y cancela cuando quieras': 'subscribe',
    'Pagar ahora y volver a la tienda': 'purchase',
    'Firmar el contrato y volver': 'sign',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" cancellato da un opt-out in coda`);
  }
  // In testa invece comanda, come in italiano e in inglese.
  assert.equal(classifyText('Cancelar y volver al carrito'), null);
  assert.equal(classifyText('Rechazar y seguir comprando'), null);
});

/**
 * «Entendido» è il gemello di «Ho capito»: da solo su un pulsante chiude un
 * banner e vale un consenso, dentro una frase è solo una parola.
 */
test('«Entendido» vale come consenso solo quando è tutta l’etichetta', () => {
  assert.equal(classifyText('Entendido'), 'consent');
  assert.equal(classifyText('¡Entendido!'), 'consent');
  assert.equal(classifyText('Hemos entendido tus preferencias'), null);
  assert.equal(classifyText('No hemos entendido tu respuesta'), null);
});

/**
 * Come per l'italiano e l'inglese: allargare le tabelle serve solo se non
 * allarga anche i falsi allarmi. «Continuar» da solo resta fuori — al resto
 * pensa il fallback strutturale del detector.
 */
test('i pulsanti generici e quelli innocui spagnoli restano fuori', () => {
  const outside = [
    'Continuar', 'Siguiente', 'Confirmar', 'Aceptar',
    'Buscar', 'Más información', 'Ver planes', 'Comparar planes', 'Añadir a la cesta',
    'Guardar borrador', 'Compartir', 'Descargar la factura', 'Contacto',
    'Iniciar sesión', 'Formas de pagar', 'Continuar sin pagar',
  ];
  for (const text of outside) {
    assert.equal(classifyText(text), null, `falso positivo su "${text}"`);
  }
});

/**
 * Parole spagnole che somigliano al contrario di quello che fanno, e che senza
 * un confine di parola preciso finirebbero nel tipo sbagliato.
 */
test('le parole che si somigliano finiscono comunque nel tipo giusto', () => {
  // «Confirmar» contiene «firmar», ma conferma un ordine: vale 4, non 5.
  assert.equal(classifyText('Confirmar pedido'), 'purchase');
  // «Volver a comprar» non torna indietro: riacquista.
  assert.equal(classifyText('Volver a comprar'), 'purchase');
  // «Darse de alta» apre un account, «Darse de baja» lo chiude.
  assert.equal(classifyText('Darse de alta'), 'signup');
  assert.equal(classifyText('Darse de baja'), null);
});

// ── prezzo: quale dei prezzi in pagina è quello che ti impegna ─────────────

/**
 * context.js vive nella pagina, ma dipende dal DOM solo attraverso tre funzioni
 * di `CF.util` e da `document`/`getComputedStyle`: con altrettanti stub gira in
 * Node, e la scelta del prezzo — la parte che decide il numero grande
 * dell'avviso — smette di essere l'unica non coperta da test.
 */
function node(tag, { cls = '', struck = false, text = '', children = [] } = {}) {
  const n = {
    tagName: String(tag).toUpperCase(),
    className: cls,
    __struck: struck,
    __text: text,
    children: children,
    parentElement: null,
    get textContent() {
      return [this.__text, ...this.children.map((k) => k.textContent)].filter(Boolean).join(' ');
    },
    get innerText() { return this.textContent; },
    getAttribute(a) { return a === 'class' ? this.className : null; },
  };
  for (const k of children) k.parentElement = n;
  return n;
}

function descendants(n) {
  const out = [];
  const walk = (x) => { for (const k of x.children) { out.push(k); walk(k); } };
  walk(n);
  return out;
}

function loadContext(body) {
  const all = [body, ...descendants(body)];
  const CF = globalThis.__CF;
  delete CF.context; // il file si registra una volta sola: si rilegge da capo
  CF.util = {
    labelOf: (el) => (el?.innerText || '').trim(),
    deepQueryAll: (_sel, root = body, limit = 400) =>
      (root === body ? all : [root, ...descendants(root)]).slice(0, limit),
    isVisible: () => true,
  };
  globalThis.document = { body, documentElement: { lang: 'it' }, title: 'prova', querySelector: () => null };
  globalThis.location = { href: 'https://esempio.test/checkout', hostname: 'esempio.test' };
  globalThis.getComputedStyle = (el) => ({
    textDecorationLine: el?.__struck ? 'line-through' : 'none',
    fontSize: '16px',
  });
  const src = readFileSync(new URL('../src/content/context.js', import.meta.url), 'utf8');
  new Function(src)();
  return CF.context;
}

/** Costruisce una pagina con un pulsante e le righe di testo date. */
function page(lines, extra = []) {
  const btn = node('button', { text: 'Abbonati ora' });
  const body = node('body', { children: [...lines.map((t) => node('div', { text: t })), ...extra, btn] });
  return { body, btn };
}

test('fra promozione e prezzo a regime vince il prezzo a regime', () => {
  const { body, btn } = page([
    'StreamPro Premium: tutto il catalogo senza pubblicità, su quattro dispositivi, in 4K e con i download offline.',
    'Primi 3 mesi a 9,99 €/mese, poi 19,99 €/mese. Disdici quando vuoi.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 19.99, 'ha scelto il prezzo promozionale invece di quello a regime');
  assert.equal(p.period, 'month');
  assert.equal(p.introductory?.amount, 9.99, 'il prezzo promozionale va conservato, non buttato');
});

test('vale anche per le offerte sul primo anno', () => {
  const { body, btn } = page([
    'Piano professionale: fatturazione elettronica illimitata, conservazione a norma e assistenza dedicata.',
    '99,00 €/anno il primo anno, poi 149,00 €/anno alla scadenza.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 149);
  assert.equal(p.period, 'year');
  assert.equal(p.introductory?.amount, 99);
});

test('il prezzo barrato è il listino, non l’impegno', () => {
  const { body, btn } = page(
    ['Offerta di lancio sul piano mensile: tutte le funzioni incluse, nessun limite di utilizzo, assistenza inclusa.'],
    [node('div', { children: [
      node('span', { text: '39,99 €/mese', struck: true }),
      node('span', { text: 'Ora 19,99 €/mese' }),
    ] })]
  );
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 19.99, 'ha preso il prezzo barrato: sovrastima che l’utente smaschera subito');
  assert.equal(p.introductory, null, 'un listino barrato non è una promozione da conservare');
});

test('un prezzo barrato da un antenato con classe conta come barrato', () => {
  const { body, btn } = page(
    ['Abbonamento annuale al servizio, con tutte le funzioni professionali incluse e assistenza prioritaria.'],
    [node('div', { cls: 'price original-price', children: [node('span', { text: '149,00 €/anno' })] }),
     node('div', { text: 'Oggi 99,00 €/anno' })]
  );
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 99);
});

test('a parità di periodicità, nel dubbio si sbaglia dalla parte più cara', () => {
  // Nessun marcatore di regime: resta comunque il più alto, mai il primo trovato.
  const { body, btn } = page([
    'Il servizio è disponibile con due formule di pagamento, entrambe attivabili subito e senza vincoli tecnici.',
    'Formula leggera 12,00 €/mese. Formula completa 24,00 €/mese.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 24);
  assert.equal(p.introductory, null, 'due piani alternativi non sono un’offerta a due tempi');
});

test('un prezzo solo resta quello che è', () => {
  const { body, btn } = page([
    'Abbonamento StreamPro: catalogo completo, quattro dispositivi in contemporanea, nessuna pubblicità.',
    'Il canone è pari a € 19,99 al mese, oltre a spese di attivazione una tantum di € 49,00.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 19.99);
  assert.equal(p.period, 'month');
  assert.equal(p.recurring, true);
});

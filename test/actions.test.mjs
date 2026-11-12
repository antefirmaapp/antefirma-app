/**
 * Tests of action recognition.
 *
 * actions.js is a classic script that registers itself on globalThis: importing
 * it here just runs it, with no DOM and no Chrome APIs needed.
 *
 * These tests are worth more than they look: every false positive here is a
 * block on a harmless button, the quickest way to get the extension
 * uninstalled. Every false negative is a commitment that passes unwarned.
 */

import { readFileSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';

import '../src/content/actions.js';

const { classifyText, ACTION_LABELS, ACTION_PATTERNS } = globalThis.__CF.actions;

test('recognises commitment buttons in Italian', () => {
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
    assert.equal(classifyText(text), wanted, `"${text}" misclassified`);
  }
});

test('recognises commitment buttons in English', () => {
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
    assert.equal(classifyText(text), wanted, `"${text}" misclassified`);
  }
});

test('doesn\'t block harmless buttons', () => {
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
    assert.equal(classifyText(text), null, `false positive on "${text}"`);
  }
});

test('a refusal always takes precedence over acceptance', () => {
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

test('on equal matches the most binding action wins', () => {
  assert.equal(classifyText('Accetta e firma il contratto'), 'sign');
  assert.equal(classifyText('Accetta le condizioni e paga ora'), 'purchase');
  assert.equal(classifyText('Registrati e abbonati'), 'subscribe');
});

test('every recognised type has a readable label', () => {
  for (const p of ACTION_PATTERNS) {
    assert.ok(ACTION_LABELS[p.type], `label missing for ${p.type}`);
  }
});

test('empty or missing text produces nothing', () => {
  assert.equal(classifyText(''), null);
  assert.equal(classifyText(null), null);
  assert.equal(classifyText(undefined), null);
});

// ── recall: labels seen in production ───────────────────────────────────────

test('recognises the payment wording found in real checkouts', () => {
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
    assert.equal(classifyText(text), wanted, `"${text}" not recognised`);
  }
});

test('recognises subscription activation wording', () => {
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
    assert.equal(classifyText(text), wanted, `"${text}" not recognised`);
  }
});

test('recognises delegated access and consent in short forms', () => {
  assert.equal(classifyText('Accedi con Google'), 'oauth');
  assert.equal(classifyText('Continua con l’account Google'), 'oauth');
  assert.equal(classifyText('Consenti'), 'consent');
  assert.equal(classifyText('Ho capito'), 'consent');
});

/**
 * The counter-check of the previous point: widening the tables only helps if it
 * doesn't widen false alarms too. "Continua" alone must not be enough — that is
 * what the detector's structural fallback is for: it asks the DOM whether we are
 * in a checkout instead of guessing from the text.
 */
test('generic and harmless buttons stay out', () => {
  const outside = [
    'Continua', 'Avanti', 'Conferma', 'Procedi', 'Continue', 'Next', 'Ok',
    'Iscriviti alla newsletter', 'Passa alla modalità scura', 'Attiva le notifiche',
    'Vedi i dettagli del piano', 'Confronta i piani', 'Scarica la fattura',
    'Prova la ricerca', 'Aggiungi al carrello', 'Accedi', 'Login',
  ];
  for (const text of outside) {
    assert.equal(classifyText(text), null, `false positive on "${text}"`);
  }
});

// ── positional opt-out ─────────────────────────────────────────────────────

/**
 * Treating the opt-out as an absolute veto ate real commitments: "cancel
 * anytime" is standard checkout microcopy in English, and it cancelled the
 * subscription that contained it.
 */
test('a trailing opt-out doesn\'t cancel the action before it', () => {
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

test('a leading opt-out wins anyway', () => {
  const cases = [
    'Annulla e torna al carrello',
    'Chiudi senza pagare',
    'Cancel subscription',
    'Rifiuta e continua con l’acquisto',
    'Torna indietro e paga più tardi',
  ];
  for (const text of cases) {
    assert.equal(classifyText(text), null, `the refusal at the start did not win: "${text}"`);
  }
});

/**
 * The test "a refusal always takes precedence" stays green for a precise reason,
 * and it should be verified rather than taken for granted: in all nine of its
 * cases the refusal is the first word of the label.
 */
test('in the nine historical refusal cases the match falls in the first third', () => {
  const optOuts = [
    'Rifiuta tutti i cookie', 'Continua senza accettare', 'Solo i cookie necessari',
    'Non accetto', 'Reject all', 'Decline', 'Gestisci preferenze',
    'Annulla abbonamento', 'Disdici',
  ];
  const { OPT_OUT } = globalThis.__CF.actions;
  for (const text of optOuts) {
    const m = OPT_OUT.exec(text);
    if (!m) {
      // "Gestisci preferenze" is not a recognised opt-out: it stays null because
      // no action catches it, which is the right result anyway.
      assert.equal(classifyText(text), null, `"${text}" has no opt-out and no action`);
      continue;
    }
    assert.ok(m.index < Math.ceil(text.length / 3), `"${text}": opt-out a ${m.index}, fuori dal primo terzo`);
    assert.equal(classifyText(text), null, `"${text}" no longer held`);
  }
});

test('a weak action doesn\'t stand against an opt-out, wherever it is', () => {
  // signup weighs 1: "Registrati" plus a refusal stays a refusal.
  assert.equal(classifyText('Registrati oppure annulla'), null);
  // sign weighs 5: the signature stands.
  assert.equal(classifyText('Sottoscrivi il documento oppure annulla'), 'sign');
});

test('classifyDetail tells "found nothing" from "it\'s a refusal"', () => {
  const { classifyDetail } = globalThis.__CF.actions;
  assert.deepEqual(classifyDetail('Cerca'), { type: null, weight: 0, vetoed: false });
  assert.equal(classifyDetail('Annulla').vetoed, true);
  assert.equal(classifyDetail('Abbonati ora').type, 'subscribe');
});

// ── Spanish ────────────────────────────────────────────────────────────────

test('recognises commitment buttons in Spanish', () => {
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
    assert.equal(classifyText(text), wanted, `"${text}" misclassified`);
  }
});

/**
 * Blocking an opt-out is the opposite of what is needed: the user is already
 * refusing, and the warning's only effect would be to send them back towards the
 * accepting button. A null result is not enough here: it must be null *by veto*,
 * because the veto is what stops HTML attributes from bringing the action back
 * into play (see classifyDetail).
 */
test('Spanish opt-outs are never intercepted', () => {
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
    assert.equal(classifyDetail(text).vetoed, true, `"${text}" is null by chance, not by veto`);
  }
});

/**
 * Many Spanish sites write buttons without accents, and whoever clicks them
 * commits exactly as much as someone clicking a correctly written one.
 */
test('accented and unaccented forms count the same', () => {
  const pairs = [
    ['Suscríbete', 'Suscribete', 'subscribe'],
    ['Regístrate', 'Registrate', 'signup'],
    ['Sólo las necesarias', 'Solo las necesarias', null],
    ['Atrás', 'Atras', null],
    ['Iniciar sesión con Google', 'Iniciar sesion con Google', 'oauth'],
    ['Acepto los términos', 'Acepto los terminos', 'accept_terms'],
  ];
  for (const [accented, unaccented, wanted] of pairs) {
    assert.equal(classifyText(accented), wanted, `"${accented}" misclassified`);
    assert.equal(classifyText(unaccented), wanted, `"${unaccented}" misclassified`);
  }
});

/**
 * The defect that has already cost this project three rules, demonstrated
 * rather than told: `\b` in JavaScript is defined on [A-Za-z0-9_], and between a
 * space and an accented vowel there is no transition to hook onto. A rule
 * relying on it doesn't fail with an error: it simply never fires, and the
 * button gets through.
 */
test('the Spanish word boundary doesn\'t rely on \\b', () => {
  assert.equal(/\bsuscr\w+\b/i.test('Suscríbete'), false, '\\w+ dovrebbe fermarsi davanti alla í');
  assert.equal(/\b(únete)\b/i.test('Únete ahora'), false, '\\b before an accented letter should not match');
  assert.equal(/(?<![\wÀ-ÿ])(únete)(?![\wÀ-ÿ])/i.test('Únete ahora'), true, 'the lookaround must match instead');

  // The counter-check on what we actually ship: no \b borders an accented
  // letter, neither before nor after.
  const { OPT_OUT } = globalThis.__CF.actions;
  const sources = [...ACTION_PATTERNS.map((p) => p.re.source), OPT_OUT.source];
  for (const src of sources) {
    assert.ok(!/\\b[^\x00-\x7F]/.test(src), `un \\b aggancia una lettera accentata: ${src.slice(0, 60)}`);
    assert.ok(!/[^\x00-\x7F]\\b/.test(src), `una lettera accentata precede un \\b: ${src.slice(0, 60)}`);
  }

  // And the behaviour that depends on it, with the accent mid-sentence and
  // stuck to punctuation, where a broken boundary would show.
  assert.equal(classifyText('¡Suscríbete!'), 'subscribe');
  assert.equal(classifyText('Volver atrás'), null);
  assert.equal(classifyText('Sólo las necesarias, gracias'), null);
  assert.equal(classifyText('Regístrate gratis'), 'signup');
});

/**
 * The Spanish equivalent of "Subscribe — cancel anytime": "cancela cuando
 * quieras" is the reassurance that comes with the subscription, not the button
 * that cancels it. Treating it as a veto would cancel the real commitment.
 */
test('a trailing Spanish opt-out doesn\'t cancel the action before it', () => {
  const cases = {
    'Suscribirse — cancela cuando quieras': 'subscribe',
    'Suscríbete y cancela cuando quieras': 'subscribe',
    'Pagar ahora y volver a la tienda': 'purchase',
    'Firmar el contrato y volver': 'sign',
  };
  for (const [text, wanted] of Object.entries(cases)) {
    assert.equal(classifyText(text), wanted, `"${text}" cancellato da un opt-out in coda`);
  }
  // At the start it commands instead, as in Italian and English.
  assert.equal(classifyText('Cancelar y volver al carrito'), null);
  assert.equal(classifyText('Rechazar y seguir comprando'), null);
});

/**
 * "Entendido" is the twin of "Ho capito": alone on a button it closes a banner
 * and counts as consent, inside a sentence it is just a word.
 */
test('"Entendido" counts as consent only when it is the whole label', () => {
  assert.equal(classifyText('Entendido'), 'consent');
  assert.equal(classifyText('¡Entendido!'), 'consent');
  assert.equal(classifyText('Hemos entendido tus preferencias'), null);
  assert.equal(classifyText('No hemos entendido tu respuesta'), null);
});

/**
 * As for Italian and English: widening the tables only helps if it doesn't
 * widen false alarms too. "Continuar" alone stays out — the detector's
 * structural fallback takes care of the rest.
 */
test('generic and harmless Spanish buttons stay out', () => {
  const outside = [
    'Continuar', 'Siguiente', 'Confirmar', 'Aceptar',
    'Buscar', 'Más información', 'Ver planes', 'Comparar planes', 'Añadir a la cesta',
    'Guardar borrador', 'Compartir', 'Descargar la factura', 'Contacto',
    'Iniciar sesión', 'Formas de pagar', 'Continuar sin pagar',
  ];
  for (const text of outside) {
    assert.equal(classifyText(text), null, `false positive on "${text}"`);
  }
});

/**
 * Spanish words that look like the opposite of what they do, and that without a
 * precise word boundary would end up in the wrong type.
 */
test('words that look alike still end up in the right type', () => {
  // "Confirmar" contains "firmar", but confirms an order: it weighs 4, not 5.
  assert.equal(classifyText('Confirmar pedido'), 'purchase');
  // "Volver a comprar" doesn't go back: it buys again.
  assert.equal(classifyText('Volver a comprar'), 'purchase');
  // "Darse de alta" opens an account, "Darse de baja" closes it.
  assert.equal(classifyText('Darse de alta'), 'signup');
  assert.equal(classifyText('Darse de baja'), null);
});

// ── price: which of the prices on the page is the one you commit to ─────────

/**
 * context.js lives in the page, but depends on the DOM only through three
 * `CF.util` functions and `document`/`getComputedStyle`: with as many stubs it
 * runs in Node, and choosing the price — the part that decides the warning's
 * big number — stops being the only part without tests.
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
  delete CF.context; // the file registers itself once only: reload it from scratch
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

/** Builds a page with a button and the given lines of text. */
function page(lines, extra = []) {
  const btn = node('button', { text: 'Abbonati ora' });
  const body = node('body', { children: [...lines.map((t) => node('div', { text: t })), ...extra, btn] });
  return { body, btn };
}

test('between promotional and regular price the regular price wins', () => {
  const { body, btn } = page([
    'StreamPro Premium: tutto il catalogo senza pubblicità, su quattro dispositivi, in 4K e con i download offline.',
    'Primi 3 mesi a 9,99 €/mese, poi 19,99 €/mese. Disdici quando vuoi.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 19.99, 'ha scelto il prezzo promozionale invece di quello a regime');
  assert.equal(p.period, 'month');
  assert.equal(p.introductory?.amount, 9.99, 'the promotional price must be kept, not thrown away');
});

test('it holds for first-year offers too', () => {
  const { body, btn } = page([
    'Piano professionale: fatturazione elettronica illimitata, conservazione a norma e assistenza dedicata.',
    '99,00 €/anno il primo anno, poi 149,00 €/anno alla scadenza.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 149);
  assert.equal(p.period, 'year');
  assert.equal(p.introductory?.amount, 99);
});

test('a struck-through price is the list price, not the commitment', () => {
  const { body, btn } = page(
    ['Offerta di lancio sul piano mensile: tutte le funzioni incluse, nessun limite di utilizzo, assistenza inclusa.'],
    [node('div', { children: [
      node('span', { text: '39,99 €/mese', struck: true }),
      node('span', { text: 'Ora 19,99 €/mese' }),
    ] })]
  );
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 19.99, 'it took the struck-through price: an overestimate the user spots at once');
  assert.equal(p.introductory, null, 'a struck-through list price is not a promotion to keep');
});

test('a price struck through by an ancestor with a class counts as struck through', () => {
  const { body, btn } = page(
    ['Abbonamento annuale al servizio, con tutte le funzioni professionali incluse e assistenza prioritaria.'],
    [node('div', { cls: 'price original-price', children: [node('span', { text: '149,00 €/anno' })] }),
     node('div', { text: 'Oggi 99,00 €/anno' })]
  );
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 99);
});

test('with the same period, when in doubt err on the expensive side', () => {
  // No regular-price marker: the highest still wins, never the first found.
  const { body, btn } = page([
    'Il servizio è disponibile con due formule di pagamento, entrambe attivabili subito e senza vincoli tecnici.',
    'Formula leggera 12,00 €/mese. Formula completa 24,00 €/mese.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 24);
  assert.equal(p.introductory, null, 'two alternative plans are not a two-stage offer');
});

test('a single price stays what it is', () => {
  const { body, btn } = page([
    'Abbonamento StreamPro: catalogo completo, quattro dispositivi in contemporanea, nessuna pubblicità.',
    'Il canone è pari a € 19,99 al mese, oltre a spese di attivazione una tantum di € 49,00.',
  ]);
  const p = loadContext(body).extractPricing(btn);
  assert.equal(p.amount, 19.99);
  assert.equal(p.period, 'month');
  assert.equal(p.recurring, true);
});

test('found on realistic pages (test/fixtures/pages): membership, and newsletters that are not subscriptions', () => {
  const { classifyDetail } = globalThis.__CF.actions;
  assert.equal(classifyText('Start my membership'), 'subscribe');
  assert.equal(classifyText('Start your membership'), 'subscribe');
  assert.equal(classifyText('Become a member'), 'subscribe');
  // The label speaks only of a newsletter: it vetoes, so an id like "subscribe-nl" cannot overrule it.
  for (const label of ['Iscriviti alla newsletter', 'Sign up for our newsletter', 'Subscribe to our newsletter', 'Suscríbete al boletín', 'Notify me', 'Avvisami']) {
    const d = classifyDetail(label);
    assert.equal(d.type, null, label);
    assert.equal(d.vetoed, true, label);
  }
  // A paid newsletter that says "Subscribe" is still a subscription.
  assert.equal(classifyText('Subscribe to the newsletter — €5/month'), 'subscribe');
});

// ── German, French, Dutch ───────────────────────────────────────────────────

test('recognises commitment buttons in German, French and Dutch', () => {
  const cases = {
    'Zahlungspflichtig bestellen': 'purchase', 'Kostenpflichtig bestellen': 'purchase', 'Jetzt kaufen': 'purchase',
    'Kauf abschließen': 'purchase', 'Zur Kasse': 'purchase', 'Jetzt bezahlen': 'purchase',
    'Jetzt abonnieren': 'subscribe', 'Kostenlos testen': 'subscribe', 'Mitglied werden': 'subscribe',
    'Vertrag unterschreiben': 'sign', 'Mit Google anmelden': 'oauth', 'Zugriff erlauben': 'oauth',
    'Alle akzeptieren': 'consent', 'Einverstanden': 'consent', 'Ich stimme zu': 'accept_terms', 'Konto erstellen': 'signup',
    "S'abonner": 'subscribe', 'Je m’abonne': 'subscribe', 'Essai gratuit': 'subscribe', 'Commencer l’essai gratuit': 'subscribe',
    'Commander': 'purchase', 'Valider la commande': 'purchase', 'Payer maintenant': 'purchase', 'Procéder au paiement': 'purchase',
    'Signer le contrat': 'sign', 'Continuer avec Google': 'oauth', 'Tout accepter': 'consent', 'J’ai compris': 'consent',
    'J’accepte': 'accept_terms', 'Accepter et continuer': 'accept_terms', 'Créer un compte': 'signup', "S'inscrire": 'signup',
    'Abonneren': 'subscribe', 'Gratis proberen': 'subscribe', 'Start je proefperiode': 'subscribe', 'Word lid': 'subscribe',
    'Afrekenen': 'purchase', 'Nu kopen': 'purchase', 'Bestellen en betalen': 'purchase', 'Bestelling plaatsen': 'purchase',
    'Ondertekenen': 'sign', 'Doorgaan met Google': 'oauth', 'Alles accepteren': 'consent', 'Akkoord': 'consent',
    'Ik ga akkoord': 'accept_terms', 'Account aanmaken': 'signup', 'Registreren': 'signup',
  };
  for (const [text, wanted] of Object.entries(cases)) assert.equal(classifyText(text), wanted, `"${text}"`);
});

test('German, French and Dutch refusals and harmless buttons stay out', () => {
  for (const text of [
    'Alle ablehnen', 'Nur notwendige Cookies', 'Abbrechen', 'Zurück', 'Schließen', 'Einstellungen verwalten', 'Weiter einkaufen',
    'In den Warenkorb', 'Mehr erfahren', 'Newsletter bestellen', 'Newsletter abonnieren',
    'Tout refuser', 'Continuer sans accepter', 'Continuer sans payer', 'Annuler', 'Retour', 'Fermer', 'Recommander', 'En savoir plus',
    'Gérer mes préférences', 'S’abonner à la newsletter',
    'Weigeren', 'Alleen noodzakelijke cookies', 'Annuleren', 'Terug', 'Sluiten', 'Verkopen', 'Meer informatie', 'Inschrijven nieuwsbrief',
    'Word document',
  ]) assert.equal(classifyText(text), null, `"${text}"`);
});

test('a trailing German, French or Dutch reassurance doesn\'t cancel the action', () => {
  assert.equal(classifyText('Abonnieren — jederzeit kündbar'), 'subscribe');
  assert.equal(classifyText("S'abonner, résiliable à tout moment"), 'subscribe');
  assert.equal(classifyText('Abonneren, altijd opzeggen'), 'subscribe');
  assert.equal(classifyText('Newsletter abonnieren — 4,99 € im Monat'), 'subscribe');
});

// ── Polish, Portuguese ──────────────────────────────────────────────────────

test('recognises commitment buttons in Polish and Portuguese', () => {
  const cases = {
    'Kupuję i płacę': 'purchase', 'Zamawiam z obowiązkiem zapłaty': 'purchase', 'Złóż zamówienie': 'purchase', 'Przejdź do kasy': 'purchase',
    'Subskrybuj': 'subscribe', 'Rozpocznij darmowy okres próbny': 'subscribe', 'Wypróbuj za darmo': 'subscribe', 'Podpisz umowę': 'sign',
    'Kontynuuj z Google': 'oauth', 'Akceptuj wszystkie': 'consent', 'Zgadzam się': 'accept_terms', 'Załóż konto': 'signup',
    'Comprar agora': 'purchase', 'Finalizar encomenda': 'purchase', 'Pagar': 'purchase', 'Subscrever': 'subscribe', 'Aderir já': 'subscribe',
    'Iniciar período experimental': 'subscribe', 'Assinar contrato': 'sign', 'Continuar com o Google': 'oauth', 'Aceitar todos': 'consent',
    'Aceito': 'accept_terms', 'Criar conta': 'signup', 'Registar-se': 'signup',
  };
  for (const [text, wanted] of Object.entries(cases)) assert.equal(classifyText(text), wanted, `"${text}"`);
});

test('Polish and Portuguese refusals and harmless buttons stay out', () => {
  for (const text of ['Odrzuć wszystkie', 'Tylko niezbędne', 'Anuluj', 'Wróć', 'Zamknij', 'Zapisz się do newslettera', 'Dodaj do koszyka', 'Więcej informacji',
    'Rejeitar tudo', 'Apenas necessários', 'Cancelar', 'Voltar', 'Fechar', 'Saber mais', 'Adicionar ao carrinho', 'Subscrever a newsletter', 'Continuar sem pagar', 'Continuar a comprar']) {
    assert.equal(classifyText(text), null, `"${text}"`);
  }
  assert.equal(classifyText('Subscrever — cancele quando quiser'), 'subscribe');
});

// ── Swedish, Romanian, Czech ────────────────────────────────────────────────

test('recognises commitment buttons in Swedish, Romanian and Czech', () => {
  const cases = {
    'Köp nu': 'purchase', 'Slutför köpet': 'purchase', 'Betala': 'purchase', 'Till kassan': 'purchase', 'Beställ': 'purchase',
    'Prenumerera': 'subscribe', 'Starta din gratis provperiod': 'subscribe', 'Bli medlem': 'subscribe', 'Signera avtalet': 'sign',
    'Fortsätt med Google': 'oauth', 'Acceptera alla': 'consent', 'Jag godkänner': 'accept_terms', 'Skapa konto': 'signup',
    'Cumpără acum': 'purchase', 'Plasează comanda': 'purchase', 'Plătește': 'purchase', 'Finalizează comanda': 'purchase',
    'Abonează-te': 'subscribe', 'Începe perioada de probă': 'subscribe', 'Semnează contractul': 'sign', 'Continuă cu Google': 'oauth',
    'Acceptă tot': 'consent', 'Sunt de acord': 'accept_terms', 'Creează un cont': 'signup',
    'Koupit nyní': 'purchase', 'Objednat s povinností platby': 'purchase', 'Zaplatit': 'purchase', 'Dokončit objednávku': 'purchase',
    'Předplatit': 'subscribe', 'Vyzkoušet zdarma': 'subscribe', 'Podepsat smlouvu': 'sign', 'Pokračovat přes Google': 'oauth',
    'Přijmout vše': 'consent', 'Souhlasím': 'accept_terms', 'Vytvořit účet': 'signup', 'Zaregistrovat se': 'signup',
  };
  for (const [text, wanted] of Object.entries(cases)) assert.equal(classifyText(text), wanted, `"${text}"`);
});

test('Swedish, Romanian and Czech refusals and harmless buttons stay out', () => {
  for (const text of ['Avvisa alla', 'Endast nödvändiga', 'Avbryt', 'Tillbaka', 'Stäng', 'Prenumerera på nyhetsbrevet', 'Lägg i varukorgen', 'Läs mer',
    'Fortsätt handla', 'Fortsätt utan att betala', 'Sätt att betala',
    'Refuză tot', 'Doar cele necesare', 'Anulează', 'Înapoi', 'Închide', 'Abonează-te la newsletter', 'Adaugă în coș', 'Află mai multe', 'Continuă cumpărăturile',
    'Odmítnout vše', 'Pouze nezbytné', 'Zrušit', 'Zpět', 'Zavřít', 'Odebírat novinky', 'Přidat do košíku', 'Více informací', 'Pokračovat v nákupu']) {
    assert.equal(classifyText(text), null, `"${text}"`);
  }
  assert.equal(classifyText('Prenumerera — säg upp när du vill'), 'subscribe');
  assert.equal(classifyText('Abonează-te, anulezi oricând'), 'subscribe');
  assert.equal(classifyText('Předplatit — zrušit můžete kdykoli'), 'subscribe');
});

test('prices, periods and free trials in Swedish, Romanian, Czech and Polish currencies', () => {
  const cases = [
    ['Premium: hela katalogen utan reklam. Pris 129 kr/mån. 30 dagar gratis, säg upp när du vill.', 129, 'SEK', 'month', 1],
    ['Abonament complet cu toate funcțiile incluse și asistență. 29,99 lei pe lună, cu 14 zile gratuit.', 29.99, 'RON', 'month', 14 / 30],
    ['Kompletní předplatné se všemi funkcemi a podporou. Cena 199 Kč měsíčně, zkušební doba zdarma na 7 dní.', 199, 'CZK', 'month', 7 / 30],
    ['Pełny pakiet ze wszystkimi funkcjami i wsparciem technicznym. 49 zł miesięcznie, 30 dni za darmo.', 49, 'PLN', 'month', 1],
    ['Årsabonnemang med alla funktioner och support ingår. 990 kr per år, första månaden gratis.', 990, 'SEK', 'year', 1],
  ];
  for (const [text, amount, currency, period, months] of cases) {
    const { body, btn } = page([text]);
    const p = loadContext(body).extractPricing(btn);
    assert.equal(p.amount, amount, text);
    assert.equal(p.currency, currency, text);
    assert.equal(p.period, period, text);
    assert.ok(Math.abs((p.trial?.months ?? 0) - months) < 1e-9, `${text} → ${JSON.stringify(p.trial)}`);
  }
});

// ── Danish, Norwegian, Finnish ──────────────────────────────────────────────

test('recognises commitment buttons in Danish, Norwegian and Finnish', () => {
  const cases = {
    'Køb nu': 'purchase', 'Gennemfør køb': 'purchase', 'Betal': 'purchase', 'Gå til kassen': 'purchase', 'Køb med betalingsforpligtelse': 'purchase',
    'Abonnér': 'subscribe', 'Start din gratis prøveperiode': 'subscribe', 'Bliv medlem': 'subscribe', 'Underskriv aftalen': 'sign',
    'Fortsæt med Google': 'oauth', 'Accepter alle cookies': 'consent', 'Jeg accepterer': 'accept_terms', 'Opret konto': 'signup',
    'Kjøp nå': 'purchase', 'Fullfør bestillingen': 'purchase', 'Bestilling med betalingsplikt': 'purchase', 'Abonner nå': 'subscribe',
    'Prøv gratis': 'subscribe', 'Signer avtalen': 'sign', 'Fortsett med Google': 'oauth', 'Godta alle': 'consent', 'Jeg godtar': 'accept_terms', 'Opprett konto': 'signup',
    'Osta nyt': 'purchase', 'Tilaa maksuvelvollisena': 'purchase', 'Siirry kassalle': 'purchase', 'Tilaa': 'subscribe', 'Aloita ilmainen kokeilu': 'subscribe',
    'Allekirjoita sopimus': 'sign', 'Jatka Googlella': 'oauth', 'Hyväksy kaikki evästeet': 'consent', 'Hyväksy ehdot': 'accept_terms', 'Luo tili': 'signup', 'Rekisteröidy': 'signup',
  };
  for (const [text, wanted] of Object.entries(cases)) assert.equal(classifyText(text), wanted, `"${text}"`);
});

test('Danish, Norwegian and Finnish refusals and harmless buttons stay out', () => {
  for (const text of ['Afvis alle', 'Kun nødvendige cookies', 'Annuller', 'Tilbage', 'Luk', 'Tilmeld nyhedsbrev', 'Læg i kurven', 'Læs mere', 'Fortsæt med at handle', 'Betalingsmetoder',
    'Avvis alle', 'Bare nødvendige', 'Avbryt', 'Tilbake', 'Lukk', 'Legg i handlekurven', 'Les mer', 'Fortsett å handle',
    'Hylkää kaikki', 'Vain välttämättömät', 'Peruuta', 'Takaisin', 'Sulje', 'Tilaa uutiskirje', 'Lisää ostoskoriin', 'Lue lisää', 'Jatka ostoksia']) {
    assert.equal(classifyText(text), null, `"${text}"`);
  }
  assert.equal(classifyText('Abonnér — opsig når som helst'), 'subscribe');
  assert.equal(classifyText('Abonner nå, si opp når du vil'), 'subscribe');
  assert.equal(classifyText('Tilaa nyt — voit peruuttaa milloin tahansa'), 'subscribe');
});

test('the Nordic crowns follow the page: Danish, Norwegian or Swedish', () => {
  const cases = [
    ['da', 'Fuldt medlemskab med alle funktioner og support inkluderet. 299 kr. om måneden, 30 dage gratis, opsig når som helst.', 299, 'DKK', 'month', 1],
    ['no', 'Fullt medlemskap med alle funksjoner og kundestøtte inkludert. Kun kr 199,- per måned, 14 dager gratis.', 199, 'NOK', 'month', 14 / 30],
    ['fi', 'Täysi jäsenyys kaikilla ominaisuuksilla ja tuella. 19,90 € kuukaudessa, 30 päivää ilmaiseksi.', 19.9, 'EUR', 'month', 1],
    ['sv', 'Fullt medlemskap med alla funktioner och support ingår. 129 kr/mån, första månaden gratis.', 129, 'SEK', 'month', 1],
    ['da', 'Årsabonnement med alle funktioner og support inkluderet. 990 kr. om året.', 990, 'DKK', 'year', 0],
  ];
  for (const [lang, text, amount, currency, period, months] of cases) {
    const { body, btn } = page([text]);
    const ctx = loadContext(body);
    globalThis.document.documentElement.lang = lang;
    const p = ctx.extractPricing(btn);
    assert.equal(p.amount, amount, text);
    assert.equal(p.currency, currency, text);
    assert.equal(p.period, period, text);
    assert.ok(Math.abs((p.trial?.months ?? 0) - months) < 1e-9, `${text} → ${JSON.stringify(p.trial)}`);
  }
});

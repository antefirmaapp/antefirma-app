/**
 * Chi può chiedere che cosa.
 *
 * I content script girano su `<all_urls>`, in ogni frame di ogni sito: tutto
 * ciò che il service worker risponde loro finisce nell'isolated world di quella
 * pagina. `GET_SETTINGS` restituiva l'oggetto integrale — chiave API, nome,
 * indirizzo, email — e il detector lo chiedeva a ogni caricamento; `SET_SETTINGS`
 * accettava un patch arbitrario, quindi un content script compromesso poteva
 * riscrivere la chiave o spegnere il firewall.
 *
 * Modulo separato e senza `chrome.*` perché la guardia è esattamente il genere
 * di logica che deve poter essere verificata in Node: sbagliarla non produce un
 * errore visibile, produce una superficie aperta.
 */

/** Messaggi che solo le pagine dell'estensione possono inviare. */
export const PRIVILEGED_MESSAGES = new Set([
  'GET_SETTINGS',
  'SET_SETTINGS',
  'GET_PROOF',
  'BUILD_LETTER',
  'GET_LICENSE',
  'START_CHECKOUT',
  'ACTIVATE_LICENSE',
  'DEACTIVATE_LICENSE',
]);

/**
 * Il mittente è una pagina dell'estensione?
 *
 * Il discriminante è l'URL, non `sender.tab`: il pannello laterale aperto come
 * scheda — è così che lo apre la notifica di scadenza — ha un `sender.tab` come
 * qualsiasi pagina web, e una guardia basata su quello lo bloccherebbe.
 *
 * @param {object} sender     `sender` di chrome.runtime.onMessage
 * @param {string} runtimeId  chrome.runtime.id
 * @param {string} baseUrl    chrome.runtime.getURL('')
 */
export function isExtensionPage(sender, runtimeId, baseUrl) {
  if (!sender || !runtimeId || !baseUrl) return false;
  if (sender.id !== runtimeId) return false;
  return String(sender.url || '').startsWith(baseUrl);
}

/** Il messaggio è consentito a questo mittente? */
export function isAllowed(type, sender, runtimeId, baseUrl) {
  if (!PRIVILEGED_MESSAGES.has(type)) return true;
  return isExtensionPage(sender, runtimeId, baseUrl);
}

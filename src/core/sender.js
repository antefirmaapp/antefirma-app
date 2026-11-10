/**
 * Who may ask for what.
 *
 * Content scripts run on `<all_urls>`, in every frame of every site: whatever
 * the service worker answers them ends up in that page's isolated world.
 * `GET_SETTINGS` used to return the whole object — API key, name, address,
 * email — and the detector asked for it on every load; `SET_SETTINGS` accepted
 * an arbitrary patch, so a compromised content script could rewrite the key or
 * switch the firewall off.
 *
 * A separate module without `chrome.*`, because this guard is exactly the kind of
 * logic that must be testable in Node: getting it wrong produces no visible
 * error, it produces an open surface.
 */

/** Messages only extension pages may send. */
export const PRIVILEGED_MESSAGES = new Set([
  'GET_SETTINGS',
  'SET_SETTINGS',
  'GET_PROOF',
  'BUILD_LETTER',
  'GET_LICENSE',
  'START_CHECKOUT',
  'ACTIVATE_LICENSE',
  'DEACTIVATE_LICENSE',
  'GET_INSTALL_ID',
  'EXPORT_DATA',
  'IMPORT_DATA',
]);

/**
 * Is the sender an extension page?
 *
 * The discriminant is the URL, not `sender.tab`: the side panel opened as a
 * tab — the way the deadline notification opens it — has a `sender.tab` like
 * any web page, and a guard based on that would block it.
 *
 * @param {object} sender     `sender` from chrome.runtime.onMessage
 * @param {string} runtimeId  chrome.runtime.id
 * @param {string} baseUrl    chrome.runtime.getURL('')
 */
export function isExtensionPage(sender, runtimeId, baseUrl) {
  if (!sender || !runtimeId || !baseUrl) return false;
  if (sender.id !== runtimeId) return false;
  return String(sender.url || '').startsWith(baseUrl);
}

/** Is the message allowed for this sender? */
export function isAllowed(type, sender, runtimeId, baseUrl) {
  if (!PRIVILEGED_MESSAGES.has(type)) return true;
  return isExtensionPage(sender, runtimeId, baseUrl);
}

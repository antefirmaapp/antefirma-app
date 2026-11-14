/**
 * The analysis report: keeping the last result so that its own page
 * (src/report/) can show it, and opening that page.
 *
 * The result stays in the browser's local storage, under one key that the next
 * report replaces: it is what the person has just read in the panel or in the
 * warning, and it never leaves the device.
 */
const KEY = 'report';
const PAGE = 'src/report/report.html';

/** Stores `verdict` as the report to show. */
export async function saveReport(verdict, now = Date.now()) {
  await chrome.storage.local.set({ [KEY]: { verdict, at: now } });
}

/** The stored report: { verdict, at } or null. */
export async function readReport() {
  const got = await chrome.storage.local.get(KEY);
  return got?.[KEY] || null;
}

/** Stores the verdict and opens the report page in a tab. */
export async function openReport(verdict, now = Date.now()) {
  await saveReport(verdict, now);
  await chrome.tabs.create({ url: chrome.runtime.getURL(PAGE) });
}

/** The line under the title: when the analysis was made, and of which site. */
export function reportMeta(report, { t, locale }) {
  const d = new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeStyle: 'short' }).format(new Date(report.at));
  return [t('reportMadeOn', { d }), report.verdict?.host || ''].filter(Boolean).join(' · ');
}

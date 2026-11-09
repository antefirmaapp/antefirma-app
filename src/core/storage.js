/**
 * Accesso a chrome.storage: impostazioni, cache delle analisi, storico.
 *
 * La chiave API sta in `local` e non in `sync`: non deve girare per i
 * dispositivi dell'utente attraverso l'account Google.
 */

import { DEFAULT_SETTINGS } from './constants.js';

const SETTINGS_KEY = 'settings';
const CACHE_KEY = 'analysisCache';
const HISTORY_KEY = 'history';

export async function getSettings() {
  const { [SETTINGS_KEY]: stored } = await chrome.storage.local.get(SETTINGS_KEY);
  return {
    ...DEFAULT_SETTINGS,
    ...(stored || {}),
    profile: { ...DEFAULT_SETTINGS.profile, ...(stored?.profile || {}) },
    identity: { ...DEFAULT_SETTINGS.identity, ...(stored?.identity || {}) },
  };
}

export async function setSettings(patch) {
  const current = await getSettings();
  const next = {
    ...current,
    ...patch,
    profile: { ...current.profile, ...(patch.profile || {}) },
    identity: { ...current.identity, ...(patch.identity || {}) },
  };
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/** L'utente ha messo questo dominio in allowlist? */
export function isAllowlisted(url, settings) {
  if (!url) return false;
  let host;
  try {
    host = new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return false;
  }
  return (settings.allowlist || []).some((entry) => {
    const e = String(entry).trim().replace(/^www\./, '').toLowerCase();
    if (!e) return false;
    return host === e || host.endsWith(`.${e}`);
  });
}

// ── cache ───────────────────────────────────────────────────────────────────

export async function getCached(key, ttlHours = 72) {
  const { [CACHE_KEY]: cache = {} } = await chrome.storage.local.get(CACHE_KEY);
  const entry = cache[key];
  if (!entry) return null;
  const age = Date.now() - entry.at;
  if (age > ttlHours * 3600_000) return null;
  return entry.value;
}

export async function setCached(key, value, max = 60) {
  const { [CACHE_KEY]: cache = {} } = await chrome.storage.local.get(CACHE_KEY);
  cache[key] = { at: Date.now(), value };
  const keys = Object.keys(cache);
  if (keys.length > max) {
    keys
      .sort((a, b) => cache[a].at - cache[b].at)
      .slice(0, keys.length - max)
      .forEach((k) => delete cache[k]);
  }
  await chrome.storage.local.set({ [CACHE_KEY]: cache });
}

export async function clearCache() {
  await chrome.storage.local.set({ [CACHE_KEY]: {} });
}

// ── storico ─────────────────────────────────────────────────────────────────

/**
 * Lo storico è il "digital footprint": a cosa mi sono impegnato, quando, con
 * che scadenze. Serve soprattutto per ritrovare le disdette da fare.
 */
export async function pushHistory(entry, limit = 100) {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  history.unshift(entry);
  await chrome.storage.local.set({ [HISTORY_KEY]: history.slice(0, limit) });
}

export async function getHistory() {
  const { [HISTORY_KEY]: history = [] } = await chrome.storage.local.get(HISTORY_KEY);
  return history;
}

export async function updateHistoryEntry(id, patch) {
  const history = await getHistory();
  const idx = history.findIndex((h) => h.id === id);
  if (idx < 0) return null;
  history[idx] = { ...history[idx], ...patch };
  await chrome.storage.local.set({ [HISTORY_KEY]: history });
  return history[idx];
}

export async function clearHistory() {
  await chrome.storage.local.set({ [HISTORY_KEY]: [] });
}

// ── impegni ─────────────────────────────────────────────────────────────────

const COMMITMENTS_KEY = 'commitments';
const SNAPSHOTS_KEY = 'snapshots';

/**
 * Il registro degli impegni è la memoria lunga del prodotto: sopravvive alla
 * pagina, alla sessione e — se l'utente vuole — anche al contratto.
 */
export async function getCommitments() {
  const { [COMMITMENTS_KEY]: list = [] } = await chrome.storage.local.get(COMMITMENTS_KEY);
  return list;
}

export async function saveCommitment(commitment) {
  const list = await getCommitments();
  const idx = list.findIndex((c) => c.id === commitment.id);
  if (idx >= 0) list[idx] = commitment;
  else list.unshift(commitment);
  await chrome.storage.local.set({ [COMMITMENTS_KEY]: list });
  return commitment;
}

export async function getCommitment(id) {
  return (await getCommitments()).find((c) => c.id === id) || null;
}

export async function updateCommitment(id, patch) {
  const list = await getCommitments();
  const idx = list.findIndex((c) => c.id === id);
  if (idx < 0) return null;
  list[idx] = { ...list[idx], ...patch };
  await chrome.storage.local.set({ [COMMITMENTS_KEY]: list });
  return list[idx];
}

export async function deleteCommitment(id) {
  const list = (await getCommitments()).filter((c) => c.id !== id);
  await chrome.storage.local.set({ [COMMITMENTS_KEY]: list });
  await deleteSnapshotText(id);
  return true;
}

/**
 * Il testo integrale accettato sta a parte: è voluminoso e serve solo quando
 * si vuole la prova o il confronto, non a ogni lettura della lista.
 */
export async function setSnapshotText(id, text) {
  const { [SNAPSHOTS_KEY]: map = {} } = await chrome.storage.local.get(SNAPSHOTS_KEY);
  map[id] = text;
  await chrome.storage.local.set({ [SNAPSHOTS_KEY]: map });
}

export async function getSnapshotText(id) {
  const { [SNAPSHOTS_KEY]: map = {} } = await chrome.storage.local.get(SNAPSHOTS_KEY);
  return map[id] || null;
}

export async function deleteSnapshotText(id) {
  const { [SNAPSHOTS_KEY]: map = {} } = await chrome.storage.local.get(SNAPSHOTS_KEY);
  delete map[id];
  await chrome.storage.local.set({ [SNAPSHOTS_KEY]: map });
}

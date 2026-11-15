/**
 * Push reminders (web version): the plan the browser keeps, the hours the
 * server is told, and what is shown when the wake-up comes.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

import { wakeTime, buildPushPlan, planTimes, dueFromPlan, MORNING_HOUR } from '../src/core/push.js';

const DAY = 86_400_000;
const NOW = new Date(2026, 10, 15, 12, 0, 0).getTime();
const notice = (c, r) => ({ id: `reminder-${c.id}-${r.days}`, title: `${c.provider}: ${r.days}`, message: 'm' });
const commitment = (id, deadlineInDays, extra = {}) => {
  const deadline = new Date(2026, 10, 15, 0, 0, 0).getTime() + deadlineInDays * DAY;
  return {
    id, provider: `P${id}`, status: 'active', deadlineAt: new Date(deadline).toISOString(),
    reminders: [30, 7, 1].map((days) => ({ days, at: new Date(deadline - days * DAY).toISOString(), fired: deadline - days * DAY <= NOW })),
    ...extra,
  };
};

test('a reminder due in the night waits for the morning; one due by day keeps its time', () => {
  const night = new Date(2026, 10, 20, 0, 0, 0).getTime();
  assert.equal(new Date(wakeTime(night)).getHours(), MORNING_HOUR);
  assert.equal(new Date(wakeTime(night)).getDate(), 20);
  const noon = new Date(2026, 10, 20, 12, 30, 0).getTime();
  assert.equal(wakeTime(noon), noon);
});

test('the plan holds the reminders still to come, in order, with their text', () => {
  const plan = buildPushPlan([commitment('a', 40), commitment('b', 5)], NOW, notice, (c) => `/c/${c.id}`);
  // a: 30, 7 and 1 day before are all ahead; b: only the 1-day one is.
  assert.deepEqual(plan.map((p) => p.tag), ['reminder-b-1', 'reminder-a-30', 'reminder-a-7', 'reminder-a-1']);
  assert.ok(plan.every((p) => p.at > NOW && new Date(p.at).getHours() >= MORNING_HOUR));
  assert.equal(plan[0].title, 'Pb: 1');
  assert.equal(plan[0].url, '/c/b');
});

test('cancelled, expired or already said: not in the plan', () => {
  assert.deepEqual(buildPushPlan([commitment('a', 40, { status: 'cancelled' })], NOW, notice), []);
  assert.deepEqual(buildPushPlan([commitment('a', -2)], NOW, notice), []);
  assert.deepEqual(buildPushPlan([{ id: 'x', status: 'active' }], NOW, notice), []);
  const c = commitment('a', 40);
  c.reminders = c.reminders.map((r) => ({ ...r, fired: true }));
  assert.deepEqual(buildPushPlan([c], NOW, notice), []);
  assert.deepEqual(buildPushPlan(null, NOW, notice), []);
});

test('the server is told hours only, once each, the nearest first', () => {
  const plan = buildPushPlan([commitment('a', 40), commitment('b', 40)], NOW, notice);
  const times = planTimes(plan);
  assert.equal(times.length, 3, 'two commitments with the same deadline share their hours');
  assert.ok(times.every((t) => /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(t)));
  assert.equal(planTimes(plan, 2).length, 2);
  assert.ok(!JSON.stringify(times).includes('P'), 'no names');
});

test('woken up: one notification per commitment, the most urgent of those due', () => {
  const plan = buildPushPlan([commitment('a', 40), commitment('b', 5)], NOW, notice);
  assert.deepEqual(dueFromPlan(plan, NOW), [], 'nothing before its time');
  // A long silence: for "a" the 30 and the 7 day reminders are both due.
  const later = NOW + 34 * DAY;
  assert.deepEqual(dueFromPlan(plan, later).map((p) => p.tag).sort(), ['reminder-a-7', 'reminder-b-1']);
  assert.deepEqual(dueFromPlan(plan.map((p) => ({ ...p, shown: true })), later), []);
  assert.equal(dueFromPlan(plan, plan[0].at - 5 * 60000).length, 1, 'a wake-up a few minutes early still shows it');
  assert.deepEqual(dueFromPlan(null, NOW), []);
});

// ── the service worker part (web/sw-push.js), run here with fakes ───────────

function worker(planInStore) {
  const shown = [];
  const store = new Map(planInStore ? [['pushPlan', planInStore]] : []);
  const listeners = {};
  const request = (fn) => { const r = {}; queueMicrotask(() => { try { r.result = fn(); r.onsuccess?.(); } catch (e) { r.error = e; r.onerror?.(); } }); return r; };
  const self = {
    location: { origin: 'https://web.antefirma.app' },
    registration: { showNotification: async (title, o) => { shown.push({ title, ...o }); } },
    addEventListener: (name, fn) => { listeners[name] = fn; },
    clients: { opened: [], matchAll: async () => [], openWindow: async (u) => { self.clients.opened.push(u); } },
  };
  const indexedDB = {
    open: () => request(() => ({ transaction: () => ({ objectStore: () => ({ get: (k) => request(() => store.get(k)), put: (v, k) => request(() => { store.set(k, v); }) }) }) })),
  };
  vm.runInNewContext(readFileSync(new URL('../web/sw-push.js', import.meta.url), 'utf8'), { self, indexedDB, URL, Map, Set, Promise, Date, queueMicrotask });
  const fire = async (name, event = {}) => { let p; listeners[name]({ waitUntil: (x) => { p = x; }, ...event }); await p; };
  return { shown, store, fire, self };
}

test('service worker: a wake-up shows what is due and marks it as said', async () => {
  const items = buildPushPlan([commitment('a', 40), commitment('b', 5)], NOW, notice, (c) => `/?tab=commitments&id=${c.id}`).map((p) => ({ ...p, at: p.tag === 'reminder-b-1' ? Date.now() - 1000 : Date.now() + 5 * DAY }));
  const w = worker({ items, fallback: { title: 'F', message: 'f', url: '/' }, icon: '/i.png' });
  await w.fire('push');
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, 'Pb: 1');
  assert.equal(w.shown[0].tag, 'reminder-b-1');
  assert.equal(w.shown[0].data.url, '/?tab=commitments&id=b');
  assert.equal(w.store.get('pushPlan').items.filter((p) => p.shown).length, 1);
  // A second wake-up with nothing new: the generic notice, not the same reminder again.
  await w.fire('push');
  assert.equal(w.shown[1].title, 'F');
});

test('service worker: with no plan at all it still shows something, and a click opens the app', async () => {
  const w = worker(null);
  await w.fire('push');
  assert.equal(w.shown.length, 1);
  assert.equal(w.shown[0].title, 'AnteFirma');
  let closed = false;
  await w.fire('notificationclick', { notification: { close: () => { closed = true; }, data: { url: '/?tab=commitments&id=b' } } });
  assert.ok(closed);
  assert.deepEqual(w.self.clients.opened, ['https://web.antefirma.app/?tab=commitments&id=b']);
});

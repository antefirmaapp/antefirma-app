/**
 * Reminders when the web app is closed: the plan the browser keeps for itself.
 *
 * The server only wakes the browser at the hours in the plan; the wake-up has
 * no content. What to say is written here, in advance, and stays in the
 * browser: when the wake-up comes, the service worker (web/sw-push.js) reads
 * the plan and shows what is due.
 *
 * Pure logic: no browser APIs, so it can be tested in Node.
 */
import { COMMITMENT_STATUS } from './commitments.js';

/** Nobody wants a reminder at midnight: before this hour, it waits for the morning. */
export const MORNING_HOUR = 9;

/** When to wake the browser for a reminder due at `at`: never before 9 in the morning, local time. */
export function wakeTime(at) {
  const d = new Date(at);
  if (d.getHours() < MORNING_HOUR) d.setHours(MORNING_HOUR, 0, 0, 0);
  return d.getTime();
}

/**
 * The plan: one entry per reminder still to come.
 * `notice(commitment, reminder, at)` writes the notification (`{ id, title, message }`).
 * @returns {Array<{ at: number, tag: string, title: string, message: string, commitmentId: string, days: number, url: string }>}
 */
export function buildPushPlan(commitments, now, notice, urlFor = () => '') {
  const out = [];
  for (const c of commitments || []) {
    if (c.status !== COMMITMENT_STATUS.ACTIVE || !c.deadlineAt) continue;
    if (new Date(c.deadlineAt).getTime() <= now) continue;
    for (const r of c.reminders || []) {
      if (r.fired) continue;
      const at = wakeTime(new Date(r.at).getTime());
      if (!(at > now)) continue;
      const n = notice(c, r, at);
      out.push({ at, tag: n.id, title: n.title, message: n.message, commitmentId: c.id, days: r.days, url: urlFor(c) });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/** What the server is told: the hours, nothing else. At most `max`, the nearest first. */
export function planTimes(plan, max = 40) {
  return [...new Set(plan.map((p) => new Date(p.at).toISOString()))].slice(0, max);
}

/**
 * What the service worker shows when it is woken: the entries that are due and
 * not shown yet, one per commitment (the most urgent), as sweep() does.
 * Kept here so the same rule is tested once; sw-push.js mirrors it.
 */
export function dueFromPlan(plan, now, slackMs = 10 * 60_000) {
  const byCommitment = new Map();
  for (const p of plan || []) {
    if (p.shown || p.at > now + slackMs) continue;
    const cur = byCommitment.get(p.commitmentId);
    if (!cur || p.days < cur.days) byCommitment.set(p.commitmentId, p);
  }
  return [...byCommitment.values()];
}

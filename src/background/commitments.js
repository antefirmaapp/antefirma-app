/** Decisions, the commitment register, reminders and their notifications. */
import { formatMoney } from '../core/text.js';
import { createSnapshot } from '../core/proof.js';
import { buildCommitment, planReminders, dueReminder, missedWindow, commitmentState, COMMITMENT_STATUS } from '../core/commitments.js';
import { t } from '../i18n/index.js';
import { updateHistoryEntry, getCommitments, saveCommitment, updateCommitment, deleteCommitment, setSnapshotText } from '../core/storage.js';
import { getSettings } from './settings.js';

export const WATCH_ALARM = 'antefirma-watch-terms';

/**
 * A single recurring alarm instead of three alarms per commitment scheduled two
 * years ahead. It fires twice a day: if one pass is skipped — browser closed,
 * update, sleep — the next one catches up.
 */
export const SWEEP_ALARM = 'antefirma-daily-sweep';

/**
 * `via` doesn't change the decision, it records where it came from: "Continue
 * anyway" (blocked), below threshold (auto), excluded site (allowlist). It keeps
 * history truthful — before, every non-blocking interception stayed with
 * `decision: null` — and will be the basis for measuring false positives.
 */
export async function recordDecision({ id, decision, via = null, track = false } = {}) {
  await updateHistoryEntry(id, { decision, via, decidedAt: new Date().toISOString() });
  if (decision !== 'proceed') return { recorded: true, commitment: null };

  const stored = (await chrome.storage.session.get(`verdict:${id}`))[`verdict:${id}`];
  // How many times the user went ahead on this site after a block: at the
  // third, the warning offers to stop warning.
  if (via === 'blocked' && stored?.verdict?.host) {
    const { proceedByHost = {} } = await chrome.storage.local.get('proceedByHost');
    proceedByHost[stored.verdict.host] = (proceedByHost[stored.verdict.host] || 0) + 1;
    await chrome.storage.local.set({ proceedByHost });
  }

  const settings = await getSettings();
  if (!settings.trackCommitments && !track) return { recorded: true, commitment: null };
  if (!stored) return { recorded: true, commitment: null };

  const commitment = await commitmentFromVerdict({ verdict: stored.verdict, text: stored.text, decision });
  // Confirmation: whoever asked for the reminder must know it exists.
  if (track && commitment?.deadlineAt) {
    const when = new Date(commitment.deadlineAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
    await notify({
      id: `tracked-${commitment.id}`,
      title: t('reminderSetX', { x: commitment.provider || commitment.host || '' }),
      message: t('iLlRemindBeforeDLast', { d: when }),
      commitmentId: commitment.id, sticky: false,
    });
  }
  return { recorded: true, commitment };
}

/**
 * Creates the commitment: snapshot of the accepted text, computed deadlines,
 * scheduled reminders. The moment a warning turns into something the user
 * will find again two years later.
 */
export async function commitmentFromVerdict({ historyId = null, verdict = null, text = '', decision = 'proceed' } = {}) {
  /**
   * The text must be the one actually analysed. The panel always passed the
   * content of the "Paste text" textarea: for an analysis from a PDF, the
   * current page or a URL that textarea is empty, and a zero-character snapshot
   * was born — with the hash of the empty string, which verification declared
   * valid. The full verdict is already in the session together with its text:
   * it is read from there.
   */
  if (historyId) {
    const stored = (await chrome.storage.session.get(`verdict:${historyId}`))[`verdict:${historyId}`];
    if (stored) {
      verdict = verdict || stored.verdict;
      text = stored.text || text;
    }
  }
  if (!verdict) throw new Error('Verdetto mancante.');

  const snapshot = await createSnapshot({ text, verdict });
  if (snapshot.empty) {
    throw new Error(t('contractTextNotAvailableWithoutProof'));
  }
  const commitment = buildCommitment({ verdict, snapshot, decision });

  // Only commitments with a consequence over time deserve the register.
  const worthTracking =
    commitment.deadlineAt || commitment.renewalAt || commitment.worstCase != null || commitment.autoRenewal;
  if (!worthTracking) return null;

  await saveCommitment(commitment);
  await setSnapshotText(commitment.id, snapshot.text);
  return planAndSave(commitment);
}

export async function updateAndReschedule(id, patch) {
  const updated = await updateCommitment(id, patch);
  if (!updated) return null;
  // Reactivated after an undone cancellation: the plan is computed again from scratch.
  if (updated.status === COMMITMENT_STATUS.ACTIVE && patch.status) return planAndSave(updated);
  return updated;
}

export async function removeCommitment(id) {
  return deleteCommitment(id);
}

/**
 * Reminders are a plan saved with the commitment, not alarms scheduled two
 * years ahead: the daily pass decides what is due. It is a self-healing
 * mechanism — a skipped day is recovered the next day — while a lost alarm is
 * simply lost.
 */
export async function planAndSave(commitment) {
  const settings = await getSettings();
  if (!settings.reminders) return commitment;
  const reminders = planReminders(commitment);
  return (await updateCommitment(commitment.id, { reminders })) || commitment;
}

/** Alarm names used before 0.9, when internal names were Italian: cleared so they don't fire twice. */
export const OLD_ALARMS = ['antefirma-controllo-condizioni', 'antefirma-passata-quotidiana', 'antefirma-attesa-pagamento'];

export async function scheduleAlarms() {
  const settings = await getSettings();
  for (const name of OLD_ALARMS) chrome.alarms.clear(name);
  chrome.alarms.create(SWEEP_ALARM, { periodInMinutes: 60 * 12, delayInMinutes: 1 });
  if (settings.watchChanges) {
    chrome.alarms.create(WATCH_ALARM, { periodInMinutes: 60 * 24 * 7, delayInMinutes: 60 });
  } else {
    chrome.alarms.clear(WATCH_ALARM);
  }
}

/**
 * The pass: looks at every active commitment and decides what to say.
 * One reminder per commitment, the most urgent: after a long browser pause all
 * three would be due, and three notifications in a row about the same contract
 * are the quickest way to get switched off.
 */
export async function sweep(now = Date.now()) {
  const settings = await getSettings();
  if (!settings.reminders) return { fired: 0 };

  const list = await getCommitments();
  let fired = 0;

  for (const c of list) {
    if (c.status !== COMMITMENT_STATUS.ACTIVE) continue;

    // The window closed while nobody was looking: saying so is unpleasant,
    // but silence means the user finds out from the bank statement.
    if (missedWindow(c, now)) {
      const renewalAmount = c.recurringTotal ?? c.worstCase;
      await notify({
        id: `missed-${c.id}`,
        title: t('xCancellationWindowClosed', { x: c.provider || c.host }),
        message: renewalAmount != null
          ? t('cancellationDeadlineHasPassedContractRenews', { x: formatMoney(renewalAmount, c.currency) })
          : t('cancellationDeadlineHasPassedOpenSee'),
        commitmentId: c.id,
      });
      await updateCommitment(c.id, { missedNotified: true });
      fired += 1;
      continue;
    }

    const due = dueReminder(c, now);
    if (!due) continue;

    const state = commitmentState(c, now);
    const renewalAmount = c.recurringTotal ?? c.worstCase;
    await notify({
      id: `reminder-${c.id}-${due.days}`,
      title: t('cancelXNDaysLeft', { x: c.provider || c.host, n: due.days }),
      message: renewalAmount != null
        ? `${t('ifDonTCancelTimeNew', { x: formatMoney(renewalAmount, c.currency) })} ${state.label}.`
        : `${state.label}. ${t('openGenerateCancellationLetter')}`,
      commitmentId: c.id,
      kind: 'reminder',
    });

    // Every reminder further away than this counts as used: warning at 30
    // days after already warning at 7 makes no sense.
    const reminders = (c.reminders || []).map((r) => (r.days >= due.days ? { ...r, fired: true } : r));
    await updateCommitment(c.id, { reminders, lastReminder: new Date(now).toISOString() });
    fired += 1;
  }

  return { fired, checked: list.length };
}

export async function notify({ id, title, message, commitmentId, kind = 'open', sticky = true }) {
  try {
    await chrome.notifications.create(id, {
      type: 'basic',
      iconUrl: chrome.runtime.getURL('src/icons/icon128.png'),
      title,
      message,
      priority: 2,
      requireInteraction: sticky,
      // Cancellation reminders lead straight to the action.
      buttons: kind === 'reminder'
        ? [{ title: t('writeLetter') }, { title: t('iVeAlreadyCancelled') }]
        : [{ title: t('openExitKit') }],
    });
    await chrome.storage.session.set({ [`notif:${id}`]: { commitmentId, kind } });
  } catch (err) {
    // Notifications can be denied by the operating system: a pity, not a fatal
    // error. The deadline stays in the panel and in the calendar.
    console.warn('[AnteFirma] notifica non mostrata:', err?.message);
  }
}

export async function notifTarget(notificationId) {
  const map = await chrome.storage.session.get(`notif:${notificationId}`);
  const v = map[`notif:${notificationId}`];
  return typeof v === 'string' ? { commitmentId: v, kind: 'open' } : v || {};
}

export async function openCommitment(notificationId, { letter = false } = {}) {
  const { commitmentId } = await notifTarget(notificationId);
  const url = chrome.runtime.getURL(
    `src/sidepanel/sidepanel.html?tab=commitments${commitmentId ? `&id=${commitmentId}` : ''}${letter ? '&letter=1' : ''}`
  );
  chrome.tabs.create({ url });
  chrome.notifications?.clear(notificationId);
}

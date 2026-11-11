/** The exit kit: letter, calendar file, proof of what was accepted. */
import { sha256, attestation } from '../core/proof.js';
import { buildIcs } from '../core/ics.js';
import { buildLetter, suggestKind, letterLangFor } from '../core/letter.js';
import { t } from '../i18n/index.js';
import { getCommitment, getSnapshotText } from '../core/storage.js';
import { getSettings } from './settings.js';

export async function letterFor({ id, kind, lang } = {}) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('commitmentNotFound'));
  const settings = await getSettings();
  // The letter's language is the provider's: normally, that of the country chosen in settings.
  return buildLetter(commitment, settings.identity || {}, kind || suggestKind(commitment), Date.now(), lang || letterLangFor(settings.jurisdiction, settings.uiLang));
}

export async function icsFor(id) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('commitmentNotFound'));
  const content = buildIcs(commitment);
  if (!content) throw new Error(t('commitmentHasNoDeadlinePutCalendar'));
  return { content, filename: `scadenza-${(commitment.provider || 'impegno').toLowerCase()}.ics` };
}

export async function proofFor(id) {
  const commitment = await getCommitment(id);
  if (!commitment) throw new Error(t('commitmentNotFound'));
  const text = await getSnapshotText(id);
  const snapshot = commitment.snapshot || {};

  // Integrity check: the fingerprint is recomputed on the stored text.
  const recomputed = text ? await sha256(text) : null;

  return {
    commitment,
    snapshot,
    text,
    // A snapshot without text cannot be "valid": the fingerprint of the empty
    // string matches itself and would say yes to nothing.
    valid: Boolean(recomputed && recomputed === snapshot.hash && !snapshot.empty),
    recomputed,
    attestation: attestation({ ...snapshot, url: commitment.url }, { host: commitment.host }),
    filename: `prova-${(commitment.provider || 'impegno').toLowerCase()}-${(snapshot.at || '').slice(0, 10)}.txt`,
  };
}

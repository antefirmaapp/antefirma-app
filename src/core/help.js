/**
 * The extension's "?": opens the right help centre page, in the interface language.
 *
 * Keys and slugs are the same as help.mjs on the website (antefirma-site): if
 * they change there, they must change here (test/help.test.mjs checks it).
 */
const SITE = 'https://antefirma.app';
const ROOT = { it: '/aiuto/', en: '/en/help/', es: '/es/ayuda/' };
const SLUGS = {
  troubleshooting: { it: 'problemi-frequenti', en: 'troubleshooting', es: 'problemas-frecuentes' },
  gettingStarted: { it: 'primi-passi', en: 'getting-started', es: 'primeros-pasos' },
  warning: { it: 'l-avviso', en: 'the-warning', es: 'el-aviso' },
  analysing: { it: 'analizzare', en: 'analysing', es: 'analizar' },
  commitments: { it: 'impegni-e-promemoria', en: 'commitments-and-reminders', es: 'compromisos-y-recordatorios' },
  letter: { it: 'lettera-di-disdetta', en: 'cancellation-letter', es: 'carta-de-baja' },
  plans: { it: 'piani-e-chiave', en: 'plans-and-keys', es: 'planes-y-clave' },
  data: { it: 'i-tuoi-dati', en: 'your-data', es: 'tus-datos' },
  team: { it: 'amministrare-un-team', en: 'managing-a-team', es: 'administrar-un-team' },
};
export const HELP_TOPICS = Object.keys(SLUGS);

/** The address of the guide on `topic` (or the index), with a question's anchor if needed. */
export function helpUrl(topic, lang = 'it', anchor = '') {
  // A language without its own help pages yet reads the English ones.
  const l = ROOT[lang] ? lang : 'en';
  const slug = SLUGS[topic]?.[l];
  return `${SITE}${ROOT[l]}${slug ? `${slug}/` : ''}${anchor ? `#${anchor}` : ''}`;
}

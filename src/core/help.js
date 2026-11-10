/**
 * Il «?» dell'estensione: porta alla pagina giusta del centro di aiuto, nella lingua dell'interfaccia.
 *
 * Le chiavi e gli slug sono gli stessi di help.mjs nel sito (antefirma-site):
 * se cambiano lì, vanno cambiati qui.
 */
const SITE = 'https://antefirma.app';
const ROOT = { it: '/aiuto/', en: '/en/help/', es: '/es/ayuda/' };
const SLUGS = {
  problemi: { it: 'problemi-frequenti', en: 'troubleshooting', es: 'problemas-frecuentes' },
  'primi-passi': { it: 'primi-passi', en: 'getting-started', es: 'primeros-pasos' },
  avviso: { it: 'l-avviso', en: 'the-warning', es: 'el-aviso' },
  analizzare: { it: 'analizzare', en: 'analysing', es: 'analizar' },
  impegni: { it: 'impegni-e-promemoria', en: 'commitments-and-reminders', es: 'compromisos-y-recordatorios' },
  lettera: { it: 'lettera-di-disdetta', en: 'cancellation-letter', es: 'carta-de-baja' },
  piani: { it: 'piani-e-chiave', en: 'plans-and-keys', es: 'planes-y-clave' },
  dati: { it: 'i-tuoi-dati', en: 'your-data', es: 'tus-datos' },
  team: { it: 'amministrare-un-team', en: 'managing-a-team', es: 'administrar-un-team' },
};
export const HELP_TOPICS = Object.keys(SLUGS);

/** L'indirizzo della guida su `topic` (o l'indice), con l'ancora di una domanda se serve. */
export function helpUrl(topic, lang = 'it', anchor = '') {
  const l = ROOT[lang] ? lang : 'it';
  const slug = SLUGS[topic]?.[l];
  return `${SITE}${ROOT[l]}${slug ? `${slug}/` : ''}${anchor ? `#${anchor}` : ''}`;
}

/**
 * The extension's "?": opens the right help centre page, in the interface language.
 *
 * Keys and slugs are the same as help.mjs on the website (antefirma-site): if
 * they change there, they must change here (test/help.test.mjs checks it).
 */
const SITE = 'https://antefirma.app';
const ROOT = { it: '/aiuto/', en: '/en/help/', es: '/es/ayuda/', de: '/de/hilfe/', fr: '/fr/aide/', nl: '/nl/hulp/', pl: '/pl/pomoc/', pt: '/pt/ajuda/' };
const SLUGS = {
  troubleshooting: { it: 'problemi-frequenti', en: 'troubleshooting', es: 'problemas-frecuentes', de: 'haeufige-probleme', fr: 'problemes-frequents', nl: 'veelvoorkomende-problemen', pl: 'czeste-problemy', pt: 'problemas-frequentes' },
  gettingStarted: { it: 'primi-passi', en: 'getting-started', es: 'primeros-pasos', de: 'erste-schritte', fr: 'premiers-pas', nl: 'eerste-stappen', pl: 'pierwsze-kroki', pt: 'primeiros-passos' },
  warning: { it: 'l-avviso', en: 'the-warning', es: 'el-aviso', de: 'die-warnung', fr: 'l-avertissement', nl: 'de-waarschuwing', pl: 'ostrzezenie', pt: 'o-aviso' },
  analysing: { it: 'analizzare', en: 'analysing', es: 'analizar', de: 'analysieren', fr: 'analyser', nl: 'analyseren', pl: 'analiza', pt: 'analisar' },
  commitments: { it: 'impegni-e-promemoria', en: 'commitments-and-reminders', es: 'compromisos-y-recordatorios', de: 'verpflichtungen-und-erinnerungen', fr: 'engagements-et-rappels', nl: 'verplichtingen-en-herinneringen', pl: 'zobowiazania-i-przypomnienia', pt: 'compromissos-e-lembretes' },
  letter: { it: 'lettera-di-disdetta', en: 'cancellation-letter', es: 'carta-de-baja', de: 'kuendigungsschreiben', fr: 'lettre-de-resiliation', nl: 'opzegbrief', pl: 'pismo-wypowiadajace', pt: 'carta-de-cancelamento' },
  plans: { it: 'piani-e-chiave', en: 'plans-and-keys', es: 'planes-y-clave', de: 'tarife-und-schluessel', fr: 'formules-et-cle', nl: 'abonnementen-en-sleutel', pl: 'plany-i-klucz', pt: 'planos-e-chave' },
  data: { it: 'i-tuoi-dati', en: 'your-data', es: 'tus-datos', de: 'ihre-daten', fr: 'vos-donnees', nl: 'je-gegevens', pl: 'twoje-dane', pt: 'os-seus-dados' },
  team: { it: 'amministrare-un-team', en: 'managing-a-team', es: 'administrar-un-team', de: 'ein-team-verwalten', fr: 'gerer-une-equipe', nl: 'een-team-beheren', pl: 'zarzadzanie-zespolem', pt: 'gerir-uma-equipa' },
};
export const HELP_TOPICS = Object.keys(SLUGS);

/** The address of the guide on `topic` (or the index), with a question's anchor if needed. */
export function helpUrl(topic, lang = 'it', anchor = '') {
  // A language without its own help pages yet reads the English ones.
  const l = ROOT[lang] ? lang : 'en';
  const slug = SLUGS[topic]?.[l];
  return `${SITE}${ROOT[l]}${slug ? `${slug}/` : ''}${anchor ? `#${anchor}` : ''}`;
}

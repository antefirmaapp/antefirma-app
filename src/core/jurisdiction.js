/**
 * The protections to start from, guessed from the browser language at install
 * ("de-AT" → Austria, "fr-BE" and "nl-BE" → Belgium, "en-US" → United States).
 * A language alone gives its main country; anything else falls back to the EU
 * rules, which hold in every member state. The person can change it in settings.
 */
export function jurisdictionFor(uiLanguage = '') {
  const [lang, region = ''] = String(uiLanguage).replace('_', '-').split('-');
  const r = region.toUpperCase();
  const l = lang.toLowerCase();
  if (['IT', 'ES', 'DE', 'AT', 'FR', 'BE', 'NL', 'PL', 'PT'].includes(r)) return r;
  // Portuguese from Brazil: outside the EU, with its own consumer code that AnteFirma doesn't cover yet.
  if (r === 'BR') return 'OTHER';
  if (r === 'GB') return 'UK';
  if (r === 'US') return 'US';
  return { it: 'IT', es: 'ES', de: 'DE', fr: 'FR', nl: 'NL', pl: 'PL', pt: 'PT', en: 'UK' }[l] || 'EU';
}

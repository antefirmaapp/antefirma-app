/**
 * Context Engine (page side).
 *
 * It looks at the *decision*, not just the document: which button it is, what it
 * costs, for how long, which consents are already ticked, where the terms are.
 *
 * Everything it collects stays in the page until the user performs the action:
 * nothing is sent in the background before the click.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.context) return;
  const { labelOf, deepQueryAll, isVisible } = CF.util;

  const CURRENCY = { '€': 'EUR', $: 'USD', '£': 'GBP', '¥': 'JPY' };
  /**
   * Word forms ("29,90 euro al mese") count as much as the symbol: without them,
   * the price of a page that doesn't use "€" was not seen at all. Postfix only,
   * as in core/text.js: in Italian the unit follows the amount. The same goes
   * for the zloty, the Nordic and Czech crowns and the Romanian leu
   * ("49 zł", "99 kr/mån", "29,99 lei pe lună", "199 Kč měsíčně"); Danish and
   * Norwegian prices also write "kr 99" and "99,-". The forint is read only as
   * "Ft" with a capital F, so that English feet ("6 ft") are not taken for a price.
   */
  const CURRENCY_WORD = { euro: 'EUR', euros: 'EUR', dollari: 'USD', sterline: 'GBP', franchi: 'CHF', 'zł': 'PLN', kr: 'KR', lei: 'RON', 'kč': 'CZK', ft: 'HUF' };
  /**
   * "kr" is the Danish, Norwegian and Swedish crown alike: the page decides
   * which, by its language first and then by its domain. Unknown: Swedish,
   * the largest of the three markets.
   */
  function crown() {
    const lang = String(document.documentElement?.lang || '').toLowerCase();
    const host = String(location?.hostname || '').toLowerCase();
    if (/^da/.test(lang) || host.endsWith('.dk')) return 'DKK';
    if (/^(nb|nn|no)/.test(lang) || host.endsWith('.no')) return 'NOK';
    return 'SEK';
  }
  const AMOUNT_RE =
    /(?:([€$£¥])|\b(EUR|USD|GBP|CHF|PLN|SEK|RON|CZK|DKK|NOK|HUF|kr)\b\.?)\s*(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:,-)?|(\d{1,3}(?:[.,\s]\d{3})*(?:[.,]\d{1,2})?|\d+(?:[.,]\d{1,2})?)(?:,-)?\s*(?:([€$£¥])|\b(EUR|USD|GBP|CHF|PLN|SEK|RON|CZK|DKK|NOK|HUF)\b|\b(euros?|dollari|sterline|franchi|zł|kr|lei|kč|ft)(?![\wÀ-ɏ]))/gi;

  /**
   * Period words in the six languages. Accented words cannot use \b (it only
   * knows [A-Za-z0-9_]), so those alternatives use lookarounds that count
   * accented letters as letters.
   */
  const PERIOD_RE = [
    [/\/\s*(?:mo|mese|month|mes|monat|mon\.?|mois|maand|mnd|m)(?![\wÀ-ÿ])|\bal\s*mese\b|\bmensil\w*|\bper\s+(?:month|maand)\b|\bmonthly\b|\bal\s+mes\b|\bmensual\w*|\b(?:pro|im|je)\s+monat\b|\bmonatlich\w*|\bmtl\.|\bpar\s+mois\b|\bmensuel\w*|\bmaandelijks\b|\bp\/m\b/i, 'month'],
    [/\/\s*(?:yr|anno|year|año|ano|jahr|an|jaar|a)(?![\wÀ-ÿ])|\ball'?\s*anno\b|\bannual\w*|\bper\s+(?:year|jaar)\b|\byearly\b|\bal\s+año(?![\wÀ-ÿ])|\banual\w*|\b(?:pro|im|je)\s+jahr\b|(?<![\wÀ-ÿ])jährlich\w*|\bpar\s+an\b|\bannuel\w*|\bjaarlijks\b/i, 'year'],
    [/\/\s*(?:wk|week|sett|semana|woche|semaine)\b|\ba\s*settimana\b|\bsettimanal\w*|\bweekly\b|\ba\s+la\s+semana\b|\bsemanal\w*|\bpro\s+woche\b|(?<![\wÀ-ÿ])wöchentlich\w*|\bpar\s+semaine\b|\bhebdomadaire\w*|\bper\s+week\b|\bwekelijks\b/i, 'week'],
    [/\bal\s*giorno\b|\bdaily\b|\bper\s+(?:day|dag)\b|\bal\s+d[ií]a(?![\wÀ-ÿ])|\bpro\s+tag\b|(?<![\wÀ-ÿ])täglich\w*|\bpar\s+jour\b|\bdagelijks\b/i, 'day'],
    [/\btrimestral\w*|\bquarterly\b|\btrimestriel\w*|(?<![\wÀ-ÿ])vierteljährlich\w*|\bpro\s+quartal\b|\bper\s+kwartaal\b/i, 'quarter'],
    // Polish and Portuguese, after the others so the older rules keep their order.
    [/\/\s*(?:mies\.?|miesi(?:ą|a)c|m(?:ê|e)s)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:miesi(?:ę|e)cznie|na\s+miesi(?:ą|a)c|za\s+miesi(?:ą|a)c|por\s+m(?:ê|e)s|ao\s+m(?:ê|e)s|mensal(?:mente)?)(?![\wÀ-ɏ])/i, 'month'],
    [/\/\s*(?:rok|ano)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:rocznie|na\s+rok|za\s+rok|por\s+ano|ao\s+ano)(?![\wÀ-ɏ])/i, 'year'],
    [/\/\s*(?:tydz\.?|tydzie(?:ń|n))(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:tygodniowo|na\s+tydzie(?:ń|n)|por\s+semana)(?![\wÀ-ɏ])/i, 'week'],
    [/(?<![\wÀ-ɏ])(?:dziennie|na\s+dzie(?:ń|n)|por\s+dia|ao\s+dia)(?![\wÀ-ɏ])/i, 'day'],
    [/(?<![\wÀ-ɏ])(?:kwartalnie|na\s+kwarta(?:ł|l)|por\s+trimestre)(?![\wÀ-ɏ])/i, 'quarter'],
    // Swedish, Romanian and Czech, appended for the same reason.
    [/\/\s*(?:m(?:å|a)n(?:ad)?|lun(?:ă|a)|m(?:ě|e)s(?:\.|(?:í|i)c)?)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:per\s+m(?:å|a)nad|i\s+m(?:å|a)naden|m(?:å|a)nadsvis|pe\s+lun(?:ă|a)|lunar|m(?:ě|e)s(?:í|i)(?:č|c)n(?:ě|e)|za\s+m(?:ě|e)s(?:í|i)c|na\s+m(?:ě|e)s(?:í|i)c)(?![\wÀ-ɏ])/i, 'month'],
    [/\/\s*(?:(?:å|a)r)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:per\s+(?:å|a)r|om\s+(?:å|a)ret|(?:å|a)rligen|pe\s+an|ro(?:č|c)n(?:ě|e))(?![\wÀ-ɏ])/i, 'year'],
    [/\/\s*(?:vecka|s(?:ă|a)pt(?:\.|(?:ă|a)m(?:â|a)n(?:ă|a))?|t(?:ý|y)den)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:per\s+vecka|i\s+veckan|pe\s+s(?:ă|a)pt(?:ă|a)m(?:â|a)n(?:ă|a)|s(?:ă|a)pt(?:ă|a)m(?:â|a)nal|t(?:ý|y)dn(?:ě|e)|za\s+t(?:ý|y)den)(?![\wÀ-ɏ])/i, 'week'],
    [/(?<![\wÀ-ɏ])(?:om\s+dagen|pe\s+zi|zilnic|denn(?:ě|e)|za\s+den)(?![\wÀ-ɏ])/i, 'day'],
    [/(?<![\wÀ-ɏ])(?:per\s+kvartal|kvartalsvis|pe\s+trimestru|trimestrial|(?:č|c)tvrtletn(?:ě|e)|za\s+(?:č|c)tvrtlet(?:í|i))(?![\wÀ-ɏ])/i, 'quarter'],
    // Danish, Norwegian and Finnish, appended for the same reason.
    [/\/\s*(?:md\.?|mdr\.?|måned|kk|kuukausi|kuukaudessa)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:pr\.?\s+m(?:å|a)ned|per\s+m(?:å|a)ned|om\s+m(?:å|a)neden|i\s+m(?:å|a)neden|m(?:å|a)nedlig(?:t|e)?|kuukaudessa|kuussa|kuukausittain|kk:ssa)(?![\wÀ-ɏ])/i, 'month'],
    [/\/\s*(?:v|vuosi|vuodessa)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:pr\.?\s+(?:å|a)r|om\s+(?:å|a)ret|i\s+(?:å|a)ret|(?:å|a)rlig(?:t|e)?|vuodessa|vuosittain)(?![\wÀ-ɏ])/i, 'year'],
    [/\/\s*(?:uge|uke|vko|viikko)(?![\wÀ-ɏ])|(?<![\wÀ-ɏ])(?:pr\.?\s+uge|per\s+uke|om\s+ugen|i\s+uk(?:a|en)|ugentlig(?:t)?|ukentlig(?:t)?|viikossa|viikoittain)(?![\wÀ-ɏ])/i, 'week'],
    [/(?<![\wÀ-ɏ])(?:pr\.?\s+dag|daglig(?:t)?|p(?:ä|a)iv(?:ä|a)ss(?:ä|a)|p(?:ä|a)ivitt(?:ä|a)in)(?![\wÀ-ɏ])/i, 'day'],
    [/(?<![\wÀ-ɏ])(?:pr\.?\s+kvartal|neljännesvuosittain|vuosinelj(?:ä|a)nnekselt(?:ä|a)|vuosinelj(?:ä|a)nnekses(?:s(?:ä|a)))(?![\wÀ-ɏ])/i, 'quarter'],
    // Slovak, Hungarian and Greek, appended for the same reason. Greek letters count as letters too.
    [/\/\s*(?:mesiac|mes\.|h(?:ó|o)(?:nap)?|μήνα|μήνας|μην\.?)(?![\wÀ-ɏͰ-Ͽ])|(?<![\wÀ-ɏͰ-Ͽ])(?:mesa(?:č|c)ne|za\s+mesiac|na\s+mesiac|havonta|havi\s+d(?:í|i)j|egy\s+h(?:ó|o)napra|τον\s+μήνα|ανά\s+μήνα|μηνιαίως|μηνιαία|το\s+μήνα)(?![\wÀ-ɏͰ-Ͽ])/i, 'month'],
    [/\/\s*(?:rok|(?:é|e)v|έτος|χρόνο|έτος)(?![\wÀ-ɏͰ-Ͽ])|(?<![\wÀ-ɏͰ-Ͽ])(?:ro(?:č|c)ne|za\s+rok|na\s+rok|(?:é|e)vente|egy\s+(?:é|e)vre|τον\s+χρόνο|το\s+χρόνο|ανά\s+έτος|ετησίως|ετήσια)(?![\wÀ-ɏͰ-Ͽ])/i, 'year'],
    [/\/\s*(?:t(?:ý|y)(?:ž|z)de(?:ň|n)|h(?:é|e)t|εβδομάδα)(?![\wÀ-ɏͰ-Ͽ])|(?<![\wÀ-ɏͰ-Ͽ])(?:t(?:ý|y)(?:ž|z)denne|za\s+t(?:ý|y)(?:ž|z)de(?:ň|n)|hetente|την\s+εβδομάδα|ανά\s+εβδομάδα|εβδομαδιαίως)(?![\wÀ-ɏͰ-Ͽ])/i, 'week'],
    [/(?<![\wÀ-ɏͰ-Ͽ])(?:denne|za\s+de(?:ň|n)|naponta|την\s+ημέρα|ανά\s+ημέρα|ημερησίως)(?![\wÀ-ɏͰ-Ͽ])/i, 'day'],
    [/(?<![\wÀ-ɏͰ-Ͽ])(?:(?:š|s)tvr(?:ť|t)ro(?:č|c)ne|za\s+(?:š|s)tvr(?:ť|t)rok|negyed(?:é|e)vente|ανά\s+τρίμηνο|τριμηνιαίως)(?![\wÀ-ɏͰ-Ͽ])/i, 'quarter'],
    // Croatian, Slovenian and Bulgarian, appended for the same reason. Cyrillic letters count as letters too.
    [/\/\s*(?:mj(?:esec)?\.?|mes(?:ec)?\.?|месец|мес\.?)(?![\wÀ-ɏͰ-ϿЀ-ӿ])|(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?:mjese(?:č|c)no|na\s+mjesec|mese(?:č|c)no|na\s+mesec|месечно|на\s+месец)(?![\wÀ-ɏͰ-ϿЀ-ӿ])/i, 'month'],
    [/\/\s*(?:god(?:ina|inu)?\.?|leto|година|год\.?)(?![\wÀ-ɏͰ-ϿЀ-ӿ])|(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?:godi(?:š|s)nje|na\s+godinu|letno|na\s+leto|годишно|на\s+година)(?![\wÀ-ɏͰ-ϿЀ-ӿ])/i, 'year'],
    [/\/\s*(?:tjedan|teden|седмица)(?![\wÀ-ɏͰ-ϿЀ-ӿ])|(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?:tjedno|na\s+tjedan|tedensko|na\s+teden|седмично|на\s+седмица)(?![\wÀ-ɏͰ-ϿЀ-ӿ])/i, 'week'],
    [/(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?:dnevno|na\s+dan|дневно|на\s+ден)(?![\wÀ-ɏͰ-ϿЀ-ӿ])/i, 'day'],
    [/(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?:tromjese(?:č|c)no|(?:č|c)etrtletno|тримесечно)(?![\wÀ-ɏͰ-ϿЀ-ӿ])/i, 'quarter'],
  ];

  /**
   * Free trials: each rule gives the number (n) and the unit (u). "First month
   * free" and the like have no number: one month.
   */
  const TRIAL_RES = [
    /\b(?:prova|periodo)\s+(?:gratuit\w+|di\s+prova)[^.]{0,40}?(?<n>\d{1,2})\s*(?<u>giorni|mesi|settimane)/i,
    /\b(?<n>\d{1,2})\s*(?<u>giorni|mesi|settimane)\s+(?:di\s+prova|gratis|gratuit\w+)/i,
    /\bfree\s+trial\s+(?:for\s+|of\s+)?(?<n>\d{1,2})\s*(?<u>days?|months?|weeks?)/i,
    /\b(?<n>\d{1,2})[-\s](?<u>day|month|week)s?\s+free(?:\s+trial)?\b/i,
    /\bfree\s+for\s+(?<n>\d{1,2})\s*(?<u>days?|months?|weeks?)/i,
    /\bprueba\s+gratuita\s+(?:de\s+)?(?<n>\d{1,2})\s*(?<u>d[ií]as|meses|semanas)/i,
    /\b(?<n>\d{1,2})\s*(?<u>d[ií]as|meses|semanas)\s+(?:gratis|de\s+prueba)/i,
    /\b(?<n>\d{1,2})\s*(?<u>tage?|monate?|wochen?)\s+(?:kostenlos|gratis|testen)/i,
    /\b(?:kostenlose[rn]?\s+)?(?:test|probe)(?:zeitraum|phase|monat|abo)\w*\s+(?:von\s+)?(?<n>\d{1,2})\s*(?<u>tage?n?|monate?n?|wochen?)/i,
    /\bessai\s+gratuit\s+(?:de\s+)?(?<n>\d{1,2})\s*(?<u>jours?|mois|semaines?)/i,
    /\b(?<n>\d{1,2})\s*(?<u>jours?|mois|semaines?)\s+(?:gratuits?|offerts?|d'essai)/i,
    /\b(?<n>\d{1,2})\s*(?<u>dagen|maanden|weken|dag|maand|week)\s+gratis/i,
    /\bgratis\s+proefperiode\s+(?:van\s+)?(?<n>\d{1,2})\s*(?<u>dagen|maanden|weken)/i,
    /\b(?:primo\s+mese\s+gratis|first\s+month\s+free|primer\s+mes\s+gratis|erster\s+monat\s+(?:gratis|kostenlos)|premier\s+mois\s+(?:gratuit|offert)|eerste\s+maand\s+gratis)\b/i,
    /(?<![\wÀ-ɏ])(?<n>\d{1,2})\s*(?<u>dni|dzie(?:ń|n)|miesi(?:ą|ę|e|a)c\w*|tygodni\w*)\s+(?:za\s+darmo|gratis|bezp(?:ł|l)atn\w*|okresu\s+pr(?:ó|o)bnego)/i,
    /(?<![\wÀ-ɏ])(?:darmowy|bezp(?:ł|l)atny)\s+okres\s+pr(?:ó|o)bny\s+(?:przez\s+)?(?<n>\d{1,2})\s*(?<u>dni|miesi(?:ą|ę|e|a)c\w*|tygodni\w*)/i,
    /(?<![\wÀ-ɏ])(?<n>\d{1,2})\s*(?<u>dias?|meses|m(?:ê|e)s|semanas?)\s+(?:gr(?:á|a)tis|gratuitos?|de\s+experi(?:ê|e)ncia|de\s+teste)/i,
    /(?<![\wÀ-ɏ])per(?:í|i)odo\s+(?:experimental|de\s+teste)\s+(?:gratuito\s+)?(?:de\s+)?(?<n>\d{1,2})\s*(?<u>dias?|meses|m(?:ê|e)s|semanas?)/i,
    /(?<![\wÀ-ɏ])(?:pierwszy\s+miesi(?:ą|a)c\s+(?:za\s+darmo|gratis)|primeiro\s+m(?:ê|e)s\s+(?:gr(?:á|a)tis|gratuito|oferta))(?![\wÀ-ɏ])/i,
    /(?<![\wÀ-ɏ])(?<n>\d{1,2})\s*(?<u>dag(?:ar|ars)?|m(?:å|a)nad(?:er|ers)?|veck(?:a|or|ors))\s+(?:gratis|kostnadsfritt|(?:gratis\s+)?provperiod)/i,
    /(?<![\wÀ-ɏ])(?:gratis\s+(?:i\s+)?|(?:gratis\s+)?provperiod\s+(?:p(?:å|a)\s+|i\s+)?)(?<n>\d{1,2})\s*(?<u>dag(?:ar|ars)?|m(?:å|a)nad(?:er|ers)?|veck(?:a|or|ors))/i,
    /(?<![\wÀ-ɏ])(?<n>\d{1,2})\s*(?<u>zi(?:le)?|lun(?:ă|a|i)|s(?:ă|a)pt(?:ă|a)m(?:â|a)n(?:ă|a|i))\s+(?:gratuit(?:e|ă|a)?|gratis|de\s+prob(?:ă|a))/i,
    /(?<![\wÀ-ɏ])(?:perioad(?:ă|a)\s+de\s+prob(?:ă|a)\s+(?:gratuit(?:ă|a)\s+)?(?:de\s+)?|gratuit\s+timp\s+de\s+)(?<n>\d{1,2})\s*(?<u>zi(?:le)?|lun(?:ă|a|i)|s(?:ă|a)pt(?:ă|a)m(?:â|a)n(?:ă|a|i))/i,
    /(?<![\wÀ-ɏ])(?<n>\d{1,2})\s*(?<u>dn(?:í|ů|i|u|y)|den|m(?:ě|e)s(?:í|i)c(?:e|ů|u)?|t(?:ý|y)d(?:en|ny|nů|nu))\s+(?:zdarma|zku(?:š|s)ebn(?:ě|e))/i,
    /(?<![\wÀ-ɏ])(?:zku(?:š|s)ebn(?:í|i)\s+(?:doba|obdob(?:í|i)|verze)\s+(?:zdarma\s+)?(?:na\s+)?|zdarma\s+na\s+)(?<n>\d{1,2})\s*(?<u>dn(?:í|ů|i|u|y)|den|m(?:ě|e)s(?:í|i)c(?:e|ů|u)?|t(?:ý|y)d(?:en|ny|nů|nu))/i,
    /(?<![\wÀ-ɏ])(?:f(?:ö|o)rsta\s+m(?:å|a)naden\s+gratis|prima\s+lun(?:ă|a)\s+(?:gratuit(?:ă|a)?|gratis)|prvn(?:í|i)\s+m(?:ě|e)s(?:í|i)c\s+zdarma)(?![\wÀ-ɏ])/i,
    /(?<![\wÀ-ɏ])(?<n>\d{1,2})\s*(?<u>dag(?:e|es|er|ers)?|m(?:å|a)ned(?:er|s)?|uge(?:r|s)?|uke(?:r|s)?)\s+(?:gratis|(?:gratis\s+)?pr(?:ø|o)veperiode)/i,
    /(?<![\wÀ-ɏ])(?:gratis\s+(?:i\s+)?|pr(?:ø|o)v\s+gratis\s+i\s+|gratis\s+pr(?:ø|o)veperiode\s+(?:p(?:å|a)\s+|i\s+)?)(?<n>\d{1,2})\s*(?<u>dag(?:e|es|er|ers)?|m(?:å|a)ned(?:er|s)?|uge(?:r|s)?|uke(?:r|s)?)/i,
    /(?<![\wÀ-ɏ])(?<n>\d{1,2})\s*(?<u>p(?:ä|a)iv(?:ä|a)(?:(?:ä|a)|n)?|kuukau(?:si|den|tta|deksi)|viik(?:ko|on|koa))\s+(?:ilmaiseksi|maksutta|ilmai\w*\s+kokeilu\w*|kokeilu\w*)/i,
    /(?<![\wÀ-ɏ])(?:ilmai\w*\s+kokeilu\w*\s+|kokeile\s+ilmaiseksi\s+)(?<n>\d{1,2})\s*(?<u>p(?:ä|a)iv(?:ä|a)(?:(?:ä|a)|n)?|kuukau(?:si|den|tta|deksi)|viik(?:ko|on|koa))/i,
    /(?<![\wÀ-ɏ])(?:f(?:ø|o)rste\s+m(?:å|a)ned\s+gratis|ensimm(?:ä|a)inen\s+kuukausi\s+(?:ilmaiseksi|maksutta|ilmainen))(?![\wÀ-ɏ])/i,
    /(?<![\wÀ-ɏͰ-Ͽ])(?<n>\d{1,2})\s*(?<u>dn(?:í|i)|de(?:ň|n)|mesiac(?:e|ov)?|t(?:ý|y)(?:ž|z)d(?:e(?:ň|n)|ne|(?:ň|n)ov))\s+(?:zadarmo|zdarma|na\s+sk(?:ú|u)(?:š|s)ku)/i,
    /(?<![\wÀ-ɏͰ-Ͽ])(?:sk(?:ú|u)(?:š|s)obn(?:á|a|é|e)\s+(?:doba|obdobie|verzia)\s+(?:zadarmo\s+)?(?:na\s+)?|zadarmo\s+na\s+)(?<n>\d{1,2})\s*(?<u>dn(?:í|i)|de(?:ň|n)|mesiac(?:e|ov)?|t(?:ý|y)(?:ž|z)d(?:e(?:ň|n)|ne|(?:ň|n)ov))/i,
    /(?<![\wÀ-ɏͰ-Ͽ])(?<n>\d{1,2})\s*(?<u>nap(?:os|ig|ra)?|h(?:ó|o)nap(?:os|ig|ra)?|h(?:é|e)t(?:ig|re)?|hetes)\s+(?:ingyen(?:es)?|d(?:í|i)jmentes(?:en)?|pr(?:ó|o)ba(?:id(?:ő|o)\w*)?)/i,
    /(?<![\wÀ-ɏͰ-Ͽ])(?:ingyenes\s+pr(?:ó|o)ba(?:id(?:ő|o)(?:szak)?)?\s+)(?<n>\d{1,2})\s*(?<u>nap(?:os|ig|ra)?|h(?:ó|o)nap(?:os|ig|ra)?|h(?:é|e)t(?:ig|re)?|hetes)/i,
    /(?<![\wÀ-ɏͰ-Ͽ])(?:δωρεάν\s+(?:δοκιμ[Ͱ-Ͽ]*\s+(?:περίοδος\s+)?)?(?:για\s+)?)(?<n>\d{1,2})\s*(?<u>ημέρ[Ͱ-Ͽ]*|ημερ[Ͱ-Ͽ]*|μήν[Ͱ-Ͽ]*|μην[Ͱ-Ͽ]*|εβδομάδ[Ͱ-Ͽ]*|εβδομαδ[Ͱ-Ͽ]*)/i,
    /(?<![\wÀ-ɏͰ-Ͽ])(?<n>\d{1,2})\s*(?<u>ημέρ[Ͱ-Ͽ]*|ημερ[Ͱ-Ͽ]*|μήν[Ͱ-Ͽ]*|μην[Ͱ-Ͽ]*|εβδομάδ[Ͱ-Ͽ]*|εβδομαδ[Ͱ-Ͽ]*)\s+(?:δωρεάν|δοκιμ[Ͱ-Ͽ]*)/i,
    /(?<![\wÀ-ɏͰ-Ͽ])(?:prv(?:ý|y)\s+mesiac\s+zadarmo|els(?:ő|o)\s+h(?:ó|o)nap\s+ingyen(?:es)?|πρώτος\s+μήνας\s+δωρεάν|τον\s+πρώτο\s+μήνα\s+δωρεάν)(?![\wÀ-ɏͰ-Ͽ])/i,
    /(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?<n>\d{1,2})\s*(?<u>dan(?:a)?|dni|dneh|mjesec(?:a|i)?|mesec(?:a|e|ev)?|tjed(?:an|na|ana)|ted(?:en|na|ne|nov)|дни|ден|месец(?:а)?|седмиц(?:а|и))\s+(?:besplatno|brezpla(?:č|c)no|безплатно)/i,
    /(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?:besplatn\w*\s+(?:probn\w*\s+)?(?:razdoblje\s+)?(?:od\s+|na\s+)?|brezpla(?:č|c)n\w*\s+(?:preizkus\w*\s+)?(?:za\s+)?|безплат\S*\s+(?:пробен\s+)?(?:период\s+)?(?:от\s+|за\s+)?)(?<n>\d{1,2})\s*(?<u>dan(?:a)?|dni|dneh|mjesec(?:a|i)?|mesec(?:a|e|ev)?|tjed(?:an|na|ana)|ted(?:en|na|ne|nov)|дни|ден|месец(?:а)?|седмиц(?:а|и))/i,
    /(?<![\wÀ-ɏͰ-ϿЀ-ӿ])(?:prvi\s+mjesec\s+besplatno|prvi\s+mesec\s+brezpla(?:č|c)no|първи(?:ят)?\s+месец\s+безплатно)(?![\wÀ-ɏͰ-ϿЀ-ӿ])/i,
  ];

  /** The first free trial in a text: { raw, months } or null. */
  function trialOf(text) {
    for (const re of TRIAL_RES) {
      const m = re.exec(text);
      if (!m) continue;
      const n = Number(m.groups?.n || 1);
      const u = (m.groups?.u || 'month').toLowerCase();
      const months = /^(giorn|day|d[ií]a|tag|jour|dag|dni|dzie|zi|dn|den|de[ňn]|p[äa]iv|nap|ημ[έε]ρ|dan|дн|ден)/.test(u) ? n / 30 : /^(settiman|week|semana|woche|semaine|wek|tydz|tygod|veck|s[ăa]pt|t[ýy]d|uge|uke|viik|t[ýy][žz]d|h[ée]t|εβδομ|tjed|ted|седм)/.test(u) ? n / 4.345 : n;
      return { raw: m[0].replace(/\s+/g, ' ').trim(), months };
    }
    return null;
  }

  const TERMS_LINK_RE =
    /termini|condizioni|contratt|informativa|privacy|terms|conditions|agreement|policy|eula|clausol/i;

  function parseAmount(raw) {
    let s = String(raw).replace(/\s/g, '');
    const hasComma = s.includes(',');
    const hasDot = s.includes('.');
    if (hasComma && hasDot) {
      s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    } else if (hasComma) {
      s = /,\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
    } else if (hasDot && /\.\d{3}$/.test(s)) {
      s = s.replace(/\./g, '');
    }
    const n = Number.parseFloat(s);
    return Number.isFinite(n) ? n : null;
  }

  function pricesIn(text) {
    const out = [];
    AMOUNT_RE.lastIndex = 0;
    let m;
    while ((m = AMOUNT_RE.exec(text)) !== null) {
      const symbol = m[1] || m[5];
      const code = m[2] || m[6];
      const word = m[7];
      if (word && word.toLowerCase() === 'ft' && word !== 'Ft') continue;
      const amount = parseAmount(m[3] || m[4]);
      if (amount == null || amount === 0) continue;
      const around = text.slice(Math.max(0, m.index - 50), m.index + m[0].length + 50);
      let period = null;
      for (const [re, p] of PERIOD_RE) {
        if (re.test(around)) { period = p; break; }
      }
      out.push({
        amount,
        currency: (() => {
          const c = code ? code.toUpperCase() : word ? CURRENCY_WORD[word.toLowerCase()] : CURRENCY[symbol] || 'EUR';
          return c === 'KR' ? crown() : c;
        })(),
        period,
        raw: m[0].trim(),
        context: around.replace(/\s+/g, ' ').trim(),
      });
    }
    return out;
  }

  /** Walks up from the button to the container most likely to hold the price. */
  function decisionScope(target) {
    let node = target;
    let best = target;
    for (let i = 0; i < 8 && node; i++) {
      node = node.parentElement || node.getRootNode?.()?.host || null;
      if (!node) break;
      best = node;
      const text = (node.innerText || '').trim();
      if (text.length > 120 && AMOUNT_RE.test(text)) {
        AMOUNT_RE.lastIndex = 0;
        return node;
      }
      AMOUNT_RE.lastIndex = 0;
      if (text.length > 3000) break;
    }
    return best;
  }

  /**
   * Amounts that are not "the price": exit fees, deposits, extra charges.
   * Mistaking them for the price is the most visible error this panel can make,
   * because it is the first number the user reads.
   */
  const NOT_A_PRICE = /(?:penale|penalit[àa]|multa|indennit[àa]|cauzione|deposito|spes\w+\s+di|attivazione|istruttoria|risarcimento|rimborso|penalty|fee\b|deposit)/i;

  /**
   * Markers of the **regular** price: the one paid when the promotion ends. They
   * are the textual confirmation that two different recurring prices are not two
   * alternative plans but two phases of the same commitment.
   */
  const REGIME_RE =
    /(?<![\wÀ-ÿ])(poi|successivamente|in\s+seguito|dal\s+secondo|dal\s+\d+°?\s*(?:mese|anno)|a\s+partire\s+dal|al\s+termine|alla\s+scadenza|then|thereafter|afterwards?|after\s+the\s+first|after\s+the\s+trial|renews\s+at|luego|despu[ée]s|a\s+partir\s+del|danach|anschlie[ßs]end|ab\s+dem\s+\d+|puis|ensuite|[àa]\s+partir\s+du|daarna|vervolgens|na\s+de\s+eerste)(?![\wÀ-ÿ])/i;

  /** Markers of the **promotional** price: the short side of the offer. */
  const PROMO_RE =
    /(?<![\wÀ-ÿ])(prim[oiae]\s*\d*\s*(?:mese|mesi|anno|anni|settiman\w+|giorni)|per\s+i\s+primi|offert\w+|promo\w*|scont\w+|introduttiv\w+|di\s+lancio|solo\s+per\s+ora|first\s+\d*\s*(?:month|months|year|years)|for\s+the\s+first|intro(?:ductory)?|limited\s+time|primer(?:os)?\s+\d*\s*(?:mes|meses|a[ñn]o)|oferta|descuento|ersten?\s+\d*\s*(?:monat|monate|jahr)|angebot|rabatt|aktion|premiers?\s+\d*\s*(?:mois|ans?)|offre|r[ée]duction|eerste\s+\d*\s*(?:maand|maanden|jaar)|aanbieding|korting|actie)(?![\wÀ-ÿ])/i;

  /**
   * A struck-through price = the list price, i.e. the one *not* being accepted.
   * Keeping it produces the opposite error to the promo one ("€39.99 struck
   * through, now €19.99" estimated at 39.99): overestimating here is not
   * prudence, it is a warning the user finds false by looking at the page.
   *
   * Computed CSS isn't inherited: a <span> inside a struck-out element reports
   * `textDecorationLine: none` while being struck through on screen. That is why
   * we walk up three levels looking at tags and classes too.
   */
  const STRIKE_TAGS = new Set(['S', 'DEL', 'STRIKE']);
  const STRIKE_CLASS_RE = /strike|barrat|line-?through|original|list-?price|old-?price|prezzo-?pieno|full-?price|\bwas\b/i;
  const PRICEY_RE = /[€$£¥]|\b(?:EUR|USD|GBP|CHF|PLN|SEK|RON|CZK|DKK|NOK|HUF|euros?|dollari|sterline)\b|\d\s*(?:zł|kr|lei|kč|Ft)(?![\wÀ-ɏ])/i;

  function isStruck(el) {
    let node = el;
    for (let depth = 0; node && depth <= 3; depth += 1) {
      if (STRIKE_TAGS.has(node.tagName)) return true;
      const cls = typeof node.className === 'string' ? node.className : node.getAttribute?.('class') || '';
      if (cls && STRIKE_CLASS_RE.test(cls)) return true;
      let deco = '';
      try {
        deco = getComputedStyle(node).textDecorationLine || '';
      } catch { /* node no longer in the document */ }
      if (deco.includes('line-through')) return true;
      node = node.parentElement;
    }
    return false;
  }

  /**
   * Keys of struck-through amounts. The bare amount is indexed too because on a
   * short fragment ("€39.99") the period is outside the element.
   */
  function struckKeys(root) {
    const keys = new Set();
    const els = deepQueryAll('s, del, strike, span, b, strong, em, small, li, td, p, div', root, 300);
    for (const el of els) {
      const text = (el.textContent || '').trim();
      if (!text || text.length > 80 || !PRICEY_RE.test(text)) continue;
      if (!isStruck(el)) continue;
      for (const p of pricesIn(text)) {
        keys.add(`${p.amount}|${p.period || ''}`);
        keys.add(String(p.amount));
      }
    }
    return keys;
  }

  function tightAround(text, price, before = 60, after = 16) {
    const i = text.indexOf(price.raw);
    if (i < 0) return price.context;
    return text.slice(Math.max(0, i - before), i + price.raw.length + after);
  }

  function extractPricing(target) {
    const scope = decisionScope(target);
    const scopeText = (scope?.innerText || '').slice(0, 6000);
    const pageText = (document.body?.innerText || '').slice(0, 20000);

    const inScope = pricesIn(scopeText).map((p) => ({ ...p, near: true }));
    const inPage = pricesIn(pageText).map((p) => ({ ...p, near: false }));

    // Dedupe by amount+period, preferring those close to the button.
    const byKey = new Map();
    for (const p of [...inScope, ...inPage]) {
      const key = `${p.amount}|${p.period || ''}`;
      if (!byKey.has(key)) byKey.set(key, p);
    }
    const struck = struckKeys(scope || document.body || document);
    const candidates = [...byKey.values()].map((c) => ({
      ...c,
      struck: struck.has(`${c.amount}|${c.period || ''}`) || struck.has(String(c.amount)),
    }));

    // If the page strikes through *every* price something went wrong: an
    // imperfect price is better than none.
    const live = candidates.filter((c) => !c.struck);
    const pool = live.length ? live : candidates;

    /**
     * 1) The price is the recurring one: it is what creates the commitment.
     *
     * Among several recurring prices the first in the document does **not** win:
     * DOM order has no semantic meaning, and in the most common offer structure
     * there is — "first 3 months at €9.99/month, then €19.99/month" — the first
     * is the promotional one. Taking it halved the estimated commitment and made
     * the headline "you are committing up to Y" more reassuring than the truth:
     * the exact opposite of what this product promises.
     *
     * So: the period closest to the button is chosen, and within it the
     * **highest** amount. When ambiguous, err on the high side.
     */
    const recurring = pool.filter((c) => c.period);
    const near = recurring.filter((c) => c.near);
    const group = near.length ? near : recurring;
    const period = group.length ? group[0].period : null;
    const samePeriod = group.filter((c) => c.period === period);
    let primary = samePeriod.length ? samePeriod.reduce((a, b) => (b.amount > a.amount ? b : a)) : null;

    /**
     * The promotional price is not thrown away: it serves whoever computes the
     * formula "€9.99 × 3 + €19.99 × 21" instead of multiplying a single price.
     * It is recorded only with textual proof of a promotion, otherwise two
     * alternative plans ("Basic 9.99 – Premium 19.99") would become one offer.
     */
    let introductory = null;
    if (primary && samePeriod.length > 1) {
      const cheapest = samePeriod.reduce((a, b) => (b.amount < a.amount ? b : a));
      const evidence =
        REGIME_RE.test(primary.context) || REGIME_RE.test(cheapest.context) || PROMO_RE.test(cheapest.context);
      if (cheapest.amount < primary.amount && evidence) {
        introductory = {
          amount: cheapest.amount,
          currency: cheapest.currency,
          period: cheapest.period,
          raw: cheapest.raw,
        };
      }
    }

    // 2) No recurrence: take the highest amount among those that are not
    //    clearly exit fees or extra charges. Better no price than the wrong
    //    price.
    if (!primary) {
      const plausible = pool.filter((c) => {
        const source = c.near ? scopeText : pageText;
        return !NOT_A_PRICE.test(tightAround(source, c));
      });
      primary = plausible.sort((a, b) => (b.near - a.near) || (b.amount - a.amount))[0] || null;
    }

    const trial = trialOf(scopeText) || trialOf(pageText);

    return {
      amount: primary?.amount ?? null,
      currency: primary?.currency ?? 'EUR',
      period: primary?.period ?? null,
      recurring: Boolean(primary?.period) || recurring.length > 0,
      raw: primary?.raw ?? null,
      introductory,
      trial,
      candidates: candidates.slice(0, 10),
      scopeChars: scopeText.length,
    };
  }

  /** Inspects the form: pre-ticked consents, form type, tiny print. */
  function extractForm(target) {
    const form = target.closest?.('form') || null;
    const root = form || document.body;
    const checkboxes = deepQueryAll('input[type="checkbox"]', root, 60).filter(isVisible);

    let precheckedConsents = 0;
    let consentBoxes = 0;
    let hasSpecificApproval = false;

    for (const cb of checkboxes) {
      const label = labelText(cb);
      const isConsent = TERMS_LINK_RE.test(label) || /consenso|accett|acconsent|marketing|newsletter|profilazione|consent|agree/i.test(label);
      if (!isConsent) continue;
      consentBoxes += 1;
      if (cb.checked) precheckedConsents += 1;
      if (/(art\.?\s*1341|specifica(?:mente)?\s+approv|doppia\s+(?:firma|sottoscrizione))/i.test(label)) {
        hasSpecificApproval = true;
      }
    }

    // "Bundled" consent: a single box covers contract + marketing/data.
    const bundledConsent =
      consentBoxes === 1 &&
      checkboxes.some((cb) => {
        const l = labelText(cb);
        return TERMS_LINK_RE.test(l) && /(marketing|profilazione|newsletter|terze\s+parti|third\s+part)/i.test(l);
      });

    const passwordFields = deepQueryAll('input[type="password"]', root, 10).length;
    const emailFields = deepQueryAll('input[type="email"], input[name*="mail" i]', root, 10).length;
    const cardFields = deepQueryAll(
      'input[autocomplete*="cc-"], input[name*="card" i], input[name*="carta" i], iframe[src*="stripe" i], iframe[src*="checkout" i]',
      root,
      10
    ).length;

    return {
      hasForm: Boolean(form),
      isSignup: passwordFields > 0 && emailFields > 0,
      isCheckout: cardFields > 0,
      consentBoxes,
      precheckedConsents,
      bundledConsent,
      hasSpecificApproval,
      smallPrintPrice: hasSmallPrintPrice(root),
      summary: [
        form ? 'Modulo presente' : 'Nessun modulo',
        passwordFields ? 'campo password' : null,
        cardFields ? 'campi di pagamento' : null,
        consentBoxes ? `${consentBoxes} casella/e di consenso (${precheckedConsents} già spuntate)` : null,
      ]
        .filter(Boolean)
        .join(', '),
    };
  }

  function labelText(input) {
    const parts = [];
    if (input.id) {
      const lab = document.querySelector(`label[for="${CSS.escape(input.id)}"]`);
      if (lab) parts.push(lab.innerText);
    }
    const wrapper = input.closest('label');
    if (wrapper) parts.push(wrapper.innerText);
    const parent = input.parentElement;
    if (parent && parts.length === 0) parts.push(parent.innerText);
    if (input.getAttribute('aria-label')) parts.push(input.getAttribute('aria-label'));
    return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 400);
  }

  /** Price or renewal written in a much smaller font than the rest: a classic dark pattern. */
  function hasSmallPrintPrice(root) {
    const nodes = deepQueryAll('small, .fine-print, .disclaimer, .legal, span, p', root, 300);
    const baseSize = Number.parseFloat(getComputedStyle(document.body).fontSize) || 16;
    for (const el of nodes) {
      const text = (el.innerText || '').trim();
      if (text.length < 15 || text.length > 400) continue;
      if (!/rinnov|auto-?renew|al\s*mese|per\s+month|penale|disdetta|preavviso|renueva|permanencia|penalizaci|verl[äa]nger|k[üu]ndig|mindestlaufzeit|renouvel|reconduction|r[ée]siliation|verleng|opzeg|looptijd/i.test(text)) continue;
      const size = Number.parseFloat(getComputedStyle(el).fontSize) || baseSize;
      if (size <= baseSize * 0.75) return true;
    }
    return false;
  }

  /** Finds the terms: text already on the page or a link to download. */
  function extractTerms(target) {
    const scope = target.closest?.('form') || document.body;
    const links = deepQueryAll('a[href]', scope, 200)
      .filter((a) => TERMS_LINK_RE.test(labelOf(a) + ' ' + (a.getAttribute('href') || '')))
      .filter((a) => {
        const href = a.getAttribute('href') || '';
        return href && !href.startsWith('#') && !href.startsWith('javascript:');
      });

    let inline = '';
    const containers = deepQueryAll(
      '[class*="terms" i], [class*="condizioni" i], [id*="terms" i], [id*="condizioni" i], [class*="tos" i], [class*="legal" i], pre, article, .modal-body',
      document,
      60
    );
    for (const el of containers) {
      const t = (el.innerText || '').trim();
      if (t.length > inline.length && t.length > 500 && /(?:articolo|clausol|condizioni|termini|section|clause|agreement)/i.test(t)) {
        inline = t;
      }
    }

    const primary = links[0];
    return {
      found: Boolean(primary) || inline.length > 500,
      url: primary ? new URL(primary.getAttribute('href'), location.href).href : null,
      linkText: primary ? labelOf(primary) : null,
      linkCount: links.length,
      textInPage: inline.length > 500,
      inlineText: inline.slice(0, 60000),
      linkOnly: Boolean(primary) && inline.length <= 500,
    };
  }

  /** Relevant text to send for analysis. */
  function collectText(target, terms) {
    const parts = [];
    if (terms.inlineText) parts.push(terms.inlineText);

    const scope = decisionScope(target);
    const scopeText = (scope?.innerText || '').trim();
    if (scopeText && scopeText.length < 12000) parts.push(scopeText);

    const body = (document.body?.innerText || '').trim();
    if (parts.join('\n').length < 1500 && body) parts.push(body.slice(0, 40000));

    return [...new Set(parts)].join('\n\n').slice(0, 80000);
  }

  CF.context = {
    build(target, actionType) {
      const terms = extractTerms(target);
      return {
        ctx: {
          url: location.href,
          title: document.title,
          // The seller's name, if the page declares it: needed when Paddle, Stripe… collect the payment.
          merchant: (document.querySelector('meta[property="og:site_name"],meta[name="application-name"]')?.content || '').trim().slice(0, 60) || null,
          buttonText: labelOf(target),
          actionType,
          pricing: extractPricing(target),
          form: extractForm(target),
          terms: { ...terms, inlineText: undefined },
          lang: document.documentElement.lang || null,
        },
        text: collectText(target, terms),
      };
    },
    pricesIn,
    extractPricing,
    // The detector needs it to decide *synchronously* whether a generic button
    // ("Continue") is in a checkout: the text alone is not enough.
    extractForm,
  };
})();

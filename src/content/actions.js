/**
 * Action recognition: which buttons represent a commitment.
 *
 * It lives in its own file, with no DOM and no Chrome APIs, for two reasons:
 * it is the table updated most often when a new site turns up, and it is the
 * only part of the detector testable in Node without a browser.
 *
 * Loaded as a classic script by the content scripts and imported by the tests:
 * in both cases it just registers itself on globalThis.__CF.
 */
(() => {
  const CF = (globalThis.__CF ||= {});
  if (CF.actions) return;

  /**
   * `weight` resolves overlaps: "Accetta e firma" contains both "accetta" and
   * "firma", but the signature sets the stakes.
   *
   * The weight also serves the opt-out veto (see below): below 3 the action is
   * too weak to stand against a "cancel" in the same label, above it isn't.
   *
   * Spanish sits in a separate branch of the alternation, after the `\b(…)\b`
   * of Italian and English, for two reasons. The first is hygiene: the tables
   * already tested stay identical character for character, so a wrong Spanish
   * rule can only add matches, never move an old one. The second is that the
   * Spanish branch cannot use `\b`: in JavaScript `\b` is defined on
   * [A-Za-z0-9_], and between a space and the "í" of "Suscríbete" there is no
   * transition to hook onto — the boundary simply doesn't exist and the rule
   * never fires. It is the same defect already found in `\bnon\s+è\b` and in
   * `\bpenalit[àa]\b`. The lookarounds `(?<![\wÀ-ÿ])` and `(?![\wÀ-ÿ])` do the
   * same job while counting accented vowels as letters, and that is why they
   * delimit every Spanish alternative.
   */

  /**
   * German, French, Dutch, Polish, Portuguese, Swedish, Romanian, Czech, Danish, Norwegian and Finnish are a third branch appended to each table, for
   * the same hygiene reason as Spanish: the older branches stay identical
   * character for character, so a wrong new rule can only add matches. Every
   * alternative is delimited by the accent-aware lookarounds ("Kauf
   * abschließen", "Accéder", "Tout accepter"), never by \b.
   */
  const W = '[\\wÀ-ɏͰ-ϿЀ-ӿ]'; // Latin-1, Extended-A and -B, Greek and Cyrillic: ą, ł, ř, ů, ș, ț, α, ж count as letters too
  const more = (re, alts, anchored = '') => new RegExp(
    `${re.source}|(?<!${W})(?:${alts.join('|')})(?!${W})${anchored ? `|${anchored}` : ''}`, re.flags);
  const AP = "['’]";
  const OAUTH = '(?:google|facebook|apple|github|microsoft|linkedin)';

  const ACTION_PATTERNS = [
    {
      type: 'sign',
      weight: 5,
      // "firmar" alone is enough: it covers "Firmar el contrato" and "Aceptar y
      // firmar". The lookbehind is what keeps out "Confirmar pedido", which
      // contains "firmar" but is a purchase, not a signature.
      re: more(/\b(firma\s+(?:il\s+|questo\s+)?(?:contratto|documento|ordine)?|firmo|sottoscriv\w+|accetta\s+e\s+firma|sign\s+(?:now|document|contract|and\s+accept)|e-?sign)\b|(?<![\wÀ-ÿ])(firmar(?:lo|la)?|firmo\s+(?:el\s+)?(?:contrato|documento))(?![\wÀ-ÿ])/i, [
        'unterschreiben', 'unterzeichnen', '(?:vertrag|dokument)\\s+(?:jetzt\\s+)?(?:unterschreiben|unterzeichnen|signieren)', 'signieren',
        'signer(?:\\s+(?:le\\s+|ce\\s+)?(?:contrat|document|bon\\s+de\\s+commande))?', 'je\\s+signe', 'accepter\\s+et\\s+signer',
        'onderteken(?:en)?', 'teken\\s+(?:het\\s+)?(?:contract|document|overeenkomst)', 'akkoord\\s+en\\s+ondertekenen',
        'podpisz(?:\\s+(?:umow(?:ę|e)|dokument))?', 'podpisuj(?:ę|e)', 'assinar(?:\\s+(?:o\\s+)?(?:contrato|documento))?', 'aceitar\\s+e\\s+assinar',
        'signera(?:\\s+(?:avtalet|dokumentet))?', 'skriv\\s+under', 'godk(?:ä|a)nn\\s+och\\s+signera', 'semneaz(?:ă|a)(?:\\s+(?:contractul|documentul))?', 'semnez', 'accept(?:ă|a)\\s+(?:ș|ş|s)i\\s+semneaz(?:ă|a)', 'podepsat(?:\\s+(?:smlouvu|dokument))?', 'podepi(?:š|s)te', 'podepisuji', 'souhlas(?:í|i)m\\s+a\\s+podepisuji',
        'underskriv(?:\\s+(?:aftalen|kontrakten|dokumentet))?', 'sign(?:é|e)r\\s+(?:aftalen|avtalen|kontrakten|dokumentet)', 'accepter\\s+og\\s+underskriv', 'undertegn(?:\\s+(?:avtalen|kontrakten))?', 'godta\\s+og\\s+signer', 'allekirjoita(?:\\s+(?:sopimus|asiakirja))?', 'hyv(?:ä|a)ksy\\s+ja\\s+allekirjoita',
        'podp(?:í|i)sa(?:ť|t)(?:\\s+(?:zmluvu|dokument))?', 'podpisujem', 's(?:ú|u)hlas(?:í|i)m\\s+a\\s+podpisujem', 'al(?:á|a)(?:í|i)rom', 'al(?:á|a)(?:í|i)r(?:á|a)s', 'szerz(?:ő|o)d(?:é|e)s\\s+al(?:á|a)(?:í|i)r(?:á|a)sa', 'elfogadom\\s+(?:(?:é|e)s\\s+)?al(?:á|a)(?:í|i)rom', 'υπογραφ(?:ή|η)(?:\\s+(?:της\\s+)?(?:σ(?:ύ|υ)μβασης|εγγρ(?:ά|α)φου))?', 'υπογρ(?:ά|α)ψτε(?:\\s+(?:τη\\s+)?σ(?:ύ|υ)μβαση)?', 'υπογρ(?:ά|α)φω', 'αποδοχ(?:ή|η)\\s+και\\s+υπογραφ(?:ή|η)',
        'potpi(?:š|s)i(?:te)?(?:\\s+ugovor)?', 'potpisujem', 'potpisati(?:\\s+ugovor)?', 'prihva(?:ć|c)am\\s+i\\s+potpisujem', 'podpi(?:š|s)i(?:te)?(?:\\s+pogodbo)?', 'podpi(?:š|s)em', 'podpisujem', 'sprejmem\\s+in\\s+podpi(?:š|s)em', 'подпиши(?:те)?(?:\\s+договора)?', 'подписвам', 'приемам\\s+и\\s+подписвам', 'подписване(?:\\s+на\\s+договора)?',
      ]),
    },
    {
      type: 'subscribe',
      weight: 4,
      re: more(/\b(abbonati|abbonamento\s+(?:ora|adesso)|attiva\s+(?:l['’])?abbonamento|attiva\s+(?:l['’]|la\s+|il\s+|lo\s+)?(?:piano|servizio|offerta|promo(?:zione)?|tariffa|prova)|attiva\s+(?:ora|adesso|subito)|contratta\s+(?:ora|adesso|subito)|sottoscrivi\s+(?:ora|adesso)|conferma\s+e\s+attiva|sottoscrivi\s+(?:l['’])?abbonamento|conferma\s+(?:l['’]|la\s+|il\s+|lo\s+)?(?:abbonamento|polizza|piano|iscrizione|sottoscrizione|attivazione)|rinnova\s+ora|inizia\s+(?:la\s+)?prova|prova(?:lo)?\s+(?:gratis|gratuitamente|gratuita\w*)|passa\s+(?:a|ad|al|alla)\s+(?:premium|pro\b|plus\b|business|gold|platinum|piano\b|abbonamento|versione)|iscriviti\s+(?:a|ad|al|alla)\s+(?:premium|pro\b|plus\b|business|piano\b|abbonamento)|scegli\s+(?:questo\s+|il\s+)?(?:piano|abbonamento)|subscribe|start\s+(?:free\s+)?trial|start\s+(?:my\s+|your\s+)?(?:plan|subscription|membership)|become\s+a\s+member|try\s+(?:it\s+)?free|get\s+(?:premium|pro\b|plus\b)|upgrade(?![-_\w])(?:\s+now)?)\b|(?<![\wÀ-ÿ])(suscr[ií]b(?:ete|irse|irme|irte)|activar\s+(?:el\s+|mi\s+|la\s+|tu\s+)?(?:plan|servicio|suscripci[óo]n)|activar\s+(?:ahora|ya)|(?:empezar|comenzar|iniciar|activar)\s+(?:la\s+|mi\s+)?prueba(?:\s+grat[\wÀ-ÿ]+)?|probar\s+gratis|pasar\s+a\s+(?:premium|pro|plus|business|gold|platinum)|elegir\s+(?:este\s+|el\s+|mi\s+)?plan|mejorar\s+(?:el\s+|mi\s+|tu\s+)?plan|contratar(?:\s+(?:ahora|ya|el\s+plan|el\s+servicio|la\s+tarifa))?)(?![\wÀ-ÿ])/i, [
        '(?:jetzt\\s+)?abonnieren', 'abo\\s+(?:abschlie(?:ß|ss)en|starten|buchen)', 'abonnement\\s+(?:abschlie(?:ß|ss)en|starten|buchen|aktivieren)', 'kostenlos\\s+(?:testen|ausprobieren)', '(?:probeabo|testphase|probemonat|gratismonat)\\s+(?:starten|beginnen|aktivieren)', '(?:jetzt\\s+)?mitglied\\s+werden', 'upgrade\\s+auf\\s+(?:premium|pro|plus)', 'tarif\\s+(?:w(?:ä|ae)hlen|buchen)', 'kostenpflichtig\\s+abonnieren',
        `s${AP}abonner`, `je\\s+m${AP}abonne`, 'abonnez-vous', `(?:commencer|d(?:é|e)marrer|activer)\\s+(?:l${AP}|mon\\s+|votre\\s+)?(?:essai|abonnement|offre)(?:\\s+gratuit)?`, 'essayer\\s+gratuitement', 'essai\\s+gratuit', `passer\\s+(?:à|a)\\s+(?:premium|pro|plus|l${AP}offre)`, `choisir\\s+(?:ce\\s+|cette\\s+|l${AP}|le\\s+|la\\s+)?(?:forfait|offre|formule|abonnement)`, 'devenir\\s+membre',
        'abonneren', 'abonnement\\s+(?:afsluiten|nemen|starten|activeren)', 'neem\\s+(?:een\\s+)?abonnement', 'gratis\\s+(?:proberen|uitproberen)', 'probeer\\s+(?:het\\s+)?gratis', 'start\\s+(?:je\\s+|uw\\s+)?(?:gratis\\s+)?proefperiode', 'proefperiode\\s+starten', 'word\\s+lid', 'lid\\s+worden', 'upgraden(?:\\s+naar\\s+(?:premium|pro|plus))?', 'kies\\s+(?:dit\\s+|het\\s+)?(?:abonnement|pakket)',
        'subskrybuj', 'zasubskrybuj', 'wykup\\s+(?:subskrypcj(?:ę|e)|abonament|pakiet)', '(?:rozpocznij|zacznij|aktywuj)\\s+(?:darmowy\\s+)?(?:okres\\s+próbny|okres\\s+probny|subskrypcj(?:ę|e)|abonament)', 'wypróbuj\\s+za\\s+darmo', 'wyprobuj\\s+za\\s+darmo', 'przejd(?:ź|z)\\s+na\\s+(?:premium|pro|plus)', 'wybierz\\s+(?:ten\\s+)?(?:plan|pakiet|abonament)', 'zosta(?:ń|n)\\s+(?:członkiem|czlonkiem)',
        'subscrever', 'subscreva(?:\\s+j(?:á|a))?', 'aderir(?:\\s+(?:j(?:á|a)|ao\\s+plano|à\\s+oferta))?', 'adira\\s+j(?:á|a)', '(?:iniciar|come(?:ç|c)ar|ativar)\\s+(?:o\\s+|a\\s+)?(?:per(?:í|i)odo\\s+experimental|experi(?:ê|e)ncia\\s+gr(?:á|a)tis|subscri(?:ç|c)(?:ã|a)o|ades(?:ã|a)o|plano)', 'experimentar\\s+gr(?:á|a)tis', 'experimente\\s+gr(?:á|a)tis', 'escolher\\s+(?:este\\s+|o\\s+)?(?:plano|tarif(?:á|a)rio)', 'passar\\s+a\\s+(?:premium|pro|plus)',
        'prenumerera(?:\\s+nu)?', 'starta\\s+(?:din\\s+|en\\s+)?(?:gratis\\s+)?(?:provperiod|prenumeration|testperiod)', 'prova\\s+gratis', 'testa\\s+gratis', 'bli\\s+medlem', 'uppgradera(?:\\s+till\\s+(?:premium|pro|plus))?', 'v(?:ä|a)lj\\s+(?:detta\\s+|den\\s+h(?:ä|a)r\\s+)?(?:abonnemang|plan|paket)', 'teckna\\s+(?:abonnemang|prenumeration|avtal)', 'aboneaz(?:ă|a)-te', 'm(?:ă|a)\\s+abonez', '(?:(?:î|i)ncepe|activeaz(?:ă|a))\\s+(?:perioada\\s+de\\s+prob(?:ă|a)|abonamentul|planul|proba\\s+gratuit(?:ă|a))', '(?:î|i)ncearc(?:ă|a)\\s+gratuit', 'treci\\s+la\\s+(?:premium|pro|plus)', 'alege\\s+(?:acest\\s+)?(?:planul?|abonamentul?|pachetul?)', 'devino\\s+membru', 'p(?:ř|r)edplatit(?:\\s+(?:si|nyn(?:í|i)|te(?:ď|d)))?', 'p(?:ř|r)edpla(?:ť|t)te\\s+si', 'za(?:č|c)(?:í|i)t\\s+(?:zku(?:š|s)ebn(?:í|i)\\s+(?:obdob(?:í|i)|verzi)|p(?:ř|r)edplatn(?:é|e))', 'vyzkou(?:š|s)et\\s+zdarma', 'vyzkou(?:š|s)ejte\\s+zdarma', 'aktivovat\\s+(?:p(?:ř|r)edplatn(?:é|e)|tarif)', 'p(?:ř|r)ej(?:í|i)t\\s+na\\s+(?:premium|pro|plus)', 'vybrat\\s+(?:tento\\s+)?(?:tarif|pl(?:á|a)n|bal(?:í|i)(?:č|c)ek)', 'st(?:á|a)t\\s+se\\s+(?:č|c)lenem',
        'abonn(?:é|e)r(?:\\s+n(?:u|å))?', 'tegn\\s+abonnement', 'start\\s+(?:din\\s+|en\\s+)?(?:gratis\\s+)?pr(?:ø|o)veperiode(?:n)?', 'pr(?:ø|o)v\\s+gratis', 'bliv\\s+medlem', 'opgrader(?:\\s+til\\s+(?:premium|pro|plus))?', 'oppgrader(?:\\s+til\\s+(?:premium|pro|plus))?', 'v(?:æ|a)lg\\s+(?:dette\\s+)?(?:abonnement|pakke)', 'velg\\s+(?:dette\\s+)?(?:abonnement|pakke)', 'tilaa(?!\\s+(?:maksuvelvollisena|ja\\s+maksa))(?:\\s+nyt)?', 'aloita\\s+(?:ilmainen\\s+)?kokeilu(?:jakso)?', 'kokeile\\s+ilmaiseksi', 'liity\\s+j(?:ä|a)seneksi', 'p(?:ä|a)ivit(?:ä|a)\\s+(?:premium|pro|plus)\\w*', 'valitse\\s+(?:t(?:ä|a)m(?:ä|a)\\s+)?(?:tilaus|paketti)',
        'predplati(?:ť|t)(?:\\s+si)?(?:\\s+teraz)?', 'aktivova(?:ť|t)\\s+predplatn(?:é|e)', 'vysk(?:ú|u)(?:š|s)a(?:ť|t)\\s+zadarmo', 'vysk(?:ú|u)(?:š|s)ajte\\s+zadarmo', 'za(?:č|c)a(?:ť|t)\\s+(?:bezplatn(?:é|e)\\s+)?sk(?:ú|u)(?:š|s)obn(?:é|e)\\s+obdobie', 'sta(?:ň|n)te\\s+sa\\s+(?:č|c)lenom', 'sta(?:ť|t)\\s+sa\\s+(?:č|c)lenom', 'prejs(?:ť|t)\\s+na\\s+(?:premium|pro|plus)', 'vybra(?:ť|t)\\s+(?:tento\\s+)?(?:program|bal(?:í|i)k|tarif|pl(?:á|a)n)', 'el(?:ő|o)fizetek', 'el(?:ő|o)fizet(?:é|e)s(?:\\s+(?:most|aktiv(?:á|a)l(?:á|a)sa|ind(?:í|i)t(?:á|a)sa))?', 'fizess\\s+el(?:ő|o)', '(?:ingyenes\\s+)?pr(?:ó|o)ba(?:id(?:ő|o)(?:szak)?)?\\s+ind(?:í|i)t(?:á|a)sa', 'pr(?:ó|o)b(?:á|a)ld\\s+ki\\s+ingyen(?:esen)?', 'kipr(?:ó|o)b(?:á|a)lom\\s+ingyen(?:esen)?', 'csatlakozom', 'tag\\s+leszek', 'v(?:á|a)lt(?:á|a)s\\s+(?:premium|pro|plus)\\w*', 'csomag\\s+kiv(?:á|a)laszt(?:á|a)sa', 'ezt\\s+a\\s+csomagot\\s+v(?:á|a)lasztom', 'γ(?:ί|ι)νετε\\s+συνδρομητ(?:ή|η)ς', 'γ(?:ί|ι)νε\\s+συνδρομητ(?:ή|η)ς', 'συνδρομ(?:ή|η)(?:\\s+τ(?:ώ|ω)ρα)?', 'εγγραφ(?:ή|η)\\s+συνδρομ(?:ή|η)ς', 'ενεργοπο(?:ί|ι)ηση\\s+(?:της\\s+)?συνδρομ(?:ή|η)ς', '(?:ξεκιν(?:ή|η)στε|(?:έ|ε)ναρξη)\\s+(?:τη\\s+|της\\s+)?δωρε(?:ά|α)ν\\s+δοκιμ(?:ή|η)ς?', 'δοκιμ(?:ά|α)στε\\s+(?:το\\s+)?δωρε(?:ά|α)ν', 'δωρε(?:ά|α)ν\\s+δοκιμ(?:ή|η)', 'αναβ(?:ά|α)θμιση\\s+σε\\s+(?:premium|pro|plus)', 'επιλογ(?:ή|η)\\s+(?:αυτο(?:ύ|υ)\\s+του\\s+)?(?:προγρ(?:ά|α)μματος|πακ(?:έ|ε)του)', 'γ(?:ί|ι)νετε\\s+μ(?:έ|ε)λος',
        'pretplati(?:te)?\\s+se(?:\\s+sada)?', 'aktiviraj(?:te)?\\s+pretplatu', 'isprobaj(?:te)?\\s+besplatno', 'zapo(?:č|c)ni(?:te)?\\s+(?:besplatno\\s+)?probno\\s+razdoblje', 'postani(?:te)?\\s+(?:č|c)lan', 'nadogradi(?:te)?\\s+na\\s+(?:premium|pro|plus)', 'odaberi(?:te)?\\s+(?:ovaj\\s+)?(?:paket|plan)', 'naro(?:č|c)i(?:te)?\\s+se(?:\\s+zdaj)?', 'aktiviraj(?:te)?\\s+naro(?:č|c)nino', 'preizkusi(?:te)?\\s+brezpla(?:č|c)no', 'za(?:č|c)ni(?:te)?\\s+brezpla(?:č|c)ni\\s+preizkus', 'postani(?:te)?\\s+(?:č|c)lan', 'nadgradi(?:te)?\\s+na\\s+(?:premium|pro|plus)', 'izberi(?:te)?\\s+(?:ta\\s+)?(?:paket|na(?:č|c)rt)', 'абонирай(?:те)?\\s+се(?:\\s+сега)?', 'активирай(?:те)?\\s+абонамент(?:а)?', 'опитай(?:те)?\\s+безплатно', 'започни(?:те)?\\s+безплатния?\\s+пробен\\s+период', 'пробвай(?:те)?\\s+безплатно', 'стани(?:те)?\\s+член', 'надгради(?:те)?\\s+до\\s+(?:premium|pro|plus)', 'избери(?:те)?\\s+(?:този\\s+)?(?:план|пакет)',
      ]),
    },
    {
      type: 'purchase',
      weight: 4,
      /**
       * In Spanish the payment button is written in the infinitive, so "Pagar"
       * alone is a real commitment — unlike Italian, where a bare "paga" is too
       * ambiguous and indeed always requires a complement above. But precisely
       * because it is an infinitive, the same word also carries sentences that
       * describe payment instead of performing it: "Formas de pagar" is a list,
       * "Continuar sin pagar" is the free path. Those two contexts are excluded
       * by name; "Terminar de pagar", which really pays, stays in.
       */
      re: more(/\b(acquista|compra|paga\s+(?:ora|adesso|subito|con\b|tutto)|effettua\s+(?:il\s+)?pagamento|procedi\s+(?:al\s+|con\s+il\s+)?(?:pagamento|checkout|ordine)|(?:continua|prosegui|vai)\s+(?:e\s+paga|e\s+pagamento|al\s+pagamento|al\s+checkout|alla\s+cassa)|conferma\s+(?:e\s+paga|e\s+procedi|ordine|acquisto|pagamento)|concludi\s+(?:l['’])?(?:ordine|acquisto)|ordina\s+(?:ora|adesso|e\s+paga)|completa\s+(?:l['’])?(?:ordine|acquisto)|buy\s+now|place\s+(?:your\s+)?order|complete\s+(?:purchase|order)|pay\s+now|confirm\s+and\s+pay|continue\s+to\s+(?:payment|checkout)|proceed\s+to\s+checkout|checkout(?![-_\w]))\b|(?<![\wÀ-ÿ])((?<!continuar\s+a\s)comprar(?:lo|la)?|(?<!sin\s)(?<!(?:formas|m[ée]todos|opciones)\s+de\s)pagar(?:lo|la)?|ir\s+al\s+(?:pago|checkout)|pasar\s+por\s+caja|proceder\s+al\s+pago|(?:finalizar|completar|confirmar|realizar|tramitar|hacer)\s+(?:la\s+|el\s+|mi\s+|tu\s+)?(?:compra|pedido|pago|reserva))(?![\wÀ-ÿ])/i, [
        '(?:jetzt\\s+)?kaufen', '(?:zahlungs|kosten)pflichtig\\s+(?:bestellen|buchen|abschlie(?:ß|ss)en)', 'kauf\\s+abschlie(?:ß|ss)en', 'bestellung\\s+(?:abschlie(?:ß|ss)en|absenden|aufgeben)', '(?:jetzt\\s+)?bestellen', '(?:jetzt\\s+)?bezahlen', 'jetzt\\s+zahlen', 'zur\\s+kasse', 'weiter\\s+zur\\s+(?:kasse|zahlung)', 'zahlung\\s+(?:abschlie(?:ß|ss)en|best(?:ä|ae)tigen)', 'jetzt\\s+buchen',
        'acheter(?:\\s+maintenant)?', 'commander', `(?:valider|confirmer|finaliser|passer)\\s+(?:la\\s+|ma\\s+|votre\\s+)?commande`, `finaliser\\s+(?:l${AP}|mon\\s+)achat`, '(?<!sans\\s)payer(?:\\s+maintenant)?', 'confirmer\\s+et\\s+payer', `proc(?:é|e)der\\s+au\\s+paiement`, `(?:aller|passer)\\s+(?:à|a)\\s+la\\s+caisse`, `continuer\\s+vers\\s+le\\s+paiement`, 'je\\s+commande',
        '(?:nu\\s+)?kopen', '(?:nu\\s+)?bestellen', 'bestelling\\s+(?:plaatsen|afronden|bevestigen)', 'afrekenen', '(?:nu\\s+)?betalen', 'bestellen\\s+en\\s+betalen', 'naar\\s+(?:de\\s+)?kassa', 'doorgaan\\s+naar\\s+(?:betalen|afrekenen)', 'bevestigen\\s+en\\s+betalen', 'aankoop\\s+afronden',
        'kup(?:uj(?:ę|e))?(?:\\s+teraz)?', 'zamawiam(?:\\s+i\\s+płacę|\\s+i\\s+placę|\\s+z\\s+obowiązkiem\\s+zapłaty|\\s+z\\s+obowiazkiem\\s+zaplaty)?', 'zamów(?:\\s+(?:i\\s+zapłać|teraz))?', 'zamow(?:\\s+(?:i\\s+zaplac|teraz))?', 'złóż\\s+zamówienie', 'zloz\\s+zamowienie', 'zapłać(?:\\s+teraz)?', 'zaplac(?:\\s+teraz)?', 'przejd(?:ź|z)\\s+do\\s+(?:kasy|płatności|platnosci)', '(?:potwierdź|potwierdz)\\s+(?:i\\s+zapłać|zakup|zamówienie|zamowienie)',
        '(?<!(?:continuar|voltar)\\s+a\\s)comprar(?:\\s+agora|\\s+j(?:á|a))?', 'finalizar\\s+(?:a\\s+)?(?:compra|encomenda)', 'concluir\\s+(?:a\\s+)?(?:compra|encomenda)', 'confirmar\\s+(?:a\\s+)?(?:compra|encomenda|e\\s+pagar)', '(?<!(?:sem|sin)\\s)(?<!(?:formas|m(?:é|e)todos|meios|op(?:ç|c)(?:õ|o)es)\\s+de\\s)pagar(?:\\s+agora)?', 'encomendar(?:\\s+agora)?', 'efetuar\\s+(?:o\\s+)?pagamento', 'avan(?:ç|c)ar\\s+para\\s+(?:o\\s+)?(?:pagamento|checkout)', 'ir\\s+para\\s+(?:o\\s+)?(?:pagamento|checkout)',
        'k(?:ö|o)p(?:\\s+nu)?', 'best(?:ä|a)ll(?:\\s+(?:nu|och\\s+betala))?', 'slutf(?:ö|o)r\\s+(?:k(?:ö|o)pet|best(?:ä|a)llningen)', 'l(?:ä|a)gg\\s+best(?:ä|a)llning(?:en)?', '(?<!att\\s)betala(?:\\s+nu)?', 'till\\s+kassan', 'g(?:å|a)\\s+till\\s+(?:kassan|betalning(?:en)?)', 'bekr(?:ä|a)fta\\s+(?:och\\s+betala|k(?:ö|o)pet|best(?:ä|a)llningen)', 'cump(?:ă|a)r(?:ă|a)(?:\\s+acum)?', 'pl(?:ă|a)te(?:ș|ş|s)te(?:\\s+acum)?', 'plaseaz(?:ă|a)\\s+comanda', 'trimite\\s+comanda', 'finalizeaz(?:ă|a)\\s+(?:comanda|achizi(?:ț|ţ|t)ia|plata)', 'comand(?:ă|a)\\s+acum', 'comand(?:ă|a)\\s+cu\\s+obliga(?:ț|ţ|t)ie\\s+de\\s+plat(?:ă|a)', 'mergi\\s+la\\s+(?:plat(?:ă|a)|cas(?:ă|a)|checkout)', 'continu(?:ă|a)\\s+(?:spre|c(?:ă|a)tre)\\s+plat(?:ă|a)', 'confirm(?:ă|a)\\s+(?:(?:ș|ş|s)i\\s+pl(?:ă|a)te(?:ș|ş|s)te|comanda|plata)', 'koupit(?:\\s+(?:nyn(?:í|i)|te(?:ď|d)))?', 'kupte\\s+(?:nyn(?:í|i)|te(?:ď|d))', 'objednat(?:\\s+(?:nyn(?:í|i)|te(?:ď|d)|a\\s+zaplatit|s\\s+povinnost(?:í|i)\\s+platby))?', 'objedn(?:á|a)vka\\s+zavazuj(?:í|i)c(?:í|i)\\s+k\\s+platb(?:ě|e)', 'odeslat\\s+objedn(?:á|a)vku', 'dokon(?:č|c)it\\s+(?:objedn(?:á|a)vku|n(?:á|a)kup|platbu)', 'zaplatit(?:\\s+(?:nyn(?:í|i)|te(?:ď|d)))?', 'p(?:ř|r)ej(?:í|i)t\\s+(?:k\\s+platb(?:ě|e)|do\\s+pokladny|k\\s+pokladn(?:ě|e))', 'pokra(?:č|c)ovat\\s+k\\s+platb(?:ě|e)', 'potvrdit\\s+(?:a\\s+zaplatit|objedn(?:á|a)vku|n(?:á|a)kup)',
        'k(?:ø|o)b(?:\\s+nu)?', 'k(?:ø|o)b\\s+med\\s+betalingsforpligtelse', 'bestil(?:\\s+nu)?', 'gennemf(?:ø|o)r\\s+(?:k(?:ø|o)b(?:et)?|bestilling(?:en)?)', 'afgiv\\s+bestilling', 'g(?:å|a)\\s+til\\s+(?:kassen|betaling(?:en)?)', 'betal(?:\\s+n(?:u|å))?', 'bekr(?:æ|a)ft\\s+(?:og\\s+betal|k(?:ø|o)b(?:et)?|bestilling(?:en)?)', 'kj(?:ø|o)p(?:\\s+n(?:å|a))?', 'kj(?:ø|o)p\\s+med\\s+betalingsplikt', 'bestill(?:\\s+n(?:å|a))?', 'bestilling\\s+med\\s+betalingsplikt', 'fullf(?:ø|o)r\\s+(?:kj(?:ø|o)p(?:et)?|bestilling(?:en)?)', 'bekreft\\s+(?:og\\s+betal|kj(?:ø|o)p(?:et)?|bestilling(?:en)?)', 'osta(?:\\s+nyt)?', 'maksa(?:\\s+nyt)?', 'tilaa\\s+ja\\s+maksa', 'tilaa\\s+maksuvelvollisena', 'siirry\\s+(?:kassalle|maksamaan)', 'vahvista\\s+(?:tilaus|ostos|ja\\s+maksa)', 'tee\\s+tilaus', 'viimeistele\\s+(?:tilaus|ostos)',
        'k(?:ú|u)pi(?:ť|t)(?:\\s+teraz)?', 'objedna(?:ť|t)(?:\\s+(?:teraz|s\\s+povinnos(?:ť|t)ou\\s+platby))?', 'objedn(?:á|a)vka\\s+(?:zav(?:ä|a)zuj(?:ú|u)ca|s\\s+povinnos(?:ť|t)ou)\\s+(?:k\\s+)?platb\\w*', 'zaplati(?:ť|t)(?:\\s+teraz)?', 'pokra(?:č|c)ova(?:ť|t)\\s+k\\s+platbe', 'prejs(?:ť|t)\\s+(?:do\\s+pokladne|k\\s+platbe)', 'dokon(?:č|c)i(?:ť|t)\\s+(?:objedn(?:á|a)vku|n(?:á|a)kup)', 'potvrdi(?:ť|t)\\s+(?:objedn(?:á|a)vku|n(?:á|a)kup|a\\s+zaplati(?:ť|t))', 'odosla(?:ť|t)\\s+objedn(?:á|a)vku', 'megv(?:á|a)s(?:á|a)rolom', 'megveszem', 'v(?:á|a)s(?:á|a)rl(?:á|a)s(?:\\s+most)?', 'v(?:á|a)s(?:á|a)rold\\s+meg', 'megrendelem', 'rendel(?:é|e)s\\s+lead(?:á|a)sa', 'megrendel(?:é|e)s\\s+(?:elk(?:ü|u)ld(?:é|e)se|v(?:é|e)gleges(?:í|i)t(?:é|e)se)', 'fizet(?:é|e)si\\s+k(?:ö|o)telezetts(?:é|e)ggel\\s+j(?:á|a)r(?:ó|o)\\s+megrendel(?:é|e)s', '(?:megrendel(?:é|e)s|rendel(?:é|e)s)\\s+fizet(?:é|e)si\\s+k(?:ö|o)telezetts(?:é|e)ggel', 'fizet(?:é|e)s(?:\\s+most)?', 'fizetek', 'tov(?:á|a)bb\\s+a\\s+(?:fizet(?:é|e)shez|p(?:é|e)nzt(?:á|a)rhoz)', 'p(?:é|e)nzt(?:á|a)r', 'rendel(?:é|e)s\\s+v(?:é|e)gleges(?:í|i)t(?:é|e)se', 'v(?:á|a)s(?:á|a)rl(?:á|a)s\\s+befejez(?:é|e)se', 'αγορ(?:ά|α)(?:\\s+τ(?:ώ|ω)ρα)?', 'αγορ(?:ά|α)στε(?:\\s+τ(?:ώ|ω)ρα)?', 'ολοκλ(?:ή|η)ρωση\\s+(?:της\\s+)?(?:αγορ(?:ά|α)ς|παραγγελ(?:ί|ι)ας)', 'υποβολ(?:ή|η)\\s+(?:της\\s+)?παραγγελ(?:ί|ι)ας', 'παραγγελ(?:ί|ι)α\\s+με\\s+υποχρ(?:έ|ε)ωση\\s+πληρωμ(?:ή|η)ς', 'πληρωμ(?:ή|η)(?:\\s+τ(?:ώ|ω)ρα)?', 'πληρ(?:ώ|ω)στε(?:\\s+τ(?:ώ|ω)ρα)?', 'συν(?:έ|ε)χεια\\s+(?:στην|προς)\\s+(?:πληρωμ(?:ή|η)|ταμε(?:ί|ι)ο)', 'μετ(?:ά|α)βαση\\s+στο\\s+ταμε(?:ί|ι)ο', 'ταμε(?:ί|ι)ο', 'επιβεβα(?:ί|ι)ωση\\s+(?:της\\s+)?(?:παραγγελ(?:ί|ι)ας|αγορ(?:ά|α)ς)', 'παραγγελ(?:ί|ι)α\\s+τ(?:ώ|ω)ρα', 'παρ(?:ά|α)γγειλε\\s+τ(?:ώ|ω)ρα',
        'kupi(?:te)?(?:\\s+sada)?', 'naru(?:č|c)i(?:te)?(?:\\s+sada)?', 'narud(?:ž|z)ba\\s+s\\s+obvezom\\s+pla(?:ć|c)anja', 'plati(?:te)?(?:\\s+sada)?', 'nastavi\\s+na\\s+(?:pla(?:ć|c)anje|blagajnu)', 'na\\s+blagajnu', 'zavr(?:š|s)i\\s+(?:narud(?:ž|z)bu|kupnju)', 'potvrdi\\s+(?:narud(?:ž|z)bu|kupnju)', 'po(?:š|s)alji\\s+narud(?:ž|z)bu', 'kupi(?:te)?(?:\\s+zdaj)?', 'naro(?:č|c)i(?:te)?(?!\\s+se)(?:\\s+zdaj)?', 'naro(?:č|c)ilo\\s+z\\s+obveznostjo\\s+pla(?:č|c)ila', 'pla(?:č|c)aj(?:te)?(?:\\s+zdaj)?', 'nadaljuj\\s+(?:na\\s+pla(?:č|c)ilo|na\\s+blagajno)', 'na\\s+blagajno', 'zaklju(?:č|c)i\\s+(?:naro(?:č|c)ilo|nakup)', 'potrdi\\s+(?:naro(?:č|c)ilo|nakup)', 'oddaj\\s+naro(?:č|c)ilo', 'купи(?:те)?(?:\\s+сега)?', 'поръчай(?:те)?(?:\\s+сега)?', 'поръчка\\s+със\\s+задължение\\s+за\\s+плащане', 'плати(?:те)?(?:\\s+сега)?', 'плащане\\s+сега', 'продължи\\s+към\\s+(?:плащане|касата)', 'към\\s+касата', 'завърши\\s+(?:поръчката|покупката)', 'потвърди\\s+(?:поръчката|покупката)', 'изпрати\\s+поръчката',
      ]),
    },
    {
      type: 'oauth',
      weight: 3,
      re: more(/\b(autorizza|consenti\s+l['’]accesso|(?:continua|accedi|entra|registrati|prosegui)\s+con\s+(?:l['’]\s*account\s+|il\s+tuo\s+account\s+|un\s+account\s+)?(?:google|facebook|apple|github|microsoft|linkedin|spid)|authorize|allow\s+access|grant\s+access|(?:continue|sign\s*in|log\s*in|sign\s*up)\s+with\s+(?:your\s+)?(?:google|facebook|apple|github|microsoft|linkedin)\s*(?:account)?)\b|(?<![\wÀ-ÿ])(autorizar(?:\s+(?:el\s+)?acceso)?|permitir\s+(?:el\s+)?acceso|conceder\s+(?:el\s+)?acceso|(?:continuar|acceder|entrar|registrarse|iniciar\s+sesi[óo]n)\s+con\s+(?:tu\s+|mi\s+|una\s+)?(?:cuenta\s+de\s+)?(?:google|facebook|apple|github|microsoft|linkedin))(?![\wÀ-ÿ])/i, [
        'autorisieren', 'zugriff\\s+(?:erlauben|gew(?:ä|ae)hren|zulassen)', `(?:weiter|anmelden|fortfahren|einloggen|registrieren)\\s+mit\\s+${OAUTH}`, `mit\\s+${OAUTH}\\s+(?:anmelden|fortfahren|einloggen|registrieren)`,
        'autoriser(?:\\s+l' + AP + 'acc(?:è|e)s)?', `(?:continuer|se\\s+connecter|s${AP}inscrire|connexion)\\s+avec\\s+${OAUTH}`,
        'autoriseren', 'toegang\\s+(?:toestaan|verlenen)', `(?:doorgaan|inloggen|aanmelden|registreren)\\s+met\\s+${OAUTH}`,
        'autoryzuj', 'zezw(?:ó|o)l\\s+na\\s+dost(?:ę|e)p', `(?:kontynuuj|zaloguj\\s+si(?:ę|e)|zarejestruj\\s+si(?:ę|e))\\s+(?:przez|z)\\s+${OAUTH}`,
        'autorizar(?:\\s+(?:o\\s+)?acesso)?', 'permitir\\s+(?:o\\s+)?acesso', `(?:continuar|iniciar\\s+sess(?:ã|a)o|entrar|registar-se|inscrever-se)\\s+com\\s+(?:o\\s+|a\\s+)?${OAUTH}`,
        'auktorisera', 'till(?:å|a)t\\s+(?:å|a)tkomst', 'ge\\s+(?:å|a)tkomst', `(?:forts(?:ä|a)tt|logga\\s+in|registrera\\s+dig)\\s+med\\s+${OAUTH}`, 'autorizeaz(?:ă|a)', 'permite\\s+accesul', `(?:continu(?:ă|a)|conecteaz(?:ă|a)-te|autentific(?:ă|a)-te|(?:î|i)nregistreaz(?:ă|a)-te)\\s+cu\\s+${OAUTH}`, 'autorizovat', 'povolit\\s+p(?:ř|r)(?:í|i)stup', `(?:pokra(?:č|c)ovat|p(?:ř|r)ihl(?:á|a)sit\\s+se|registrovat\\s+se)\\s+(?:p(?:ř|r)es|se|s)\\s+(?:(?:ú|u)(?:č|c)tem\\s+)?${OAUTH}`,
        `forts(?:æ|a)t\\s+med\\s+${OAUTH}`, `log\\s+ind\\s+med\\s+${OAUTH}`, 'tillad\\s+adgang', 'giv\\s+adgang', `fortsett\\s+med\\s+${OAUTH}`, `logg\\s+inn\\s+med\\s+${OAUTH}`, 'tillat\\s+tilgang', 'gi\\s+tilgang', `jatka\\s+${OAUTH}\\w*`, `kirjaudu\\s+(?:sis(?:ä|a)(?:ä|a)n\\s+)?${OAUTH}\\w*`, 'salli\\s+p(?:ää|aa)sy', 'my(?:ö|o)nn(?:ä|a)\\s+k(?:ä|a)ytt(?:ö|o)oikeus',
        `pokra(?:č|c)ova(?:ť|t)\\s+(?:cez|s|so)\\s+(?:(?:ú|u)(?:č|c)tom\\s+)?${OAUTH}`, `prihl(?:á|a)si(?:ť|t)\\s+sa\\s+(?:cez|pomocou)\\s+${OAUTH}`, `povoli(?:ť|t)\\s+pr(?:í|i)stup`, `autorizova(?:ť|t)`, `folytat(?:á|a)s\\s+${OAUTH}\\S*`, `bejelentkez(?:é|e)s\\s+${OAUTH}\\S*`, `hozz(?:á|a)f(?:é|e)r(?:é|e)s\\s+enged(?:é|e)lyez(?:é|e)se`, `enged(?:é|e)lyez(?:é|e)s`, `συν(?:έ|ε)χεια\\s+με\\s+${OAUTH}`, `σ(?:ύ|υ)νδεση\\s+με\\s+${OAUTH}`, `να\\s+επιτρ(?:έ|ε)πεται\\s+η\\s+πρ(?:ό|ο)σβαση`, `παραχ(?:ώ|ω)ρηση\\s+πρ(?:ό|ο)σβασης`, `εξουσιοδ(?:ό|ο)τηση`,
        `nastavi\\s+(?:s|putem)\\s+${OAUTH}\\w*`, `prijavi\\s+se\\s+(?:s|putem)\\s+${OAUTH}\\w*`, `dopusti\\s+pristup`, `odobri\\s+pristup`, `autoriziraj`, `nadaljuj\\s+(?:z|prek)\\s+${OAUTH}\\w*`, `(?:nadaljuj|prijava)\\s+(?:z|prek)\\s+googl\\w*`, `prijava\\s+(?:z|prek)\\s+${OAUTH}\\w*`, `dovoli\\s+dostop`, `odobri\\s+dostop`, `avtoriziraj`, `продължи\\s+(?:с|чрез)\\s+${OAUTH}`, `вход\\s+(?:с|чрез)\\s+${OAUTH}`, `разреши\\s+достъп(?:а)?`, `предостави\\s+достъп`, `упълномощи`,
      ]),
    },
    {
      type: 'consent',
      weight: 3,
      /**
       * "Entendido" is anchored to the whole label, not searched inside the text
       * like the others: alone on a button it is the twin of "Ho capito" and
       * counts as consent, but it is also a very common word in banner prose
       * ("Hemos entendido tus preferencias"), where it would close a notice on a
       * sentence that commits to nothing.
       */
      re: more(/\b(accetta\s+tutt\w+|consenti\s+tutt\w+|acconsento\s+a\s+tutt\w+|consenti(?![-_\w])|ho\s+capito|accept\s+all(?:\s+cookies)?|allow\s+all|got\s+it|gestisci\s+(?:i\s+)?consensi|salva\s+(?:le\s+)?preferenze\s+(?:sui\s+)?cookie)\b|(?<![\wÀ-ÿ])(aceptar\s+tod[oa]s?(?:\s+las\s+cookies)?|aceptar\s+(?:las\s+)?cookies|permitir\s+tod[oa]s?|consentir|doy\s+mi\s+consentimiento)(?![\wÀ-ÿ])|^[\s¡"'«(]*entendido[\s!.…»)]*$/i, [
        'alle\\s+(?:cookies\\s+)?(?:akzeptieren|zulassen|erlauben|annehmen)', '(?:akzeptieren|zulassen)\\s+und\\s+(?:schlie(?:ß|ss)en|weiter)',
        'tout\\s+(?:accepter|autoriser)', 'accepter\\s+(?:tout|les\\s+cookies|tous\\s+les\\s+cookies)', `j${AP}accepte\\s+(?:tout|les\\s+cookies)`,
        'alles?\\s+(?:cookies\\s+)?(?:accepteren|toestaan)', 'alle\\s+cookies\\s+(?:accepteren|toestaan)', 'cookies\\s+accepteren',
        '(?:akceptuj|zaakceptuj|zezw(?:ó|o)l\\s+na)\\s+wszystk(?:ie|o)', 'akceptuj(?:ę|e)\\s+wszystk(?:ie|o)', 'zgadzam\\s+si(?:ę|e)\\s+na\\s+wszystk(?:ie|o)',
        'aceitar\\s+tod(?:o|os|as)(?:\\s+os\\s+cookies)?', 'aceitar\\s+(?:os\\s+)?cookies', 'permitir\\s+tod(?:o|os|as)', 'aceito\\s+tud(?:o)',
        '(?:acceptera|godk(?:ä|a)nn|till(?:å|a)t)\\s+alla(?:\\s+cookies)?', 'jag\\s+godk(?:ä|a)nner\\s+alla', 'accept(?:ă|a)?\\s+tot(?:ul|ate)?(?:\\s+cookie-urile)?', 'permite\\s+tot(?:ul|ate)', 'sunt\\s+de\\s+acord\\s+cu\\s+toate', 'accept(?:ă|a)\\s+cookie-urile', 'p(?:ř|r)ijmout\\s+v(?:š|s)e(?:chny)?(?:\\s+cookies)?', 'povolit\\s+v(?:š|s)e(?:chny)?(?:\\s+cookies)?', 'souhlas(?:í|i)m\\s+se\\s+v(?:š|s)emi',
        'accept(?:é|e)r\\s+alle(?:\\s+cookies)?', 'tillad\\s+alle(?:\\s+cookies)?', 'godkend\\s+alle(?:\\s+cookies)?', 'godta\\s+alle(?:\\s+informasjonskapsler)?', 'aksepter\\s+alle', 'tillat\\s+alle', 'hyv(?:ä|a)ksy\\s+kaikki(?:\\s+ev(?:ä|a)steet)?', 'salli\\s+kaikki(?:\\s+ev(?:ä|a)steet)?',
        'prija(?:ť|t)\\s+v(?:š|s)etk(?:o|y)(?:\\s+(?:s(?:ú|u)bory\\s+)?cookies)?', 'povoli(?:ť|t)\\s+v(?:š|s)etk(?:o|y)(?:\\s+cookies)?', 's(?:ú|u)hlas(?:í|i)m\\s+so\\s+v(?:š|s)etk(?:ý|y)m', '(?:az\\s+)?(?:(?:ö|o)sszes|minden)\\s+(?:s(?:ü|u)ti\\s+)?elfogad(?:á|a)sa', 'mindet\\s+elfogadom', '(?:az\\s+)?(?:ö|o)sszes\\s+enged(?:é|e)lyez(?:é|e)se', 'minden\\s+s(?:ü|u)ti\\s+elfogad(?:á|a)sa', 'αποδοχ(?:ή|η)\\s+(?:ό|ο)λων(?:\\s+των\\s+cookies)?', 'αποδ(?:έ|ε)χομαι\\s+(?:ό|ο)λα', 'να\\s+επιτρ(?:έ|ε)πονται\\s+(?:ό|ο)λα', 'αποδοχ(?:ή|η)\\s+cookies',
        'prihvati\\s+sve(?:\\s+kola(?:č|c)i(?:ć|c)e)?', 'dopusti\\s+sve(?:\\s+kola(?:č|c)i(?:ć|c)e)?', 'prihva(?:ć|c)am\\s+sve', 'sprejmi\\s+vse(?:\\s+pi(?:š|s)kotke)?', 'dovoli\\s+vse(?:\\s+pi(?:š|s)kotke)?', 'sprejmem\\s+vse', 'приеми\\s+всички(?:\\s+бисквитки)?', 'разреши\\s+всички(?:\\s+бисквитки)?', 'приемам\\s+всички',
      ], /^[\s"'«(]*(?:einverstanden|j['’]ai\s+compris|akkoord|oké)[\s!.…»)]*$/i.source),
    },
    {
      type: 'accept_terms',
      weight: 2,
      re: more(/\b(accetto|accetta(?:re)?|ho\s+letto\s+e\s+accetto|acconsento|approvo|prosegui\s+e\s+accetta|i\s+agree|agree\s+(?:and|to)\b|accept\s+(?:and|terms)|accetta\s+e\s+continua)\b|(?<![\wÀ-ÿ])(acepto|estoy\s+de\s+acuerdo|aceptar\s+(?:los\s+|las\s+)?(?:t[ée]rminos|condiciones)|aceptar\s+y\s+continuar)(?![\wÀ-ÿ])/i, [
        'akzeptieren', 'ich\\s+(?:stimme\\s+zu|akzeptiere|bin\\s+einverstanden)', 'zustimmen(?:\\s+und\\s+(?:fortfahren|weiter))?', '(?:agb|bedingungen)\\s+(?:akzeptieren|annehmen)', 'akzeptieren\\s+und\\s+(?:fortfahren|weiter)',
        `j${AP}accepte`, 'accepter(?:\\s+et\\s+continuer)?', `je\\s+suis\\s+d${AP}accord`, `accepter\\s+les\\s+(?:conditions|cgu|cgv)`,
        'accepteren', 'ik\\s+(?:ga\\s+akkoord|accepteer)', 'akkoord\\s+(?:gaan|en\\s+doorgaan)', 'ga\\s+akkoord', 'voorwaarden\\s+accepteren',
        'akceptuj(?:ę|e)?', 'zaakceptuj', 'zgadzam\\s+si(?:ę|e)', 'akceptuj(?:ę|e)\\s+regulamin', 'akceptuj\\s+i\\s+kontynuuj',
        'aceito', 'aceitar(?:\\s+e\\s+continuar)?', 'concordo', 'aceitar\\s+(?:os\\s+)?(?:termos|condi(?:ç|c)(?:õ|o)es)',
        'jag\\s+(?:godk(?:ä|a)nner|accepterar|samtycker)', 'godk(?:ä|a)nn(?:\\s+(?:villkoren|och\\s+forts(?:ä|a)tt))?', 'acceptera(?:\\s+(?:villkoren|och\\s+forts(?:ä|a)tt))?', 'accept(?:ă|a)(?:\\s+(?:termenii|condi(?:ț|ţ|t)iile|(?:ș|ş|s)i\\s+continu(?:ă|a)))?', 'accept\\s+(?:termenii|condi(?:ț|ţ|t)iile)', 'sunt\\s+de\\s+acord', 'am\\s+citit\\s+(?:ș|ş|s)i\\s+accept', 'souhlas(?:í|i)m(?:\\s+s\\s+(?:obchodn(?:í|i)mi\\s+)?podm(?:í|i)nkami)?', 'p(?:ř|r)ijmout(?:\\s+(?:podm(?:í|i)nky|a\\s+pokra(?:č|c)ovat))?', 'p(?:ř|r)ij(?:í|i)m(?:á|a)m', 'souhlasit\\s+a\\s+pokra(?:č|c)ovat',
        'jeg\\s+(?:accepterer|godtar|samtykker|er\\s+enig)', 'accept(?:é|e)r\\s+(?:vilk(?:å|a)rene|og\\s+forts(?:æ|a)t)', 'godkend(?:\\s+vilk(?:å|a)rene)?', 'godta(?:\\s+(?:vilk(?:å|a)rene|og\\s+fortsett))?', 'aksepter(?:\\s+vilk(?:å|a)rene)?', 'hyv(?:ä|a)ksy(?:\\s+(?:ehdot|ja\\s+jatka))?', 'hyv(?:ä|a)ksyn(?:\\s+ehdot)?',
        's(?:ú|u)hlas(?:í|i)m(?:\\s+s\\s+(?:obchodn(?:ý|y)mi\\s+)?podmienkami)?', 'prija(?:ť|t)(?:\\s+(?:podmienky|a\\s+pokra(?:č|c)ova(?:ť|t)))?', 'prij(?:í|i)mam', 's(?:ú|u)hlasi(?:ť|t)\\s+a\\s+pokra(?:č|c)ova(?:ť|t)', 'elfogadom(?:\\s+a\\s+(?:felt(?:é|e)teleket|(?:á|a)szf-et))?', 'egyet(?:é|e)rtek', 'elfogad(?:á|a)s(?:\\s+(?:(?:é|e)s\\s+folytat(?:á|a)s))?', 'αποδ(?:έ|ε)χομαι(?:\\s+τους\\s+(?:ό|ο)ρους)?', 'συμφων(?:ώ|ω)(?:\\s+με\\s+τους\\s+(?:ό|ο)ρους)?', 'αποδοχ(?:ή|η)(?:\\s+(?:των\\s+)?(?:ό|ο)ρων)?', 'αποδοχ(?:ή|η)\\s+και\\s+συν(?:έ|ε)χεια',
        'prihva(?:ć|c)am(?:\\s+uvjete)?', 'sla(?:ž|z)em\\s+se(?:\\s+s\\s+uvjetima)?', 'prihvati(?:\\s+uvjete)?', 'prihvati\\s+i\\s+nastavi', 'sprejmem(?:\\s+pogoje)?', 'strinjam\\s+se(?:\\s+s\\s+pogoji)?', 'sprejmi(?:\\s+pogoje)?', 'sprejmi\\s+in\\s+nadaljuj', 'приемам(?:\\s+условията)?', 'съгласен\\s+съм(?:\\s+с\\s+условията)?', 'съгласна\\s+съм(?:\\s+с\\s+условията)?', 'приеми(?:\\s+условията)?', 'приеми\\s+и\\s+продължи',
      ]),
    },
    {
      type: 'signup',
      weight: 1,
      re: more(/\b(crea\s+(?:un\s+)?account|registrati|iscriviti\s+ora|apri\s+(?:un\s+)?conto|create\s+(?:an\s+)?account|sign\s+up|get\s+started\s+free|join\s+now)\b|(?<![\wÀ-ÿ])(crear\s+(?:una\s+|mi\s+|tu\s+)?cuenta|abrir\s+(?:una\s+)?cuenta|registrar(?:se|me|te)|reg[ií]strate|dar(?:se|me|te)?\s+de\s+alta|date\s+de\s+alta)(?![\wÀ-ÿ])/i, [
        'konto\\s+(?:erstellen|anlegen|er(?:ö|oe)ffnen)', '(?:jetzt\\s+)?registrieren', 'kostenlos\\s+registrieren',
        'cr(?:é|e)er\\s+(?:un\\s+|mon\\s+|votre\\s+)?compte', `s${AP}inscrire`, 'inscrivez-vous', `je\\s+m${AP}inscris`, 'ouvrir\\s+(?:un\\s+)?compte',
        'account\\s+(?:aanmaken|maken)', 'maak\\s+(?:een\\s+)?account(?:\\s+aan)?', 'registreren', 'registreer(?:\\s+nu)?',
        'za(?:ł|l)(?:ó|o)(?:ż|z)\\s+konto', 'utw(?:ó|o)rz\\s+konto', 'zarejestruj(?:\\s+si(?:ę|e))?', 'rejestracja',
        'criar\\s+(?:uma\\s+)?conta', 'registar(?:-se)?', 'registe-se', 'inscrever(?:-se)?', 'inscreva-se', 'abrir\\s+(?:uma\\s+)?conta',
        'skapa\\s+(?:ett\\s+)?konto', 'registrera(?:\\s+dig)?', '(?:ö|o)ppna\\s+(?:ett\\s+)?konto', 'creeaz(?:ă|a)\\s+(?:un\\s+)?cont', '(?:î|i)nregistreaz(?:ă|a)-te', '(?:î|i)nregistrare', 'deschide\\s+(?:un\\s+)?cont', 'vytvo(?:ř|r)it\\s+(?:si\\s+)?(?:ú|u)(?:č|c)et', 'zaregistrovat(?:\\s+se)?', 'registrovat(?:\\s+se)?', 'registrace', 'zalo(?:ž|z)it\\s+(?:si\\s+)?(?:ú|u)(?:č|c)et',
        'opret\\s+(?:en\\s+)?konto', 'tilmeld\\s+dig', 'registrer\\s+(?:dig|deg)', 'opprett\\s+(?:en\\s+)?konto', 'meld\\s+deg\\s+p(?:å|a)', 'luo\\s+tili', 'rekister(?:ö|o)idy',
        'vytvori(?:ť|t)\\s+(?:si\\s+)?(?:ú|u)(?:č|c)et', 'zaregistrova(?:ť|t)(?:\\s+sa)?', 'registr(?:á|a)cia', 'zalo(?:ž|z)i(?:ť|t)\\s+(?:si\\s+)?(?:ú|u)(?:č|c)et', 'fi(?:ó|o)k\\s+l(?:é|e)trehoz(?:á|a)sa', 'regisztr(?:á|a)ci(?:ó|o)', 'regisztr(?:á|a)lok', 'regisztr(?:á|a)lj(?:\\s+most)?', 'hozz\\s+l(?:é|e)tre\\s+fi(?:ó|o)kot', 'δημιουργ(?:ί|ι)α\\s+λογαριασμο(?:ύ|υ)', 'δημιουργ(?:ή|η)στε\\s+λογαριασμ(?:ό|ο)', 'εγγραφ(?:ή|η)', 'εγγραφε(?:ί|ι)τε',
        '(?:izradi|otvori|kreiraj)(?:te)?\\s+ra(?:č|c)un', 'registriraj(?:te)?\\s+se', 'registracija', 'ustvari(?:te)?\\s+ra(?:č|c)un', 'registriraj(?:te)?\\s+se', 'registracija', 'създай(?:те)?\\s+(?:профил|акаунт)', 'регистрирай(?:те)?\\s+се', 'регистрация',
      ]),
    },
  ];

  const ACTION_LABELS = {
    accept_terms: 'acceptingTermsConditions',
    subscribe: 'startingSubscription',
    purchase: 'purchase',
    sign: 'signingDocument',
    signup: 'creatingAccount',
    consent: 'consentDataProcessing',
    oauth: 'accessAuthorisation',
  };

  /**
   * Expressions meaning the opposite of a commitment: refusal, waiver, exit.
   * They cannot be an absolute veto: "Subscribe — cancel anytime" is standard
   * checkout microcopy, and "Firma il contratto e chiudi" is a signature with
   * an instruction about what to do next. See `optOutWins`.
   *
   * Two cautions about Spanish, both learnt from how it is really written:
   *
   * - "volver a comprar" is not a return, it is a re-purchase: the same word
   *   that usually goes back here opens an order. The exclusion is explicit
   *   because the case is exactly the reverse of "Volver" and "Volver a la
   *   tienda", which stay opt-outs.
   * - "cerrar" is left out on purpose: "cerrar la compra" means completing the
   *   purchase, not closing the window, and the risk of silencing a real
   *   checkout outweighs that of an unrecognised banner.
   */
  const OPT_OUT = more(/\b(rifiut\w+|nega|non\s+(?:accett|consent|autorizz)\w+|solo\s+(?:i\s+)?(?:cookie\s+)?(?:necessari|essenziali)|continua\s+senza\s+accettare|reject(?:\s+all)?|decline|deny|manage\s+(?:preferences|options)|annulla|cancel|indietro|torna|chiudi|close|esci|log\s*out|disdici|unsubscribe)\b|(?<![\wÀ-ÿ])(rechaz(?:ar|o)(?:\s+tod[oa]s)?|denegar|s[óo]lo\s+(?:las\s+|los\s+)?(?:cookies\s+)?(?:necesari[oa]s|esenciales|t[ée]cnicas)|continuar\s+sin\s+aceptar|no\s+(?:acepto|aceptar|autorizar|permitir)|cancelar?|volver(?!\s+a\s+(?:comprar|pagar|contratar|suscribirse|reservar))|atr[áa]s|gestionar\s+(?:las\s+|mis\s+)?(?:preferencias|opciones|cookies)|configurar\s+(?:las\s+)?(?:cookies|preferencias)|dar(?:se|me|te)?\s+de\s+baja|date\s+de\s+baja)(?![\wÀ-ÿ])/i, [
    // German. "Schließen" never fires inside "Kauf abschließen": the lookbehind sees the letter.
    '(?:alle\\s+)?ablehnen', 'nur\\s+(?:notwendige|erforderliche|essenzielle)(?:\\s+cookies)?', 'nicht\\s+(?:akzeptieren|zustimmen|einverstanden)', 'abbrechen', 'zur(?:ü|ue)ck', 'schlie(?:ß|ss)en', 'k(?:ü|ue)ndigen', 'abmelden', 'abbestellen', '(?:einstellungen|optionen|cookies)\\s+(?:verwalten|anpassen)', 'weiter\\s+ohne\\s+(?:zustimmung|einwilligung|akzeptieren)',
    // French.
    '(?:tout\\s+)?refuser', 'continuer\\s+sans\\s+accepter', `je\\s+refuse`, 'annuler', 'retour', 'fermer', `(?:se\\s+)?d(?:é|e)sabonner`, `(?:se\\s+)?d(?:é|e)sinscrire`, 'r(?:é|e)silier', 'personnaliser', `(?:g(?:é|e)rer|param(?:é|e)trer)\\s+(?:mes\\s+|les\\s+)?(?:pr(?:é|e)f(?:é|e)rences|cookies|choix)`, 'uniquement\\s+(?:les\\s+)?(?:cookies\\s+)?(?:n(?:é|e)cessaires|essentiels)',
    // Dutch.
    '(?:alles\\s+)?weigeren', 'alleen\\s+(?:noodzakelijke|functionele|essenti(?:ë|e)le)(?:\\s+cookies)?', 'niet\\s+(?:akkoord|accepteren)', 'annuleren', 'terug', 'sluiten', 'opzeggen', 'afmelden', 'uitschrijven', '(?:voorkeuren|instellingen|cookies)\\s+(?:beheren|aanpassen)', 'doorgaan\\s+zonder\\s+(?:accepteren|akkoord)',
    // Polish.
    '(?:odrzu(?:ć|c)|odrzucam)(?:\\s+wszystk(?:ie|o))?', 'tylko\\s+(?:niezb(?:ę|e)dne|wymagane)(?:\\s+(?:pliki\\s+)?cookies)?', 'nie\\s+(?:akceptuj(?:ę|e)?|zgadzam\\s+si(?:ę|e))', 'anuluj', 'wr(?:ó|o)(?:ć|c)', 'zamknij', 'wypowiedz(?:\\s+umow(?:ę|e))?', 'wyloguj', 'wypisz\\s+si(?:ę|e)', '(?:ustawienia|zarz(?:ą|a)dzaj)\\s+(?:cookies|plikami\\s+cookies|preferencjami)', 'dostosuj',
    // Portuguese.
    'rejeitar(?:\\s+tud(?:o)|\\s+todos)?', 'recusar(?:\\s+tud(?:o))?', 'apenas\\s+(?:os\\s+)?(?:necess(?:á|a)rios|essenciais)', 'continuar\\s+sem\\s+(?:aceitar|pagar)', 'n(?:ã|a)o\\s+(?:aceito|aceitar|concordo)', 'cancelar', 'voltar(?!\\s+a\\s+(?:comprar|pagar|subscrever))', 'fechar', 'sair', 'anular\\s+(?:a\\s+)?subscri(?:ç|c)(?:ã|a)o', '(?:gerir|configurar|personalizar)\\s+(?:as\\s+)?(?:prefer(?:ê|e)ncias|cookies|op(?:ç|c)(?:õ|o)es)',
    // Swedish. "Avsluta" alone stays out: "Avsluta köp" completes a purchase.
    '(?:avvisa|neka)(?:\\s+alla)?', '(?:endast|bara)\\s+n(?:ö|o)dv(?:ä|a)ndiga(?:\\s+cookies)?', '(?:jag\\s+)?godk(?:ä|a)nn(?:er)?\\s+inte', 'avbryt', 'tillbaka', 'st(?:ä|a)ng', 's(?:ä|a)g\\s+upp', 'logga\\s+ut', 'avsluta\\s+prenumeration(?:en)?', 'avregistrera', '(?:hantera|anpassa)\\s+(?:inst(?:ä|a)llningar|cookies|val)', 'forts(?:ä|a)tt\\s+utan\\s+att\\s+(?:godk(?:ä|a)nna|acceptera|betala)',
    // Romanian.
    'refuz(?:ă|a)?(?:\\s+tot(?:ul|ate)?)?', 'respinge(?:\\s+tot(?:ul|ate)?)?', '(?:doar|numai)\\s+(?:cele\\s+)?(?:necesare|esen(?:ț|ţ|t)iale)', 'nu\\s+(?:accept|sunt\\s+de\\s+acord)', 'anuleaz(?:ă|a)', 'anulare', '(?:î|i)napoi', '(?:î|i)nchide', 'renun(?:ț|ţ|t)(?:ă|a)', 'deconectare', 'dezabonare', 'dezaboneaz(?:ă|a)-te', 'reziliaz(?:ă|a)', '(?:gestioneaz(?:ă|a)|personalizeaz(?:ă|a)|set(?:ă|a)ri)\\s+(?:preferin(?:ț|ţ|t)ele|cookie-uri(?:le)?|op(?:ț|ţ|t)iuni(?:le)?)', 'continu(?:ă|a)\\s+f(?:ă|a)r(?:ă|a)\\s+(?:a\\s+accepta|s(?:ă|a)\\s+accep(?:ț|ţ|t)i|plat(?:ă|a))',
    // Czech.
    '(?:odm(?:í|i)tnout|zam(?:í|i)tnout)(?:\\s+v(?:š|s)e)?', '(?:pouze|jen)\\s+(?:nezbytn(?:é|e)|nutn(?:é|e))(?:\\s+cookies)?', 'nesouhlas(?:í|i)m', 'zru(?:š|s)it', 'zp(?:ě|e)t', 'zav(?:ř|r)(?:í|i)t', 'vypov(?:ě|e)d(?:ě|e)t(?:\\s+smlouvu)?', 'odhl(?:á|a)sit(?:\\s+(?:se|odb(?:ě|e)r))?', '(?:spravovat|upravit|nastaven(?:í|i))\\s+(?:cookies|preference|p(?:ř|r)edvolby)', 'pokra(?:č|c)ovat\\s+bez\\s+(?:souhlasu|p(?:ř|r)ijet(?:í|i)|placen(?:í|i))',
    // Danish. "Afslut" alone stays out: "Afslut køb" completes a purchase.
    'afvis(?:\\s+alle)?', 'kun\\s+n(?:ø|o)dvendige(?:\\s+cookies)?', 'annuller', 'tilbage', 'luk', 'opsig(?:\\s+abonnement(?:et)?)?', 'log\\s+ud', 'afmeld(?:\\s+dig)?', '(?:administrer|tilpas)\\s+(?:indstillinger|cookies|valg)', 'forts(?:æ|a)t\\s+uden\\s+at\\s+(?:acceptere|betale)', 'jeg\\s+accepterer\\s+ikke',
    // Norwegian. "Avslutt" alone stays out for the same reason.
    'avvis(?:\\s+alle)?', 'bare\\s+n(?:ø|o)dvendige(?:\\s+informasjonskapsler)?', 'tilbake', 'lukk', 'si\\s+opp(?:\\s+abonnementet)?', 'logg\\s+ut', 'meld\\s+(?:deg\\s+)?av', '(?:administrer|tilpass)\\s+(?:innstillinger|informasjonskapsler|valg)', 'fortsett\\s+uten\\s+(?:å|a)\\s+(?:godta|betale)', 'jeg\\s+godtar\\s+ikke',
    // Finnish.
    'hylk(?:ää|aa)(?:\\s+kaikki)?', 'vain\\s+v(?:ä|a)ltt(?:ä|a)m(?:ä|a)tt(?:ö|o)m(?:ä|a)t(?:\\s+ev(?:ä|a)steet)?', 'peruuta', 'takaisin', 'palaa', 'sulje', 'irtisano(?:\\s+tilaus)?', 'kirjaudu\\s+ulos', 'peru\\s+tilaus', '(?:hallinnoi|muokkaa)\\s+(?:asetuksia|ev(?:ä|a)steit(?:ä|a)|valintoja)', 'ev(?:ä|a)steasetukset', 'jatka\\s+hyv(?:ä|a)ksym(?:ä|a)tt(?:ä|a)', 'en\\s+hyv(?:ä|a)ksy',
    // Slovak, Hungarian and Greek. "Vásárlás folytatása" (continue shopping) is not a purchase.
    'odmietnu(?:ť|t)(?:\\s+v(?:š|s)etko)?', '(?:len|iba)\\s+nevyhnutn(?:é|e)(?:\\s+(?:s(?:ú|u)bory\\s+)?cookies)?', 'nes(?:ú|u)hlas(?:í|i)m', 'zru(?:š|s)i(?:ť|t)', 'sp(?:ä|a)(?:ť|t)', 'zavrie(?:ť|t)', 'vypoveda(?:ť|t)(?:\\s+zmluvu)?', 'odhl(?:á|a)si(?:ť|t)(?:\\s+sa)?', '(?:spravova(?:ť|t)|upravi(?:ť|t)|nastavenia)\\s+(?:cookies|predvo(?:ľ|l)by|preferencie)', 'pokra(?:č|c)ova(?:ť|t)\\s+(?:bez\\s+(?:s(?:ú|u)hlasu|platby)|v\\s+n(?:á|a)kupe)', 'elutas(?:í|i)tom', '(?:az\\s+)?(?:(?:ö|o)sszes|mind)\\s+elutas(?:í|i)t(?:á|a)sa', 'elutas(?:í|i)t(?:á|a)s', 'csak\\s+a\\s+(?:sz(?:ü|u)ks(?:é|e)gesek|sz(?:ü|u)ks(?:é|e)ges\\s+s(?:ü|u)tik)', 'm(?:é|e)gse', 'vissza', 'bez(?:á|a)r(?:á|a)s', 'nem\\s+fogadom\\s+el', 'leiratkoz(?:á|a)s', 'kijelentkez(?:é|e)s', 'felmond(?:á|a)s', '(?:be(?:á|a)ll(?:í|i)t(?:á|a)sok|s(?:ü|u)tik)\\s+kezel(?:é|e)se', 's(?:ü|u)tibe(?:á|a)ll(?:í|i)t(?:á|a)sok', 'v(?:á|a)s(?:á|a)rl(?:á|a)s\\s+folytat(?:á|a)sa', 'folytat(?:á|a)s\\s+(?:elfogad(?:á|a)s|fizet(?:é|e)s)\\s+n(?:é|e)lk(?:ü|u)l', 'απ(?:ό|ο)ρριψη(?:\\s+(?:ό|ο)λων)?', 'απορρ(?:ί|ι)πτω', 'μ(?:ό|ο)νο\\s+(?:τα\\s+)?απαρα(?:ί|ι)τητα(?:\\s+cookies)?', 'ακ(?:ύ|υ)ρωση', 'π(?:ί|ι)σω', 'κλε(?:ί|ι)σιμο', 'δεν\\s+αποδ(?:έ|ε)χομαι', 'διαχε(?:ί|ι)ριση\\s+(?:των\\s+)?(?:cookies|ρυθμ(?:ί|ι)σεων|προτιμ(?:ή|η)σεων)', 'ρυθμ(?:ί|ι)σεις\\s+cookies', 'αποσ(?:ύ|υ)νδεση', 'απεγγραφ(?:ή|η)', 'συν(?:έ|ε)χεια\\s+(?:των\\s+)?αγορ(?:ώ|ω)ν', 'συν(?:έ|ε)χεια\\s+χωρ(?:ί|ι)ς\\s+(?:αποδοχ(?:ή|η)|πληρωμ(?:ή|η))',
    // Croatian, Slovenian and Bulgarian. "Naroči se na e-novice" (newsletter) is not a subscription.
    'odbij(?:\\s+sve)?', 'samo\\s+(?:nu(?:ž|z)ni|neophodni)(?:\\s+kola(?:č|c)i(?:ć|c)i)?', 'ne\\s+prihva(?:ć|c)am', 'odustani', 'natrag', 'zatvori', 'otka(?:ž|z)i(?:\\s+pretplatu)?', 'odjavi\\s+se', 'odjava', '(?:postavke|upravljanje)\\s+kola(?:č|c)i(?:ć|c)(?:a|ima)', 'nastavi\\s+(?:kupovati|kupnju|bez\\s+(?:prihva(?:ć|c)anja|pla(?:ć|c)anja))', 'zavrni(?:\\s+vse)?', 'samo\\s+(?:nujni|nujne)(?:\\s+pi(?:š|s)kotki)?', 'ne\\s+sprejmem', 'prekli(?:č|c)i', 'nazaj', 'zapri', 'odpovej(?:\\s+naro(?:č|c)nino)?', 'odjavi\\s+se', 'odjava', '(?:nastavitve|upravljanje)\\s+pi(?:š|s)kotkov', 'nadaljuj\\s+(?:z\\s+nakupovanjem|brez\\s+(?:sprejetja|pla(?:č|c)ila))', 'откажи(?:\\s+всички)?', 'отхвърли(?:\\s+всички)?', 'само\\s+(?:необходимите|задължителните)(?:\\s+бисквитки)?', 'не\\s+приемам', 'отказ', 'назад', 'затвори', 'прекрати(?:\\s+абонамента)?', 'изход', 'отпиши\\s+се', '(?:настройки|управление)\\s+на\\s+бисквитките', 'продължи\\s+(?:пазаруването|без\\s+(?:приемане|плащане))',
  ]);

  /**
   * Labels about something free and without commitment: newsletters, alerts,
   * notifications. "Subscribe to our newsletter" is not a subscription, and an
   * id like "subscribe-nl" must not make it one; neither is the German
   * "Newsletter bestellen" an order. Only subscribe, sign-up and purchase
   * give way, and only when the label names no price: a paid newsletter's
   * "Subscribe — €5/month" is still a subscription.
   */
  const FREE_ONLY = more(/\b(newsletter|notify\s+me|avvisami|notifiche|alerts?)\b|(?<![\wÀ-ÿ])(bolet[ií]n|av[ií]same|notificaciones)(?![\wÀ-ÿ])/i, [
    'benachrichtig\\w*', 'newsletter', `lettre\\s+d${AP}information`, 'alertes?', `m${AP}avertir`, 'nieuwsbrief', 'meldingen', 'houd\\s+me\\s+op\\s+de\\s+hoogte',
    'newsletter(?:a|y|ze)?', 'powiadomie(?:ń|n)', 'alert(?:y|ów)', 'boletim\\s+informativo', 'notifica(?:ç|c)(?:õ|o)es', 'alertas',
    'nyhetsbrev(?:et)?', 'aviseringar', 'meddela\\s+mig', 'buletin\\s+informativ', 'notific(?:ă|a)ri', 'anun(?:ț|ţ|t)(?:ă|a)-m(?:ă|a)', 'alerte', 'odeb(?:í|i)rat\\s+novinky', 'upozorn(?:ě|e)n(?:í|i)', 'upozorn(?:ě|e)te\\s+m(?:ě|e)',
    'nyhedsbrev(?:et)?', 'notifikationer', 'giv\\s+mig\\s+besked', 'varsler', 'gi\\s+meg\\s+beskjed', 'uutiskirje(?:en|eemme)?', 'ilmoitukset', 'ilmoita\\s+minulle',
    'odobera(?:ť|t)\\s+novinky', 'prihl(?:á|a)si(?:ť|t)\\s+sa\\s+na\\s+odber(?:\\s+noviniek)?', 'upozornenia', 'upozornite\\s+ma', 'h(?:í|i)rlev(?:é|e)l\\w*', '(?:é|e)rtes(?:í|i)t(?:é|e)sek', '(?:é|e)rtes(?:í|i)ts(?:en)?(?:\\s+engem)?', 'ενημερωτικ(?:ό|ο)\\s+δελτ(?:ί|ι)ο', 'ειδοποι(?:ή|η)σεις', 'ειδοποι(?:ή|η)στε\\s+με',
    '(?:pretplati\\s+se\\s+na\\s+)?(?:newsletter|bilten)', 'obavijesti\\s+me', 'obavijesti', '(?:naro(?:č|c)i\\s+se\\s+na\\s+)?(?:e-?novice|novi(?:č|c)nik)', 'obvesti\\s+me', 'obvestila', 'бюлетин', '(?:абонирай\\s+се\\s+за\\s+)?(?:бюлетина|новините)', 'уведоми\\s+ме', 'известия',
  ]);

  const PRICED = /[€$£]|\d/;

  /** Below this weight an action cannot stand against an opt-out. */
  const STRONG_WEIGHT = 3;

  /**
   * The refusal wins if it is **at the start** of the label, or if what it
   * caught is a weak action.
   *
   * Position is the signal: whoever writes a button puts the commanding verb
   * first ("Annulla e torna al carrello"); what follows is trimming. Conversely,
   * in "Subscribe — cancel anytime" the refusal is a reassurance about later,
   * and treating it as a veto cancelled a real subscription — exactly the case
   * this product exists to stop.
   */
  function optOutWins(text, best) {
    const m = OPT_OUT.exec(text);
    if (!m) return false;
    const strong = Boolean(best) && best.weight >= STRONG_WEIGHT;
    if (!strong) return true;
    const head = Math.max(1, Math.ceil(text.trim().length / 3));
    return m.index < head;
  }

  function heaviestMatch(text) {
    let best = null;
    for (const p of ACTION_PATTERNS) {
      if (!p.re.test(text)) continue;
      if (!best || p.weight > best.weight) best = p;
    }
    return best;
  }

  /**
   * Like `classifyText`, but it also says *why* it didn't classify.
   *
   * The detector needs it: if the visible label refuses the action ("Cancel"),
   * HTML attributes must not be able to overrule it; if the label simply says
   * nothing, attributes may speak.
   *
   * @returns {{type: string|null, weight: number, vetoed: boolean}}
   */
  function classifyDetail(text) {
    if (!text) return { type: null, weight: 0, vetoed: false };
    const best = heaviestMatch(text);
    if (optOutWins(text, best)) return { type: null, weight: 0, vetoed: true };
    // A label that only speaks of newsletters or alerts commits to nothing, and
    // says so: an id like "subscribe-nl" must not turn it into a subscription.
    if (FREE_ONLY.test(text) && (!best || ['subscribe', 'signup', 'purchase'].includes(best.type)) && !PRICED.test(text)) {
      return { type: null, weight: 0, vetoed: true };
    }
    return { type: best ? best.type : null, weight: best ? best.weight : 0, vetoed: false };
  }

  /** Classifies a text. @returns {string|null} */
  function classifyText(text) {
    return classifyDetail(text).type;
  }

  CF.actions = { ACTION_PATTERNS, ACTION_LABELS, OPT_OUT, classifyText, classifyDetail, STRONG_WEIGHT };
})();

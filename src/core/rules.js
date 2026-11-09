/**
 * Motore a regole locale.
 *
 * Fa il primo screening senza mandare nulla fuori dal browser: riconosce le
 * clausole tipiche per categoria di rischio, in italiano e in inglese, ed
 * estrae le citazioni testuali che serviranno all'LLM e alla UI.
 *
 * Filosofia: le regole devono essere *precise* più che esaustive. Un falso
 * positivo insegna all'utente a ignorare l'avviso, ed è il modo più veloce per
 * rendere inutile un firewall.
 */

import { RISK_CATEGORIES } from './constants.js';
import { splitClauses, extractPrices, extractDurations, normalize } from './text.js';

/**
 * Espressioni che, se presenti nella stessa clausola, *negano* il rischio.
 * Es. "nessun rinnovo automatico", "no automatic renewal".
 */
const NEGATORS = [
  /\bnessun\w*\s+(rinnovo|penale|vincolo|obbligo|costo\s+aggiuntivo)/i,
  /\bnon\s+(?:si\s+)?(rinnov\w+|è\s+previst\w+\s+alcun|prevede\s+alcun|vendiamo|cediamo|condividiamo)/i,
  /\bsenza\s+(vincoli|penali|obblighi|rinnovo\s+automatico|costi\s+aggiuntivi)/i,
  /\bno\s+(automatic\s+renewal|hidden\s+fees|penalt\w+|lock-?in)\b/i,
  /\bwe\s+do\s+not\s+(sell|share|rent)\b/i,
  /\bnon\s+vendiamo\s+i\s+tuoi\s+dati\b/i,
  /\bpuoi\s+(disdire|cancellare|recedere)\s+in\s+qualsiasi\s+momento\s+senza\b/i,
  /\bcancel\s+anytime\s+(with\s+no|without)\b/i,
  // Il foro del consumatore è la tutela, non il rischio: segnalarlo sarebbe
  // esattamente il contrario di quello che serve.
  /\bforo\s+(?:competente\s+)?(?:è\s+|sar[àa]\s+)?(?:quello\s+)?(?:del|di\s+residenza\s+del|del\s+domicilio\s+del)\s+consumatore/i,
  /\bforo\s+(?:competente\s+)?(?:è\s+)?(?:quello\s+)?del\s+luogo\s+di\s+residenza/i,

  // ── spagnolo ──────────────────────────────────────────────────────────────
  /\bning[úu]n\w*\s+(?:renovaci[óo]n|penalizaci[óo]n|permanencia|compromiso|coste\s+adicional)/i,
  /\bno\s+se\s+renueva\s+autom[áa]ticamente/i,
  /\bsin\s+(?:permanencia|penalizaci[óo]n|compromiso|coste\s+adicional|costes\s+adicionales)/i,
  /\bno\s+vendemos\s+tus\s+datos/i,
  /\bpuedes\s+(?:darte\s+de\s+baja|cancelar|desistir)\s+en\s+cualquier\s+momento\s+sin\b/i,
  // Il foro del consumatore è la tutela, non il rischio, anche in spagnolo.
  /\b(?:fuero|juzgados?)\s+(?:y\s+tribunales\s+)?(?:del?\s+)?(?:domicilio\s+)?del\s+consumidor/i,
];

/**
 * Città e stati che, per un utente italiano o europeo, non sono «estero».
 *
 * La categoria si chiama `jurisdiction: 'Foro competente estero'` ma non
 * verificava mai che lo fosse: «devolute al foro di Roma» veniva presentato
 * all'utente come foro estero. Un elenco dei capoluoghi risolve il grosso dei
 * casi reali senza pretendere un geocoder.
 */
const DOMESTIC_VENUES = new Set([
  'roma', 'milano', 'napoli', 'torino', 'palermo', 'genova', 'bologna', 'firenze',
  'bari', 'catania', 'venezia', 'verona', 'messina', 'padova', 'trieste', 'brescia',
  'parma', 'taranto', 'prato', 'modena', 'reggio', 'reggiocalabria', 'reggioemilia',
  'perugia', 'ravenna', 'livorno', 'cagliari', 'foggia', 'rimini', 'salerno',
  'ferrara', 'sassari', 'latina', 'giugliano', 'monza', 'siracusa', 'pescara',
  'bergamo', 'forlì', 'forli', 'trento', 'vicenza', 'terni', 'bolzano', 'novara',
  'piacenza', 'ancona', 'andria', 'arezzo', 'udine', 'cesena', 'lecce', 'pesaro',
  'barletta', 'alessandria', 'catanzaro', 'aosta', 'campobasso', 'potenza',
  'laquila', 'italia', 'italy',
]);

/** Usi di «penale» che sono aggettivo, non clausola economica. */
const PENALTY_AS_LEGAL_ADJECTIVE = /(?:responsabilit[àa]|codice|sede|rilevanza|profilo|azione|sanzion\w*|illecit\w*|procedimento|natura)\s+penal|penal\w*\s+(?:e\s+civile|amministrativ)/i;

/** Contesto che rende «penale» una somma di denaro. */
const PENALTY_IN_MONEY_CONTEXT = /\b(?:recess|disdett|risoluzion|anticipat|estinzion|cessazion|disattivazion|euro|eur\b|pari\s+a|import|addebit|corrisponder|versar|dovut|fattur|€)/i;

/**
 * Il foro citato è davvero estero?
 *
 * @param {RegExpExecArray} m
 * @param {string} sentence
 * @param {object} ctx  porta `jurisdiction` dalle impostazioni.
 */
function isForeignVenue(m, sentence, ctx) {
  const place = (m[1] || m[2] || '').trim().toLowerCase().replace(/[^a-zàèéìòù]/g, '');
  if (!place) return true;
  const atHome = !ctx?.jurisdiction || ctx.jurisdiction === 'IT' || ctx.jurisdiction === 'EU';
  if (atHome && DOMESTIC_VENUES.has(place)) return false;
  return true;
}

/**
 * «Penale» in italiano è anche un aggettivo, e «responsabilità penale» sta in
 * una privacy policy su due: la regola scattava a severità 65 — la terza più
 * alta del dizionario — su un'informativa che non prevede alcuna penale.
 * È il tipo di allarme che fa disinstallare l'estensione.
 */
function isMonetaryPenalty(m, sentence) {
  const around = sentence.slice(Math.max(0, m.index - 60), m.index + m[0].length + 90);
  if (PENALTY_AS_LEGAL_ADJECTIVE.test(around)) return false;
  return PENALTY_IN_MONEY_CONTEXT.test(around);
}

/**
 * Il dizionario. `w` è il peso della regola: quanto sposta la severità della
 * categoria (1 = severità piena, 0.6 = indizio debole).
 */
export const RULES = [
  // ── Denaro: rinnovo, durata, penali ────────────────────────────────────────
  { id: 'ren.it.1', cat: 'auto_renewal', w: 1, re: /\brinnov\w*\s+(?:si\s+intende\s+)?(?:in\s+via\s+)?(?:automatic\w*|tacit\w*)|\btacito\s+rinnovo|\bsi\s+rinnov\w+\s+automaticamente|\brinnovat\w+\s+tacitamente|\btacitamente\s+rinnovat\w+|\bsi\s+intende\s+(?:tacitamente\s+)?rinnovat\w+/i },
  { id: 'ren.it.2', cat: 'auto_renewal', w: 0.85, re: /\bsalvo\s+disdetta|\bin\s+mancanza\s+di\s+disdetta|\bse\s+non\s+viene\s+comunicata\s+la\s+disdetta/i },
  { id: 'ren.en.1', cat: 'auto_renewal', w: 1, re: /\bautomatically\s+renew\w*|\bauto-?renew\w*|\brenews?\s+automatically|\bcontinuous\s+(?:service|billing)/i },
  { id: 'ren.en.2', cat: 'auto_renewal', w: 0.8, re: /\bunless\s+(?:you\s+)?cancel\w*\b|\buntil\s+(?:you\s+)?cancel\b/i },

  { id: 'min.it.1', cat: 'minimum_term', w: 1, re: /\bdurata\s+minima|\bperiodo\s+minimo\s+(?:di\s+)?(?:contratt\w+|abbonament\w+|vincol\w+)|\bvincolo\s+(?:contrattuale\s+|di\s+permanenza\s+|di\s+durata\s+|temporale\s+)?(?:di\s+)?\d+\s*(?:mesi|anni)|\bpermanenza\s+minima|\bimpegno\s+minimo/i },
  { id: 'min.en.1', cat: 'minimum_term', w: 1, re: /\bminimum\s+(?:term|period|commitment|contract\s+length)|\bcommitment\s+period|\block-?in\s+period/i },

  // Il `\b` in coda a `penalit[àa]` non aggancia mai: in JS il confine di
  // parola è definito su [A-Za-z0-9_] e `à` non ne fa parte.
  { id: 'pen.it.1', cat: 'early_termination_penalty', w: 1, guard: isMonetaryPenalty, re: /\bpenale\b|\bpenalit[àa](?=\W|$)|\bcosti\s+di\s+(?:recesso|disattivazione|cessazione)|\bindennit[àa]\s+di\s+recesso|\baddebit\w+\s+(?:in\s+caso\s+di\s+)?recesso\s+anticipato/i },
  { id: 'pen.en.1', cat: 'early_termination_penalty', w: 1, re: /\bearly\s+termination\s+fee|\bcancellation\s+fee|\bexit\s+fee|\btermination\s+charge|\bbreak\s+fee/i },

  { id: 'not.it.1', cat: 'notice_period', w: 1, re: /\bpreavviso\s+di\s+(?:almeno\s+)?\d+\s*(?:giorni|mesi)|\bcon\s+\d+\s*(?:giorni|mesi)\s+di\s+preavviso|\bdisdetta\s+(?:va|deve\s+essere)\s+(?:inviata|comunicata)\s+(?:almeno\s+)?\d+/i },
  { id: 'not.en.1', cat: 'notice_period', w: 1, re: /\b(?:at\s+least\s+)?\d+\s*(?:days?|months?)['’]?\s+(?:prior\s+)?(?:written\s+)?notice|\bnotice\s+period\s+of\s+\d+/i },

  { id: 'ref.it.1', cat: 'no_refund', w: 1, re: /\bnon\s+(?:sono\s+)?(?:previsti\s+)?rimbors\w*|\bnessun\s+rimborso|\brimborsi\s+esclusi|\bimport\w+\s+(?:versat\w+\s+)?non\s+(?:sono\s+)?rimborsabil\w+|\bnon\s+rimborsabil\w+/i },
  { id: 'ref.en.1', cat: 'no_refund', w: 1, re: /\bnon-?refundable|\bno\s+refunds?\b|\brefunds?\s+(?:are\s+)?not\s+(?:available|provided|granted)|\ball\s+sales\s+(?:are\s+)?final/i },

  { id: 'hid.it.1', cat: 'hidden_costs', w: 0.9, re: /\bcosti\s+(?:aggiuntivi|accessori|una\s+tantum)|\bspese\s+di\s+(?:attivazione|gestione|istruttoria|incasso)|\boltre\s+(?:a|al)\s+(?:iva|imposte)|\bcontributo\s+(?:fisso|obbligatorio)|\bservizio\s+obbligatorio/i },
  { id: 'hid.en.1', cat: 'hidden_costs', w: 0.9, re: /\bactivation\s+fee|\bsetup\s+fee|\bprocessing\s+fee|\badditional\s+charges?\s+(?:may\s+)?apply|\bplus\s+applicable\s+taxes|\bmandatory\s+(?:service|add-?on)/i },

  // Fra il verbo e il complemento si infilano quasi sempre degli avverbi
  // ("modificare unilateralmente il prezzo", "variare in qualsiasi momento le
  // condizioni"): pretendere che siano adiacenti fa perdere la clausola.
  { id: 'prc.it.1', cat: 'price_change', w: 1, re: /\b(?:pu[òo]|potr[àa]|si\s+riserva\s+il\s+diritto\s+di)\s+(?:\w+\s+){0,3}?(?:modificare|variare|aggiornare|adeguare|rideterminare)\s+(?:\w+\s+){0,3}?(?:il\s+|i\s+|le\s+)?(?:prezzo|prezzi|corrispettivo|canone|tariff\w+)|\bvariazion\w+\s+(?:del\s+)?prezzo|\badeguamento\s+(?:istat|inflazion\w+|tariffario)/i },
  { id: 'prc.en.1', cat: 'price_change', w: 1, re: /\b(?:we\s+)?may\s+(?:change|modify|increase|adjust)\s+(?:the\s+)?(?:price|fees?|rates?|charges?)|\bprice\s+(?:changes?|increases?)\s+(?:will|may)/i },

  { id: 'uni.it.1', cat: 'unilateral_change', w: 1, re: /\b(?:ci\s+riserviamo|si\s+riserva)\s+il\s+diritto\s+di\s+(?:\w+\s+){0,2}?(?:modificare|variare|aggiornare)|\b(?:pu[òo]|potr[àa])\s+(?:\w+\s+){0,3}?(?:modificare|variare)\s+(?:\w+\s+){0,3}?(?:i\s+presenti\s+|le\s+presenti\s+)?(?:termini|condizioni|clausole)|\bmodifiche\s+unilateral\w+/i },
  { id: 'uni.en.1', cat: 'unilateral_change', w: 1, re: /\b(?:we\s+)?reserve\s+the\s+right\s+to\s+(?:modify|change|amend|update)\s+(?:these\s+)?(?:terms|agreement)|\bmay\s+(?:modify|amend)\s+(?:these\s+)?terms\s+at\s+any\s+time/i },

  // ── Diritti e controversie ────────────────────────────────────────────────
  { id: 'arb.it.1', cat: 'arbitration', w: 1, re: /\barbitrat\w+\s+(?:obbligatori\w+|vincolante|rituale|irrituale)|\bclausola\s+compromissoria|\bcollegio\s+arbitrale|\bdevoluta?\s+(?:ad\s+)?arbitr\w+/i },
  { id: 'arb.en.1', cat: 'arbitration', w: 1, re: /\bbinding\s+arbitration|\bmandatory\s+arbitration|\bagree\s+to\s+arbitrate|\barbitration\s+agreement|\bwaive\s+(?:your\s+)?right\s+to\s+(?:a\s+)?(?:jury\s+)?trial/i },

  { id: 'cls.it.1', cat: 'class_action_waiver', w: 1, re: /\brinunc\w+\s+(?:a|ad)\s+(?:azioni\s+)?(?:collettiv\w+|class\s+action)|\bazione\s+di\s+classe\s+esclus\w+/i },
  { id: 'cls.en.1', cat: 'class_action_waiver', w: 1, re: /\bclass\s+action\s+waiver|\bwaive\w*\s+(?:any\s+)?right\s+to\s+(?:participate\s+in\s+a\s+)?class\s+action|\bon\s+an\s+individual\s+basis\s+only|\bnot\s+as\s+a\s+(?:plaintiff|class\s+member)/i },

  // Con il flag `i`, `[A-Z]` degenera in `[a-zA-Z]`: la clausola di città
  // diventava «tre caratteri qualsiasi», e «il foro competente è determinato
  // ai sensi di legge» veniva segnalato come foro estero. Qui la maiuscola è
  // richiesta davvero, e il luogo catturato viene confrontato con i fori interni.
  { id: 'jur.it.1', cat: 'jurisdiction', w: 0.9, guard: isForeignVenue, re: /[Ff]oro\s+(?:competente\s+)?(?:esclusiv\w+\s+)?(?:[èe]\s+|sar[àa]\s+)?(?:quello\s+)?(?:di\s+)?([A-ZÀ-Ý][\wÀ-ÿ'’-]{2,})|[Ll]egge\s+applicabile\s+(?:[èe]\s+)?(?:quella\s+)?(?:dello\s+[Ss]tato\s+di\s+|del\s+)([A-ZÀ-Ý][\wÀ-ÿ'’-]{2,})/ },
  { id: 'jur.en.1', cat: 'jurisdiction', w: 0.9, guard: isForeignVenue, re: /governed\s+by\s+the\s+laws?\s+of\s+(?:the\s+)?(?:[Ss]tate\s+of\s+)?([A-Z][\w' -]{2,})|exclusive\s+jurisdiction\s+of\s+the\s+courts?\s+of\s+([A-Z][\w' -]{2,})|\bvenue\s+shall\s+be/ },

  { id: 'lia.it.1', cat: 'liability_limitation', w: 0.9, re: /\besclusione\s+(?:di\s+ogni\s+)?responsabilit[àa]|\bnon\s+(?:sar[àa]\s+|è\s+)?(?:in\s+alcun\s+modo\s+)?responsabile\s+per|\blimitazione\s+di\s+responsabilit[àa]|\bmanleva|\bnei\s+limiti\s+massimi\s+consentiti\s+dalla\s+legge/i },
  { id: 'lia.en.1', cat: 'liability_limitation', w: 0.9, re: /\blimitation\s+of\s+liability|\bshall\s+not\s+be\s+liable\s+for|\bin\s+no\s+event\s+(?:shall|will)\s+\w+\s+be\s+liable|\bas\s+is,?\s+without\s+warrant|\bdisclaim\w*\s+all\s+warranties/i },

  // ── Spagnolo ──────────────────────────────────────────────────────────────
  //
  // Le regole spagnole stanno in blocco e non mescolate alle italiane: le
  // categorie sono le stesse, ma le formule contrattuali no, e tenerle separate
  // rende evidente che cosa è coperto in quale lingua. Le grafie senza accento
  // sono accettate ovunque: molti siti reali le usano.
  { id: 'ren.es.1', cat: 'auto_renewal', w: 1, re: /\brenovaci[óo]n\s+(?:autom[áa]tica|t[áa]cita)|\bse\s+renueva\s+autom[áa]ticamente|\bse\s+renovar[áa]\s+autom[áa]ticamente|\bpr[óo]rroga\s+(?:autom[áa]tica|t[áa]cita)|\bse\s+prorroga\w*\s+autom[áa]ticamente/i },
  { id: 'ren.es.2', cat: 'auto_renewal', w: 0.85, re: /\bsalvo\s+(?:cancelaci[óo]n|baja|preaviso|comunicaci[óo]n\s+en\s+contrario)|\bsi\s+no\s+(?:se\s+)?cancelas?\b/i },

  { id: 'min.es.1', cat: 'minimum_term', w: 1, re: /\bpermanencia\s+m[íi]nima|\bcompromiso\s+de\s+permanencia|\bduraci[óo]n\s+m[íi]nima|\bplazo\s+m[íi]nimo|\bper[íi]odo\s+m[íi]nimo|\bperiodo\s+m[íi]nimo/i },

  { id: 'pen.es.1', cat: 'early_termination_penalty', w: 1, guard: isMonetaryPenalty, re: /\bpenalizaci[óo]n\w*|\bpenalidad\w*|\bcoste\s+de\s+(?:cancelaci[óo]n|baja)|\bcomisi[óo]n\s+por\s+(?:cancelaci[óo]n|baja\s+anticipada)|\bindemnizaci[óo]n\s+por\s+(?:baja|desistimiento)/i },

  { id: 'ref.es.1', cat: 'no_refund', w: 1, re: /\bno\s+(?:son|ser[áa]n)\s+reembolsables|\bno\s+reembolsable\w*|\bsin\s+derecho\s+a\s+(?:reembolso|devoluci[óo]n)|\bno\s+se\s+admiten\s+devoluciones|\bno\s+habr[áa]\s+reembolso/i },

  { id: 'prz.es.1', cat: 'price_change', w: 1, re: /\bmodificar\s+(?:unilateralmente\s+)?(?:el\s+)?precio|\brevisar\s+(?:las\s+)?tarifas|\bactualizar\s+(?:las\s+)?tarifas|\bmodificaci[óo]n\s+(?:unilateral\s+)?(?:del\s+)?precio|\bpodr[áa]\s+modificar\s+el\s+precio/i },

  { id: 'uni.es.1', cat: 'unilateral_change', w: 1, re: /\bse\s+reserva\s+el\s+derecho\s+(?:de|a)\s+modificar|\bpodr[áa]\s+modificar\s+(?:en\s+cualquier\s+momento\s+)?(?:las\s+)?(?:presentes\s+)?condiciones|\bmodificar\s+unilateralmente\s+(?:las\s+)?condiciones/i },

  { id: 'not.es.1', cat: 'notice_period', w: 0.9, re: /\bpreaviso\s+de\s+\w+|\bcon\s+una\s+antelaci[óo]n\s+(?:m[íi]nima\s+)?de|\bavisar\s+con\s+\w+\s+(?:d[íi]as|meses)\s+de\s+antelaci[óo]n/i },

  { id: 'jur.es.1', cat: 'jurisdiction', w: 0.9, guard: isForeignVenue, re: /(?:juzgados?|tribunales)\s+(?:y\s+tribunales\s+)?de\s+(?:la\s+ciudad\s+de\s+)?([A-ZÀ-Ý][\wÀ-ÿ'’-]{2,})|se\s+someten\s+a\s+(?:los\s+)?(?:juzgados?\s+(?:y\s+tribunales\s+)?de\s+)([A-ZÀ-Ý][\wÀ-ÿ'’-]{2,})|legislaci[óo]n\s+(?:aplicable\s+)?(?:ser[áa]\s+la\s+)?de\s+([A-ZÀ-Ý][\wÀ-ÿ'’-]{2,})/ },

  { id: 'arb.es.1', cat: 'arbitration', w: 1, re: /\barbitraje\s+(?:vinculante|obligatorio|de\s+derecho)|\bsometer\w*\s+a\s+arbitraje|\bmediante\s+arbitraje|\brenuncia\w*\s+a\s+(?:la\s+)?v[íi]a\s+judicial/i },

  { id: 'cls.es.1', cat: 'class_action_waiver', w: 1, re: /\brenuncia\w*\s+a\s+(?:participar\s+en\s+)?(?:las\s+)?acciones\s+colectivas|\bacci[óo]n\s+colectiva\s+.{0,20}renuncia|\ba\s+t[íi]tulo\s+individual\s+[úu]nicamente/i },

  { id: 'lia.es.1', cat: 'liability_limitation', w: 0.9, re: /\bexclusi[óo]n\s+de\s+responsabilidad|\blimitaci[óo]n\s+de\s+responsabilidad|\bno\s+(?:ser[áa]|es)\s+responsable\s+(?:de|por)|\bexime\w*\s+de\s+(?:toda\s+)?responsabilidad|\ben\s+la\s+m[áa]xima\s+medida\s+permitida\s+por\s+la\s+ley/i },

  { id: 'ipl.es.1', cat: 'ip_license', w: 1, re: /\bconcede\w*\s+(?:a\s+(?:\w+\s+){0,3})?(?:una\s+)?licencia\s+(?:mundial|no\s+exclusiva|gratuita|perpetua|irrevocable|transferible|sublicenciable)|\botorga\w*\s+(?:a\s+(?:\w+\s+){0,3})?(?:una\s+)?licencia\s+(?:mundial|no\s+exclusiva|gratuita|perpetua|irrevocable)/i },
  { id: 'ipa.es.1', cat: 'ip_assignment', w: 1, re: /\bcesi[óo]n\s+de\s+(?:los\s+)?derechos\s+(?:de\s+explotaci[óo]n|de\s+autor|de\s+propiedad\s+intelectual)|\bcede\w*\s+(?:en\s+exclusiva\s+)?(?:todos\s+)?los\s+derechos|\btransmite\w*\s+la\s+titularidad\s+de\s+los\s+derechos/i },
  { id: 'aim.es.1', cat: 'ai_training', w: 1, re: /\bentrenar\s+(?:modelos|sistemas|algoritmos)|\bentrenamiento\s+de\s+(?:modelos|sistemas)|\bmodelos\s+de\s+inteligencia\s+artificial/i },

  { id: 'dsl.es.1', cat: 'data_sale', w: 1, re: /\bvender\s+(?:tus\s+|sus\s+)?datos|\bventa\s+de\s+(?:tus\s+|sus\s+)?datos\s+personales|\bceder\s+(?:tus\s+|sus\s+)?datos\s+a\s+cambio\s+de/i },
  { id: 'dsh.es.1', cat: 'data_sharing', w: 0.9, re: /\bcompart\w+\s+(?:tus\s+|sus\s+)?datos\s+con\s+terceros|\bcomunicar\s+(?:tus\s+|sus\s+)?datos\s+a\s+terceros|\bceder\s+(?:tus\s+|sus\s+)?datos\s+a\s+terceros/i },
  { id: 'prf.es.1', cat: 'profiling', w: 0.9, re: /\belabora\w*\s+perfiles|\bperfilado\b|\bpublicidad\s+(?:personalizada|comportamental|segmentada)|\bdecisiones\s+automatizadas/i },
  { id: 'ret.es.1', cat: 'data_retention', w: 0.9, re: /\bconservar\w*\s+(?:tus\s+|sus\s+)?datos\s+(?:de\s+forma\s+)?(?:indefinida|indefinidamente|ilimitada)|\bplazo\s+indefinido|\bsin\s+l[íi]mite\s+temporal/i },
  { id: 'tpt.es.1', cat: 'third_party_transfer', w: 0.9, re: /\btransfer\w+\s+(?:tus\s+|sus\s+)?datos\s+fuera\s+del\s+(?:EEE|Espacio\s+Econ[óo]mico\s+Europeo)|\btransferencias?\s+internacionales?\s+de\s+datos|\bfuera\s+del\s+Espacio\s+Econ[óo]mico\s+Europeo/i },
  { id: 'act.es.1', cat: 'account_termination', w: 0.9, re: /\b(?:suspender|cancelar|cerrar|bloquear)\s+(?:o\s+\w+\s+)?(?:tu|su)\s+cuenta|\bcancelaci[óo]n\s+de\s+(?:tu|su)\s+cuenta\s+sin\s+(?:previo\s+)?aviso/i },
  { id: 'hid.es.1', cat: 'hidden_costs', w: 0.9, re: /\bgastos\s+de\s+(?:activaci[óo]n|gesti[óo]n|tramitaci[óo]n|env[íi]o|estudio)|\bcoste\s+de\s+alta\b|\bcuota\s+de\s+(?:alta|inscripci[óo]n)|\bcomisi[óo]n\s+de\s+apertura/i },

  // ── Proprietà intellettuale ───────────────────────────────────────────────
  { id: 'ipl.it.1', cat: 'ip_license', w: 1, re: /\bconced\w+\s+(?:a(?:l|lla|llo|lle|i|gli)?\s+(?:[\wÀ-ÿ'’]+\s+){0,2})?(?:una\s+)?licenza\s+(?:non\s+esclusiva|mondiale|gratuita|perpetua|irrevocabile|trasferibile|sublicenziabile)/i },
  { id: 'ipl.it.2', cat: 'ip_license', w: 0.9, re: /\blicenza\s+(?:mondiale|perpetua|irrevocabile)\b|\bdiritto\s+di\s+(?:usare|riprodurre|modificare|distribuire)\s+i\s+(?:tuoi\s+)?contenuti/i },
  { id: 'ipl.en.1', cat: 'ip_license', w: 1, re: /\bgrant\s+(?:\w+\s+){1,3}?an?\s+(?:worldwide|non-?exclusive|royalty-?free|perpetual|irrevocable|transferable|sublicensable)[\w,\s-]*license/i },

  // "cessione dei diritti", "cede alla società tutti i diritti", "ceduti i
  // diritti": le forme reali sono molte e la persona verbale cambia a seconda
  // di chi ha scritto il contratto. Pretenderne una sola faceva sparire la
  // clausola più grave del dizionario.
  { id: 'ipa.it.1', cat: 'ip_assignment', w: 1, re: /\bcession\w+\s+(?:\w+\s+){0,3}?diritti|\bced\w+\s+(?:\w+\s+){0,4}?(?:tutti\s+)?i\s+diritti|\btrasferimento\s+(?:della\s+)?titolarit[àa]|\bdiventano\s+di\s+propriet[àa]\s+(?:esclusiva\s+)?di|\bacquisisce\s+la\s+(?:piena\s+)?titolarit[àa]/i },
  { id: 'ipa.en.1', cat: 'ip_assignment', w: 1, re: /\b(?:hereby\s+)?assigns?\s+(?:to\s+\w+\s+)?all\s+(?:right,?\s+title|intellectual\s+property)|\bwork\s+made\s+for\s+hire|\bbecomes?\s+(?:our|the\s+company['’]s)\s+(?:sole\s+)?property/i },

  { id: 'ait.it.1', cat: 'ai_training', w: 1, re: /\baddestr\w+\s+(?:di\s+|i\s+)?(?:nostri\s+)?(?:modelli|sistemi)\s+(?:di\s+)?(?:intelligenza\s+artificiale|ai|machine\s+learning)|\bper\s+(?:l['’])?addestramento\s+(?:di\s+)?(?:modelli|algoritmi)|\bmigliorare\s+i\s+nostri\s+modelli\s+di\s+ai/i },
  { id: 'ait.en.1', cat: 'ai_training', w: 1, re: /\btrain\w*\s+(?:our\s+)?(?:ai|machine\s+learning|ml|generative|language)\s+models?|\bmodel\s+training\s+purposes|\bimprove\s+our\s+(?:ai|machine\s+learning)\s+(?:models?|systems?)/i },

  // ── Privacy e dati ────────────────────────────────────────────────────────
  { id: 'shr.it.1', cat: 'data_sharing', w: 1, re: /\bcondivi\w+\s+(?:i\s+(?:tuoi\s+)?dati\s+)?con\s+(?:terze\s+parti|partner|societ[àa]\s+(?:terze|affiliate)|inserzionisti)|\bcomunicat\w+\s+a\s+terzi|\btrasmess\w+\s+a\s+(?:soggetti\s+)?terzi/i },
  { id: 'shr.en.1', cat: 'data_sharing', w: 1, re: /\bshare\s+(?:your\s+)?(?:personal\s+)?(?:data|information)\s+with\s+(?:third\s+part|partners|affiliates|advertisers)|\bdisclose\s+(?:your\s+)?information\s+to\s+third/i },

  { id: 'sel.it.1', cat: 'data_sale', w: 1, re: /\bvend\w+\s+(?:i\s+)?(?:tuoi\s+)?dati|\bcession\w+\s+(?:a\s+titolo\s+oneroso\s+)?dei\s+dati|\bmonetizz\w+\s+(?:dei\s+)?dati/i },
  { id: 'sel.en.1', cat: 'data_sale', w: 1, re: /\bsell\s+(?:your\s+)?(?:personal\s+)?(?:data|information)|\bsale\s+of\s+personal\s+information|\bdata\s+brokers?\b/i },

  { id: 'prf.it.1', cat: 'profiling', w: 0.9, re: /\bprofilazione\b|\bpubblicit[àa]\s+(?:personalizzat\w+|comportamental\w+|mirata)|\bmarketing\s+personalizzat\w+|\bannunci\s+personalizzati/i },
  { id: 'prf.en.1', cat: 'profiling', w: 0.9, re: /\bprofiling\b|\btargeted\s+(?:advertising|ads)|\bbehaviou?ral\s+advertising|\bpersonali[sz]ed\s+ads|\binterest-?based\s+advertising/i },

  { id: 'bio.it.1', cat: 'biometric', w: 1, re: /\bdati\s+biometric\w+|\briconoscimento\s+facciale|\bimpronta\s+digitale|\bscansione\s+(?:del\s+)?(?:volto|iride)/i },
  { id: 'bio.en.1', cat: 'biometric', w: 1, re: /\bbiometric\s+(?:data|identifiers?)|\bfacial\s+recognition|\bfingerprint\s+(?:data|scan)|\bface\s+(?:scan|geometry)|\bvoiceprint/i },

  { id: 'ret.it.1', cat: 'data_retention', w: 0.9, re: /\bconserv\w+\s+(?:i\s+dati\s+)?(?:a\s+tempo\s+indeterminato|per\s+un\s+periodo\s+illimitato|anche\s+dopo\s+la\s+(?:chiusura|cancellazione))|\bconservazione\s+(?:per\s+)?\d+\s*anni/i },
  { id: 'ret.en.1', cat: 'data_retention', w: 0.9, re: /\bretain\s+(?:your\s+)?(?:data|information)\s+(?:indefinitely|for\s+as\s+long\s+as|even\s+after)|\bretention\s+period\s+of\s+\d+\s*years/i },

  { id: 'trf.it.1', cat: 'third_party_transfer', w: 0.9, re: /\btrasferi\w+\s+(?:dei\s+dati\s+)?(?:al\s+di\s+fuori\s+dell['’]?(?:unione\s+europea|ue|spazio\s+economico)|verso\s+paesi\s+terzi|negli\s+stati\s+uniti)/i },
  { id: 'trf.en.1', cat: 'third_party_transfer', w: 0.9, re: /\btransfer\w*\s+(?:your\s+)?(?:data|information)\s+(?:to|outside)\s+(?:the\s+)?(?:united\s+states|us|third\s+countries|eea|european\s+economic)/i },

  { id: 'trm.it.1', cat: 'account_termination', w: 0.85, re: /\bsospendere\s+o\s+(?:chiudere|disattivare|terminare)\s+(?:il\s+tuo\s+)?account\s+(?:in\s+qualsiasi\s+momento|a\s+nostra\s+discrezione|senza\s+preavviso)|\ba\s+nostro\s+insindacabile\s+giudizio/i },
  { id: 'trm.en.1', cat: 'account_termination', w: 0.85, re: /\b(?:suspend|terminate)\s+(?:your\s+)?account\s+at\s+(?:any\s+time|our\s+sole\s+discretion)|\bwithout\s+(?:prior\s+)?notice\s+(?:and\s+)?(?:for\s+any\s+reason|at\s+our\s+discretion)/i },
];

/** Segnali di dark pattern letti dal contesto della pagina, non dal testo legale. */
export const DARK_PATTERN_CHECKS = [
  {
    id: 'dp.precheck',
    label: 'Caselle di consenso già selezionate',
    test: (ctx) => (ctx.form?.precheckedConsents || 0) > 0,
    detail: (ctx) => `${ctx.form.precheckedConsents} casella/e di consenso risultano già spuntate.`,
    w: 0.9,
  },
  {
    id: 'dp.trial',
    label: 'Prova gratuita che si trasforma in abbonamento',
    test: (ctx) => Boolean(ctx.pricing?.trial) && Boolean(ctx.pricing?.recurring),
    detail: (ctx) => `Prova gratuita rilevata (${ctx.pricing.trial.raw}) seguita da addebito ricorrente.`,
    w: 1,
  },
  {
    id: 'dp.hiddenterms',
    label: 'Termini non visibili nella pagina',
    test: (ctx) => Boolean(ctx.terms?.linkOnly) && !ctx.terms?.textInPage,
    detail: () => 'Il contratto non è mostrato nella pagina: è solo un link che quasi nessuno apre.',
    w: 0.6,
  },
  {
    id: 'dp.smallprint',
    label: 'Condizioni economiche in caratteri minuscoli',
    test: (ctx) => Boolean(ctx.form?.smallPrintPrice),
    detail: () => 'Le condizioni di prezzo o rinnovo sono scritte in un carattere molto più piccolo del resto.',
    w: 0.7,
  },
];

function isNegated(clause) {
  return NEGATORS.some((re) => re.test(clause));
}

const SENTENCE_SPLIT = /(?<=[.!?;])\s+/;

/**
 * Marcatori di negazione che governano ciò che li segue.
 *
 * La lista NEGATORS qui sopra è fatta di frasi intere: riconosce «nessun
 * rinnovo automatico» ma non «non è previsto il rinnovo tacito», e non
 * «alcuna penale». Una lista chiusa di formule non è un rilevatore di
 * negazione, ed è per questo che cinque clausole *favorevoli* al consumatore
 * finivano segnalate come rischi — fra cui «Il recesso non comporta alcuna
 * penale», a severità 65.
 *
 * Questi invece si valutano nella finestra che precede il match, dentro la
 * stessa frase. Tre esclusioni deliberate:
 *  - `alcun` solo al singolare: «alcuni servizi prevedono una penale» è una
 *    frase affermativa, e `alcun\w*` la spegnerebbe;
 *  - `senza` da solo resta fuori: «può recedere senza preavviso, e in tal caso
 *    è dovuta una penale» negherebbe la penale. Le sue forme sicure
 *    («senza penali», «senza vincoli») sono già in NEGATORS;
 *  - `non` solo davanti a copula, ausiliare o verbo alla prima persona
 *    plurale: «non può recedere» non nega la penale che segue.
 */
const NEGATION_BEFORE = [
  /\bnessun\w*\b/i,
  /\balcun(?:o|a)\b/i,
  /\besclus\w+\b/i,
  /\bpriv[oaie]\s+di\b/i,
  // Niente `\b` in coda: in JS il confine di parola è definito su [A-Za-z0-9_],
  // quindi `\bè\b` non aggancia mai e «Non è previsto il rinnovo tacito»
  // restava segnalato. Il lookahead sullo spazio funziona con le accentate.
  /\bnon\s+(?:è|e'|sono|vi\s+è|vi\s+sono|viene|vengono|verr[àa]|verranno|ci\s+sono|comporta|prevede|include|si\s+\w+)(?=\s|$)/i,
  /\bnon\s+\w+(?:iamo|ano)\b/i,
  /\b(?:is|are|shall\s+be|will\s+be|does|do|did)\s+not\b/i,
  /\bwithout\b/i,
  // Spagnolo. `alguno/alguna` al singolare postposto è negativo («sin coste
  // alguno»), ma la forma che conta davvero è `ningún/ninguna`.
  /\bning[úu]n\w*\b/i,
  /\bno\s+(?:es|son|se|hay|ser[áa]n?|existe|existen|se\s+\w+)(?=\s|$)/i,
  /\bno\s+\w+(?:amos|emos|imos)(?=\s|$)/i,
  /\bexclui\w+\b|\bexcluid[oa]s?\b/i,
];

/** Quanto indietro guardare da un match per capire se è negato. */
const NEGATION_WINDOW = 70;

/**
 * La negazione vale per la frase in cui compare, non per il paragrafo intero.
 *
 * Valutarla sull'intera clausola era un falso negativo strutturale e banale da
 * sfruttare: «Non vendiamo i tuoi dati.» in testa a un paragrafo spegneva
 * tutte e 47 le regole su tutto il resto — rinnovo automatico, penale di
 * recesso, conservazione a tempo indeterminato.
 *
 * E colpiva anche per caso, nella direzione opposta: in un contratto onesto
 * «il foro competente è quello del consumatore» — una tutela, giustamente fra
 * i negatori — cancellava la limitazione di responsabilità che stava nella
 * frase precedente.
 */
function sentencesOf(clause) {
  return clause.split(SENTENCE_SPLIT).filter((s) => s.trim());
}

/**
 * Il match è governato da una negazione?
 *
 * Si guarda solo *prima* del match e solo dentro la frase: la negazione in
 * italiano precede ciò che nega, e un marcatore che compare dopo appartiene
 * quasi sempre a un'altra proposizione. Se il match contiene già il «non»
 * (come in «non sarà in alcun modo responsabile», che è la regola stessa) la
 * finestra è vuota e non scatta nulla — che è il comportamento giusto.
 */
function negatesMatch(sentence, matchIndex) {
  const before = sentence.slice(Math.max(0, matchIndex - NEGATION_WINDOW), matchIndex);
  return NEGATION_BEFORE.some((re) => re.test(before));
}

/**
 * Esegue il motore a regole su un testo.
 *
 * @param {string} text  Testo del contratto / pagina.
 * @param {object} ctx   Contesto della pagina (per i dark pattern).
 * @returns {{findings: Array, stats: object}}
 */
export function runRules(text, ctx = {}) {
  const clauses = splitClauses(text);
  const byCategory = new Map();

  for (const clause of clauses) {
    for (const body of sentencesOf(clause.text)) {
      if (isNegated(body)) continue;

    for (const rule of RULES) {
      rule.re.lastIndex = 0;
      const m = rule.re.exec(body);
      if (!m) continue;
      if (negatesMatch(body, m.index)) continue;
      // Alcune regole non si decidono sulla sola forma: «penale» ha bisogno del
      // contesto economico, «foro di Roma» di sapere che Roma non è estero.
      if (rule.guard && !rule.guard(m, body, ctx)) continue;

      const meta = RISK_CATEGORIES[rule.cat];
      if (!meta) continue;

      const severity = Math.round(meta.base * rule.w);
      const existing = byCategory.get(rule.cat);
      const finding = {
        category: rule.cat,
        label: meta.label,
        severity,
        confidence: rule.w,
        quote: trimQuote(body, m.index),
        matched: m[0],
        ruleId: rule.id,
        source: 'rules',
        why: meta.why,
      };

      if (!existing || existing.severity < severity) {
        byCategory.set(rule.cat, { ...finding, hits: (existing?.hits || 0) + 1 });
      } else {
        existing.hits += 1;
      }
    }
    }
  }

  // Dark pattern: derivano dalla struttura della pagina.
  const darkDetails = [];
  for (const check of DARK_PATTERN_CHECKS) {
    let hit = false;
    try {
      hit = Boolean(check.test(ctx));
    } catch {
      hit = false;
    }
    if (!hit) continue;
    darkDetails.push({ id: check.id, label: check.label, detail: check.detail(ctx), w: check.w });
  }
  if (darkDetails.length) {
    const meta = RISK_CATEGORIES.dark_pattern;
    const maxW = Math.max(...darkDetails.map((d) => d.w));
    byCategory.set('dark_pattern', {
      category: 'dark_pattern',
      label: meta.label,
      severity: Math.round(meta.base * maxW),
      confidence: maxW,
      quote: darkDetails.map((d) => d.detail).join(' '),
      matched: darkDetails.map((d) => d.label).join(', '),
      ruleId: darkDetails.map((d) => d.id).join('+'),
      hits: darkDetails.length,
      source: 'rules',
      why: meta.why,
      details: darkDetails,
    });
  }

  const findings = [...byCategory.values()].sort((a, b) => b.severity - a.severity);

  return {
    findings,
    stats: {
      clauses: clauses.length,
      chars: normalize(text).length,
      prices: extractPrices(text).length,
      durations: extractDurations(text).length,
    },
  };
}

/** Ritaglia una citazione leggibile attorno al punto di match. */
function trimQuote(clause, matchIndex, span = 260) {
  if (clause.length <= span) return clause;
  const start = Math.max(0, matchIndex - Math.floor(span / 3));
  const end = Math.min(clause.length, start + span);
  const prefix = start > 0 ? '…' : '';
  const suffix = end < clause.length ? '…' : '';
  return `${prefix}${clause.slice(start, end).trim()}${suffix}`;
}

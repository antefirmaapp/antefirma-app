/**
 * The letters in "es": see ../letter.js for how they are put together.
 *
 * Spain: Royal Legislative Decree 1/2007 (TRLGDCU); burofax is the most used proof of sending.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Nombre y apellidos]', address: '[Dirección]', email: '[Email]', provider: '[Empresa]', service: '[descripción del servicio]', date: '[fecha]' },
  estimated: (x) => `(compromiso estimado ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `A la atención de ${provider}`,
    '[Dirección de la empresa / email indicado en las condiciones]', '', `Lugar y fecha: ______________, ${today}`, '',
    'Enviada por: ☐ burofax   ☐ correo certificado con acuse de recibo   ☐ formulario online   ☐ email'].join('\n'),
  withdrawal: (k) => ['Asunto: ejercicio del derecho de desistimiento', '', `Estimados señores de ${k.provider}:`, '',
    'Por la presente les comunico que desisto del contrato de prestación', `del servicio ${service(k)}, celebrado el ${orderDate(k)}.`, '',
    'Ejerzo el derecho de desistimiento previsto para los contratos a distancia, dentro del plazo',
    'de catorce días naturales desde la celebración del contrato, sin necesidad de justificación',
    'y sin penalización alguna.', '', 'Por ello les solicito:',
    '  1. el cese inmediato del servicio y de cualquier cargo asociado;',
    '  2. la devolución de las cantidades abonadas en un plazo máximo de catorce días desde',
    '     la recepción de esta comunicación, por el mismo medio de pago utilizado;',
    '  3. la confirmación por escrito de la recepción de esta comunicación.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Asunto: baja del contrato — no renovación automática', '', `Estimados señores de ${k.provider}:`, '',
      `Por la presente les comunico mi baja del contrato relativo a ${service(k)},`, `dado de alta el ${orderDate(k)}.`, '',
      renewal ? `Esta comunicación se envía para que el contrato no se renueve en el vencimiento del ${renewal},`
        : 'Esta comunicación se envía para que el contrato no se renueve tácitamente a su vencimiento,',
      notice ? `respetando el preaviso de ${notice} días previsto en las condiciones${deadline ? ` (fecha límite: ${deadline})` : ''}.`
        : 'respetando el preaviso previsto en las condiciones del contrato.', '',
      'Por ello les solicito:', '  1. la confirmación por escrito de la recepción de esta comunicación y de la fecha de efecto de la baja;',
      '  2. el cese de cualquier cargo a partir del vencimiento indicado;',
      '  3. el detalle de las cantidades que consideren pendientes, indicando la cláusula de la que derivan.', '',
      'Les recuerdo que la baja no puede someterse a requisitos más gravosos que el alta,',
      'y que no se considerará legítimo ningún cargo por periodos posteriores al vencimiento indicado.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Asunto: baja por modificación unilateral de las condiciones del contrato', '', `Estimados señores de ${k.provider}:`, '',
      `He detectado una modificación de las condiciones del contrato relativo a ${service(k)},`, `respecto a las que acepté el ${orderDate(k)}.`, '',
      ch?.summary ? `En concreto: ${ch.summary}` : 'La modificación afecta a las condiciones económicas o de prestación del servicio.', '',
      'Al no aceptar las nuevas condiciones, les comunico la baja del contrato con efecto inmediato,',
      'sin penalización ni gastos de desconexión, por tratarse de una modificación unilateral',
      'que no he solicitado.', '', 'Por ello les solicito:',
      '  1. la confirmación por escrito de la baja y de su fecha de efecto;', '  2. el cese de cualquier cargo;',
      '  3. la devolución de las cantidades abonadas por periodos posteriores a la baja.'];
  },
  identity: ({ you, c }) => [`Titular del contrato: ${you.name}`, `Dirección: ${you.address}`, `Email de contacto: ${you.email}`,
    `Código de cliente / número de contrato: ${you.customerId || '[a indicar]'}`,
    ...(c.url ? [`Contratado en: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Huella del texto aceptado (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Atentamente,', '', you.name, '', 'Firma _______________________', `Fecha ${today}`].join('\n'),
  footer: (refs) => ['—', 'Normativa de referencia:', ...refs.map((r) => `  · ${r}`), '',
    'Documento generado automáticamente por AnteFirma a partir de las condiciones',
    'analizadas. Revisa los datos entre corchetes antes de enviarlo. No constituye', 'asesoramiento legal.'].join('\n'),
  subject: { withdrawal: (p) => `Ejercicio del derecho de desistimiento — ${p}`, cancellation: (p) => `Baja del contrato — ${p}`, change_withdrawal: (p) => `Baja por modificación unilateral — ${p}` },
  refs: {
    withdrawal: ['Real Decreto Legislativo 1/2007 (TRLGDCU), arts. 102-108 — derecho de desistimiento en contratos a distancia',
      'Anexo B del TRLGDCU — modelo de formulario de desistimiento', 'Directiva 2011/83/UE'],
    cancellation: ['Real Decreto Legislativo 1/2007, art. 62 — la baja, sin obstáculos y por el mismo medio que el alta',
      'Real Decreto Legislativo 1/2007, arts. 85-87 — cláusulas abusivas sobre duración y prórroga'],
    change_withdrawal: ['Real Decreto Legislativo 1/2007, art. 85.3 — modificación unilateral sin motivos válidos',
      'Directiva 93/13/CEE, anexo, punto 1, letras j) y l)'],
  },
};

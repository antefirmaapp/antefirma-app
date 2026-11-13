/**
 * The letters in "pt": see ../letter.js for how they are put together.
 *
 * Portugal: Decreto-Lei 24/2014 (distance contracts) and the general contract terms law.
 */
import { service, orderDate, noticeOf, when } from './shared.js';

export default {
  ph: { name: '[Nome completo]', address: '[Morada]', email: '[E-mail]', provider: '[Fornecedor]', service: '[descrição do serviço]', date: '[data]' },
  estimated: (x) => `(compromisso estimado ${x})`,
  header: ({ you, provider, today }) => [you.name, you.address, you.email, '', `Ao cuidado de ${provider}`,
    '[Morada do fornecedor / e-mail indicado nas condições]', '', `Local e data: ______________, ${today}`, '',
    'Enviada por: ☐ carta registada com aviso de receção   ☐ formulário online   ☐ e-mail'].join('\n'),
  withdrawal: (k) => ['Assunto: exercício do direito de livre resolução', '', 'Exmos. Senhores,', '',
    'Venho por este meio comunicar que resolvo o contrato de prestação',
    `do serviço ${service(k)}, celebrado em ${orderDate(k)}.`, '',
    'Exerço o direito de livre resolução previsto para os contratos celebrados à distância, no prazo',
    'de catorze dias a contar da celebração do contrato, sem necessidade de indicar o motivo e sem custos.', '',
    'Solicito, por isso:', '  1. a cessação imediata do serviço e de qualquer cobrança associada;',
    '  2. o reembolso de todos os pagamentos recebidos no prazo de catorze dias a contar da receção',
    '     desta comunicação, pelo mesmo meio de pagamento;', '  3. a confirmação por escrito da receção desta comunicação.'],
  cancellation: (k) => {
    const notice = noticeOf(k.c), deadline = when(k.c.deadlineAt, k.fmt), renewal = when(k.c.renewalAt, k.fmt);
    return ['Assunto: denúncia do contrato — oposição à renovação automática', '', 'Exmos. Senhores,', '',
      `Venho por este meio denunciar o contrato relativo a ${service(k)},`, `celebrado em ${orderDate(k)}.`, '',
      renewal ? `Esta comunicação destina-se a impedir a renovação do contrato em ${renewal},`
        : 'Esta comunicação destina-se a impedir a renovação automática do contrato no seu termo,',
      notice ? `respeitando o pré-aviso de ${notice} dias previsto nas condições${deadline ? ` (data limite: ${deadline})` : ''}.`
        : 'respeitando o pré-aviso previsto nas condições do contrato.', '',
      'Solicito, por isso:', '  1. a confirmação por escrito da receção desta comunicação e da data em que produz efeitos;',
      '  2. a cessação de qualquer cobrança a partir dessa data;',
      '  3. o detalhe dos montantes que considerem ainda devidos, com indicação da cláusula de que resultam.', '',
      'Não aceitarei qualquer cobrança relativa a períodos posteriores à data indicada.'];
  },
  change: (k) => {
    const ch = (k.c.changes || []).slice(-1)[0];
    return ['Assunto: resolução do contrato por alteração unilateral das condições', '', 'Exmos. Senhores,', '',
      `Verifiquei uma alteração das condições do contrato relativo a ${service(k)},`, `face às que aceitei em ${orderDate(k)}.`, '',
      ch?.summary ? `Em particular: ${ch.summary}` : 'A alteração incide sobre o preço ou as condições do serviço.', '',
      'Não aceitando as novas condições, resolvo o contrato com efeitos imediatos,',
      'sem penalizações nem encargos, por se tratar de uma alteração unilateral', 'que não solicitei.', '',
      'Solicito, por isso:', '  1. a confirmação por escrito da cessação do contrato e da respetiva data;', '  2. a cessação de qualquer cobrança;',
      '  3. o reembolso dos montantes pagos por períodos posteriores à cessação.'];
  },
  identity: ({ you, c }) => [`Titular do contrato: ${you.name}`, `Morada: ${you.address}`, `E-mail de contacto: ${you.email}`,
    `Número de cliente / contrato: ${you.customerId || '[a preencher]'}`,
    ...(c.url ? [`Contratado em: ${c.url}`] : []),
    ...(c.snapshot?.hash ? [`Impressão digital das condições aceites (SHA-256): ${c.snapshot.hash.slice(0, 32)}…`] : [])].join('\n'),
  signature: ({ you, today }) => ['Com os melhores cumprimentos,', '', you.name, '', 'Assinatura _______________________', `Data ${today}`].join('\n'),
  footer: (refs) => ['—', 'Referências legais úteis:', ...refs.map((r) => `  · ${r}`), '',
    'Documento gerado automaticamente pelo AnteFirma a partir das condições analisadas.',
    'Verifique os dados entre parênteses retos antes de enviar. Não constitui aconselhamento jurídico.'].join('\n'),
  subject: { withdrawal: (p) => `Exercício do direito de livre resolução — ${p}`, cancellation: (p) => `Denúncia do contrato — ${p}`, change_withdrawal: (p) => `Resolução por alteração unilateral — ${p}` },
  refs: {
    withdrawal: ['Decreto-Lei n.º 24/2014, arts. 10.º a 17.º — direito de livre resolução nos contratos à distância',
      'Decreto-Lei n.º 24/2014, Anexo, parte B — formulário de livre resolução', 'Diretiva 2011/83/UE'],
    cancellation: ['Decreto-Lei n.º 446/85 (cláusulas contratuais gerais), arts. 21.º e 22.º — cláusulas proibidas',
      'Lei n.º 24/96 (Lei de Defesa do Consumidor), art. 9.º — proteção dos interesses económicos'],
    change_withdrawal: ['Decreto-Lei n.º 446/85, art. 22.º, n.º 1, alíneas c) e d) — alteração unilateral das condições ou do preço',
      'Diretiva 93/13/CEE, anexo, ponto 1, alíneas j) e l)'],
  },
};

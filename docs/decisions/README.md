# Decisões, hipóteses e pendências

Decisões registradas em 27/09/2026; contexto de acesso à VPS atualizado em 28/09/2026. PF-003 autorizou somente a fundação local PF-010–012; decisões de arquitetura não autorizam outras etapas.

| Registro | Decisão |
|---|---|
| [ADR-001](001-base-e-escopo.md) | Base menor com reaproveitamento seletivo e receitas |
| [ADR-002](002-processamento-e-isolamento.md) | Monólito, fila em Postgres, isolamento por conta e resultados incertos explícitos |
| [ADR-003](003-meta-e-distribuicao.md) | Instagram Login direto, uso próprio primeiro e distribuição auto-hospedada |
| [ADR-004](004-onboarding-meta-e-gate.md) | Um app operacional, conexões separadas e gate de eventos reais; ressalva de acesso aos webhooks |
| [ADR-005](005-autenticacao-administrativa.md) | Seleção de Better Auth para PF-014, ainda sem implementação ou conexão |

## Perguntas que dependem do usuário

| ID | Informação | Efeito / tratamento enquanto pendente |
|---|---|---|
| Q1 | Quais 2–3 fluxos reais do ManyChat e resultados desejados por conta? | Parcial: três prints documentam um fluxo ativo da @somoskyber, e o usuário informou que os demais seguem padrão semelhante. Faltam exemplos específicos da @igor_cferreira e prioridade de resposta pública/botão/follow gate no primeiro piloto; não confirmar equivalência ou economia |
| Q2 | Categoria Creator/Business/consumer, gestão e visibilidade de cada conta; app Meta existente, rota, modo, níveis e papéis/aceites? | Parcial: @igor_cferreira e @somoskyber aparecem como “Profissional pública” segundo o usuário. Faltam subtipo técnico Creator/Business, gestão, app/papéis/níveis/subscriptions, integrações de DM concorrentes e interlocutor de teste sem papel; nenhum token necessário |
| Q3 | Volume diário/pico, assinatura atual e valor do tempo de manutenção? | Estimativas conservadoras; não há ROI confirmado |
| Q4 | Aceita GitHub como login administrativo? Qual licença deseja para o PersonaFlow? | GitHub aceito pelo usuário em 27/09/2026; implementação PF-014 ainda não autorizada. Licença não escolhida nem aplicada |
| Q5 | Domínio/subdomínio, folga contratada da VPS e canal de alertas existente? | Parcial em 28/09/2026: usuário informou acesso SSH com senha como root; print mostra `id -u` = `0` e Ubuntu 24.04.4 LTS. Falta inventário de capacidade/serviços/proxy/backups, domínio e alertas. Inspeção remota não autorizada; detalhes em OPERACAO. Não bloqueia MVP local fictício |
| Q6 | Retenção proposta atende à operação e quem será contato de privacidade? | Confirmar antes de dados reais; 90 dias de conteúdo é proposta, não obrigação legal |

Q1 e Q2 receberam respostas parciais em 27/09/2026; detalhes em [PRODUTO](../PRODUTO.md). As demais informações ficam agrupadas para a etapa em que alterem decisões, sem exigir formulário extenso agora.

## Hipóteses e gatilhos de revisão

- H1: um operador, duas contas, até 1.000 eventos/dia, sem picos conhecidos. Revisar capacidade e UX após medir.
- H2: receitas simples resolvem o uso principal. Reabrir escopo apenas com fluxo concreto não atendido.
- H3: PostgreSQL comporta fila e dados. Provar atomicidade/recuperação em PF-011; reavaliar se incompatibilidade ou carga medida justificar.
- H4: autenticação administrativa via provedor existente é aceitável. Alternativa não deve exigir SMTP pago sem necessidade.
- H5: outra pessoa utilizará instalação própria, não cadastro no app de Igor. Se mudar, aprovação Meta, privacidade e identidade passam a outro escopo.

## Bloqueios e pendências técnicas

**Para implementação além de PF-010–012:** nova autorização do usuário. **Antes de investir no produto completo:** elegibilidade das contas, configuração do app e plano de validação Meta (PF-001/002 e PF-002-B), seguido de prova técnica real em PF-013 quando autorizada. O acesso padrão é previsto para uso próprio em fontes gerais, mas o guia de webhooks lista requisitos adicionais: D-META-01 em [META_ONBOARDING](../META_ONBOARDING.md). Nem acesso nem eventos estão validados aqui.

**Antes do piloto:** login escolhido, assinatura e OAuth provados, rotas de exclusão, política de privacidade, isolamento/duplicidade/pausa testados e ambiente HTTPS de teste. **Antes de produção:** inventário real, restore, alertas, domínio e autorização de deploy. **Antes de terceiros no mesmo app:** revisão/permissões/verificação e escopo revisto.

Pendências específicas: versão Graph fixada para o piloto (v25.0 aparece nos exemplos consultados, não foi declarada “a mais recente”); habilitação/revisão de Human Agent caso necessário (janela de 7 dias confirmada no overview relido); comportamento de ecos e mensagens enviadas pelo app nativo; eventos de interlocutores externos em Standard Access e D-META-01; identificação de story; autorização de PF-014 e revisão das licenças/dependências antes da publicação. Botão, resposta pública e follow gate foram observados/solicitados pelo usuário; prioridade e viabilidade real permanecem em PF-100/PF-104.

Nenhum desses pontos autoriza scraping ou contorno. Bloqueio de uma conta não deve ser resolvido usando a credencial da outra.

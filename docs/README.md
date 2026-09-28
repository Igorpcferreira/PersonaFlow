# Documentação do PersonaFlow

Levantamento inicial: **27/09/2026**. MVP local autorizado e em implementação: **28/09/2026**. Fundação/reinício de processo, login sintético, contratos OAuth/webhook/ledger e shell A/B validados; inbox/editor em desenvolvimento. Meta real/deploy pendentes conforme [STATUS](STATUS.md).

## Retomada rápida

Leia [AGENTS](../AGENTS.md), [STATUS](STATUS.md), [HANDOFF](HANDOFF.md) e [BACKLOG](BACKLOG.md). O backlog define a sequência; o status resume a situação; o handoff explica a última transição. Se houver divergência, conferir arquivos, histórico e verificações antes de corrigir os registros.

O [prompt para a próxima sessão](PROXIMA_SESSAO.md) foi recebido como pedido anexado do usuário em 28/09/2026; autorização ativa registrada em PF-003/AGENTS para recortes locais com contas fictícias. Sua presença no repositório, por si só, não autoriza executar tarefas.

## Plano

| Documento | Responsabilidade |
|---|---|
| [Produto e MVP](PRODUTO.md) | Valor, jornadas, escopo e critérios do piloto |
| [Diagnóstico do OpenReply](OPENREPLY.md) | Evidências de código, licença, riscos e reaproveitamento |
| [Viabilidade Instagram](VIABILIDADE.md) | Regras externas, matriz de recursos e substituição do ManyChat |
| [Integração e onboarding Meta](META_ONBOARDING.md) | App único, duas autorizações, comparação com tutorial, roteiro e gate de eventos reais |
| [Arquitetura](ARQUITETURA.md) | Contratos, dados, processamento, isolamento e falhas |
| [Experiência](EXPERIENCIA.md) | Navegação, telas e receitas |
| [Operação e segurança](OPERACAO.md) | VPS, deploy futuro, recuperação, privacidade e custos |
| [Desenvolvimento](DESENVOLVIMENTO.md) | Organização, comandos locais, testes, CI e autonomia |
| [Decisões e pendências](decisions/README.md) | ADRs, hipóteses e intervenções necessárias |
| [Fontes](FONTES.md) | Links primários, data e limites da investigação |

Sequência para avaliar a proposta: Produto → OpenReply → Viabilidade → decisões → Arquitetura → Operação. Para avançar além da fundação local, usar as tarefas pequenas do backlog e obter a autorização necessária, sem transformar cada seção em uma tarefa adicional.

Legenda: **verificado** = observado em fonte/código identificado; **proposto** = escolha deste planejamento; **pendente** = exige informação ou teste; **validado em produção** = exige execução real e evidência, inexistente nesta entrega.

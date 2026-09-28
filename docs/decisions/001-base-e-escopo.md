# ADR-001 — Base menor e receitas

Data: 27/09/2026. Estado: adotada no planejamento.

Contexto: OpenReply implementa muito do domínio, mas modelo, worker, workspaces, provedores e tracking excedem duas contas e um operador. Inbox persistente e pausa por conversa ainda precisam de trabalho. Evidências em [OPENREPLY](../OPENREPLY.md).

Decisão: criar base menor na família TypeScript/Next/PostgreSQL e importar componentes pequenos com testes e atribuição. Manter duas receitas, inbox e diagnóstico. Sem canvas, equipes, cobrança ou IA generativa.

Alternativas: fork integral reduz o tempo até uma demo, mas herda operação e fluxos inadequados; começar do zero integral perde parsers e casos de borda já conhecidos.

Consequência: não teremos a UI completa upstream imediatamente; ganhamos limites mais claros para manutenção solo. Cada importação deve demonstrar economia e não arrastar subsistemas excluídos. Reabrir somente se a prova de extração mostrar que um fork mínimo exige menos manutenção com os mesmos critérios de segurança.

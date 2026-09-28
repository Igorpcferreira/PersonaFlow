# Estado atual

Atualizado em **28/09/2026**. Fase: **MVP local autorizado; fundação revalidada e PF-014-L em andamento.** Pedido anexado do usuário autoriza correções PF-010–012 e recortes PF-014–017-L, PF-020–026-L, PF-100-L/PF-104-L com duas contas fictícias. UI simulada antes de PF-013 expressamente permitida. Escopo em PF-003/[AGENTS](../AGENTS.md); contas/apps reais, envio externo, VPS/DNS, deploy/push e custos novos fora do escopo.

## Implementado e validado localmente

- PF-010–012: Next.js/TypeScript/Node 24, Prisma 7.10.0/PostgreSQL 16/pg-boss 12.35.0. URLs apenas loopback personaflow_*, sem query/fragmento e com caminho estrito. FKs compostas e consultas escopadas, duas contas fictícias e credenciais independentes. Evento/job atômicos no mesmo banco.
- PF-011-R (28/09): supervisão da fila ativa. Processo filho faz claim, é encerrado por SIGKILL; outro PID recupera o mesmo UUID de job após expiração e persiste o evento processado, retry_count > 0. Não há transporte de envio: prova de unknown após possível aceite pertence a PF-017-L.
- Em 28/09: npm ci, geração Prisma, check (lint/tipos/9 unitários), 5 integrações com PostgreSQL real e build aprovados. Configuração ausente recusada por setup/migração com mensagem sanitizada. Audit completo e omit-dev: zero após overrides fixos mysql2 3.24.4/deepmerge-ts 8.0.2; compatibilidade validada nos comandos acima. Detalhes em [DESENVOLVIMENTO](DESENVOLVIMENTO.md).
- Git local criado para preservar a base preexistente (`6e8030b`), sem push. PROXIMA_SESSAO ausente no disco foi restaurado do anexo como registro histórico. A mensagem do usuário concede a autorização, não o arquivo.

## Trabalho atual e limites

PF-014-L: implementar Better Auth 1.7.6/Prisma com provedor sintético, sessão persistida, allowlist por ID imutável, logout e CSRF. GitHub configurado sem criar app/credencial nem conectar conta real. Demonstração somente modo local explícito e loopback; recusar mecanismo fora desse modo. Próximos: PF-015–017-L, depois UI simulada e receitas. Ainda sem inbox/editor funcional.

**Validação local:** comandos e PostgreSQL reais conforme acima. **Providers:** ainda não validados, somente recortes sintéticos planejados. **CI remoto:** workflow presente, sem execução remota. **Meta real:** não implementada/testada; nenhum gate externo concluído por fixtures.

## Pendências externas preservadas

- PF-001 parcial: prints @somoskyber e pedido de editor por reel; ambas contas informadas como “Profissional pública”. Faltam subtipo Creator/Business, gestão/app e detalhes @igor_cferreira. GitHub aceito para login administrativo. Textos reais não bloqueiam fixtures.
- PF-002/002-B, D-META-01 e PF-013 pendentes: modo/permissões/subscriptions e prova real em duas contas exigem outra autorização. Story real tem gate próprio. Ver [META_ONBOARDING](META_ONBOARDING.md).
- VPS: acesso root com senha já disponível ao usuário, print id -u = 0/Ubuntu 24.04.4 LTS; agente não inspecionou. Capacidade/serviços/proxy/backups/domínio pendentes. PF-031 e deploy fora do goal.
- OpenReply apenas analisado estaticamente no commit fixado; nada importado. PF-000/004 validados somente como documentação. ESLint 9.39.5 em fim de suporte, sem aviso de vulnerabilidade no audit atual; atualização major avaliada futuramente com Next.

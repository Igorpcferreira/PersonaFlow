# Estado atual

Atualizado em **28/09/2026**. Fase: **MVP local autorizado; fundação, PF-014–017-L, PF-020–023-L básicos, PF-026-L e PF-024/100/104-L validados; PF-025-L em andamento.** Pedido anexado do usuário autoriza correções PF-010–012 e recortes PF-014–017-L, PF-020–026-L, PF-100-L/PF-104-L com duas contas fictícias. UI simulada antes de PF-013 expressamente permitida. Escopo em PF-003/[AGENTS](../AGENTS.md); contas/apps reais, envio externo, VPS/DNS, deploy/push e custos novos fora do escopo.

## Implementado e validado localmente

- PF-010–012: Next.js/TypeScript/Node 24, Prisma 7.10.0/PostgreSQL 16/pg-boss 12.35.0. URLs apenas loopback personaflow_*, sem query/fragmento e com caminho estrito. FKs compostas e consultas escopadas, duas contas fictícias e credenciais independentes. Evento/job atômicos no mesmo banco.
- PF-011-R (28/09): supervisão da fila ativa. Processo filho faz claim, é encerrado por SIGKILL; outro PID recupera o mesmo UUID de job após expiração e persiste o evento processado, retry_count > 0. Não há transporte de envio: prova de unknown após possível aceite pertence a PF-017-L.
- Em 28/09: npm ci, geração Prisma, check (lint/tipos/9 unitários), 5 integrações com PostgreSQL real e build aprovados. Configuração ausente recusada por setup/migração com mensagem sanitizada. Audit completo e omit-dev: zero após overrides fixos mysql2 3.24.4/deepmerge-ts 8.0.2; compatibilidade validada nos comandos acima. Detalhes em [DESENVOLVIMENTO](DESENVOLVIMENTO.md).
- Git local criado para preservar a base preexistente (`6e8030b`), sem push. PROXIMA_SESSAO ausente no disco foi restaurado do anexo como registro histórico. A mensagem do usuário concede a autorização, não o arquivo.

## Trabalho atual e limites

PF-014-L validado: Better Auth/Prisma 1.7.6 com OAuth sintético, sessão PostgreSQL, allowlist por ID imutável, logout/expiração/CSRF/state/PKCE/replay e concorrência. GitHub configurado com placeholders e bloqueado. Local explícito/loopback; produção/locked recusam o provedor. npm ci/geração/check (17 unitários), 10 integrações reais, 2 E2E Chromium e build aprovados. Auditoria zero; demo/demo:stop executados e processos encerrados. Login visual inspecionado.

PF-015-L validado: OAuth/tokens canônicos sintéticos sem rede, state vinculado a sessão/conta, identidades explícitas, AES-256-GCM com contexto da conexão, geração e lease persistida. Replays, expiração, scopes, chave/conta erradas, concorrência, resposta tardia, rotação e A alterada sem afetar B testados. Geração/check (19 unitários), integração (17 PostgreSQL reais) e build aprovados em 28/09.

PF-016-L validado: webhook local assinado nos bytes, app único, subscription sintética por conta/geração, parser com campos aditivos, dedup durável e evento/job atômicos. Falha PostgreSQL real reverte lote A/B e responde 503. Check (24 unitários), 20 integrações reais, 2 E2E de regressão e build aprovados. Documentação Meta pública retornou HTTP 429 nesta consulta; formato real continua pendente, sem substituir fonte primária por tutoriais de terceiros.

PF-017-L validado: ledger por efeito, reserva serializada, revalidação de prazo/janela/geração/token/revisão/controle/limite, retries antes do envio comprovado e unknown terminal. Crash de processo após aceite fake persistido: novo PID, uma tentativa/efeito e zero novas chamadas. Manutenção/heartbeat por conta. Check (24 unitários), 30 integrações reais, 2 E2E e build aprovados.

PF-020-L validado: shell com Aurora/Jardim, rotas/APIs autenticadas, seleção explícita, no-store/abort/componente e rascunho por conta. Seed inicial/repetido preserva dados, `demo:seed` implementado/executado duas vezes pelo E2E. Check (24), 31 integrações reais, 4 E2E e build aprovados; screenshot inspecionado.

PF-021-L validado: inbox persistente, thread paginada/ordenada, echo/tipos indisponíveis e histórico parcial. Janela monotônica, data futura limitada e geração obsoleta sem elegibilidade. UI simula DM via bytes assinados/webhook/fila; replay sem duplicação, API cruzada/CSRF negados. Check (24), 34 integrações reais, 5 E2E e build aprovados; screenshot/diff/links revisados.

PF-022-L validado: assumir/retomar/manual pela UI/API, requestId escopado/persistido até confirmação, janela/controle no servidor e aceito/incerto/falhou sem retry unknown. Check (24), 37 integrações reais, 6 E2E + caso isolado de resposta perdida após commit, build aprovado. Lista de controle e screenshot revisados; console/pageerror sem erros.

PF-023-L básico validado: editor/rascunho/prévia/ativação por reel, textos/termos/link editáveis, matcher Unicode, conflito/revisão/pausa/geração e decisão/intenção/job na transação da inbox. Check (26), 41 integrações PostgreSQL, E2E focado e build aprovados; screenshot/console/diff/links revisados. Botão/follow ainda recusam ativação até PF-104-L; pública local liberada em PF-100-L. Cache Next gerado com conteúdo duplicado foi preservado em QA e regenerado; rodada limpa passou.

PF-026-L validado: diagnóstico sanitizado por conta, heartbeat/idades de fila/jobs, conexão/token/subscription, limite/cooldown/unknown terminal. Ações autenticadas/CSRF e cancelamento transacional de pendentes em expiração/revogação/reconexão; refresh mantém regra 24 h. Check (26), 45 integrações PostgreSQL, 10 E2E completos e build aprovados. Campo de limite bloqueado enquanto ação atualiza; screenshot/diff/links revisados. A limitada/alterada preserva B.

PF-100-L validado: pública fake configurável, intenção própria, idempotência/revisão/pausa/A-B e falha pública independente da privada. Trigger PostgreSQL no job público reverte ambos os efeitos/mensagem/processedAt; reentrega produz uma vez cada. Check (26), 49 integrações, 3 E2E focados e build aprovados; screenshot/console/diff revisados. Inbox distingue tipos de efeito; campos de edição/manual bloqueados durante ação para preservar texto.

PF-104-L validado: sequência persistida, botão/introdução independentes, consulta fictícia de perfil por consentimento/interação elegíveis e revalidação antes do link. False pede seguir; unknown/erro retêm link; mudar perfil sozinho não envia nem abre janela. Link existente nunca ganha retry, inclusive unknown/blocked. Check (26), 59 integrações PostgreSQL, 12 E2E completos e build aprovados; screenshots/diff/console revisados.

PF-024-L validado: DM/story textuais no editor/matcher, echo/sem texto ignorados, PARAR/SAIR persistidos e pendentes automáticos cancelados atomicamente. Pausa/manual prevalecem; supressão sobrevive a entradas/geração futuras. Check (27), 65 integrações PostgreSQL, E2E focado e build aprovados; screenshot/console/diff revisados. Organização/métricas PF-025-L em andamento e fechamento persistente ainda pendente.

**Validação local:** comandos e PostgreSQL reais conforme acima. **Providers:** login sintético Better Auth validado sem rede; GitHub/Meta reais pendentes. **CI remoto:** workflow inclui preparação do navegador/E2E, sem execução remota. **Meta real:** não implementada/testada; nenhum gate externo concluído por fixtures.

## Pendências externas preservadas

- PF-001 parcial: prints @somoskyber e pedido de editor por reel; ambas contas informadas como “Profissional pública”. Faltam subtipo Creator/Business, gestão/app e detalhes @igor_cferreira. GitHub aceito para login administrativo. Textos reais não bloqueiam fixtures.
- PF-002/002-B, D-META-01 e PF-013 pendentes: modo/permissões/subscriptions e prova real em duas contas exigem outra autorização. Story real tem gate próprio. Ver [META_ONBOARDING](META_ONBOARDING.md).
- VPS: acesso root com senha já disponível ao usuário, print id -u = 0/Ubuntu 24.04.4 LTS; agente não inspecionou. Capacidade/serviços/proxy/backups/domínio pendentes. PF-031 e deploy fora do goal.
- OpenReply apenas analisado estaticamente no commit fixado; nada importado. PF-000/004 validados somente como documentação. ESLint 9.39.5 em fim de suporte, sem aviso de vulnerabilidade no audit atual; atualização major avaliada futuramente com Next.

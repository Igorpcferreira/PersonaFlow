# Backlog executável

Atualizado: 28/09/2026, autorização do MVP local recebida nesta sessão. IDs estáveis; a ordem abaixo orienta retomada. **Planejado não significa autorizado.** PF-000 e PF-004 estão concluídas apenas como documentação; PF-003 registra o escopo vigente. Tarefas podem ser divididas com sufixos sem renumerar as demais. Evidências reais devem ser anexadas à linha/tarefa quando executadas.

[PROXIMA_SESSAO](PROXIMA_SESSAO.md) registra o prompt recebido no anexo do usuário em 28/09/2026: recortes locais `-L` de PF-014–017, PF-020–026, PF-100/PF-104 autorizados, com exceção ao gate PF-013 apenas para demonstração simulada. Pendências externas dos pais permanecem; validação local não prova Meta real.

## Fase 0 — Fechar bloqueios de acesso e escopo

| ID / prioridade / estado | Entrega delimitada | Dependências | Critérios de aceitação |
|---|---|---|---|
| PF-000 / P0 / validado (documental) | Levantamento e plano inicial | — | Documentos conectados, commit upstream fixado, fontes Meta consultadas, estado verdadeiro. Evidência: HANDOFF; nenhum produto validado |
| PF-001 / P0 / em andamento: resposta parcial | Registrar fluxos prioritários e categorias das duas contas | Respostas do usuário | Em 27/09/2026: prints de um fluxo real @somoskyber (comentário `site` → resposta pública → DM/botão → link), padrão geral informado e desejo de configurar cada automação pela interface por reel; @igor_cferreira e @somoskyber descritas como “Profissional pública”. Faltam subtipo Creator/Business, gestão e exemplos específicos de @igor_cferreira; confirmar prioridade de resposta pública, botão e follow gate. Nenhum segredo no registro |
| PF-002 / P0 / planejado | Conferir configuração do app Meta disponível | PF-001; acesso ao painel quando fornecido | Ficha individual A/B com papéis/aceites, categoria/gestão, rota, scopes concedidos, ID profissional conciliável e subscriptions; registrar app/mode por alias; sem valores de segredo e sem criar/mudar app sem autorização |
| PF-002-B / P0 / planejado | Resolver gate de publicação/acesso documental do app | PF-002; acesso autorizado ao painel | Para comments/messages: modo, nível por scope, restrições/exigências do painel e necessidade de review/verificação; confrontar D-META-01. Se não resolvido, registrar bloqueio e evidência; teste real permanece PF-013 |
| PF-003 / P0 / validado (autorização do MVP local) | Autorizar próxima fase concreta | Usuário | Fundação autorizada em 27/09/2026. Em 28/09/2026, pedido anexado recebido como solicitação de execução do goal: correções PF-010–012 e recortes PF-014–017-L, PF-020–026-L, PF-100-L/PF-104-L, dependências fixas, testes/serviços isolados, migrações personaflow_* em loopback, documentação pública e Git local sem push. UI fictícia antes de PF-013 expressamente autorizada. Sem contas/apps reais, envio externo, VPS/DNS, produção, deploy, push ou custos novos |
| PF-004 / P0 / validado (documental) | Complemento de onboarding Meta e tutorial | PF-000 | Artefatos locais lidos sem retranscrição; M12–M18 e O1/O2 consultados; guia e ADR-004, D-META-01, matriz de fluxos e experimento especificados. Nenhuma integração executada |

## Fase 1 — Fundação verificável local

| ID / prioridade / estado | Entrega delimitada | Dependências | Critérios de aceitação |
|---|---|---|---|
| PF-010 / P0 / validado localmente | Bootstrap e contratos de comandos/configuração | PF-003 | Versões fixas e lockfile; `.env.example` sem credencial; config rejeita destino inválido sem ecoar valor; comandos e workflow de CI presentes; Better Auth selecionada na ADR-005. Instalação, lint, tipos, 5 unitários e build passaram localmente em 27/09/2026. CI remoto não executado; ver evidência abaixo |
| PF-011 / P0 / validado parcialmente: atomicidade e recriação de instância | Prova Postgres + fila transacional | PF-010 | PostgreSQL 16 real: teste prova rollback de evento + job via adaptador Prisma/pg-boss; commit persiste após recriar a instância pg-boss no mesmo processo; exceção do handler deixa evento não processado. Encerramento/reinício de processo e recuperação após crash de claim ainda sem evidência. Sem transporte externo nesta fase; ver evidência abaixo |
| PF-012 / P0 / validado localmente | Modelo mínimo e isolamento | PF-011 | Duas contas fictícias e credenciais separadas; FKs compostas e consultas escopadas; teste negativo cruzado no serviço e banco passou em PostgreSQL real; ver evidência abaixo |
| PF-014 / P0 / planejado, recorte local autorizado | Login administrativo restrito | PF-010; escolha GitHub aceita em 27/09/2026 | Allowlist por ID, sessões/logout/CSRF testados, cadastro externo negado, ausência de secret em cliente; sem OAuth Instagram como login do operador. PF-014-L autorizado; criação de app/credenciais externas fora do escopo |

### Evidências PF-010–012 (27/09/2026)

- Artefatos: `package.json`, `package-lock.json`, `.env.example`, `.github/workflows/ci.yml`, `prisma/schema.prisma`, migração `202609270001_foundation`, `src/shared/config.ts`, `src/jobs/queue.ts`, `src/modules/accounts/service.ts` e `tests/`.
- `npm ci`, `npm run db:generate`, `npm run lint`, `npm run typecheck`, `npm test` (5/5), `npm run test:integration` (4/4 em PostgreSQL 16 efêmero) e `npm run build`: sucesso local. `npm run setup`: sucesso com URL sintética local; sem URL terminou com erro sanitizado e código 1. `npm run db:migrate` sem URL também recusou com código 1 antes de tocar banco. A integração executou `db:migrate` e aplicou a migração antes dos testes. `npm run dev` serviu a página mínima por HTTP 200 em loopback.
- O rollback consulta `pgboss.job` por UUID e observa zero jobs, além de zero eventos. A recuperação para e recria a instância pg-boss **dentro do mesmo processo** antes de processar o evento confirmado. O título do teste cita reinício de processo, mas seu código não encerra/reinicia um processo do sistema operacional. A exceção simulada do handler observa evento não processado; não existe adaptador de envio nem asserção de chamadas externas nesta fase. Crash após claim e reenvio ambíguo não foram provados. Reforço incluído na próxima autorização proposta, sem alterar o código nesta preparação.
- CI configurado, sem execução remota ou link de run. `npm audit` local de 27/09/2026 apontou quatro avisos altos na cadeia do Prisma 7.10.0, também com `--omit=dev` pelo peer opcional; revisão registrada em DESENVOLVIMENTO. Nenhuma integração Meta, conta real ou deploy validado. Não houve reexecução dos testes da aplicação em 28/09/2026.

## Fase 2 — Provar integração antes da UI completa

| ID / prioridade / estado | Entrega delimitada | Dependências | Critérios de aceitação |
|---|---|---|---|
| PF-015 / P0 / planejado | Adaptador Meta, OAuth e tokens | PF-012, PF-014 | State de uso único/sessão, scopes mínimos, `user_id` distinto de `id` sem fallback silencioso, cifragem/vencimento por conexão; testes fake de replay/revogação/refresh e reconexão só de A. Registrar origem dos trechos reaproveitados |
| PF-016 / P0 / planejado | Webhook durável | PF-011, PF-012 | Assinatura nos bytes com secret do app identificado, parsing estrito, lote de duas contas, subscription individual, reentrega única, ACK após commit, falha DB sem ACK; fixtures sintéticas |
| PF-017 / P0 / planejado | Ledger e executor de envios | PF-015, PF-016 | Chaves privadas/manuais/DM, estados e prazo, limite por conta, timeout → unknown; concorrência e crash testados; transporte fake por padrão |
| PF-013-A / P0 / planejado | Preparar ambiente mínimo do experimento | PF-003; domínio/inventário/alterações autorizados; PF-015–017 para execução | URLs exatas de OAuth/webhook/deauth/exclusão, páginas públicas adequadas, HTTPS isolado na VPS preferencialmente, secrets fora de logs e plano de pausa; aprovação específica antes de qualquer deploy. Não exige UI completa |
| PF-013 / P0 / planejado | Prova real mínima em duas contas | PF-001, PF-002-B, PF-013-A, PF-015–017; autorização de teste real | Executar E0–E9 de META_ONBOARDING; comments e messages reais nas duas contas, audiência sem papel, recepção confirmada e isolamento; story tem gate próprio. Token/GET/Test do painel não aprovam. Relatório sanitizado com modo/níveis por evento |

PF-013 não é “teste de documentação”. Exige código mínimo seguro e autorização posterior. Falha externa não deve ser escondida como sucesso de fixture. A exceção de PF-003 permite o MVP exclusivamente em simulação local antes da prova real.

PF-002-B é o gate de requisitos; PF-013 é o gate de comportamento real. Se o painel exigir review para webhooks próprios, preparar submissão mínima segura e aguardar aprovação, sem habilitar terceiros ou contratar intermediário automaticamente. PF-013-A reaproveita o inventário de PF-031 se disponível, mas não depende do produto completo: apenas do alvo de experimento seguro e autorizado.

## Fase 3 — Fluxos do MVP

| ID / prioridade / estado | Entrega delimitada | Dependências | Critérios de aceitação |
|---|---|---|---|
| PF-020 / P0 / planejado | Shell e troca de conta | PF-012, PF-014, PF-013 | Conta em rota/header/composer; resposta tardia e rascunho não vazam; teste E2E de troca durante requisição |
| PF-021 / P0 / planejado | Inbox recebida persistente | PF-016, PF-020 | Lista e thread por conta, IDs únicos, echo identificado, ordem por timestamp, histórico parcial e tipos indisponíveis indicados; paginação local |
| PF-022 / P0 / planejado | Controle manual e envio de texto | PF-017, PF-021 | Assumir cancela pendentes, corrida serializada, dupla submissão única, janela no servidor, aceito/incerto/falhou visíveis; E2E + integração |
| PF-023 / P0 / planejado | Receita comentário → DM configurável por reel | PF-013, PF-017, PF-020, PF-022 | Formulário guiado por conta/post/reel com palavra, DM e link editáveis, rascunho, preview e ativação; sem texto fixo do exemplo. Passos opcionais de resposta pública/botão/seguir só ativam após PF-100/PF-104 e prova Meta. Self-comment ignorado; conflito bloqueado; uma intenção por comentário entre regras |
| PF-024 / P1 / planejado | Receita DM e resposta textual a story | PF-023 | Echo/sem texto não disparam; PARAR/SAIR suprime; pausa prevalece; fixture story + caso real antes de declarar stories suportados |
| PF-025 / P1 / planejado | Organização e métricas mínimas | PF-021–024 | Aberta/resolvida, nota por conta, métricas sem contar retry como novo envio, datas/filtros e denominadores claros |
| PF-026 / P0 / planejado | Diagnóstico e manutenção de conexão | PF-015–017 | Heartbeat, idade de fila, expiração, reconexão e limite; outra conta segue operando; nenhum retry de unknown pela UI |

## Fase 4 — Preparação operacional e piloto

| ID / prioridade / estado | Entrega delimitada | Dependências | Critérios de aceitação |
|---|---|---|---|
| PF-030 / P0 / planejado | Retenção, exclusão e privacidade | PF-012, PF-022; Q6 | Purga testada, supressão/replay seguro, exclusão cancela jobs, callback/instruções Meta conforme app, aviso e canal; restore reaplica exclusões |
| PF-031 / P0 / planejado, acesso informado | Inventário de VPS e pacote de deploy | Q5; autorização da inspeção; PF-010 | Em 28/09/2026, usuário informou login SSH como root e enviou print com `id -u` = `0`; nenhum acesso remoto do agente. Inventário de capacidade/serviços/proxy/backups e domínio continuam pendentes, sem autorização de inspeção. Critérios: inventário de leitura, orçamento e portas confirmados; Compose isolado, limites/healthchecks, imagem imutável e plano de rollback; não executar deploy |
| PF-032 / P0 / planejado | Ensaio de backup/restore | PF-011, PF-030, PF-031 | Restore em ambiente isolado, chave recuperável, envio desabilitado, teste de ledger antigo, medição RPO/RTO e relatório curto |
| PF-033 / P0 / planejado | Revisão de publicação | PF-023–026, PF-030; licença escolhida | Licença, atribuições, dependências, varredura de secrets, demo sintética e instruções testadas; não presumir publicação remota autorizada |
| PF-034 / P0 / planejado | Deploy e piloto controlado | PF-032/033; autorização de produção | Revisão final de alvo, proxy e backup, alertas externos, 14 dias e critérios do PRODUTO; nenhuma alteração em projetos vizinhos; resultado por conta |
| PF-035 / P1 / planejado | Decidir substituição do ManyChat | PF-034; Q1/Q3 | Comparar fluxos atendidos, custo/tempo e falhas; decisão do usuário sobre assinatura, sem cancelamento automático |

## Extensões e gates adicionais

| ID / estado | Possível entrega | Gate para considerar |
|---|---|---|
| PF-100 / solicitado no fluxo real, prioridade pendente | Resposta pública opcional e configurável por reel | Prints da @somoskyber mostram uso ativo; confirmar necessidade no primeiro piloto, campos editáveis no formulário, efeito idempotente independente e suporte Meta real |
| PF-101 / adiado | Tracking de links | Decisão concreta baseada em clique; privacidade e bots avaliados |
| PF-102 / adiado | Human Agent | Confirmar política/janela e aprovação oficial, necessidade de atendimento fora de 24 h |
| PF-103 / adiado | Conectar terceiros no mesmo app | Novo escopo autorizado, Advanced Access e requisitos empresariais atendidos |
| PF-104 / solicitado, prova pendente | Provar sequência configurável com botão e opção de seguir antes do link | Prints da @somoskyber mostram botão ativo e controle Pro de seguir desligado; usuário quer configurar por reel. Confirmar prioridade do primeiro piloto; verificar private reply/template, postback versus URL/quick reply, janela e consentimento de perfil; testar true/false/unknown, sem loop ou envio por leitura. Requer autorização posterior e prova Meta real |

Não há tarefa escondida para billing, canvas, outros canais ou IA. Tamanho maior que uma entrega coerente deve ser dividido antes de executar. Tempo externo de aprovação não entra como estimativa de desenvolvimento; não há data de entrega prometida.

## Recortes locais autorizados — 28/09/2026

Uma entrega coerente por vez; pais mantêm critérios reais pendentes. Transporte sem capacidade de envio externo.

| ID / estado | Entrega e verificações previstas | Dependências locais |
|---|---|---|
| PF-011-R / validado localmente | Em 28/09: npm ci, geração, check (9 unitários), integração (5 em PostgreSQL 16 real) e build aprovados. SIGKILL após claim, PID distinto, mesmo UUID de job e retry_count > 0. Supervisão ativa; URL sem query/fragmento e caminho estrito; audit completo/omit-dev zero após overrides. Diff revisado. CI remoto/Meta não executados | PF-003 |
| PF-014-L / em andamento | Better Auth/Prisma 1.7.6, GitHub sem rede, provedor sintético em modo explícito loopback; testar allowlist imutável, sessão persistida/reinício, logout, CSRF, state/PKCE/replay e recusa fora do modo local. Sem UI completa até PF-017-L | PF-011-R |
| PF-015-L / planejado | OAuth sem rede, state único/sessão, cifragem/versionamento/revogação por conexão | PF-014-L |
| PF-016-L / planejado | Bytes assinados, lote A/B, dedup durável, evento/job atômicos, falha DB sem ACK | PF-015-L |
| PF-017-L / planejado | Ledger/executor fake, concorrência, janela/prazo, pausa, limites, crash/timeout unknown sem reenvio | PF-016-L |
| PF-020-L / planejado | Shell/troca A/B, rotas autenticadas, cache/rascunhos/respostas tardias isolados; E2E | PF-017-L |
| PF-021-L / planejado | Inbox persistida/thread, paginação, echo/ordem/histórico parcial | PF-020-L |
| PF-022-L / planejado | Assumir/retomar, envio fake idempotente, pausa concorrente e janela no servidor | PF-021-L |
| PF-023-L / planejado | Editor por reel: termos/textos/link, rascunho/edição/prévia/simulação/ativação; conflitos/self-comment | PF-022-L |
| PF-026-L / planejado | Diagnóstico por conta, heartbeat/fila/conexão/limite/unknown sem retry | PF-017-L, PF-020-L |
| PF-100-L / planejado | Resposta pública fake opcional com ledger próprio/idempotência | PF-023-L |
| PF-104-L / planejado | Botão fake com efeito próprio, follow true/false/unknown; consentimento/rechecagem elegíveis; sem polling | PF-100-L |
| PF-024-L / planejado | DM/story sintéticos, echo ignorado, PARAR/SAIR/supressão/pausa | PF-104-L |
| PF-025-L / planejado | Aberta/resolvida/notas/filtros/métricas por intenção | PF-024-L |

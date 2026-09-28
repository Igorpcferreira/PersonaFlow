# Handoff

Atualizado em **28/09/2026** durante o goal autorizado do MVP local. Ler AGENTS → README → STATUS → este arquivo → BACKLOG; conferir Git/processos antes de repetir comandos. Não há autorização de Meta real, contas reais, VPS, deploy, push ou custos novos. Não imprimir configurações privadas em .local-postgres.

## Estado confirmado

PF-011-R e PF-014-L validados; commits locais preservam fundação, reparos e login sintético. PF-015-L validado nesta rodada: migração `202609280002_connections`, state por sessão/conta, identidades user_id/id explícitas, TokenVault AES-256-GCM com nonce/AAD/versão, geração e refresh lease persistida. Rotação/reconexão/revogação de A preservam B. Respostas OAuth/refresh tardias não substituem a nova conexão. Nada copiado do OpenReply.

`npm run db:generate`, `npm run check` (19 unitários), `npm run test:integration` (17 com PostgreSQL 16 real) e `npm run build`: sucesso. A migração foi aplicada em banco efêmero validado; fetch dos testes não foi chamado. PF-014-L também passou instalação, 2 E2E Chromium e start/stop persistente. CI apenas configurado; GitHub/Meta reais pendentes.

## Trabalho atual

PF-016-L validado: migração `202609280003_webhook`, HMAC bytes originais/app único, parser/fixtures canônicos sintéticos, subscription por conta/geração, lote A/B, dedup durável e evento/job na mesma transação. Trigger PostgreSQL isolado da fixture causou rollback de todo lote e 503; reparo/reentrega confirma commit antes do ACK. Check (24 unitários), 20 integrações reais, 2 E2E e build passaram. Segredos exclusivos de simulação gerados/preservados pelo supervisor, nunca enviados ao cliente. Nova rota `/api/local-webhook` somente local-demo/loopback. Documentação Meta pública retornou 429; contratos reais pendentes.

PF-017-L validado: migração `202609280004_ledger`, ledger/intenção/job/tentativa/efeito fake, FKs compostas e idempotência própria por efeito. Reserva serializa conta→conversa e revalida geração/token/revisão/controle/prazo/janela/limite. Manual exige assumir; retomar não descarrega pendentes antigos. Unknown nunca retorna a pending. Filho morto após aceite fake confirmado no banco; outro PID marca unknown, uma tentativa/efeito, zero novas chamadas. Check (24 unitários), 30 integrações reais, 2 E2E e build passaram. Worker somente synthetic, com manutenção de pending seguro/sending órfão e heartbeat por conta.

Interferência entre arquivos de integração (schema/filas/trigger compartilhados) causou timeouts; runner agora usa --no-file-parallelism. Corridas essenciais continuam concorrentes dentro dos casos, sem aumentar prazos/remover asserções. Rodada corrigida aprovada e processos filhos encerrados.

PF-020-L validado: seed A/B transacional e repetível sem sobrescrever dados, shell/troca explícita, páginas/API autenticadas, no-store, abort e componente por accountId. Rascunho no localStorage com chave da conta; futuras conversas terão chave adicional. Check (24), 31 integrações reais, 4 E2E e build passaram. Screenshot .local-tools/qa/account-shell.png inspecionado. E2E repetiu seed via controle do supervisor duas vezes. Falha no seletor de alerta (Next também cria route announcer) corrigida por filtro de texto, sem mudar UI/critério. Supervisor/browser/banco encerrados após testes.

PF-021-L validado: migração `202609280005_inbox`, processInboxEvent no worker, contato/conversa/mensagem por conta, thread/lista paginadas, ordem/echo/tipo indisponível/histórico parcial. Janela monotônica; comentário/echo/sem texto e geração obsoleta não abrem. UI e `/simulate-event` autenticados: server assina fixture, persiste via webhook e worker processa. Check (24), 34 integrações reais, 5 E2E e build passaram; screenshot .local-tools/qa/inbox.png inspecionado. Último ajuste de geração revalidado em check/integração. Diff sem erros; 22 Markdown com links locais resolvendo.

PF-022-L em andamento: próxima ação segura é API/UI assumir/retomar, send manual com requestId persistido e janela no servidor, estados de intenção/tentativa visíveis (sem retry unknown). Reutilizar ledger/control já testados, validar dupla submissão e isolamento/CSRF no navegador. Depois editor PF-023-L, diagnóstico/extensões/DM-story/métricas. Nenhuma falha pendente. Pais/gates PF-001/002/002-B/D-META-01/PF-013 abertos; fixtures não comprovam Meta real.

Scripts `demo`/`demo:stop` preservam dados em .local-postgres/demo e encerram somente processos próprios. E2E usa namespace próprio. Não apagar pasta persistente nem relaxar loopback/Host. Se houver run.lock, verificar supervisor antes de agir. Ao interromper, registrar arquivos incompletos, falha e próximo comando aqui.

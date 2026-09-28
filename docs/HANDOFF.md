# Handoff

Atualizado em **28/09/2026** durante o goal autorizado do MVP local. Ler AGENTS → README → STATUS → este arquivo → BACKLOG; conferir Git/processos antes de repetir comandos. Não há autorização de Meta real, contas reais, VPS, deploy, push ou custos novos. Não imprimir configurações privadas em .local-postgres.

## Estado confirmado

PF-011-R e PF-014-L validados; commits locais preservam fundação, reparos e login sintético. PF-015-L validado nesta rodada: migração `202609280002_connections`, state por sessão/conta, identidades user_id/id explícitas, TokenVault AES-256-GCM com nonce/AAD/versão, geração e refresh lease persistida. Rotação/reconexão/revogação de A preservam B. Respostas OAuth/refresh tardias não substituem a nova conexão. Nada copiado do OpenReply.

`npm run db:generate`, `npm run check` (19 unitários), `npm run test:integration` (17 com PostgreSQL 16 real) e `npm run build`: sucesso. A migração foi aplicada em banco efêmero validado; fetch dos testes não foi chamado. PF-014-L também passou instalação, 2 E2E Chromium e start/stop persistente. CI apenas configurado; GitHub/Meta reais pendentes.

## Trabalho atual

PF-016-L validado: migração `202609280003_webhook`, HMAC bytes originais/app único, parser/fixtures canônicos sintéticos, subscription por conta/geração, lote A/B, dedup durável e evento/job na mesma transação. Trigger PostgreSQL isolado da fixture causou rollback de todo lote e 503; reparo/reentrega confirma commit antes do ACK. Check (24 unitários), 20 integrações reais, 2 E2E e build passaram. Segredos exclusivos de simulação gerados/preservados pelo supervisor, nunca enviados ao cliente. Nova rota `/api/local-webhook` somente local-demo/loopback. Documentação Meta pública retornou 429; contratos reais pendentes.

PF-017-L em andamento: implementar ledger/intenção/tentativa e executor somente fake. Revalidar geração/revisão/controle/janela/prazo/limite no momento da reserva; idempotência por efeito. Provar concorrência, pausa serializada, limite A/B, retry apenas antes do envio, timeout/crash após possível aceite → unknown sem reenvio. Próxima ação segura: schema/serviços/testes PostgreSQL e filho real para crash, antes da UI completa. Não há falha pendente nos testes anteriores. Os pais e gates PF-001/002/002-B/D-META-01/PF-013 permanecem abertos; fixtures não comprovam integração real.

Scripts `demo`/`demo:stop` preservam dados em .local-postgres/demo e encerram somente processos próprios. E2E usa namespace próprio. Não apagar pasta persistente nem relaxar loopback/Host. Se houver run.lock, verificar supervisor antes de agir. Ao interromper, registrar arquivos incompletos, falha e próximo comando aqui.

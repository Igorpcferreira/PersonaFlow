# Handoff

Sessão ativa em **28/09/2026**, goal MVP local incompleto. Autorização recebida no anexo, registrada em PF-003/AGENTS: correções PF-010–012 e recortes PF-014–017-L, PF-020–026-L, PF-100-L/PF-104-L. UI fictícia antes de PF-013 permitida. Contas/apps reais, envio externo, VPS/DNS, deploy/push e custos novos fora do escopo. Nenhuma delegação.

## Estado real

- Git local: `6e8030b` preserva base anterior; `571d51e` registra reparo PF-011-R/escopo. Sem push. PROXIMA_SESSAO restaurado do anexo, estava ausente no disco.
- PF-011-R validado: instalação/check (9 unitários), 5 integrações PostgreSQL real e build. Processo filho encerrado após claim; PID distinto recupera mesmo job, retry_count > 0. Supervisão ativa e URL local sem parâmetros/fragmentos/caminhos adicionais. Overrides mysql2 3.24.4/deepmerge-ts 8.0.2, Prisma mantido 7.10.0; audit zero completo/omit-dev.
- PF-014-L implementado, fechamento em execução: Better Auth/Prisma 1.7.6; provedor OAuth sintético, state/PKCE, código hash com DELETE RETURNING, allowlist por subject imutável, sessão/expiração/logout/CSRF. GitHub configurado com placeholders e bloqueado no handler, cadastro/linking/endpoints extras negados. Modo local explícito, loopback; produção recusa local-demo.
- Migração `202609280001_operator_auth` adiciona User/Session/Account/Verification/LocalOAuthGrant. Somente bancos locais isolados migrados. UTC no pool Prisma e timestamptz no prazo do grant corrigem comparação de expiração.
- Scripts demo/demo:stop iniciam/param banco persistente personaflow_demo, web/worker em loopback. Chaves/configuração na pasta ignorada .local-postgres/demo, não imprimir. E2E usa namespaces próprios. Browser Chromium baixado apenas para .local-tools/playwright. CI inclui preparação do browser/E2E; sem execução remota.

## Verificações recentes

17 unitários e 10 integrações reais aprovados; build aprovado sem banco/segredo. Dois E2E Chromium aprovados: login/sessão após recarga/logout/API protegida e loading/erro. Screenshot .local-tools/qa/login.png inspecionado, sem corte/overlap. Start/stop da demonstração executados e nenhum processo demo/worker/postgres do projeto observado após encerramento.

Falhas corrigidas: URLs relativas nos asserts; fuso do adaptador Prisma; destino externo de login; Next injeta x-forwarded-* e normaliza URL interna de loopback. Guards agora exigem Host original exato, porta/protocolo iguais e valores locais exatos dos headers; comando web vincula 127.0.0.1. Não remover guard nem ampliar bind. Testes de prazo/concorrrência/replay e E2E passaram após os reparos. Diagnóstico HTTP temporário removido.

Reprodução final em andamento: célula exec/session **50581** executa npm ci → geração → check → integração → E2E → build. Registrar resultado antes de validar PF-014-L. Últimas mudanças de shutdown ainda nessa rodada. Se retomado em outra sessão, verificar processos/estado em vez de confiar no ID de sessão.

## Próxima ação segura

Fechar PF-014-L com diff/documentação/resultado dessa rodada; commit local opcional. Iniciar PF-015-L (somente uma entrega em andamento): state OAuth ligado a sessão/conta, identidade user_id versus id sem fallback, cifragem/versionamento por conexão, refresh/revogação/reconexão sintéticos sem rede e testes PostgreSQL. Depois webhook/ledger PF-016/017-L; UI completa só após seus contratos. Pais Meta e PF-001/002/002-B/D-META-01/PF-013 permanecem abertos. Acesso root VPS disponível ao usuário, sem inspeção do agente.

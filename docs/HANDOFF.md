# Handoff

Atualizado em **29/09/2026**. **Goal do MVP local concluído.** Ler AGENTS → README → STATUS → este arquivo → BACKLOG; conferir Git/processos antes de executar novos comandos. A autorização foi concedida pelo pedido anexado do usuário, registrado em PF-003/PROXIMA_SESSAO; não pelo backlog.

## Estado confirmado

Correções PF-010–012/PF-011-R e recortes PF-014–017-L, PF-020–026-L, PF-100-L/PF-104-L implementados e validados localmente. Dois contextos fictícios: Aurora/Jardim. Better Auth/sessão PostgreSQL, OAuth/tokens e webhook sintéticos, pg-boss/ledger/executor fake, inbox/manual, editor por reel/DM/story, pública/botão/seguir/link, organização/notas/filtros/métricas e diagnóstico. Nove migrações; a última acrescenta organizationVersion.

Nada importado do OpenReply. Git local preserva a base preexistente e as entregas em commits. Em 29/09, o usuário solicitou publicar tudo para continuidade do sócio no repositório público `Igorpcferreira/PersonaFlow`. Nenhum app/conta real, envio externo, VPS/DNS, produção/deploy ou custo novo. Os pais/gates PF-001/002/002-B, D-META-01 e PF-013 continuam pendentes; fixtures não comprovam Meta/GitHub reais.

## Evidências finais após reinstalação

- `npm ci`, geração Prisma, `npm run check`: sucesso, 27 unitários, lint/tipos sem erro.
- `npm run test:integration`: 70 casos em 16 arquivos, PostgreSQL 16 real isolado, nove migrações aplicadas. Atomicidade/FKs/corridas/rollback/recuperação de processo, controles/janelas/token/limites/supressão e métricas testados.
- `npm run test:e2e`: 14 jornadas Chromium completas; conta/rascunho/resposta tardia, login/inbox/manual, editor/pública, sequência true/false/unknown/erro, diagnóstico/notas/filtros/CSRF/IDs cruzados. Sem erros de console/pageerror observados.
- `npm run test:restart`: receita criada/editada pela UI, comentário assinado/fila, follow unknown→false→true e link; B manual unknown/nota/resolvida, A pausada, B rascunho. Stop/start real de supervisor/PostgreSQL com PIDs distintos. Sessão/snapshots preservados; seed e replay mantêm cinco tentativas/efeitos, unknown não reenvia.
- `npm run demo`: ambiente padrão servido em 127.0.0.1:3000 (HTTP 200), API sem sessão HTTP 401; `demo:seed` e `demo:stop` aprovados. Banco preservado, zero run.lock ao fim.
- `npm run build`: sucesso sem configuração/segredo de banco na shell.
- Audit completo e omit-dev: zero vulnerabilidades. Setup/migração sem URL recusaram com exit 1 sanitizado. Avisos npm de ESLint em fim de suporte/allow-scripts registrados em DESENVOLVIMENTO; binários reais validados pelos comandos acima.
- Screenshots em .local-tools/qa (incluindo recipe/sequence/diagnostics/organization/restart) inspecionados. Diff revisado; 22 Markdown com links locais resolvendo. Nenhum arquivo privado rastreado. Busca por padrões conhecidos de credenciais: zero; não é detector completo.
- CI inclui geração/checks/PostgreSQL/E2E/restart/build, **apenas configurado**, sem execução remota. Resultados individuais e datas no BACKLOG/STATUS.

## Decisões e limites que precisam sobreviver à retomada

Conta explícita em escrita/job/log. Lock de conta antes de conversa; evento/mensagem/decisão/intenção/job atômicos. Revisão/controle/geração/prazo/janela/token/quota revalidados antes da reserva. Somente falha comprovada antes do envio admite retry limitado; unknown/rejeição confirmada são terminais. Crash de filho após efeito fake e novo PID sem segunda chamada também comprovados em PF-017-L.

Follow usa fixture por conta/contato, nunca verdade fornecida pelo postback. Consentimento/interação elegíveis habilitam consulta; false pede seguir, unknown/erro retêm link. Alterar perfil sozinho não consulta/envia/abre janela. Reserva só consulta após demais condições e quota permitirem; manutenção não vira polling. Link existente conserva terminal, inclusive blocked/unknown. Nova sequência é necessária se uma condição mudar e bloquear o link.

PARAR/SAIR completos persistem supressão/cancelam automáticos, inclusive durante pausa/manual; nova entrada/reconexão/seed não removem. Organização tem versão própria, sem alterar controle/supressão. Atualizar conversa conserva edição da nota em memória; nota não salva é descartada ao recarregar/trocar conversa. Rascunho manual/pedido usam localStorage por conta/conversa, requestId preservado até ACK.

Métricas por intenção/coorte criada no período; entradas por recebimento, sem echo. Datas inclusivas UTC−03:00, 2020–2099. Estado/manual/busca filtram só a lista. Taxa aceitas/(aceitas+falhas confirmadas); demais estados fora e visíveis, sem inventar taxa vazia. Tentativas não são novos envios; aceite fake não comprova entrega.

Integrações rodam --no-file-parallelism por schema/filas/trigger compartilhados; corridas essenciais continuam dentro dos casos. Falhas anteriores de keys/aria/cache Next foram corrigidas; cache corrompido preservado em .local-tools/qa/next-dev-corrupt-*. Não ocultar indicador de erro nem ampliar prazos para esconder falha. No ensaio de restart, Chromium é importado após definir pasta; página fecha durante parada deliberada e reabre no mesmo contexto/cookies, mantendo guard zero. Limites de ação/navegação 15/30 s, sem espera ilimitada.

## Próxima ação segura

Para demonstrar: `npm run demo`, abrir http://127.0.0.1:3000 e entrar como operador fictício. Instruções completas em DESENVOLVIMENTO. Parar com `npm run demo:stop`; dados privados ficam em .local-postgres/demo, não imprimir/apagar. Serviços deste trabalho foram encerrados.

Não iniciar nova implementação/integração externa a partir do backlog. Próxima fase real depende de nova autorização e dos gates preservados. AGENTS e esses documentos orientam sessões; não agendam agentes nem garantem execução em segundo plano.

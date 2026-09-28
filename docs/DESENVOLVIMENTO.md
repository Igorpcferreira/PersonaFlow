# Desenvolvimento e continuidade

O protocolo obrigatório está em [AGENTS](../AGENTS.md). Este documento define a organização e os meios de comprovar resultados; não duplica a memória de sessão.

## Organização e recorte atual

```text
src/
  app/                    # páginas e rotas finas
  modules/
    accounts/             # conexão e escopo de conta
    inbox/                # conversas e controle manual
    automations/          # receitas e matcher
    delivery/             # política, intenções e resultados
  integrations/meta/      # OAuth, webhook e adaptador HTTP
  jobs/                   # handlers e entrada do worker
  shared/                 # DB, config, auth e logs; sem depósito genérico
prisma/                   # schema e migrações
tests/
  fixtures/meta/          # payloads sintéticos versionados
  integration/            # PostgreSQL real e transport fake
  e2e/                    # jornadas críticas
docs/                     # documentação já existente
```

PF-010–012 criaram apenas `src/app` mínimo, `src/shared`, `src/modules/accounts`, `src/jobs`, `prisma`, `scripts` e testes unitários/de integração. O restante da árvore acima ainda é proposta. Regras puras ficam próximas ao módulo, sem framework nem rede. Rotas futuras farão autenticação, validação e chamada de serviço; não duplicarão regras do worker.

Na importação seletiva do OpenReply, registrar origem e modificações; mover função com testes úteis, evitando importar toda a árvore. Contratos externos têm fixtures por tipo/versão, incluindo campos desconhecidos para tolerar evolução aditiva sem disparar ações inesperadas.

## Contrato de comandos

Node.js 24 e npm 11 são pré-requisitos. As dependências diretas estão fixadas em `package.json` e resolvidas em `package-lock.json`. `.env.example` contém placeholders, sem credencial real. O setup e a migração aceitam somente URL PostgreSQL de loopback para banco `personaflow_*`; a integração usa banco `personaflow_test*`. Variáveis são lidas de `.env` quando presente. Scripts do OpenReply não foram copiados.

| Comando | Estado e responsabilidade |
|---|---|
| `npm ci` | Implementado: instalação pelo lockfile |
| `npm run setup` | Implementado: Node/config local e geração do cliente; não conecta ao banco |
| `npm run dev` | Implementado: página mínima local, sem fluxos de produto |
| `npm run worker:dev` | Implementado: processa eventos locais, sem transporte de envio |
| `npm run db:migrate` | Implementado: migração apenas para URL local validada |
| `npm run lint` / `npm run typecheck` | Implementados: qualidade estática |
| `npm test` | Implementado: configuração inválida e sanitização, sem rede Meta |
| `npm run test:integration` | Implementado: PostgreSQL 16 efêmero local ou `TEST_DATABASE_URL` local, transação/fila/isolamento |
| `npm run test:e2e` | Planejado para tarefas de interface; fora de PF-010–012 |
| `npm run build` | Implementado: build da página mínima sem migração ou Meta |
| `npm run check` | Implementado: lint, tipos e unitários; CI acrescenta integração e build |

Os testes de PF-012 criam duas contas fictícias e credenciais de bytes sintéticos. Webhook, transporte fake, 429 e demais cenários externos pertencem às tarefas posteriores. Nenhum código atual pode enviar à Meta. Para Meta real futuramente, endpoint HTTPS de teste separado; não usar VPS de produção como ambiente de desenvolvimento.

## Estratégia proporcional de testes

| Risco | Verificação que fornece evidência |
|---|---|
| Conta errada | Integração: trocar IDs em todas as rotas; FKs rejeitam relações cruzadas; cache/UI não exibem resposta tardia de outra conta |
| Webhook forjado | Bytes alterados, ausência de assinatura, tamanho inválido e secret errado não geram evento elegível/job |
| Perda de evento aceito | Commit + ACK; derrubar worker; reiniciar e processar. Rollback do evento não deixa job órfão |
| Duplicidade | Reentrega concorrente, regras coincidentes e duplo clique geram uma intenção; retenção de job não apaga dedup de negócio |
| Envio ambíguo | Simular aceite externo seguido de timeout/crash; não ocorrer nova chamada automática |
| Janela | Relógio falso: imediatamente antes, no limite e depois de 24 h/7 dias; webhook tardio e fora de ordem não reabrem janela |
| Pausa manual | Pausa concorre com reserva; após confirmação não há nova reserva automática; envio já em trânsito é identificado |
| Limites | Duas contas em paralelo: A limitada não bloqueia B; orçamento atômico, cooldown e retries limitados |
| Tokens | Refresh concorrente, revogação, escopo faltante, expiração e rotação de chave; nenhuma credencial em erro/log |
| Restore | Banco restaurado não reenvia jobs que podem ter sido enviados após o backup; exclusões reaplicadas |

Não buscar cobertura de linhas como substituto dessas propriedades. Testes de integração usam Postgres real para transação, unicidade e concorrência; mocks de Prisma não bastam. Testes fake provam comportamento do software, não permissões, entrega de webhooks ou políticas efetivamente aplicadas à conta.

CI por PR configurado em `.github/workflows/ci.yml`: instalação pelo lockfile, geração Prisma, lint, tipos, unitários, serviço PostgreSQL 16/migração, integração e build. Sem Meta/VPS nem deploy automático. E2E, detector de secrets e revisão completa de licenças ficam para as tarefas pertinentes; não foram executados. O workflow ainda não rodou remotamente. A auditoria local de npm em 27/09/2026 encontrou quatro avisos altos na cadeia do Prisma 7.10.0 (`prisma`, `@prisma/config`, `deepmerge-ts`, `mysql2`). `npm audit --omit=dev` ainda reporta os quatro por causa do peer opcional de `@prisma/client`. A correção automática sugerida era downgrade major para Prisma 6.19.3, que exigiria revalidar o adaptador; não aplicá-la cegamente. Revisar antes de publicação.

## Evidência de conclusão

Backlog usa `planejado`, `bloqueado`, `em andamento`, `implementado` e `validado`. Implementado significa artefato presente, ainda sem todas as verificações; validado exige resultado dos critérios e ambiente indicado. Para tarefa exclusivamente documental, `validado` não significa produto funcionando.

Registrar comando, data, resultado e limitações em resumo curto na tarefa/handoff, com link a CI quando houver. Não guardar dumps de terminal. Não marcar Meta real como validada por fixture, screenshot do formulário ou documentação de fornecedor.

STATUS resume fase, fatos, bloqueios e próximo ID. HANDOFF substitui o resumo da sessão anterior e preserva somente trabalho incompleto relevante. ADR registra decisão durável e o motivo; não guardar debate de chat. Atualizar apenas os documentos afetados.

## Nova sessão

Para continuar só o planejamento: “Leia AGENTS.md e a memória operacional; resolva a próxima pendência documental, sem implementar”.

Quando o usuário decidir começar: “Autorizo implementação local da fase indicada no backlog, sem deploy nem custos novos. Leia AGENTS.md, STATUS e HANDOFF; escolha a primeira tarefa desbloqueada e execute seus critérios”. A autorização precisa vir do usuário, não desse exemplo.

Se a sessão terminar no meio, deixar tarefa em andamento, arquivos e falhas no HANDOFF, verificações faltantes e próxima ação concreta. Na retomada, validar o diff antes de repetir operações. Esses arquivos reduzem coordenação, mas não iniciam sessões automaticamente.

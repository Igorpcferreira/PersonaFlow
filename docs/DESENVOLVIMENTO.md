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

PF-010–012 criaram a fundação. PF-014-L acrescenta `src/shared/auth*`, rotas/página de login, schema/migração Better Auth, supervisor local e testes E2E. PF-015-L implementa `modules/accounts/connections.ts`, `token-vault.ts` e contrato/provider OAuth sintético em `integrations/meta/`. Inbox, automações, delivery e HTTP Meta real permanecem propostas até suas entregas. Regras puras ficam próximas ao módulo, sem framework/rede. Rotas autenticam, validam e chamam serviços; não duplicam regras do worker.

Na importação seletiva do OpenReply, registrar origem e modificações; mover função com testes úteis, evitando importar toda a árvore. Contratos externos têm fixtures por tipo/versão, incluindo campos desconhecidos para tolerar evolução aditiva sem disparar ações inesperadas.

## Contrato de comandos

Node.js 24 e npm 11 são pré-requisitos. As dependências diretas estão fixadas em `package.json` e resolvidas em `package-lock.json`. `.env.example` contém placeholders, sem credencial real. O setup e a migração aceitam somente URL PostgreSQL de loopback para banco `personaflow_*`; a integração usa banco `personaflow_test*`. Variáveis são lidas de `.env` quando presente. Scripts do OpenReply não foram copiados.

| Comando | Estado e responsabilidade |
|---|---|
| `npm ci` | Implementado: instalação pelo lockfile |
| `npm run setup` | Implementado: Node/config local e geração do cliente; não conecta ao banco |
| `npm run dev` | Implementado: página de login local; bind explícito 127.0.0.1; exige banco/config para autenticação |
| `npm run demo` | Implementado: supervisor inicia PostgreSQL 16 persistente personaflow_demo, aplica migrações validadas, web/worker loopback; gera dados de configuração locais sem imprimir segredos |
| `npm run demo:stop` | Implementado: pede parada autenticada ao supervisor; encerra árvore web/worker/banco, preserva dados. Ctrl+C também solicita parada |
| `npm run worker:dev` | Implementado: eventos locais; em local-demo usa executor fake, manutenção de intenções/heartbeat por conta; sem transporte externo |
| `npm run db:migrate` | Implementado: migração apenas para URL local validada |
| `npm run lint` / `npm run typecheck` | Implementados: qualidade estática |
| `npm test` | Implementado: configuração inválida e sanitização, sem rede Meta |
| `npm run test:integration` | Implementado: PostgreSQL 16 efêmero local ou `TEST_DATABASE_URL` local, transação/fila/isolamento |
| `npm run test:browser:install` | Implementado: Chromium/Playwright somente em .local-tools/playwright, sem instalação global |
| `npm run test:e2e` | Implementado e executado: executor inicia/encerra supervisor/banco próprios; 2 jornadas de login/estados no Chromium aprovadas em 28/09 |
| `npm run build` | Implementado: build sem migração/conexão/segredo; runtime de autenticação inicializado apenas em request |
| `npm run check` | Implementado: lint, tipos e unitários; CI acrescenta integração e build |

Os testes de PF-012 criam duas contas fictícias e credenciais de bytes sintéticos. PF-015-L usa grants e identidades sintéticos, tokens cifrados e PostgreSQL real; guard fetch comprova ausência de chamadas nos testes. PF-016-L implementa `/api/local-webhook` em loopback/local-demo, com chave exclusiva da simulação, limite 1 MiB, HMAC/UTF-8/parser e persistência atômica. `tests/fixtures/meta/batch.ts` é contrato sintético v1, sem garantia de wire format real. Inscrição fictícia separada por conta/geração; não chama subscribed_apps. PF-017-L implementa ledger/executor e FakeTransport: apenas grava SyntheticEffect no PostgreSQL, sem URL/chamada de rede. Aceite fake não significa entrega real. Nenhum código atual pode enviar à Meta. Para Meta real futuramente, endpoint HTTPS de teste separado; não usar VPS de produção como ambiente de desenvolvimento.

## Estratégia proporcional de testes

### Demonstração local

Após `npm ci` e `npm run db:generate`, executar `npm run demo` e abrir http://127.0.0.1:3000. O botão usa identidade fictícia e sessão Better Auth persistida. Nesta etapa só o login está implementado; contas, inbox/editor e transporte fake virão após PF-015–017-L. Parar com `npm run demo:stop` em outro terminal ou Ctrl+C no supervisor. Nenhuma URL/chave é impressa; .local-postgres/demo contém configuração privada e banco persistente, ambos ignorados por Git. Não apagar essa pasta para contornar falhas. Se outro supervisor detiver run.lock, verificar o processo/controle antes de qualquer intervenção.

Os E2E criam namespace e portas próprios; não usam personaflow_demo do usuário. `npm run test:browser:install` prepara o navegador no projeto antes de `npm run test:e2e`. Executor espera a web e sempre solicita parada do supervisor; não usa reset/limpeza dos dados persistentes. CI inclui integração, preparação do browser, E2E e build; configuração remota ainda sem execução.

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

CI por PR configurado em `.github/workflows/ci.yml`: instalação pelo lockfile, geração Prisma, lint, tipos, unitários, PostgreSQL 16/migração, integração, preparação Chromium, E2E e build. Sem Meta/VPS nem deploy automático; workflow ainda não rodou remotamente. E2E local executado desde PF-014-L. Detector de secrets/revisão completa de licenças não implementados. Os quatro avisos altos do audit de 27/09 foram corrigidos e revalidados em 28/09; detalhes abaixo.

Os arquivos de integração compartilham schema/filas e um teste instala trigger PostgreSQL temporário. Rodam sequencialmente (`--no-file-parallelism`); as concorrências essenciais permanecem em Promise.all dentro dos casos. A execução simultânea entre arquivos causou timeouts e shutdown bloqueado após ampliar o ledger; a rodada sequencial passou sem ampliar prazos ou remover asserções. Não confundir concorrência de fixtures com prova de concorrência dos serviços.

## Evidência de conclusão

### Revalidação de dependências — 28/09/2026

Prisma permanece em 7.10.0. Overrides fixos: `prisma → mysql2 3.24.4` (atualização na mesma major) e `@prisma/config → deepmerge-ts 8.0.2`. A versão 8 corrige recursão circular e muda principalmente merge de Maps; a inspeção de `@prisma/config/dist/index.js` observou uso de `deepmerge` como merger de configuração local, sem Maps no arquivo do projeto. A compatibilidade será aceita somente após geração, migração/integração e build. Não houve downgrade Prisma nem audit fix --force. Fontes primárias: [aviso DeepmergeTS](https://github.com/advisories/GHSA-ggr8-5vv4-36mx), [mudanças 8.0.0](https://github.com/RebeccaStevens/deepmerge-ts/releases/tag/v8.0.0) e [releases mysql2](https://github.com/sidorares/node-mysql2/releases), consultadas em 28/09/2026.

`npm ci` passou com lockfile atualizado; `npm audit` e `npm audit --omit=dev` retornaram zero vulnerabilidades. ESLint 9.39.5 emite aviso de fim de suporte, sem vulnerabilidade reportada; atualização major deve ser avaliada com os peers do Next, não aplicada automaticamente neste reparo. Scripts de instalação de cinco dependências tiveram aviso npm allow-scripts; as verificações reais confirmarão os binários usados. O `check` chama binários do projeto diretamente para evitar uma versão antiga de npm encontrada no PATH dos scripts npm aninhados desta máquina.

Backlog usa `planejado`, `bloqueado`, `em andamento`, `implementado` e `validado`. Implementado significa artefato presente, ainda sem todas as verificações; validado exige resultado dos critérios e ambiente indicado. Para tarefa exclusivamente documental, `validado` não significa produto funcionando.

Registrar comando, data, resultado e limitações em resumo curto na tarefa/handoff, com link a CI quando houver. Não guardar dumps de terminal. Não marcar Meta real como validada por fixture, screenshot do formulário ou documentação de fornecedor.

STATUS resume fase, fatos, bloqueios e próximo ID. HANDOFF substitui o resumo da sessão anterior e preserva somente trabalho incompleto relevante. ADR registra decisão durável e o motivo; não guardar debate de chat. Atualizar apenas os documentos afetados.

## Nova sessão

Para continuar só o planejamento: “Leia AGENTS.md e a memória operacional; resolva a próxima pendência documental, sem implementar”.

Quando o usuário decidir começar: “Autorizo implementação local da fase indicada no backlog, sem deploy nem custos novos. Leia AGENTS.md, STATUS e HANDOFF; escolha a primeira tarefa desbloqueada e execute seus critérios”. A autorização precisa vir do usuário, não desse exemplo.

Se a sessão terminar no meio, deixar tarefa em andamento, arquivos e falhas no HANDOFF, verificações faltantes e próxima ação concreta. Na retomada, validar o diff antes de repetir operações. Esses arquivos reduzem coordenação, mas não iniciam sessões automaticamente.

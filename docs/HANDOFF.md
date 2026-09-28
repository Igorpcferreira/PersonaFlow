# Handoff

Atualização documental em **28/09/2026**, a pedido do usuário para preparar o próximo chat. A autorização vigente continua limitada a PF-010, PF-011 e PF-012; nenhuma tarefa adicional foi implementada. A pasta inicial continha apenas Markdown; a ausência de `.git` foi reconfirmada nesta preparação. Não foi criado repositório Git nem feito push.

## Retomada preparada

- [PROXIMA_SESSAO](PROXIMA_SESSAO.md) contém o prompt `/goal` completo. Propõe MVP local com duas contas fictícias: PF-014–017, PF-020–026, PF-100/PF-104 divididas em recortes `-L`, com backend verificado antes da interface e transporte exclusivamente simulado. Inclui autorização explícita para UI simulada antes do gate real PF-013, sem resolver esse gate.
- **O arquivo é um rascunho, não autorização.** Somente quando o usuário enviar o prompt, registrar a nova mensagem em PF-003 e atualizar AGENTS/limites de migração para o recorte local. AGENTS não foi alterado nesta preparação. Não ativar goal por inferência nem implementar novas fases a partir deste arquivo.
- Próxima ação após receber a autorização: conferir árvore/lockfile, registrar o escopo e revalidar `npm ci`, `npm run db:generate`, `npm run check`, `npm run test:integration` e `npm run build`. Depois, reforçar recuperação de processo e tratar avisos corrigíveis, antes de PF-014-L. Não repetir os bloqueios históricos de sandbox como se fossem atuais: verificar as ferramentas e permissões disponíveis na nova sessão.
- Nesta preparação foram alterados apenas PROXIMA_SESSAO, READMEs da raiz e de docs, STATUS, HANDOFF e BACKLOG. Código e dependências foram inspecionados, sem testes da aplicação reexecutados. Os resultados abaixo são de **27/09/2026**.
- Validação documental de 28/09/2026: 22 arquivos Markdown, 64 links locais sem destino quebrado; bloco `/goal` presente. Revisão conferiu a distinção entre rascunho e autorização vigente e corrigiu o estado de PF-011 para validação parcial, conforme o teste existente. Próxima sessão deve completar a prova de reinício.

## Informação adicional de VPS — 28/09/2026

- O usuário informou possuir acesso com senha como `root` e forneceu print da sessão SSH, com `id -u` retornando `0` e banner Ubuntu 24.04.4 LTS. Acesso administrativo já realizado pelo usuário; não repetir a pergunta sobre disponibilidade desse acesso. A senha não foi recebida nem armazenada; não solicitar seu envio em chat. Endereço/hostname e print não foram copiados aos arquivos.
- Atualizados OPERACAO, decisions/README, PF-031 no BACKLOG, STATUS e o contexto do prompt PROXIMA_SESSAO. Nenhum comando remoto, instalação, atualização, reinício ou deploy foi realizado pelo agente. AGENTS e os limites de autorização permanecem inalterados.
- Capacidade/folga, serviços, proxy, backups, domínio e alertas ainda exigem inventário. A informação de login não autoriza PF-031: a próxima sessão pode continuar o MVP local com o prompt preparado; inventário remoto e deploy têm escopos separados. O banner do print indicava atualizações e reinício solicitados, sem conferência ao vivo.
- Após registrar esse contexto, conferidos 22 arquivos Markdown e 65 links locais, sem destinos quebrados. Alterações somente documentais; testes da aplicação não reexecutados.

## Novo contexto de produto

- Três prints mostram uma automação ManyChat ativa da @somoskyber: comentário `site` em post/reel específico, resposta pública, DM de apresentação, botão “Quero minha prévia” e mensagem posterior com link para WhatsApp. O controle Pro para seguir antes do link estava desligado; o usuário quer essa opção. E-mail e lembrete por clique estavam desligados. Prints não foram copiados ao repositório e não comprovam API Meta.
- O usuário esclareceu que configurará cada automação **pela interface, para cada reel**. PRODUTO, EXPERIENCIA, BACKLOG e META_ONBOARDING registram formulário guiado com textos e etapas editáveis. A proposta local permite simular resposta pública, botão e seguir antes do link; prioridade no piloto real e prova Meta de PF-100/PF-104 permanecem pendentes. Não pedir textos/links finais para desenvolver campos configuráveis com fixtures.
- @igor_cferreira e @somoskyber foram descritas como “Profissional pública”, sem comprovar subtipo Creator/Business. O usuário aceitou GitHub para login administrativo, mas não autorizou PF-014 nesta mensagem. PF-001 permanece parcial; Q1/Q2 e licença Q4 remanescente estão em decisions/README.

## Entrega

Bootstrap Next.js/TypeScript com versões fixas e lockfile, validação de URL local, exemplo sem credencial, comandos npm, CI configurado e seleção de Better Auth documentada na ADR-005. Prisma schema/migração com FKs compostas e credenciais por conta. Adaptador `executeSql` de pg-boss dentro de transação Prisma, worker local sem transporte de envio. Testes usam PostgreSQL 16 embutido isolado ou banco de teste de loopback informado por `TEST_DATABASE_URL`.

## Evidência e verificações

- `npm ci` e `npm run db:generate`: sucesso. `npm run lint`, `npm run typecheck`, `npm test` (5/5) e `npm run build`: sucesso local. `npm run test:integration`: 4/4 após `db:migrate` em PostgreSQL 16 real. `npm run dev` respondeu HTTP 200 em loopback; o processo foi encerrado após a verificação.
- Teste de rollback consulta a tabela real `pgboss.job` e observa zero jobs; teste de recuperação para e recria **instâncias pg-boss no mesmo processo**. Apesar do título do teste citar “reinício do processo”, não há processo filho encerrado/reiniciado nem crash após claim. O teste de falha lança exceção no handler e observa evento não processado; não há transporte nem asserção de chamadas de envio. Esses casos não provam recuperação após crash ou ausência de reenvio ambíguo. A próxima autorização proposta inclui reforçar essa evidência.
- Duas contas fictícias: consultas do serviço e FKs rejeitam relações cruzadas; credenciais distintas. Nas novas rotas/jobs/UI, testar também ausência de sessão, IDs de recursos iguais nas duas contas, accountId trocado, cache/rascunho e resposta tardia na troca de conta.
- `npm run setup` com URL sintética local gerou o cliente; sem URL saiu com código 1 e mensagem sanitizada. `npm run db:migrate` sem URL também recusou com código 1. Nenhum dado de conexão secreto foi registrado. Build não conecta ao banco ou à Meta.
- Workflow `.github/workflows/ci.yml` presente e YAML analisado localmente (1 job, 9 passos), ainda sem execução remota. Nenhuma integração Meta real, deploy, VPS, DNS, app externo ou conta real testada. Links locais dos 21 arquivos Markdown conferidos: zero quebrados; varredura limitada de padrões de segredo nos artefatos autorais sem correspondências.

## Limitações e próxima ação segura

- A máquina restringiu Docker/WSL; foi usado PostgreSQL embutido somente no projeto. No sandbox, `tsx` falhou em `os.userInfo` e a integração precisou da execução local fora dessa restrição. O teste passou com código 0. Um primeiro teste de credencial falhou por comparação `Uint8Array` versus `Buffer`; foi corrigido e a suíte passou integralmente.
- `npm audit` de 27/09/2026 apontou quatro avisos altos na cadeia do Prisma 7.10.0, inclusive com `--omit=dev` pelo peer opcional. A correção automática sugerida era downgrade major, que requer revalidar o adaptador. Detalhes em DESENVOLVIMENTO. Reconsultar antes de decidir; não aceitar o risco por omissão nem aplicar `--force` cegamente. Nenhum deploy autorizado.
- Sem nova implementação incompleta nesta preparação. Existe a limitação de evidência de recuperação descrita acima; não usar os títulos dos testes como prova mais ampla do que o código executa. Sem o envio do prompt pelo usuário, permanecer no escopo vigente. Subtipo/gestão/app das contas e prioridade no piloto continuam pendentes para integração real; licença, privacidade e infraestrutura serão decisões das etapas correspondentes, sem bloquear o MVP fictício proposto.

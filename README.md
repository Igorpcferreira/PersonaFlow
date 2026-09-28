# PersonaFlow

Fundação local de uma ferramenta auto-hospedada, exclusivamente para Instagram, planejada para duas contas independentes.

**Estado: fundação local PF-010–012 implementada e testada; prova de reinício de processo em PF-011 pendente.** Não há integração Meta, login administrativo, inbox ou interface funcional. A autorização atual não cobre outras tarefas de implementação, contas reais ou deploy.

Comece pelo [índice da documentação](docs/README.md). Para retomar com um agente, leia [AGENTS.md](AGENTS.md), [estado atual](docs/STATUS.md), [handoff](docs/HANDOFF.md) e [backlog](docs/BACKLOG.md).

O [prompt preparado para a próxima sessão](docs/PROXIMA_SESSAO.md) propõe um MVP local com dados fictícios e critérios verificáveis. Deve ser enviado pelo usuário para autorizar essa nova etapa; o arquivo não inicia execução.

## Execução local

Requer Node.js 24 e npm 11. `npm ci` instala as versões fixadas. Copie `.env.example` para `.env` e informe somente uma URL PostgreSQL **local** com banco `personaflow_*`; o exemplo contém placeholders. `npm run setup` valida a configuração e gera o cliente Prisma. `npm run db:migrate` aplica a migração somente depois de validar o destino local. `npm run dev` inicia a página mínima; `npm run worker:dev` processa eventos locais sem transporte de envio.

Verificações: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`. A integração cria e encerra um PostgreSQL 16 isolado e efêmero; com `TEST_DATABASE_URL` apontando a `personaflow_test*` em loopback, usa esse banco (como no CI). Não utilizar banco de outro projeto. `npm run check` agrega lint, tipos e unitários. Detalhes e evidências em [DESENVOLVIMENTO](docs/DESENVOLVIMENTO.md) e [STATUS](docs/STATUS.md).

O CI foi configurado em `.github/workflows/ci.yml`, mas não há execução remota registrada. O plano de produto e os bloqueios externos continuam na documentação.

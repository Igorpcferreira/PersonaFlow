# PersonaFlow

Fundação local de uma ferramenta auto-hospedada, exclusivamente para Instagram, planejada para duas contas independentes.

**Estado: MVP local autorizado em 28/09/2026; revalidação da fundação PF-010–012 em andamento.** Login, contratos e interface simulados serão implementados em recortes locais conforme BACKLOG. Contas/apps reais, integração Meta, VPS e deploy permanecem fora do escopo.

Comece pelo [índice da documentação](docs/README.md). Para retomar com um agente, leia [AGENTS.md](AGENTS.md), [estado atual](docs/STATUS.md), [handoff](docs/HANDOFF.md) e [backlog](docs/BACKLOG.md).

O [prompt preparado](docs/PROXIMA_SESSAO.md) foi recebido como pedido anexado nesta sessão; autorização registrada em PF-003/AGENTS. O arquivo sozinho não inicia execução.

## Execução local

Requer Node.js 24 e npm 11. `npm ci` instala as versões fixadas. Copie `.env.example` para `.env` e informe somente uma URL PostgreSQL **local** com banco `personaflow_*`; o exemplo contém placeholders. `npm run setup` valida a configuração e gera o cliente Prisma. `npm run db:migrate` aplica a migração somente depois de validar o destino local. `npm run dev` inicia a página mínima; `npm run worker:dev` processa eventos locais sem transporte de envio.

Verificações: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`. A integração cria e encerra um PostgreSQL 16 isolado e efêmero; com `TEST_DATABASE_URL` apontando a `personaflow_test*` em loopback, usa esse banco (como no CI). Não utilizar banco de outro projeto. `npm run check` agrega lint, tipos e unitários. Detalhes e evidências em [DESENVOLVIMENTO](docs/DESENVOLVIMENTO.md) e [STATUS](docs/STATUS.md).

O CI foi configurado em `.github/workflows/ci.yml`, mas não há execução remota registrada. O plano de produto e os bloqueios externos continuam na documentação.

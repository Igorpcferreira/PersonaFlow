# PersonaFlow

Fundação local de uma ferramenta auto-hospedada, exclusivamente para Instagram, planejada para duas contas independentes.

**Estado: contratos backend e shell A/B validados localmente em 28/09/2026; PF-021-L em andamento.** `npm run demo` inicia banco/web/worker, prepara Aurora/Jardim e permite entrar como operador fictício; `npm run demo:seed` repete a preparação sem sobrescrever trabalho e `npm run demo:stop` encerra preservando dados. Inbox/editor em desenvolvimento. Contas/apps reais, Meta, VPS e deploy fora do escopo.

Comece pelo [índice da documentação](docs/README.md). Para retomar com um agente, leia [AGENTS.md](AGENTS.md), [estado atual](docs/STATUS.md), [handoff](docs/HANDOFF.md) e [backlog](docs/BACKLOG.md).

O [prompt preparado](docs/PROXIMA_SESSAO.md) foi recebido como pedido anexado nesta sessão; autorização registrada em PF-003/AGENTS. O arquivo sozinho não inicia execução.

## Execução local

Requer Node.js 24 e npm 11. Para a demonstração: `npm ci`, `npm run db:generate`, `npm run demo`; abra http://127.0.0.1:3000. O supervisor gera configuração privada e gerencia PostgreSQL/web/worker em loopback. Em outro terminal, `npm run demo:seed` repete fixtures e `npm run demo:stop` encerra. Para usar serviços locais próprios, `.env.example` contém placeholders; `setup`/`db:migrate` validam URL local personaflow_*. Efeitos são exclusivamente fake no banco.

Verificações: `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:integration`, `npm run build`. A integração cria e encerra um PostgreSQL 16 isolado e efêmero; com `TEST_DATABASE_URL` apontando a `personaflow_test*` em loopback, usa esse banco (como no CI). Não utilizar banco de outro projeto. `npm run check` agrega lint, tipos e unitários. Detalhes e evidências em [DESENVOLVIMENTO](docs/DESENVOLVIMENTO.md) e [STATUS](docs/STATUS.md).

O CI foi configurado em `.github/workflows/ci.yml`, mas não há execução remota registrada. O plano de produto e os bloqueios externos continuam na documentação.

# PersonaFlow

MVP local de uma ferramenta auto-hospedada, exclusivamente para Instagram, com duas contas fictícias independentes.

**Estado: MVP local concluído e validado em 28/09/2026; operação real ainda não implementada.** Login fictício, inbox/manual, editor por reel/DM/story, pública/botão/seguir/link, notas/filtros/métricas e diagnóstico usam PostgreSQL e fila locais. Providers e efeitos são sintéticos; isso não comprova integração Meta. Em 30/09, Pedro pediu concluir o produto para a Kyber e hospedar na VPS. O pedido amplia o objetivo anterior, mas contas, envio real e deploy continuam pendentes de implementação e teste.

Comece pelo [índice da documentação](docs/README.md). Para retomar com um agente, leia [AGENTS.md](AGENTS.md), [estado atual](docs/STATUS.md), [handoff](docs/HANDOFF.md) e [backlog](docs/BACKLOG.md).

O [prompt preparado](docs/PROXIMA_SESSAO.md) foi recebido como pedido anexado nesta sessão; autorização registrada em PF-003/AGENTS. O arquivo sozinho não inicia execução.

## Execução local

Requer Node.js 24 e npm 11. Para a demonstração: `npm ci`, `npm run db:generate`, `npm run demo`; abra http://127.0.0.1:3000. O supervisor gera configuração privada e gerencia PostgreSQL/web/worker em loopback. Em outro terminal, `npm run demo:seed` repete fixtures e `npm run demo:stop` encerra. Para usar serviços locais próprios, `.env.example` contém placeholders; `setup`/`db:migrate` validam URL local personaflow_*. Efeitos são exclusivamente fake no banco.

Verificações: `npm run check`, `npm run test:integration`, `npm run test:browser:install`, `npm run test:e2e`, `npm run test:restart`, `npm run build`. Check agrega lint/tipos/unitários. A integração usa PostgreSQL 16 isolado e efêmero ou `TEST_DATABASE_URL` validada para `personaflow_test*` em loopback. E2E/restart usam namespaces próprios e preservam o banco da demonstração. Detalhes e evidências em [DESENVOLVIMENTO](docs/DESENVOLVIMENTO.md) e [STATUS](docs/STATUS.md).

O CI foi configurado em `.github/workflows/ci.yml`, mas não há execução remota registrada. O plano de produto e os bloqueios externos continuam na documentação.

# ADR-005 — Biblioteca para autenticação administrativa

Data: 27/09/2026; atualização local em 28/09/2026. Estado: adotada/validada em PF-014-L com provedor fictício. GitHub real aceito como escolha em 27/09, mas criação de app/credenciais ou acesso real não autorizados/implementados.

Escolha: **Better Auth 1.7.6**, com adaptador Prisma. GitHub é a escolha para login administrativo futuro; local-demo é o único provedor habilitado na demonstração. Integração Next.js/Prisma validada localmente conforme o recorte abaixo.

Motivo: separar login administrativo do OAuth Instagram, com sessões persistentes e allowlist por ID. Allowlist/sessão/logout/CSRF/state/PKCE comprovados no recorte local; conexão GitHub e credenciais externas continuam fora do escopo.

Fontes consultadas em 27/09/2026: [integração Next.js](https://better-auth.com/docs/integrations/next), [adaptador Prisma](https://better-auth.com/docs/adapters/prisma), [instalação](https://better-auth.com/docs/installation).

## Recorte local — 28/09/2026

Better Auth e adaptador Prisma fixados em **1.7.6**. Tabelas User/Account/Session/Verification separadas das contas Instagram. Provedor `local-demo` usa Generic OAuth, state e PKCE da biblioteca, código sintético persistido por hash e consumo atômico DELETE RETURNING. Allowlist `provider:subject` usa ID imutável antes de criar usuário/identidade e ao reservar sessão; acesso protegido revalida a identidade no banco a cada request. Email/nome não autorizam acesso. Account linking, senha/cadastro, callbacks GitHub e endpoints extras ficam bloqueados.

GitHub declarado com placeholders não utilizáveis; o handler recusa seu início/callback. Nenhum app, credencial externa ou conta real foi criado/conectado. Isso valida o recorte sintético, não login GitHub real; pai PF-014 conserva a pendência externa.

Modo local exige configuração explícita, URL/bind loopback e segredo aleatório ≥32 caracteres. `NODE_ENV=production` recusa local-demo; modo locked não registra o provedor. `demo` vincula web/banco/controle a 127.0.0.1. Next acrescenta x-forwarded-* em conexão direta e normaliza a URL interna de loopback: validar Host original exato, porta/protocolo iguais e somente valores locais exatos desses headers. Não confiar em proxy remoto. POST exige Origin exata e JSON; destinos de retorno ficam locais. Cookie HttpOnly/SameSite=Lax, sem cache de sessão, logout revoga registro. Respostas privadas no-store; UI recebe apenas nome/ID/prazo, sem token.

LocalOAuthGrant usa timestamptz; pool Prisma fixa timezone UTC para comparação consistente de prazo no SQL. A demonstração guarda dados/chaves locais na pasta ignorada .local-postgres/demo; não imprimir/copiar seus valores. E2E usa namespace próprio, nunca o banco da demonstração do usuário.

Consultadas em 28/09/2026: [Generic OAuth](https://better-auth.com/docs/plugins/generic-oauth), [segurança](https://better-auth.com/docs/reference/security), [Prisma](https://better-auth.com/docs/adapters/prisma) e [hooks de banco](https://better-auth.com/docs/concepts/database). Guias da versão instalada do Next sobre route, cookies, use client e authentication lidos antes do código.

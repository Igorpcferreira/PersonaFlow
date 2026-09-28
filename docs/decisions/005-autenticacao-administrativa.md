# ADR-005 — Biblioteca para autenticação administrativa

Data: 27/09/2026; autorização local ampliada em 28/09/2026. Estado: selecionada para PF-014; PF-014-L autorizado, implementação ainda pendente. Uso de GitHub aceito em 27/09/2026; sem criação de app/credenciais ou acesso real autorizado.

Escolha: **Better Auth**, com adaptador Prisma e provedor GitHub OAuth. O usuário aceitou GitHub como login administrativo. A documentação oficial mantém integração com Next.js e Prisma 7. Fixar a versão apenas quando PF-014 for autorizada; não instalar uma biblioteca de autenticação sem uso na fundação local.

Motivo: versão estável e documentação de integração atuais, separação do login administrativo em relação ao OAuth do Instagram. PF-014 ainda precisa provar allowlist por ID imutável, sessão, logout e CSRF. Esta seleção não autoriza conexão ao GitHub ou criação de credenciais.

Fontes consultadas em 27/09/2026: [integração Next.js](https://better-auth.com/docs/integrations/next), [adaptador Prisma](https://better-auth.com/docs/adapters/prisma), [instalação](https://better-auth.com/docs/installation).

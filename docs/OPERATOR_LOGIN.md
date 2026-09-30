# Login de operador

Implementado em 30/09/2026 e validado somente de forma local. O acesso de produção usa OAuth do GitHub e aceita uma única identidade numérica imutável. Nome, @, e-mail, avatar e organização no GitHub não são critérios de autorização.

## Configuração de produção

Use um mount de segredos protegido, fora do repositório. A inicialização recusa a configuração inteira se qualquer item abaixo estiver ausente ou diferente:

```text
PERSONAFLOW_MODE=production
NODE_ENV=production
PERSONAFLOW_BIND_HOST=127.0.0.1
BETTER_AUTH_URL=https://personaflow.somoskyber.com.br
BETTER_AUTH_SECRET=<aleatório-com-pelo-menos-32-caracteres>
OPERATOR_ALLOWLIST=github:<ID_NUMERICO_UNICO>
GITHUB_CLIENT_ID=<OAuth-App-client-id>
GITHUB_CLIENT_SECRET=<OAuth-App-client-secret>
```

No OAuth App do GitHub, cadastre exatamente `https://personaflow.somoskyber.com.br/api/auth/callback/github` como Authorization callback URL. A URL canônica não aceita HTTP, porta, caminho, query, fragmento ou outro host. O processo web continua em loopback para o proxy HTTPS local encaminhar o host público canônico.

O ID deve ser o número estável informado pelo GitHub no perfil OAuth, não o login. Há uma só entrada permitida, no formato `github:<número>`. O callback consulta o perfil GitHub, confere esse ID antes de disponibilizar o perfil ao Better Auth e repete a defesa antes de criar uma conta. Uma identidade diferente não cria `User`, `Account` ou sessão.

O fluxo solicita somente `read:user` e `user:email`. Ele exige um e-mail verificado do GitHub para completar a conta local, embora a autorização continue baseada exclusivamente no ID numérico. Sessões expiram em oito horas, usam cookie HttpOnly, SameSite=Lax e Secure em produção. O logout remove a sessão persistida.

## Modos preservados

`local-demo` continua exclusivamente em loopback HTTP e usa apenas `local-demo:demo-operator-001`; seus callbacks e APIs sintéticas permanecem protegidos pelas validações locais existentes. `locked` não oferece login. Nenhum modo local aceita credencial do GitHub.

O login GitHub não libera o painel de automações em produção. As rotas do painel ainda dependem de `getLocalRuntime`, que contém contas, webhooks e efeitos sintéticos. Elas retornam indisponível fora de `local-demo`; a tela permite somente verificar a sessão e sair. Separar esse runtime é uma entrega posterior e deve ser validado antes de expor dados ou ações reais.

## Limites da validação

Os testes cobrem a configuração canônica, a allowlist única, login/logout e recusa das rotas/provedores locais. Esta entrega não cadastra o OAuth App, não instala segredos, não acessa GitHub, não sobe proxy, e não realiza um callback real. Antes de liberar o host, é necessário configurar o callback no GitHub e testar o fluxo com a identidade autorizada em ambiente controlado.

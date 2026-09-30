# PersonaFlow, preparação de produção do piloto Kyber

Este diretório prepara a topologia aprovada, sem aplicar nada na VPS:

```text
Internet -> Nginx root-owned :443 -> Next systemd --user :3210 (127.0.0.1)
                                      -> PostgreSQL Docker :5432 (127.0.0.1)
```

Os templates não iniciam `npm run demo` nem `npm run demo:seed`. `PERSONAFLOW_MODE=production` e `PERSONAFLOW_SEND_MODE=disabled` são os valores iniciais obrigatórios. A unit do worker pode consumir eventos e manter o ledger mesmo com envio desabilitado; a troca para `meta-private-reply` exige todos os IDs exatos, inclusive o ID do único comentário de teste. A unit não está instalada na VPS.

## Arquivos privados necessários na VPS

Crie, fora do checkout e com modo `0600`:

- `~/.config/personaflow/postgres.env`, a partir de `postgres.env.example`;
- `~/.config/personaflow/personaflow.env`, a partir de `personaflow.env.example`.

Os dois arquivos devem usar a mesma credencial e o mesmo banco `personaflow_*`. O banco é exposto somente como `127.0.0.1:5432`; não existe regra de firewall ou serviço PostgreSQL do sistema neste desenho.

## Instalação posterior, ainda não executada

1. Escolha o checkout imutável do release e substitua `__PERSONAFLOW_RELEASE_DIR__` nas units.
2. Copie as units para `~/.config/systemd/user/`, execute `systemctl --user daemon-reload` e habilite primeiro `personaflow-postgres.service`, depois `personaflow-web.service`. A conta `pedro` precisa conseguir usar Docker sem `sudo`, e precisa de linger habilitado por root para os serviços sobreviverem ao logout.
3. Com o PostgreSQL saudável, execute no checkout `npm ci`, `npm run build` e `npm run db:migrate`. Não use `npm run demo` ou seu seed. Instale a unit `personaflow-worker.service` somente depois de validar as variáveis Meta e o fluxo de fila; mantenha envio desabilitado no primeiro início.
4. Substitua os placeholders TLS e ACME do template Nginx, instale-o como root, valide com `nginx -t` e recarregue o Nginx. O template não deve ser instalado enquanto o DNS e o certificado não existirem.
5. Substitua os placeholders de `personaflow-app.logrotate.conf.template` e `personaflow-retention.logrotate.conf.template`, valide com `logrotate -d` e instale a rotação diária de 30 dias. Antes de declarar a política de logs cumprida, confira em uma execução real que web e worker escrevem apenas eventos sanitizados, sem URL de OAuth, corpo de webhook, token ou mensagem.

## Pendências antes da ativação pública

O modo `production` exige a origem exata `https://personaflow.somoskyber.com.br`, um único operador GitHub permitido e `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. O callback foi testado com provedor simulado; o login real ainda depende de criar o aplicativo OAuth GitHub e da URL HTTPS. As APIs do painel sintético continuam bloqueadas em produção.

Depois de escolher o Reel da Kyber, `src/jobs/pilot-setup.ts --check` apenas consulta e `--prepare` cria a conta interna e uma regra em rascunho. Após o OAuth, `src/jobs/pilot-subscribe.ts --execute` solicita somente o campo `comments` à Meta e consulta a assinatura antes de registrá-la localmente; essa chamada ainda não foi validada contra a Meta real. `pilot-setup.ts --activate` arma a regra de captura **somente com envio desabilitado** e exige token válido e assinatura de comentários. Quando o comentário controlado tiver chegado à fila, `src/jobs/pilot-comments.ts --list` mostra IDs, horários e estados recentes sem corpo nem autor. Confirme qual é o comentário de teste, então configure `META_INSTAGRAM_TEST_COMMENT_ID` e `PERSONAFLOW_SEND_MODE=meta-private-reply` juntos para uma única DM. Outros comentários acumulados são bloqueados pelo executor. Um resultado incerto não é reenviado automaticamente.

Também faltam: o registro DNS de `personaflow.somoskyber.com.br`, um certificado TLS válido, o caminho do release, linger de systemd para `pedro`, variáveis privadas geradas e OAuth/webhook Meta com prova real. O acesso de `pedro` ao Docker sem sudo foi conferido por `docker info` via SSH em 30/09/2026. Nenhuma dessas pendências é suprida por este diretório.

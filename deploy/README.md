# PersonaFlow, preparação de produção do piloto Kyber

Este diretório contém os templates da topologia aprovada. O estado medido da VPS fica em `docs/STATUS.md`:

```text
Internet -> Nginx root-owned :443 -> Next systemd --user :3210 (127.0.0.1)
                                      -> PostgreSQL Docker :5432 (127.0.0.1)
```

Os templates não iniciam `npm run demo` nem `npm run demo:seed`. `PERSONAFLOW_MODE=production` e `PERSONAFLOW_SEND_MODE=disabled` são os valores iniciais obrigatórios. A unit do worker pode consumir eventos e manter o ledger mesmo com envio desabilitado; a troca para `meta-private-reply` exige todos os IDs exatos, inclusive o ID do único comentário de teste. O worker foi ativado somente após o teste controlado de 01/10, e o envio voltou a `disabled`. Confira o estado vivo em `docs/STATUS.md` antes de operar.

## Arquivos privados necessários na VPS

Crie, fora do checkout e com modo `0600`:

- `~/.config/personaflow/postgres.env`, a partir de `postgres.env.example`;
- `~/.config/personaflow/personaflow.env`, a partir de `personaflow.env.example`.

Os dois arquivos devem usar a mesma credencial e o mesmo banco `personaflow_*`. O banco é exposto somente como `127.0.0.1:5432`; não existe regra de firewall ou serviço PostgreSQL do sistema neste desenho.

## Instalação e verificação

1. Escolha o checkout imutável do release e substitua `__PERSONAFLOW_RELEASE_DIR__` nas units.
2. Copie as units para `~/.config/systemd/user/`, execute `systemctl --user daemon-reload` e habilite primeiro `personaflow-postgres.service`, depois `personaflow-web.service`. A conta `pedro` precisa conseguir usar Docker sem `sudo`, e precisa de linger habilitado por root para os serviços sobreviverem ao logout. A unit do PostgreSQL usa `sg docker`, pois o gerenciador systemd do usuário pode ter sido iniciado antes de `pedro` entrar no grupo `docker`. Não reinicie o gerenciador do usuário para corrigir isso: ele abriga outros serviços.
3. Com o PostgreSQL saudável, execute no checkout `npm ci`, `npm run build` e `npm run db:migrate`. Não use `npm run demo` ou seu seed. Instale a unit `personaflow-worker.service` somente depois de validar as variáveis Meta e o fluxo de fila; mantenha envio desabilitado no primeiro início.
4. Substitua os placeholders TLS e ACME do template Nginx, instale-o como root, valide com `nginx -t` e recarregue o Nginx. O template não deve ser instalado enquanto o DNS e o certificado não existirem.
5. Substitua os placeholders de `personaflow-app.logrotate.conf.template` e `personaflow-retention.logrotate.conf.template`, valide com `logrotate -d` e instale a rotação diária de 30 dias. Diretório e logs devem ser privados (`0700` e `0600`), inclusive após rotação. Antes de declarar a política de logs cumprida, confira em uma execução real que web e worker escrevem apenas eventos sanitizados, sem URL de OAuth, corpo de webhook, token ou mensagem.

## Backup diário do banco

- **Na VPS:** `personaflow-backup.sh` roda o `pg_dump -Fc` dentro do contêiner, com as variáveis dele (nenhuma credencial passa pelo script).
  - Confere o arquivo com `pg_restore --list` e grava o `.sha256`.
  - Mantém os 14 mais novos em `~/backups/personaflow/` (pasta `0700`, arquivos `0600`) e escreve `ultimo-ok`.
  - Instalação: copie o script para `~/.local/bin/personaflow-backup` (modo `0700`) e as units `personaflow-backup.service.template` e `.timer.template` para `~/.config/systemd/user/`, sem o `.template`.
  - Depois: `systemctl --user daemon-reload` e `systemctl --user enable --now personaflow-backup.timer`. O timer roda às 06:41 UTC.
- **Fora da VPS:** `puxar-backup.ps1`, no PC do operador, copia por `scp` os dumps que faltam e confere o SHA-256 de cada um.
  - Guarda os 30 mais novos em `%USERPROFILE%\Backups\personaflow\`.
  - `-Agendar` instala a cópia nessa pasta e agenda no Agendador do Windows às 10h e às 20h, com `StartWhenAvailable`.
  - O log fica em `puxar.log`.
- **Restaurar e conferir:** num contêiner sem rede, nunca no banco vivo.
  ```sh
  docker run -d --rm --name pf-restaura-teste --network none -e POSTGRES_HOST_AUTH_METHOD=trust postgres:16.11-alpine
  docker exec pf-restaura-teste createdb -U postgres restaurado
  docker exec -i pf-restaura-teste pg_restore -U postgres -d restaurado --no-owner --no-privileges --exit-on-error < personaflow-<data>.dump
  ```
  Compare a contagem por tabela com o banco vivo e remova o contêiner (`docker rm -f pf-restaura-teste`).
  - Conferido em 12/10/2026: 33 tabelas, contagem igual à do banco vivo tabela a tabela.
- **Dados pessoais:** o dump contém dados pessoais de quem comentou ou mandou mensagem. Ele fica só nas duas pastas privadas e nunca vai pro git, pra nuvem ou pra mensagem.

## Pendências antes da ativação pública

O modo `production` exige a origem exata `https://personaflow.somoskyber.com.br`, um único operador GitHub permitido e `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. O callback foi testado com provedor simulado; o login real ainda depende de criar o aplicativo OAuth GitHub e da URL HTTPS. As APIs do painel sintético continuam bloqueadas em produção.

Depois de escolher o Reel da Kyber, `src/jobs/pilot-setup.ts --check` apenas consulta e `--prepare` cria a conta interna e uma regra em rascunho. Após o OAuth, `src/jobs/pilot-subscribe.ts --execute` solicita somente o campo `comments` à Meta e consulta a assinatura antes de registrá-la localmente; essa chamada ainda não foi validada contra a Meta real. `pilot-setup.ts --activate` arma a regra de captura **somente com envio desabilitado** e exige token válido e assinatura de comentários. Quando o comentário controlado tiver chegado à fila, `src/jobs/pilot-comments.ts --list` mostra IDs, horários e estados recentes sem corpo nem autor. Confirme qual é o comentário de teste, então configure `META_INSTAGRAM_TEST_COMMENT_ID` e `PERSONAFLOW_SEND_MODE=meta-private-reply` juntos para uma única DM. Outros comentários acumulados são bloqueados pelo executor. Um resultado incerto não é reenviado automaticamente.

Em 01/10/2026, DNS, TLS, banco, web em loopback, proxy HTTPS e credencial do app OAuth GitHub foram configurados. O início do OAuth redirecionou para `github.com`; a conclusão com a identidade permitida ainda não foi observada. Meta OAuth, webhook e envio real seguem sem prova. Consulte `docs/STATUS.md` antes de repetir qualquer configuração.

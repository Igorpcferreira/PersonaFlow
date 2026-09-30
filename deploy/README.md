# PersonaFlow, preparação de produção do piloto Kyber

Este diretório prepara a topologia aprovada, sem aplicar nada na VPS:

```text
Internet -> Nginx root-owned :443 -> Next systemd --user :3210 (127.0.0.1)
                                      -> PostgreSQL Docker :5432 (127.0.0.1)
```

Os templates não iniciam `npm run demo`, `npm run demo:seed`, `npm run worker:dev` nem um worker de entrega. `PERSONAFLOW_MODE=production` e `PERSONAFLOW_SEND_MODE=disabled` são obrigatórios no ambiente proposto. A rota de webhook pode criar as filas necessárias para receber eventos, mas não há processo de consumo ou envio nesta preparação.

## Arquivos privados necessários na VPS

Crie, fora do checkout e com modo `0600`:

- `~/.config/personaflow/postgres.env`, a partir de `postgres.env.example`;
- `~/.config/personaflow/personaflow.env`, a partir de `personaflow.env.example`.

Os dois arquivos devem usar a mesma credencial e o mesmo banco `personaflow_*`. O banco é exposto somente como `127.0.0.1:5432`; não existe regra de firewall ou serviço PostgreSQL do sistema neste desenho.

## Instalação posterior, ainda não executada

1. Escolha o checkout imutável do release e substitua `__PERSONAFLOW_RELEASE_DIR__` nas units.
2. Copie as units para `~/.config/systemd/user/`, execute `systemctl --user daemon-reload` e habilite primeiro `personaflow-postgres.service`, depois `personaflow-web.service`. A conta `pedro` precisa conseguir usar Docker sem `sudo`, e precisa de linger habilitado por root para os serviços sobreviverem ao logout.
3. Com o PostgreSQL saudável, execute no checkout `npm ci`, `npm run build` e `npm run db:migrate`. Não use `npm run demo`, seed ou scripts de worker.
4. Substitua os placeholders TLS e ACME do template Nginx, instale-o como root, valide com `nginx -t` e recarregue o Nginx. O template não deve ser instalado enquanto o DNS e o certificado não existirem.

## Pendências antes da ativação pública

O modo `production` presente no contrato local de autenticação exige a origem exata `https://personaflow.somoskyber.com.br`, um único operador GitHub permitido e `GITHUB_CLIENT_ID` e `GITHUB_CLIENT_SECRET`. Essa alteração de autenticação está fora deste diretório e ainda precisa de sua própria revisão e validação integrada antes de ativar a unit web.

Também faltam: o registro DNS de `personaflow.somoskyber.com.br`, um certificado TLS válido, o caminho do release, a confirmação de acesso da conta `pedro` ao Docker sem sudo, linger de systemd para `pedro`, variáveis privadas geradas e uma decisão explícita para configurar OAuth/webhook Meta. Nenhuma dessas pendências é suprida por este diretório.

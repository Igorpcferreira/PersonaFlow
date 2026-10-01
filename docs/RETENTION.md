# Retenção de conteúdo

Implementado em 30/09/2026 para a conta piloto indicada explicitamente no comando. A rotina automática é somente uma simulação diária. A redação efetiva não é agendada e exige início manual, com duas confirmações independentes.

## Prazos e efeito

| Dado | Prazo | Ação | O que permanece |
| --- | --- | --- | --- |
| `Message.body` | 90 dias desde `receivedAt` | Define o corpo como `NULL` | IDs, direção, tipo e timestamps |
| `Conversation.note` | 90 dias desde `noteUpdatedAt` | Define nota e timestamp como `NULL` | conversa, estado e versão de organização |
| `DeliveryIntent.body` | 90 dias desde `createdAt` | Substitui o JSON por `{}` | identidade do ledger, status, deduplicação e timestamps |
| `InboundEvent.payload` | 7 dias desde `receivedAt`, após processamento | Define o payload como `NULL` | IDs externos, tipo, processamento e timestamps |

`noteUpdatedAt` é escrito somente quando o conteúdo da nota muda. A migração `202609300009_retention` preenche as notas já existentes com o momento em que ela é aplicada, de forma conservadora: nenhuma nota anterior é removida cedo.

O job usa `receivedAt` para conteúdo recebido, pois é o instante em que o PersonaFlow passou a reter o dado. Para não quebrar processamento tardio, ele limpa `InboundEvent.payload` somente quando `processedAt` já está preenchido. A conta do argumento deve ser idêntica a `META_INSTAGRAM_PILOT_ACCOUNT_ID`; não há varredura de todas as contas.

## Execução controlada

Com o PostgreSQL da implantação disponível, configure `META_INSTAGRAM_PILOT_ACCOUNT_ID` com o UUID exato da conta piloto e informe o mesmo UUID no comando. Sem `--execute`, o comando é somente uma simulação e imprime contagens sem alterar dados:

```powershell
npx tsx src/jobs/retention.ts --account-id <UUID-da-conta-piloto>
```

Depois de revisar a saída, a execução efetiva exige `--execute` e a variável de processo `PERSONAFLOW_RETENTION_EXECUTE=confirm`:

```powershell
$env:PERSONAFLOW_RETENTION_EXECUTE = 'confirm'
npx tsx src/jobs/retention.ts --account-id <UUID-da-conta-piloto> --execute
```

O job rejeita qualquer UUID diferente de `META_INSTAGRAM_PILOT_ACCOUNT_ID`. A saída contém somente ID interno da conta, modo e contagens de campos redigidos. Ela não inclui mensagem, nota, payload, token, URL ou segredo. Erros inesperados são reduzidos a `Falha de retenção.`.

## Agendamento e gate manual

Conferido na VPS em 01/10/2026: a simulação e seu timer foram instalados e ativados. Os templates em `deploy/` têm estas funções:

- `personaflow-retention.service.template` executa a simulação e grava somente a saída sanitizada em `~/.local/state/personaflow/logs/retention.log`;
- `personaflow-retention.timer.template` dispara essa simulação diariamente às 03:17, recuperando uma execução perdida depois de reinício;
- `personaflow-retention-execute.service.template` não tem timer e contém a confirmação de ambiente mais `--execute`. Depois de conferir a última simulação, a única forma prevista de iniciar a redação é `systemctl --user start personaflow-retention-execute.service`;
- `personaflow-retention.logrotate.conf.template` mantém o arquivo sanitizado por no máximo 30 dias, com compressão dos arquivos antigos.

Na VPS, a simulação executada em 01/10 registrou zero campos elegíveis e não apagou nada. A unit de redação efetiva não foi habilitada. `personaflow-retention.timer` está ativo às 03h17 UTC; `personaflow-logs.timer` roda às 03h23 UTC e usa um estado próprio para girar somente `retention.log`. A configuração passou em `logrotate -d` e na execução real, com arquivos `0600`. A rotação preexistente de web e worker permanece separada em `/etc/logrotate.d/personaflow-app`. Antes de afirmar que a política de 90 dias está cumprida, ainda é preciso decidir e validar a execução efetiva de redação de dados vencidos.

## Logs sanitizados

Não existe tabela persistente de logs no schema atual. Web, worker e retenção escrevem em arquivos privados `0600` na VPS. As regras de trinta dias estão instaladas, mas ainda falta observar uma rotação natural e auditar regularmente a sanitização de erros inesperados antes de declarar toda a retenção operacional comprovada.

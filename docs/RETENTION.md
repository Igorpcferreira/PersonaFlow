# Retenção de conteúdo

Implementado em 30/09/2026 para a conta piloto indicada explicitamente no comando. Não existe scheduler nesta entrega e nenhum dado de produção estava presente durante a validação.

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

Depois de revisar a saída, execute a mesma conta de modo explícito:

```powershell
npx tsx src/jobs/retention.ts --account-id <UUID-da-conta-piloto> --execute
```

O comando não agenda a próxima execução. Antes de ativar uma rotina operacional, definir a frequência e manter o modo de piloto por conta até a revisão dessa decisão.

## Logs sanitizados

Não existe tabela persistente de logs no schema atual. Portanto, o código não afirma reter ou apagar logs. A implantação precisa configurar rotação de logs sanitizados por 30 dias no serviço que executar web e worker, sem registrar corpos de mensagens, notas, payloads, tokens ou segredos. Essa configuração permanece pendente de infraestrutura.

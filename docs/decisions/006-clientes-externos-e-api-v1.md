# ADR-006 — Clientes externos, campanhas no banco e a API v1

Estado: **Proposta (12/10/2026), esperando a revisão do Igor.** Só documento: nenhum código, migração ou configuração muda com esta ADR.

Igor, esta ADR é pra você ler e decidir. O PersonaFlow continua sendo um produto do Pedro e seu, com o painel e a caixa de entrada de vocês dois. O merge é seu.

## Contexto

- Hoje as campanhas (reel, palavra, links) e os textos das DMs e das respostas públicas ficam no ambiente (`.env` da VPS). Trocar uma palavra ou um texto exige mexer na VPS e reiniciar.
- O hub de conteúdo do Pedro e o Hermes (o assistente dele no WhatsApp) querem **propor** campanhas junto com cada post, ligar a mídia depois de publicada e pausar.
- O PersonaFlow **não é exclusivo do hub**. O hub entra como mais um cliente, pelo mesmo contrato que o Hermes usa. O CRM também.
- O PR #1 (`codex/personaflow-integration-readiness`) já entrou na `master` (merge `7ba5ce6`). Isso está feito; o que falta é a sua revisão desta ADR.

## Decisão

**1. Tabelas novas, todas por conta (`accountId`, no mesmo padrão de isolamento da ADR-002):** `ServiceClient`, `MessageTemplate`, `Campaign`, `OutboxEvent`, `IdempotencyRecord` e `ApiRequestLog`.

**2. Estados da campanha:** proposta → aprovada → ativa (depois de ligar a mídia) → pausada → encerrada.
- Duas campanhas ativas na mesma mídia com a mesma palavra são recusadas.
- Mudar uma campanha ativa sempre passa por gente.
- Retomar uma campanha pausada é só de gente.
- A campanha dura 30 dias depois de ligada, renovável.

**3. Token por cliente**, guardado em hash e com prefixo (o token inteiro aparece uma vez, na criação). Escopos:

| Escopo | O que permite |
|---|---|
| `campaigns:read` | ler campanhas |
| `campaigns:propose` | propor campanha |
| `campaigns:bind-media` | ligar a mídia publicada |
| `campaigns:pause` | pausar (retomar é só de gente) |
| `templates:read` | ler textos aprovados |
| `templates:propose` | propor texto |
| `stats:read` | ler só os totais |
| `events:read` | ler o outbox |

**Não existe escopo** para mandar mensagem, ler a caixa de entrada nem ver contato. Nenhum cliente consegue fazer isso, nem por engano.

**4. Onde a API vive:** só em `127.0.0.1:3210/api/v1`. O Nginx público responde 404 para `/api/v1`. Token na URL é recusado; só `Authorization: Bearer`. A sessão do painel não abre a v1 e o token não abre o painel.

**5. Desligador:** `PERSONAFLOW_API_ENABLED=false` desliga a API sem desligar as campanhas.

**6. Eventos sem dado de pessoa** (sem @, sem ID de usuário, sem texto), pelo outbox: `campaign.status_changed`, `comment.matched`, `dm.accepted`, `dm.uncertain`, `dm.failed`, `conversation.opened`, `summary.daily` e `account.health`. Escrita com idempotência (`IdempotencyRecord`) e cada pedido registrado (`ApiRequestLog`).

**7. As garantias de hoje continuam:**
- uma intenção por comentário;
- o incerto não repete;
- a resposta pública só sai depois da DM aceita;
- tudo é revalidado antes do HTTP;
- nada é retroativo.

## Aprovação dos textos

O texto da DM e das respostas públicas é **aprovado uma vez**, no PersonaFlow, pelo Pedro ou por você, qualquer um dos dois, com registro de quem foi e quando. A campanha que usa só texto aprovado entra **aprovada junto com o post**. Texto novo (proposto por um cliente) volta pra aprovação e a campanha espera.

## Migração em modo sombra (E2)

Campanhas e textos passam a viver no banco, mas primeiro em **modo sombra**: o executor continua decidindo pelo ambiente, e o banco é lido e comparado ao lado, sem mandar nada. Quando bater, o executor passa a ler do banco **atrás de uma chave que volta pro ambiente**: a volta é desligar a chave e reiniciar. O ambiente só deixa de valer depois de um período estável combinado com você.

## Dois operadores em produção (E3)

Hoje a produção aceita um operador só (o GitHub do Pedro). Antes de qualquer cliente externo, entram **os dois operadores** (Pedro e você), com o painel real de campanhas, propostas e textos. Isso depende do seu login (ver as perguntas abaixo).

## Cuidados contra bloqueio (E6)

O bloqueio costuma vir do padrão: mesma frase centenas de vezes, link na primeira mensagem, pico de viral. Então:
- respostas públicas **variadas** (várias versões aprovadas, sorteadas);
- **nenhum link na primeira DM** (a DM pergunta ou confirma, o link vai na seguinte);
- **freio de viral**: acima de X comentários por hora, desacelera e avisa (o X se mede no piloto);
- a palavra **também aceita por DM**, pra quem prefere mandar direto.

## Consequências

**Fica mais difícil:**
- mais tabelas, migrações e estados pra manter;
- aprovação de texto vira etapa obrigatória;
- uma API a mais pra proteger e documentar;
- o modo sombra dá trabalho duplicado por um tempo.

**Riscos:**
- token vazado: limitado pelos escopos, pelo hash, pelo acesso só local e pelo desligador;
- divergência entre banco e ambiente na migração: por isso o modo sombra e a chave de volta;
- a divergência D-META-01 sobre webhooks em Standard Access e o risco de virar Provedor de Tecnologia (irreversível) continuam como estão e **não são resolvidos por esta ADR**;
- hub, Hermes e PersonaFlow ficam na mesma VPS (ponto único de falha); o backup diário e o sinal de vida existem por isso.

**O que NÃO muda:**
- o PersonaFlow segue um produto próprio de vocês dois, com painel e caixa de entrada próprios;
- ninguém de fora manda mensagem, lê a caixa ou vê contato;
- o isolamento por conta, as garantias de envio (item 7) e o app Meta atual;
- a licença continua pendente e o repositório continua seu;
- nenhuma DM é habilitada por esta ADR.

## O que precisa do Igor

1. Você aprova esta ADR (clientes externos, campanhas no banco, API v1 e eventos)?
2. Você quer um login de produção próprio no PersonaFlow? Hoje só entra o GitHub do Pedro.
3. Você quer ligar a sua conta, a @igor_cferreira, ao PersonaFlow compartilhado?
4. O que você precisa ver no painel e por onde quer ser avisado? O Hermes só fala com o Pedro.
5. Quanto ao CRM: você aceita registrar com a tag `post:XXXX` os leads que chegarem com código, e que o hub conte esses leads, sem nomes?
6. Qual licença você quer pro PersonaFlow? A pergunta está pendente desde o início (Q4).

## Passos seguintes

E2 (campanhas e textos no banco, modo sombra), E3 (dois operadores), E4 (API v1, outbox e rotas), E5 a E9 (hub, cuidados contra bloqueio, CRM, contas novas, Hermes). Cada um volta pra você antes do merge. O plano completo é a Fase E do plano do hub do Pedro.

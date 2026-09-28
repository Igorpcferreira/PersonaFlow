# Diagnóstico do OpenReply

Inspeção estática em 27/09/2026 do commit [`5760181c4bb9683241357cbbcd8ca635d19f835a`](https://github.com/diwenne/openreply/tree/5760181c4bb9683241357cbbcd8ca635d19f835a), de 21/09/2026. Clone temporário fora do PersonaFlow; nenhuma dependência instalada e nenhum serviço executado. Não é auditoria completa de segurança nem validação com a Meta.

## Estado e arquitetura verificados

`package.json` define Next.js 16.2.6, React 19.2.4, Prisma 7.8, PostgreSQL, BullMQ 5, ioredis, TypeScript, Zod, Tailwind 4, Recharts e Auth.js/next-auth **5 beta**. São dependências declaradas, não versões recomendadas automaticamente para o PersonaFlow. Há lockfile.

Next serve UI e rotas; `worker/dm-worker.ts` mantém processo separado. `lib/queue/process-webhook.ts` grava eventos em Postgres e adiciona jobs no Redis. `lib/instagram/*` seleciona Meta ou Zernio. Autenticação por magic link usa Resend ou SMTP. Vercel, Neon e Redis Cloud são sugestões de hospedagem, não exigências arquiteturais; Zernio é provedor pago opcional. `@vercel/analytics` também é dependência externa dispensável.

## Funcionalidades demonstradas no código

Todos os caminhos abaixo se referem ao commit fixado acima, não ao `main` futuro.

| Recurso | Evidência | Limite da conclusão |
|---|---|---|
| Comentário → DM e resposta pública opcional | `lib/meta/webhook.ts`, `lib/queue/dm-worker.ts`, `lib/meta/client.ts` | Há parser, decisão e chamada de API; entrega real não testada |
| DM por palavra-chave | `parseMessageEvents`, `ProcessMessageJob`, `processMessageJob` nos módulos de webhook/fila | Ignora echo, exclusão, conteúdo não suportado e mensagem sem texto |
| Stories | Mesmo parser de DM; README explica respostas textuais | Não é motor geral de interações com stories; não prova suporte a likes, votos ou visualizações |
| Inbox | `app/api/instagram/conversations/route.ts`, rota `[id]`, `lib/instagram/read-inbox.ts` | Consulta API e envia resposta direta; não há modelo persistente Contact/Conversation no schema |
| Várias contas | `InstagramAccount`, `lib/instagram-accounts.ts`, rotas de conexão | Contas dividem workspace; isso não comprova o isolamento estrito requerido aqui |
| Workspaces e convites | `Workspace`, `WorkspaceMember`, `WorkspaceInvitation`, `lib/workspace-access.ts` | OWNER/ADMIN/MEMBER implementados; dispensáveis para um operador |
| Campanhas/receitas | `Automation`, `lib/templates/campaign-templates.ts`, rotas de automações | Campanha significa regra configurada, não licença para broadcast |
| Tracking e relatórios | `TrackedLink`, `LinkClick`, `lib/tracking/*`, `lib/reports/*` | Implica coleta e retenção adicionais; não prova conversão comercial |
| Filas e limites | `lib/queue/client.ts`, `lib/utils/rate-limiter.ts` | Reserva atômica via Lua no Redis; jobs têm retries e retenção finita |
| Tokens protegidos | `lib/meta/oauth.ts`, callback e cron de refresh | AES-256-GCM e state assinado presentes; exige gestão da chave |
| Pausa de regra | `Automation.isActive` | Não equivale a assumir conversa e cancelar envios concorrentes |

Não encontrei mecanismo de handoff por conversa nem organização persistente de contatos equivalente ao requisito do PersonaFlow. O modelo `ProcessedComment` se declara legado e não conectado ao runtime: sua existência não prova deduplicação. `lib/billing/usage.ts` e campos de uso não provam cobrança ou checkout. Planos em `docs/superpowers/plans/` não foram tratados como funcionalidades sem caminho de execução correspondente.

## Manutenção, testes e sinais de risco

Repositório não arquivado, commits recentes, contribuições além do autor e correções em setembro. API do GitHub não retornou releases na consulta; há 14 itens abertos no contador combinado de issues/PRs. Entre PRs recentes: limite de pool PostgreSQL, saúde de fila e classificação de entrega incerta. São sinais de atividade e áreas em evolução, não correções já incorporadas.

Há **27 arquivos de testes** em `__tests__`, incluindo OAuth, assinatura, matcher, worker, tracking e rate limit. `.github/workflows/ci.yml` configura geração Prisma, typecheck, lint, testes e build em Node 20, já EOL na [tabela oficial do Node](https://nodejs.org/en/about/previous-releases) consultada. Não executei essa suíte. Os três runs mais recentes consultados estavam `action_required`; não se deve concluir sucesso ou falha do commit auditado a partir deles. A suíte e a CI existentes são vantagem concreta, mas não certificam segurança nem integração com Instagram.

Pontos observados que impedem importar sem revisão:

- O webhook grava no Postgres e enfileira no Redis em operações distintas. Sem transação comum, é necessário auditar recuperação entre persistência e publicação; retornar 500 e esperar reentrega ajuda, mas não fornece garantia ilimitada.
- O worker consulta logs e contém guardas de duplicidade, inclusive entre campanhas. O índice `DmLog(automationId, commentId)` isoladamente não impede duas regras de consumir a mesma resposta privada. Exigir restrição durável por conta/comentário e testes concorrentes.
- A rota de resposta manual chama o provedor diretamente. Não compartilha integralmente a fila e as garantias propostas para automações; repetição pelo cliente merece proteção própria.
- `process-webhook.ts` agenda envio após confirmação de leitura da primeira DM. O worker reconhece que a janela pode estar fechada e trata a tentativa como especulativa. **Não reaproveitar esse comportamento:** leitura não é resposta nem autorização para follow-up.
- Entrega incerta recebe tratamento explícito para Zernio; não assumir tratamento equivalente para todas as falhas da Meta. Um PR aberto sobre Meta code 1 reforça a necessidade de revisão, não prova vulnerabilidade explorada.
- Assinatura usa HMAC e comparação constante, mas a rota registra `bodyPreview` de requisição inválida: risco de registrar conteúdo pessoal ou injetado sem necessidade.
- OAuth state contém workspace e timestamp assinados; sozinho não é nonce de uso único ligado à sessão. Reavaliar vínculo no callback e proteção contra replay antes de copiar.
- Escopo de insights, cache, relatórios compartilhados, tokens em URLs de algumas chamadas e logs de erros precisam de minimização. Não transplantar defaults de compartilhamento de relatórios.

## Licença

O arquivo [LICENSE do commit](https://github.com/diwenne/openreply/blob/5760181c4bb9683241357cbbcd8ca635d19f835a/LICENSE) é MIT, com copyrights de **Anish Raj (2026)** e **Diwen Huang (2026)**. Permite reutilizar, modificar, publicar e distribuir, inclusive comercialmente, mantendo aviso de copyright e texto de permissão nas cópias ou porções substanciais. Não obriga publicar todas as modificações nem abrir um serviço hospedado. A ausência de garantia também deve ser preservada junto ao texto completo. [Texto MIT/OSI](https://opensource.org/license/mit), consultado em 27/09/2026.

Ao importar: manter licença upstream integral em `third_party/openreply/LICENSE`, registrar arquivos e commit em `THIRD_PARTY_NOTICES.md`, atribuir os dois autores e identificar adaptações. Não remover autoria original ao aplicar licença própria. Dependências, fontes (`public/fonts/Geist-LICENSE.txt`) e assets têm verificações separadas. Licença do código não concede marca nem aprovação da Meta. Nenhum código upstream foi copiado nesta entrega; a licença do PersonaFlow ainda depende do proprietário.

## Comparação e recomendação

| Estratégia | Economia | Custo e risco | Decisão |
|---|---|---|---|
| Fork integral | Dashboard e muitos fluxos imediatamente disponíveis | Desmontar workspaces, providers, tracking, auth por email; manter Redis e caminhos não usados; corrigir garantias | Não recomendar para este escopo |
| Base menor + componentes selecionados | Aproveita conhecimento, funções puras e casos de teste, sem carregar todo o modelo | Inbox persistente, OAuth adaptado e pipeline precisam ser construídos | **Principal** |
| Tudo novo, apenas inspiração | Modelo inteiramente sob controle | Redescobrir payloads, particularidades da Meta e casos já cobertos | Evitar reescrita sem motivo |

Reaproveitar primeiro matcher de palavras e testes, parsers de eventos com validação estrita, tipos e conhecimento dos endpoints. Adaptar criptografia/OAuth com revisão e testes, wrappers Meta com timeouts e erros tipados, ideias de formulários. Reescrever isolamento, inbox persistente, pipeline transacional e pausa manual conforme contratos do PersonaFlow. Não copiar worker de mais de mil linhas para depois tentar simplificá-lo. Evitar Zernio, billing/usage, workspaces, follow gate, fallback por leitura, relatórios públicos e páginas promocionais.

Economia não quantificada em horas: depende da compatibilidade e não há implementação para medi-la. Em cada importação, comparar adaptar + testar com escrever + testar. Se os imports transitivos arrastarem subsistemas excluídos, aproveitar os casos de teste e reimplementar o trecho pequeno. Não manter sincronização automática do fork; revisar upstream periodicamente por correções úteis.

## Complemento: onboarding e tutorial

Na investigação complementar de 27/09/2026, o `main` continuava no mesmo commit auditado. Foram lidos integralmente `docs/setup.md` e `META_APP_REVIEW.md`. O setup orienta Instagram Login, convite/aceite por conta, Live para comentários reais e diferencia publicação de Advanced Access. Também oferece Zernio pago como opção patrocinada; isso não muda a decisão de integração direta do PersonaFlow.

O guia de revisão diz que uso próprio dispensa review, mas essa afirmação não resolve a divergência com o guia oficial de webhooks que lista Advanced Access. As justificativas de permissão upstream também não substituem o requisito oficial de cada endpoint. Ver D-META-01 em [META_ONBOARDING](META_ONBOARDING.md).

O callback guarda `userInfo.user_id ?? userInfo.id`; no PersonaFlow não reaproveitar fallback de identidade sem conciliação. `getUserFollowStatus` consulta `is_user_follow_business` e retorna null em falha/ausência: isso não significa “não segue”. A documentação oficial do User Profile exige consentimento que comentário sozinho não fornece.

Os artefatos do tutorial Guibchat foram lidos como referência independente. Não há evidência de uso de OpenReply no vídeo, e controles visíveis não demonstram implementação nem conformidade.

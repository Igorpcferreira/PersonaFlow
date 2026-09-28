# Fontes e rastreabilidade

Consulta: **27/09/2026**, salvo indicação explícita. Prioridade a código e documentação dos próprios mantenedores. Conteúdo de terceiros retornado em pesquisas não foi usado para confirmar políticas. Links `/docs/` podem redirecionar para `/documentation/`.

## Meta

| ID | Fonte primária | Evidência utilizada |
|---|---|---|
| M1 | [Instagram Platform Overview](https://developers.facebook.com/docs/instagram-platform/overview/) | Contas profissionais, Standard/Advanced Access e verificação empresarial |
| M2 | [Private Replies](https://developers.facebook.com/documentation/instagram-platform/private-replies.md) | Uma resposta privada, até 7 dias, exceção Live, follow-up após resposta; permissões e endpoint |
| M3 | [Messaging / Send](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api.md) | Janela 24 h, início pela pessoa, atendimento humano e limitações |
| M4 | [Business Login for Instagram](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login/) | OAuth, scopes, troca/refresh de tokens de 60 dias e validade mínima de 24 h para refresh |
| M5 | [Webhooks](https://developers.facebook.com/documentation/instagram-platform/webhooks.md) | HTTPS, challenge, HMAC, assinatura por conta, retries e limitação de histórico |
| M6 | [App Review](https://developers.facebook.com/docs/instagram-platform/app-review/) | Cenários de acesso próprio/terceiros, permissões, screencasts e instruções para revisão |
| M7 | [Conversations API](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/conversations-api.md) | Inbox, permissões, Requests inativas e detalhes das últimas 20 mensagens |
| M8 | [Rate Limiting](https://developers.facebook.com/docs/graph-api/overview/rate-limiting/) | Limites específicos por endpoint/conta e cabeçalhos de uso |
| M9 | [Webhook examples](https://developers.facebook.com/documentation/instagram-platform/webhooks/examples.md) | `reply_to.story`, `story_mention`, tipos de mensagem e timestamps |
| M10 | [Platform Terms](https://developers.facebook.com/terms/) | Responsabilidades sobre dados e operação na plataforma; confirmar exigências do app antes de produção |
| M11 | [Instagram Login — coleção oficial Meta](https://www.postman.com/meta/instagram/folder/6raa77c/instagram-api-with-instagram-login) | Contas profissionais, ausência de Página obrigatória e nomes de scopes |
| M12 | [Get Started — Instagram Login](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started.md) | Token por conta no painel, duração, distinção entre `id` e `user_id`, tipos Business/Media_Creator |
| M13 | [Instagram Use Case](https://developers.facebook.com/documentation/development/create-an-app/instagram-use-case.md) | Uma configuração de login por app, Add account, scopes, URLs, publicação, review e Tech Provider |
| M14 | [App Modes](https://developers.facebook.com/documentation/development/build-and-test/app-modes.md) | Development/Live e restrições gerais; não substitui requisitos específicos Instagram |
| M15 | [App Roles](https://developers.facebook.com/documentation/development/build-and-test/app-roles.md) | Papéis, convites e uso legítimo de testadores |
| M16 | [Instagram User Profile](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/user-profile.md) | Consentimento de perfil, IGSID e `is_user_follow_business`; comentário sozinho não basta |
| M17 | [Button Template](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/button-template.md) | Distinção URL/postback e evento de seleção; não prova sozinho toda sequência private reply → janela |
| M18 | [Quick Replies](https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/messaging-api/quick-replies.md) | Seleção gera mensagem e evento `messages`; limitações de cliente |

A ferramenta web não conseguiu abrir algumas páginas Meta (429/erro de acesso). Elas foram recuperadas publicamente por HTTP e, quando disponível, pela versão Markdown oficial indicada no [índice para LLMs da Meta](https://developers.facebook.com/documentation/instagram-platform/llms.txt). Não foi usada sessão autenticada nem API privada. Páginas lidas exibiam atualizações como 30/06/2026 (private replies/review), 06/05/2026 (mensagens) e 13/03/2026 (login). Isso não substitui reconsulta antes de implementar.

Na resposta do usuário de 27/09/2026, a reconsulta de M16 pela ferramenta web retornou 429; o limite sobre consentimento continua atribuído à leitura oficial anterior, sem nova confirmação por painel ou teste. A [coleção oficial Instagram da Meta](https://www.postman.com/meta/instagram/collection/6yqw8pt/instagram-api) foi reconsultada para contexto de contas profissionais e início de conversas pela pessoa; ela não comprova o follow gate do ManyChat no PersonaFlow.

Na primeira investigação não foi possível confirmar a página específica de Human Agent nos caminhos tentados (404). Na releitura complementar, o [overview oficial em Markdown](https://developers.facebook.com/documentation/instagram-platform/overview.md) indicou resposta humana em até sete dias. Habilitação/revisão aplicável ao app permanece pendente; a extensão não foi incluída no MVP. Nenhum painel ou permissão das contas reais foi consultado.

### Complemento de onboarding — 27/09/2026

Novas tentativas com a ferramenta web retornaram timeout nas duas pastas Postman fornecidas e 429 na página raiz da plataforma. Fontes M1–M6 e M12–M18 foram lidas diretamente pelos endpoints públicos oficiais, preferencialmente Markdown; não houve acesso autenticado. A página `create-an-instagram-app.md` continha apenas encaminhamento, então foi consultado o guia completo M13 do índice oficial de Development.

**D-META-01, evidência conflitante:** M1/M6/M13 descrevem Standard/dispensa de review para uso próprio; M5, seções Requirements/Limitations, exige Live, lista Advanced Access e verificação para Instagram Login e exige Advanced para comments/live_comments. Não há exceção explícita reconciliando tudo no texto lido. O plano foi corrigido para tratar eventos próprios como gate pendente, sem prometer que Live + Standard basta. M14 é genérico e não resolve essa divergência. O painel e o experimento devem registrar a condição efetivamente permitida por app/campo; resultado técnico não dispensa cumprimento de políticas.

Também foi lido o [guia oficial de webhooks de Instagram via Messenger](https://developers.facebook.com/docs/messenger-platform/instagram/features/webhook/), que descreve publicação e papéis para essa outra rota. Seus scopes `instagram_basic`, `instagram_manage_messages`, `pages_manage_metadata` identificam o contexto Facebook Login: a exceção nele descrita não foi transferida ao Instagram Login como prova.

## Evidência fornecida pelo usuário

| ID | Origem | O que comprova e limite |
|---|---|---|
| U1 | Três prints enviados pelo usuário na conversa em 27/09/2026 | Interface e configuração de um fluxo ManyChat ativo da @somoskyber: `site` em post/reel específico, resposta pública, DM inicial, botão e link; opção Pro de seguir desligada. Não foram copiados ao repositório; não comprovam API Meta nem fluxo da @igor_cferreira |
| U2 | Resposta textual do usuário em 27/09/2026 | @igor_cferreira e @somoskyber exibem “Profissional pública”; GitHub aceito como login administrativo; automação deve ser configurável pela interface por reel. Não identifica subtipo Creator/Business, gestão do app ou autorização de implementação adicional |

## Código e tecnologia

- [PersonaFlow](https://github.com/Igorpcferreira/PersonaFlow): API pública do GitHub retornou tamanho 0, sem licença; `git ls-remote` sem refs. Estado observado, não previsão do próximo acesso.
- [OpenReply, commit auditado](https://github.com/diwenne/openreply/tree/5760181c4bb9683241357cbbcd8ca635d19f835a): conteúdo completo obtido por clone raso. [package.json](https://github.com/diwenne/openreply/blob/5760181c4bb9683241357cbbcd8ca635d19f835a/package.json), [schema](https://github.com/diwenne/openreply/blob/5760181c4bb9683241357cbbcd8ca635d19f835a/prisma/schema.prisma), [CI](https://github.com/diwenne/openreply/blob/5760181c4bb9683241357cbbcd8ca635d19f835a/.github/workflows/ci.yml). Outros caminhos estão no diagnóstico.
- [OpenReply LICENSE](https://github.com/diwenne/openreply/blob/5760181c4bb9683241357cbbcd8ca635d19f835a/LICENSE) e [MIT/OSI](https://opensource.org/license/mit): obrigações de atribuição e permissão de reutilização.
- [GitHub API do upstream](https://api.github.com/repos/diwenne/openreply), [runs](https://api.github.com/repos/diwenne/openreply/actions/runs?per_page=3), [releases](https://api.github.com/repos/diwenne/openreply/releases?per_page=3): fotografia de atividade, não SLA.
- [pg-boss](https://pgboss.io/): fila em Postgres, transações e suporte a adaptadores; não implica exactly-once para chamadas HTTP externas.
- [Node releases](https://nodejs.org/en/about/previous-releases): referência para runtime suportado; revalidar no bootstrap.
- [Auth.js GitHub provider](https://authjs.dev/getting-started/providers/github): alternativa ao magic link; manutenção/versão da biblioteca ainda deve ser selecionada, especialmente porque o upstream usa beta.

Guias adicionais lidos integralmente no complemento (O1/O2):

- O1: [OpenReply setup](https://github.com/diwenne/openreply/blob/5760181c4bb9683241357cbbcd8ca635d19f835a/docs/setup.md): Instagram Login, roles/aceites por conta, Live versus Advanced, IDs e opção Zernio. Fonte de implementação/experiência do mantenedor, não norma Meta.
- O2: [OpenReply Meta App Review](https://github.com/diwenne/openreply/blob/5760181c4bb9683241357cbbcd8ca635d19f835a/META_APP_REVIEW.md): justificativas e demonstração de review; não importar sem adaptar ao produto e à documentação de cada endpoint.

O `main` foi reconferido pela API pública e seguia em `5760181c4bb9683241357cbbcd8ca635d19f835a`. Os links fixados correspondem, portanto, ao conteúdo dos links `main` fornecidos pelo usuário nesta consulta.

Referência do vídeo: `C:\Users\user\Downloads\edit\personaflow-tutorial\analise.md` e `takes_packed.md`, ambos acessíveis e lidos. A análise prévia registra vídeo de 62,16 s e tempos dos frames; a transcrição é automática e contém erros de nomes. Não houve retranscrição nem nova análise visual nesta sessão. Não foram copiados vídeo, frames, token ou transcrição integral para o repositório. A matriz em META_ONBOARDING diferencia evidência reportada, alegação e conclusão técnica.

## Privacidade e infraestrutura

- [LGPD — texto oficial](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm): requisitos gerais de tratamento; prazos propostos no plano são escolhas técnicas, não prazos impostos pela lei.
- Referência local de deploy: caminhos e arquivos em [OPERACAO](OPERACAO.md). Sem URL pública e sem reprodução de valores privados.
- Custos são estimativas com hipóteses, não preços citados de fornecedores. Capacidade e disponibilidade não foram medidas remotamente.

## Como atualizar conclusões

Ao alterar uma regra de plataforma: registrar data, fonte primária, caminho de login/versão e consequência no código/testes. Não copiar regra de Messenger ou Facebook Login para Instagram Login sem validar. Divergência entre fonte, painel e resultado real vira pendência, com código de erro sanitizado; não “corrigir” através de tentativas de contorno.

# Integração Meta e onboarding das duas contas

Investigação complementar de **27/09/2026**. Somente estudo da integração: nenhum app criado, consentimento realizado, token obtido, mensagem enviada ou alteração na VPS. As referências M1–M18 estão em [FONTES](FONTES.md); O1/O2 identificam os guias do OpenReply no commit auditado. Este guia detalha [VIABILIDADE](VIABILIDADE.md), sem substituir os contratos de segurança da [ARQUITETURA](ARQUITETURA.md).

## Respostas em linguagem simples

**Um app pode atender as duas contas?** Sim, esse é o desenho recomendado: um app Meta para a instalação operacional, com duas conexões independentes. Cada conta profissional autoriza o app, tem seu token e sua inscrição de webhooks. A documentação descreve tokens por app/usuário e inscrições por conta; o OpenReply implementa esse modelo. Não existe requisito identificado de um app por conta, nem de separar Creator e Business em apps diferentes. Isso não comprova a elegibilidade das suas contas nem a entrega de eventos. [M1, M4, M5, M12; O1]

**A conta de criador pode continuar sendo “pessoal”?** No uso cotidiano, sim; tecnicamente ela precisa ser profissional **Creator** ou **Business**. Personal/consumer não atende a este MVP. Creator é a recomendação para sua atividade de conteúdo; Business, para Kyber Tech. Ambas atendem às APIs propostas. Se alguma for Personal, a conversão exige sua ação e avaliação das consequências no Instagram; não converter automaticamente. Verificar também visibilidade pública para eventos de comentários. A categoria retornada pela API pode aparecer como `Media_Creator` ou `Business`. [M1, M5, M12]

**Qual login?** Manter **Instagram Login direto**, sem intermediário pago. Ele evita exigir Página do Facebook e corresponde à integração principal já examinada no OpenReply. O login administrativo do PersonaFlow é outra coisa: identifica quem opera a interface, não concede acesso ao Instagram.

**Basta ser testador e gerar token?** Não. Papel no app, aceite do convite, nível de acesso, modo/publicação, permissões concedidas, inscrição de webhook e identidade da conta são verificações distintas. O teste real precisa comprovar cada uma; a divergência documental sobre acesso a webhooks está descrita abaixo.

**Publicar no GitHub abre acesso para terceiros?** Não. Quem instalar sua própria cópia usará seu app Meta. Quem conectar uma conta ao app de Igor passa pelo escopo e pelas aprovações desse app. Deixar o app Live também não concede Advanced Access automaticamente.

## O vídeo: evidência e correção

Foram lidos `analise.md` e `takes_packed.md` em `C:\Users\user\Downloads\edit\personaflow-tutorial`. A evidência visual abaixo vem da análise anterior; não houve nova inspeção de frames nem transcrição nesta sessão. Nenhuma credencial ou imagem do vídeo foi copiada. Guibchat não foi auditado e não há evidência de que use OpenReply.

| Orientação do vídeo | Evidência disponível | Correção ou complemento | Impacto no PersonaFlow |
|---|---|---|---|
| Criar app e selecionar “Gerenciar mensagens e conteúdo no Instagram” | Análise 05–17 s; caso de uso oficial M13 | Ainda é preciso escolher uma configuração de login e os recursos necessários | Usar caso de uso Instagram com Instagram Login |
| Adicionar Instagram como testador | Análise 18–22 s; O1 e papéis em M15 | Convite enviado não é aceite; repetir para cada conta; papel não equivale a consentimento OAuth | Checklist individual, sem presumir que a segunda conta herda acesso |
| Gerar token no Explorer | Análise 23–27 s, com scopes `pages_*` e `instagram_*` | Compatível com Facebook Login; não prova qual backend foi usado nem permissões de inbox; token não é integração durável | Não copiar scopes/token do vídeo; usar OAuth Instagram ou token do painel específico para experimento |
| Colar token no agente | Transcrição | Token é segredo; entregar ao runtime por armazenamento protegido, nunca chat | Agente prepara referências; usuário preenche secrets fora de transcript/log |
| Mensagem inicial, botão, seguir e link | Controles Guibchat, 30–52 s | UI não comprova eventos, janela, consentimento de perfil ou envio | Avaliar cada etapa; usuário depois solicitou opções por reel, mas não habilitar sem prova Meta |
| “Gratuito e ilimitado” | Fala transcrita | Há limites Meta, infraestrutura, operação e ferramentas; sem garantia de custo zero | Manter orçamento e limites já documentados |
| Interface semelhante ao ManyChat | Tela demonstrada | Uma interface familiar não substitui integração validada | Teste técnico antes da UI completa |

## Exemplo real informado pelo usuário

Em 27/09/2026 o usuário enviou três capturas de uma automação ativa da @somoskyber no ManyChat, distintas do vídeo Guibchat analisado acima. O fluxo seleciona publicações/reels específicos, reage à palavra `site`, publica uma resposta curta ao comentário, envia DM de apresentação com botão **“Quero minha prévia”** e, após a interação, mostra um texto com link para WhatsApp. A opção Pro de pedir para seguir antes do link aparece desligada; o usuário quer poder habilitar esse passo no PersonaFlow. E-mail e lembrete por clique não aparecem ativos. São observações da interface e intenção do usuário, não prova da capacidade do app Meta planejado. Os prints não estão versionados neste repositório.

O usuário esclareceu que configurará a automação pela interface **para cada reel**: seleção da mídia, gatilho, textos, etapas opcionais e link devem ser campos editáveis da receita, não conteúdo fixado em código. Isso não autoriza implementar a UI nesta fase. A viabilidade de resposta pública, botão e verificação de seguidor continua separada por endpoint/evento; cada etapa precisa de teste real e política de envio própria.

## App, conta e ambiente não são a mesma coisa

Proposta: `app operacional → conexão Conteúdo + conexão Kyber Tech`. O app fornece identidade/segredo de integração; cada conexão fornece identidade Instagram, credencial, escopos, expiração e inscrição próprias. Suspender ou reconectar uma não pode afetar a outra. Alterações de secret, permissão, revisão ou bloqueio do **app** podem afetar ambas: esse risco compartilhado é real.

Separar ambientes tem outro objetivo. Quando houver produção, testes de código usam transporte fake e banco separado; experimentos Meta usam app/contas de teste dedicados quando disponíveis. Não mudar callbacks/segredos do app operacional para testar uma branch. Um app de teste pode precisar de Live para receber eventos reais: “staging” não significa modo Meta Development. Não manter as mesmas duas contas respondendo simultaneamente por dois apps/instâncias sem validar roteamento.

Exceções para apps separados: ambientes com credenciais/callbacks independentes; responsáveis legais diferentes que não aceitem a administração conjunta; ou necessidade comprovada de ambos os tipos de login. O guia atual permite **uma configuração de login por app**; se implementar ambos, requer apps distintos. Nenhuma dessas exceções obriga um app por cada uma das duas contas atuais. [M13]

## Comparação das duas rotas

| Aspecto | Instagram Login — escolhido | Facebook Login — apenas comparação |
|---|---|---|
| Conta | Profissional Business/Creator | Profissional Business/Creator vinculada a Página |
| Quem autoriza | Pessoa entra com credenciais Instagram da conta que gerencia | Pessoa entra no Facebook com acesso/tarefas adequadas na Página |
| App ID para OAuth | Instagram app ID da seção Instagram | Meta app ID do app Facebook |
| Token | Instagram User access token | Facebook User token e Page token conforme operação; não intercambiáveis |
| Host de recursos | `graph.instagram.com` | `graph.facebook.com` |
| Perfil/comentários | `instagram_business_basic`, `instagram_business_manage_comments` | `instagram_basic`, `instagram_manage_comments`, `pages_read_engagement` e acesso à Página conforme operação |
| DM/inbox | `instagram_business_manage_messages` + basic | `instagram_manage_messages` + basic; permissões de Página e produto de messaging aplicáveis |
| Descoberta/assinatura | ID profissional e `subscribed_apps` por conta | Descoberta de Página/conta vinculada; `pages_show_list`, `pages_manage_metadata` para webhooks de messaging conforme documentação |
| Adequação | Menos pré-requisitos e aproveitamento direto do código estudado | Sem benefício demonstrado para o MVP; introduz Página e outra família de credenciais |

A coluna Facebook não é uma receita pronta nem lista exaustiva de permissões: o caso de uso atual pode incluir `business_management`; requisitos variam por operação e forma de gestão da Página. Não acrescentar esses scopes ao Instagram Login. O uso técnico de produtos Meta ligados a Messenger nessa rota não introduziria um canal Messenger no PersonaFlow. [M1, M5, M11, M13]

### Permissões mínimas na rota escolhida

| Função | Scopes / eventos |
|---|---|
| Identificar conta e obter mídias próprias | `instagram_business_basic` |
| Comentário → resposta privada | basic + `instagram_business_manage_comments`; evento `comments`; envio ancorado em comment ID |
| Resposta pública a comentário, se futura | basic + manage_comments; efeito independente da DM |
| Receber DM, responder e listar conversas | basic + `instagram_business_manage_messages`; `messages` |
| Resposta textual a story | Mesmos scopes/evento de DM; identificar `reply_to.story` |
| Botão postback, se futuro | basic + manage_messages; `messaging_postbacks` além de messages |
| Consulta de seguidor via User Profile | basic + manage_messages; IGSID elegível e consentimento de perfil; não há scope que elimine esse pré-requisito |

MVP solicita as três permissões `instagram_business_*` acima. Não pedir insights, publicação ou anúncios. O2 justifica manage_messages pelo fluxo comentário→DM, enquanto M2 lista basic/comments para private reply: usar a exigência por endpoint da Meta, não o texto de revisão upstream como norma. No PersonaFlow, manage_messages se justifica de forma independente pela inbox/DM. [M2, M3, M7, M16]

## Papéis, acesso, publicação e eventos reais

Papel de administrador/desenvolvedor dá acesso ao app; Instagram tester habilita a conta no contexto de teste. O convite precisa ser aceito pela identidade correta. O caminho atual pode oferecer **Add account** na configuração Instagram, realizando login/consentimento, ou convite em Roles com aceite no Instagram. Conferir o estado final, não exigir cliques em menus antigos. A documentação oficial de papéis limita testadores a pessoas que realmente testam em seu nome; não usar essa função como substituto de onboarding de clientes. [M13, M15; O1]

**Divergência D-META-01:** M1 e M6 descrevem Standard Access/dispensa de review para contas próprias ou gerenciadas, e M13 diz que review é necessário para soluções de clientes. Porém, M5 exige Live e sua tabela lista Advanced Access/verificação empresarial para Instagram Login; também afirma Advanced Access para `comments` e `live_comments`. O1 descreve operação própria em Live com Standard, mas ressalva que o painel pode exigir review. Não foi encontrada uma exceção oficial explícita, no guia de webhooks, que resolva toda essa diferença para o nosso app.

Conclusão conservadora: **não prometer automação própria por webhook sem review**. Considerar Live requisito documentado e Advanced Access/review um possível bloqueio também do fluxo próprio. Consultar o painel por permissão/campo e comprovar entrega por evento; se houver exigência de revisão, seguir o processo. Não ignorar a restrição porque um GET funcionou, nem transformar texto genérico de modos em regra específica da configuração Instagram. [M1, M5, M6, M13, M14]

| Condição | O que podemos concluir | Entrega real de eventos |
|---|---|---|
| Development, papel e consentimento válidos | Permite desenvolvimento e chamadas dentro dos acessos disponíveis | Não é condição de aceite: M5 exige Live; Test do painel só verifica parte do caminho |
| Live + Standard, contas próprias/testadoras | Cenário indicado em M1/M6/M13 e O1 | **Pendente por campo**, devido a D-META-01; comprovar comments e messages em cada conta |
| Live + Advanced concedido + conta autorizada/inscrita | Satisfaz requisito de nível descrito em M5 | Ainda depende de scopes, assinatura, inscrição, configurações de mensagens e evento real |
| Convite pendente, scope ausente ou conta não inscrita | OAuth/token pode não resolver a causa | Não considerar operacional |
| Botão Test do painel entrega HTTP 200 | Endpoint recebe o payload de teste | Não prova evento de usuário real, roteamento ou capacidade de enviar |

Separar **dono da conta conectada** de **pessoa que comenta/envia DM**. Um seguidor externo interagindo com a sua conta não é automaticamente um cliente conectando uma nova conta ao app. Mesmo assim, a entrega dessas interações em Standard deve ser testada com interlocutor externo, sem transformá-lo em testador apenas para ocultar uma limitação do cenário real.

| Uso | Modelo e condição |
|---|---|
| Conteúdo + Kyber na instalação de Igor | Um app, duas autorizações; conferir gestão legítima, papéis, scopes, Live e gate de eventos |
| Terceiros conectam ao app de Igor | Advanced Access, App Review, verificação empresarial e, se aplicável no painel, requisitos de Tech Provider/access verification. Sem cadastro aberto no MVP |
| Terceiro instala sua cópia e seu app | Configuração, publicação e aprovações próprias; mesmos gates. Código público não transmite token, papéis ou aprovação de Igor |

## Etapas do fluxo demonstrado

| Etapa | Suporte verificado | Limite e decisão |
|---|---|---|
| Comentário com palavra → DM | M2: uma resposta privada por comentário, até 7 dias; Live só durante transmissão | MVP em post/reel orgânico; não usar ID do comentarista como autorização para Send comum |
| Primeira DM → resposta escrita → próxima mensagem | M2/M3: resposta do destinatário permite follow-up dentro de 24 h | Viável; relógio baseado na interação elegível, não no envio da primeira DM |
| Botão `web_url` | M17: abre uma página | Clique não é mensagem nem prova de abertura da janela; tracking não concede permissão |
| Botão `postback` | M17: gera `messaging_postbacks` e permite tratar a seleção | Viável como interação; fonte lida não comprova toda combinação de private reply com template nem autorização universal de janela. Validar formato, postback e regra específica antes de habilitar sequência |
| Quick reply | M18: seleção posta texto como mensagem e gera `messages` | Evidência mais clara de resposta; limitada ao contexto suportado, com restrições de cliente. Não presumir que qualquer botão visual seja quick reply |
| Pedir para seguir | Texto e chamada à ação podem ser enviados se a mensagem já for elegível | Seguir o perfil não reabre sozinho a janela; não prometer automação ao novo seguidor |
| Verificar se segue | M16 expõe `is_user_follow_business` no User Profile | Consulta requer consentimento: mensagem da pessoa ou ações documentadas como icebreaker/menu persistente. Comentário sozinho não concede acesso ao perfil; bloqueio/ausência/erro = desconhecido, não false |
| Entregar link após verificação | Send é possível quando destinatário e janela forem elegíveis | Ser seguidor não substitui elegibilidade de envio. Sem loop insistente, consulta contínua ou fallback por leitura |
| DM e resposta textual a story | M3/M9: evento de mensagem; story em `reply_to` | MVP condicionado ao teste; não estender para visualização, likes ou enquete |

O perfil usa consentimento técnico da plataforma, que não substitui a avaliação de privacidade/LGPD. O OpenReply retorna `null` quando não obtém o status de seguidor e contém caminhos de entrega mesmo sem confirmação. Não usar isso como prova de “seguidor verificado”. Botão e follow gate foram solicitados como opções configuráveis, mas seguem sem autorização de implementação e sem prova Meta real; quando investigados, registrar `true/false/unknown`, nunca consultar perfil somente porque chegou comentário, e não liberar sequência baseada apenas em leitura ou clique em URL.

## IDs e segredos: inventário sem valores

| Referência | Origem e função | Armazenamento planejado |
|---|---|---|
| `META_APP_ID` | App Dashboard; identidade do app Meta, não confundir com Instagram app ID | Configuração do ambiente, sem necessidade de publicar valor |
| `INSTAGRAM_APP_ID` / `INSTAGRAM_APP_SECRET` | Seção Instagram Login; OAuth e troca do código | ID em config; secret em arquivo protegido/secret mount, somente servidor |
| `META_WEBHOOK_APP_SECRET` | App Secret do app que assina eventos, conferir origem no painel | Secret separado por finalidade; M5 refere App settings > Basic; validar assinatura real, não adivinhar nem aceitar secrets de outros apps |
| `WEBHOOK_VERIFY_TOKEN` | Gerado para nosso endpoint, repetido no painel | Secret local e painel; só challenge, não autoriza chamadas Meta |
| Instagram User token por conta | OAuth ou geração no painel específico Instagram | Cifrado no banco, com scopes, vencimento, app/conta e geração; nunca variável global única para duas contas |
| `TOKEN_ENCRYPTION_KEY` | Gerada para a instalação | Fora do banco, backup separado e rotação controlada |
| Código OAuth / state | Callback / nonce da aplicação | Efêmeros; state de uso único ligado à sessão e intenção; não logar query |
| `user_id` / `id` de `/me` | `user_id`: conta profissional; `id`: app-scoped | Guardar campos distintos; reconciliar `user_id` com `entry.id`; bloquear conexão se identidade não for comprovada |
| IGSID do interlocutor | `messaging.sender.id` de evento válido | Chave `(accountId, IGSID)`, nunca username como chave ou ID global entre contas |
| IDs de comentário/mídia/mensagem | API/eventos da conta | Escopados à conta, para roteamento, referência e deduplicação |

O callback upstream usa `user_id ?? id`; não copiar esse fallback silencioso. A integração deve falhar com diagnóstico se não confirmar a identidade usada pelos webhooks. Também não copiar sua aceitação de dois secrets como forma de resolver configuração desconhecida: identificar a chave correta para o app/caminho e provar a assinatura. [M5, M12; código em OPENREPLY]

## Roteiro operacional futuro

Todos os passos abaixo estão **planejados, não executados**. O agente pode preparar documentos, código e validação conforme autorização futura. Login, aceite e decisões legais/empresariais continuam com o proprietário. Não pedir credenciais em chat.

| Passo | Pré-requisito | Agente prepara / faz quando autorizado | Ação pessoal / externa | Prova de sucesso | Bloqueia |
|---|---|---|---|---|---|
| 1. Inventariar contas | Acesso do proprietário | Ficha sem secrets: categoria, gestão, visibilidade, integrações existentes | Conferir ambas; decidir conversão se consumer | Categoria/gestão confirmadas individualmente | Teste real e uso próprio |
| 2. Registrar proprietário/app | Conta Meta Developer; responsável definido | Checklist do caso de uso e names dos campos | Login/MFA; criar app e escolher Instagram Login; vincular empresa se exigido | App e rota corretos, sem confundir IDs; restrições do painel registradas | Toda API real |
| 3. Habilitar permissões/papéis | App definido | Lista mínima e estado por permissão/conta | Adicionar conta/convite; aceitar no Instagram correto e conceder acesso | Convite aceito/conta adicionada; permissões disponíveis e concedidas | Teste por conta |
| 4. Preparar HTTPS de experimento | Autorização futura; domínio e inventário VPS | Serviço mínimo isolado, proxy existente, TLS, health, secret mounts; nada de reutilizar script do vira-anuncio | Aprovar hostname/alteração de ambiente e fornecer secrets por canal protegido | Endpoint alcançável sem redirect, TLS válido, demais projetos intactos | Eventos reais e callback |
| 5. Configurar URLs | Endpoints implementados e testados localmente | URLs exatas de OAuth, webhook, deauth, exclusão e páginas públicas | Salvar no painel/confirmar valores | Challenge válido, callback exato e páginas públicas acessíveis | OAuth/webhook; publicação conforme painel |
| 6. Autorizar cada conta | Passos 1–5 | OAuth com state, troca server-side e validação da identidade; status separado | Login e consentimento primeiro em A, depois B; verificar username retornado | Duas conexões distintas; scopes/vencimentos próprios; `/me` e mídia acessíveis | Uso de cada conta |
| 7. Inscrever webhooks | Token válido e app com campos configurados | Assinar `comments,messages` por conta em `/{IG_ID}/subscribed_apps`; verificar estado retornado; postbacks só em experimento posterior | Conferir permissões de acesso a mensagens no Instagram, se solicitadas | Inscrição confirmada para A e B; webhook válido roteado corretamente | Automações/inbox em tempo real |
| 8. Resolver publicação/acesso | Aplicação mínima segura e páginas, requisitos do painel | Checklist Live versus níveis; preparar justificativas e demonstração se review for exigida | Publicar app com autorização; enviar documentos/review se exigidos; Meta decide | Modo, níveis, verificação e resultado de eventos anotados; D-META-01 resolvida por campo | Eventos reais; possivelmente uso próprio; obrigatoriamente terceiros conforme escopo |
| 9. Executar experimento PF-013 | Gates anteriores, envio restrito a casos acordados | Instrumentar/observar testes abaixo; relatar aceitação e recepção separadas | Criar interações controladas e confirmar recebimento | Fluxos reais nas duas contas e isolamento, sem aprovar por teste do painel | UI completa e piloto |
| 10. Operar tokens e reconexão | Conexões verificadas | Renovação antecipada, alerta, pausa de conta, reconexão e eliminação de token revogado | Reautorizar em revogação/expiração; consentir novamente | Nova credencial só da conta afetada; outra segue saudável | Continuidade daquela conta |
| 11. Abrir a terceiros, se futuro | Novo escopo autorizado e produto demonstrável | Onboarding, revisão, instruções e evidências por permissão | Responsável legal fornece comprovações e Meta aprova | Advanced Access por scope, verificação e acesso externo testados | Terceiros no mesmo app |

### URLs e VPS

Usar `<BASE_URL_HTTPS>` como referência, sem inventar domínio disponível. Rotas **planejadas**: `/api/meta/oauth/callback`, `/api/meta/webhook`, `/api/meta/deauthorize`, `/api/meta/data-deletion`, `/privacy`, `/terms` e `/data-deletion`. Ainda não existem. O path exato deve ser fixado com o código e registrado no painel; webhook GET/POST não é redirect OAuth. Não usar wildcard ou redirecionamento de www, barra final ou login no webhook.

A VPS existente é preferência, não ambiente já pronto. Inventário, isolamento, portas, TLS e autorização de alterações continuam necessários conforme OPERACAO. O experimento requer deploy mínimo próprio autorizado; não pressupõe instalar todo o produto. Se usar outra solução HTTPS temporária, avaliar estabilidade e custo antes, sem torná-la dependência permanente. Páginas de privacidade/termos/exclusão precisam descrever o PersonaFlow e ter responsável real; não publicar textos upstream como se validados para a Kyber.

### Ciclo do token

OAuth Instagram: autorização em `www.instagram.com/oauth/authorize`; troca de código em `api.instagram.com/oauth/access_token`; extensão em `graph.instagram.com/access_token` com `ig_exchange_token`; renovação em `graph.instagram.com/refresh_access_token` com `ig_refresh_token`. Não usar `fb_exchange_token` nem token de Página nesse fluxo. Os endpoints de recursos usam versão Graph fixada e validada; não inferir versão “latest” pelos exemplos. [M4]

Token do login é curto (1 h), trocado server-side por longo (60 dias). Token gerado no painel específico Instagram pode já ser longo (60 dias), segundo M12. Registrar validade retornada, não inferir pelo prefixo. A opção de painel é útil para diagnóstico antecipado, porém não prova o fluxo OAuth completo; não exigir OAuth pronto para simplesmente consultar elegibilidade. Se utilizada futuramente, inserir token em arquivo protegido por mecanismo sem eco, sem argumento de shell, clipboard compartilhado, chat ou log. Não gerar nenhum agora.

Refresh exige token longo ainda válido e com pelo menos 24 h. Agendar antecipadamente, salvar novo valor/vencimento atomicamente e impedir dois refreshes simultâneos. Revogação, troca de permissões ou expiração bloqueiam envios daquela conta; depois de reconectar, revalidar identidade, scopes e inscrição, cancelando jobs que perderam prazo. Token vencido não é recuperado insistindo no refresh.

## Experimento antecipado PF-013 — especificação, não execução

Objetivo: demonstrar que **o mesmo app** recebe e roteia eventos reais de ambas as contas e responde com a identidade correta, antes da interface completa. Dois tokens e dois GETs bem-sucedidos não são aprovação.

Pré-requisitos: autorização de implementação/teste/deploy mínimo separada desta sessão; contas A/B profissionais, app/rota documentados, servidor HTTPS isolado, persistência e envio seguro mínimos, relógio sincronizado, allowlist de casos de teste, logs sanitizados e nenhuma ferramenta concorrente respondendo ao mesmo gatilho. Interlocutor controlado com papel para teste inicial e interlocutor consentido **sem papel no app** para provar o cenário de audiência real. Não reutilizar credencial visível no vídeo.

O experimento não depende de canvas, métricas completas ou inbox pronta. Um coletor e um relatório restritos ao operador bastam; a implementação mínima ainda precisa de assinatura, persistência, deduplicação, política e pausa de emergência.

| Caso | Ação futura | Evidência exigida |
|---|---|---|
| E0 — inventário de acesso | Registrar Development/Live, Standard/Advanced e papéis/scopes de A/B | Estado real por permissão; tentativa inviável fica bloqueada, não passa por hipótese |
| E1 — identidade | Autorizar A e B separadamente; ler `/me` e mídia | A e B distintos, `user_id` conciliado com evento; segredo nunca no relatório |
| E2 — controle do endpoint | Teste do painel e assinatura inválida local | Teste recebido; inválido rejeitado; resultado classificado como controle técnico, não evento real |
| E3 — comentários | Comentário com nonce/palavra única em post/reel de A, depois B | Evento real `comments`, ação durável, ID de aceite e DM recebida pelo interlocutor vinda da conta correta |
| E4 — DM | Interlocutor envia palavra única a A e B | Evento real `messages`, resposta dentro da janela e identidade correta em cada conversa |
| E5 — story | Resposta textual a story de A e B | Payload real com contexto quando presente; resposta recebida. Falha bloqueia apenas suporte declarado a stories, não falsifica aprovação |
| E6 — público externo | Repetir E3/E4 com interlocutor sem papel no app | Provar interação de audiência real; anotar diferença de comportamento, modo/nível e erros |
| E7 — isolamento | Pausar A e revogar/reconectar A em passos separados; continuar B | A não usa token B; dados/jobs não cruzam; B permanece funcional; teste sem indisponibilizar integrações desconhecidas |
| E8 — repetição e crash | Reentregar fixture derivada/sanitizada e reiniciar worker no laboratório | Uma intenção; resultado incerto não reenvia. Evidência local separada de Meta real |
| E9 — janela | Fixture com relógio falso e, se necessário, conversa controlada comprovadamente fora de 24 h | Bloqueio local antes de enviar; leitura/clique URL não reabre janela. Não disparar chamada proibida só para “testar” |

Não mudar para Live e Advanced ao mesmo tempo sem registrar condições: isso impediria identificar a causa. Testar somente estados disponíveis e permitidos pelo painel; não solicitar revisão desnecessária só para preencher a matriz. Development fornece controle negativo/limitado, não é obrigação de forçar evento real onde a documentação não permite.

Relatório mínimo por caso: data UTC, versão Graph, ambiente/app por alias, conta A/B, nível por scope, modo, papel do interlocutor, resultado esperado/observado, IDs de correlação pseudonimizados, código de erro, recepção confirmada e pendência. Sem conteúdo pessoal, secrets ou screenshots brutos. Guardar detalhes privados fora do repositório quando necessários.

**Passagem:** E1, E3, E4 e E6 aprovados nas duas contas, com assinatura/roteamento e isolamento comprovados; controles E2/E7/E8/E9 aprovados no ambiente correspondente. E5 é gate para stories. Se só funciona com testadores, só chega Test do painel, apenas uma conta funciona ou comments exige review ainda não concedida, registrar bloqueio; não construir o restante da UI como se a integração estivesse pronta. Não substituir webhook ausente por polling silencioso para declarar sucesso.

Botões e follow gate terão experimento separado PF-104, se priorizados depois: private reply com formato suportado → postback/quick reply real → verificação da elegibilidade da próxima mensagem → consulta de perfil autorizada; testar seguidor, não seguidor e status desconhecido. Repetição do botão não pode duplicar link. Não fazer chamada sem consentimento apenas para confirmar uma restrição já documentada.

## Diagnóstico de falhas comuns

| Sintoma | Conferir antes de tentar novamente |
|---|---|
| “Insufficient Developer Role” | Conta correta, convite aceito e papel efetivo; login do administrador Meta não adiciona automaticamente todo Instagram |
| OAuth funciona, `/me` falha | Host/token da mesma rota, scopes concedidos, ID de app correto, conta/papel; código 100 isolado não prova uma única causa |
| `/me` funciona, evento real não chega | Live, D-META-01/acesso do campo, assinatura do app e inscrição por conta, conta pública para comentários, integração concorrente e configuração de mensagens |
| Test do painel chega, real não | Separar conectividade de elegibilidade; não atribuir automaticamente à fila/worker |
| Uma conta funciona, outra não | Autorização, aceite, subscription, token, `user_id` e geração daquela conexão; não copiar token da primeira |
| 401 na recepção | Secret do app assinante, bytes originais, header e proxy; verify token não é chave HMAC |
| Callback negado | URL exata, HTTPS e state/sessão; não registrar código OAuth em log |
| Private reply recusada | Comentário próprio, prazo, resposta já usada, mídia/campo elegível; separar de Send comum |
| Botão abre site, nenhuma continuação | `web_url` não é `postback` nem quick reply; comportamento esperado |
| Flag de seguidor ausente | Consentimento de perfil, bloqueio, IGSID/conta, permissões; manter unknown, sem retries insistentes |
| Refresh recusado | Token ainda curto, longo com menos de 24 h, expirado/revogado ou scopes; não confundir fluxo Facebook |
| Limite ou resposta perdida | Respeitar cooldown; resultado desconhecido não autoriza repetir envio |

## Intervenções indispensáveis

Continuam pendentes Q1/Q2: fluxos reais e categoria/app atual. Acrescentar ao inventário: gestão das duas contas, possibilidade de torná-las públicas/profissionais se necessário, integrações de DM já ativas, estado/papéis no painel e disponibilidade de interlocutor de teste sem papel. Para HTTPS, domínio e autorização específica de alteração da VPS. Se o painel exigir review/verificação, o proprietário fornece consentimentos/documentos e a Meta decide; o agente pode preparar material e registrar evidência, não eliminar essas etapas.

Não é necessário enviar tokens, senhas ou captura do painel de secrets para responder essas pendências. As decisões de base menor, fila em PostgreSQL, receitas, separação de contas e ausência de assinaturas adicionais permanecem.

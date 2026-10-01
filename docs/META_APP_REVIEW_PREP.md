# Pacote de preparação para análise do app Meta, piloto @somoskyber

Preparado em **30/09/2026** e atualizado com o teste real de **01/10/2026** para a configuração Instagram Login do app PersonaFlow Kyber. Este é um pacote para preencher a análise e gravar o screencast. O documento não solicita acesso nem envia submissão.

## Leitura do estado e limite desta preparação

| Afirmação | Classificação | Evidência e limite |
| --- | --- | --- |
| O piloto é somente a conta profissional @somoskyber e uma resposta privada disparada por um comentário controlado no Reel escolhido. | Implementado e testado | `src/jobs/pilot-setup.ts` fixa conta, Reel e termo; a decisão e o transporte fixam também o ID do comentário. O teste real no Reel de 20/09 foi concluído em 01/10, conforme `STATUS.md`. |
| O OAuth pede `instagram_business_basic`, `instagram_business_manage_messages` e `instagram_business_manage_comments`. | Código e uso real parcial | O callback vinculou a conta e a API confirmou leitura de mídia e comentários; uma DM de teste foi aceita e apareceu na conta pessoal. Isso não comprova acesso avançado para contas sem papel no app. |
| A Meta receberá um pedido de Advanced Access somente se for preciso para esse piloto. | Decisão pendente | As fontes locais têm a divergência D-META-01: parte da documentação descreve Standard para uso próprio, mas a página específica de webhooks pode exigir Live e Advanced para `comments`. A decisão depende do painel e de um teste real autorizado. |
| No painel, o caminho “Adicionar à análise do app” exige Provedor de Tecnologia, com verificação empresarial, verificação de acesso e App Review, e alerta que essa identificação não pode ser revertida. | Confirmado no painel em 01/10 | O modal foi reproduzido após a DM controlada; a ação irreversível não foi confirmada. Decisão de Pedro solicitada. |
| Retenção, exclusão e política pública estão definidas para o piloto. | Fato parcial | A política está publicada em `https://somoskyber.com.br/privacidade/personaflow`, segundo `docs/STATUS.md`; a rotina local de redação está implementada, mas o fluxo Meta de desautorização/exclusão e a validação operacional de logs ainda não estão comprovados. |

### Estado atual antes da análise

1. O Reel orgânico da Kyber foi escolhido e seu ID registrado na configuração privada. A web HTTPS, o banco e o worker estão ativos; o envio está desligado após o teste.
2. OAuth, assinatura de `comments`, webhook real, seleção do comentário, aceite da API e DM recebida na conta pessoal foram observados em 01/10. Não repetir a DM para preencher checklist.
3. A decisão sobre a identificação irreversível como Provedor de Tecnologia continua pendente. O teste com a conta de Pedro não prova acesso a comentários de clientes sem papel no app.
4. Para submissão, ainda faltam os campos exigidos pela Meta, a demonstração revisável da interface de produção, o fluxo de exclusão/desautorização exigido e provas operacionais de retenção. Não declarar esses pontos concluídos por causa do piloto.

## Descrição curta para o formulário de análise

> O PersonaFlow Kyber é uma ferramenta interna, sem cadastro público, usada exclusivamente pela Kyber Tech para operar a conta profissional @somoskyber. Um operador autorizado conecta essa conta por Instagram Login. A ferramenta recebe comentários e mensagens dessa conta, mostra a inbox para atendimento humano e, no piloto, envia no máximo uma resposta privada previamente aprovada em resposta a um comentário controlado em um Reel específico. Não envia campanhas, mensagens frias, broadcasts, anúncios, conteúdo, respostas em contas de terceiros nem usa dados para publicidade ou venda.

Não afirmar no formulário que o app atende clientes, permite que terceiros conectem contas ou substitui toda a funcionalidade do ManyChat. Isso mudaria o escopo apresentado ao revisor.

## Justificativa por permissão

| Permissão aprovada | Necessidade concreta no piloto | Demonstração no screencast | Dados e controles | Fora do escopo |
| --- | --- | --- | --- | --- |
| `instagram_business_basic` | Identificar a conta profissional que acabou de autorizar o app, confirmar a identidade da conexão e restringir a execução à @somoskyber. | Após o consentimento, mostrar o status conectado e a conta exibida como @somoskyber, sem token ou IDs completos. | O callback busca `user_id` e `id`; o código não aceita fallback silencioso entre eles. Credencial é por conta e deve ficar cifrada no servidor. | Não consulta seguidores em massa, insights, mídia de terceiros, anúncios ou publicação de conteúdo. |
| `instagram_business_manage_comments` | Inscrever apenas o campo `comments`, receber o comentário no Reel piloto e usar o ID daquele comentário como destinatário da única resposta privada. | Mostrar a inscrição de `comments`, depois o comentário controlado chegando à fila e sendo selecionado pelo seu ID interno/mascarado. | Uma regra é ligada a uma única conta, um único Reel e a palavra aprovada. O transporte exige o mesmo ID profissional, o comentário exato e o texto exato. Falha ambígua vira `unknown`, sem reenvio. | Não responde publicamente, não monitora Lives/anúncios e não processa comentários de outros Reels no piloto. |
| `instagram_business_manage_messages` | Operar a inbox e responder a DMs recebidas dentro das regras da plataforma; após uma resposta privada, tratar a eventual resposta voluntária da pessoa no atendimento humano. | Depois da DM de teste, mostrar que eventual resposta do interlocutor aparece como conversa e que não há nova automação nem sequência. Se não houver resposta, declarar essa etapa não exercitada. | O produto trata janela, pausa e assunção manual como gates. Conteúdo de DM/notas é retido por até 90 dias e pode ser excluído sob solicitação. | A primeira resposta privada ancorada no comentário é justificada tecnicamente por `basic` + `manage_comments` nas fontes locais. Esta permissão não deve ser apresentada como autorização para iniciar DMs, usar listas ou prolongar a janela de mensagens. |

O conjunto é mínimo para a combinação de comentário, resposta privada e inbox. Não incluir permissões de publicação, anúncios, insights, perfil de seguidor, campanhas ou Facebook Login. A regra por endpoint e as limitações permanecem em [META_ONBOARDING](META_ONBOARDING.md#permissões-mínimas-na-rota-escolhida) e [VIABILIDADE](VIABILIDADE.md#caminho-principal-e-requisitos).

## Roteiro de screencast para o revisor

Gravar um vídeo contínuo, em uma conta de teste ou ambiente controlado autorizado para o app, com narração em português simples. Não mostrar token, App Secret, URL de callback com código OAuth, cookie, ID integral de pessoa, mensagem de cliente, painel de variáveis nem servidor. Usar uma segunda conta controlada apenas para comentar e, se desejado, responder à DM.

| Cena | O que mostrar e narrar | Prova para o revisor | Dependência a marcar |
| --- | --- | --- | --- |
| 1. Escopo | Tela inicial do PersonaFlow com “Piloto interno @somoskyber”, sem opções de cadastro ou conexão de clientes. Dizer que o app não faz envio em massa e que o teste trata uma única resposta privada. | Finalidade limitada e operador responsável. | A tela de produção e o login GitHub real precisam estar funcionais. |
| 2. OAuth | Clicar em “Conectar Instagram” pela interface autenticada. Mostrar a tela oficial Instagram Login, a conta profissional de teste/@somoskyber e os três nomes de permissão. Conceder acesso. | Consentimento explícito e uso dos scopes pedidos. | Meta/UI pode mudar textos, ordem, nomes e telas. Pausar a gravação apenas para ocultar credenciais, nunca para encenar resultado. |
| 3. Retorno seguro | Retornar ao PersonaFlow. Mostrar somente conta rotulada, conexão saudável, vencimento em formato relativo e escopos concedidos. Não revelar token, `state`, `code`, IDs ou cabeçalhos. | A autorização chega ao servidor e fica vinculada à conta certa. | O callback real e a troca de token ainda precisam ser executados e observados. |
| 4. Assinatura | Mostrar a ação de inscrever somente `comments` e o estado confirmado após consulta. Explicar que OAuth não é prova de webhook. | Limite de eventos solicitado para o piloto. | A tela/ação precisa usar o adaptador real; `src/integrations/meta/subscribe.ts` só confirma após POST e GET. |
| 5. Regra limitada | Mostrar a regra “Kyber · prévia · piloto”: uma conta, um Reel escolhido, a palavra `prévia`, status rascunho/ativo e o texto aprovado. Mostrar que envio permanece `disabled` durante a captura. | Critérios de elegibilidade antes de qualquer envio. | O Reel e seu ID precisam estar definidos. A interface pode exigir uma visualização específica para essa regra. |
| 6. Comentário controlado | Na segunda conta controlada, abrir o Reel e comentar exatamente `prévia`. Voltar ao PersonaFlow e mostrar a chegada do evento, com corpo/autor borrados na gravação se a tela os trouxer. | Comentário real, na mídia correta, recebido pelo webhook. | Exige app Live/acesso efetivo, HTTPS, assinatura e interlocutor autorizado. Resultado de “Test” no painel não serve. |
| 7. Seleção explícita | Com envio ainda desabilitado, mostrar a lista sanitizada de candidatos e selecionar somente aquele comentário. Narrar que os demais ficam bloqueados. | Nenhum comentário comum dispara uma DM. | O comando atual de candidatos não expõe autor/corpo, e a UI precisa preservar essa minimização. |
| 8. Uma DM privada | Mostrar a habilitação temporária e controlada do único envio, então o recebimento da DM pela segunda conta. Mostrar o texto integral previamente aprovado e que não há botão, link, resposta pública ou sequência. | Ação externa concreta: uma resposta privada recebida. | Exige autorização específica para ativar o envio. Um timeout/5xx deve encerrar como `unknown`, sem refazer a tentativa. |
| 9. Inbox e parada | Opcionalmente, a segunda conta responde uma frase neutra. Mostrar a conversa na inbox, a opção de assumir/pausar e que nenhuma nova mensagem automática é criada. | `manage_messages` usado para atendimento e não para automação ilimitada. | Se a pessoa não responder ou a Meta não entregar o evento, declarar a etapa não comprovada. |
| 10. Privacidade e exclusão | Abrir a política pública e a instrução de exclusão. Mostrar na interface ou em registro sanitizado os prazos de retenção e a execução em simulação, sem executar exclusão de dados reais durante o vídeo. | Transparência, retenção e canal de solicitação. | A implementação/verificação do callback Meta de exclusão e a validação dos logs de produção continuam pendentes. |

### Texto aprovado da DM do teste

O texto que o código do piloto já fixa é: “Oi! Vi seu pedido de prévia. Me manda o @ do seu negócio ou algumas fotos para eu entender o que você faz? Eu continuo por aqui depois.”

Usar esse texto somente depois de ele ser confirmado como o texto submetido e de o comentário controlado ser selecionado. Não acrescentar link, botão, resposta pública, pedido para seguir ou variação automática na gravação. Esses recursos têm gates próprios e não são necessários para comprovar este piloto.

## Instruções que acompanham a análise

Preencher os campos de instrução ao revisor com estas informações, adaptadas apenas aos rótulos da interface Meta:

1. O revisor usa a conta de teste fornecida no campo específico pela Meta, ou uma conta Meta/Instagram que a própria Meta orientar. Não incluir senha em documento, vídeo, repositório ou chat.
2. Após entrar, abrir o PersonaFlow, autenticar como operador permitido e iniciar “Conectar Instagram”.
3. Conceder as três permissões solicitadas e voltar à tela de conexão. Confirmar que a conta exibida é a conta de teste vinculada ao review, nunca uma conta de cliente.
4. Abrir o Reel de teste indicado na submissão e comentar exatamente `prévia` a partir da conta controlada indicada. Aguardar o evento na tela de eventos.
5. Confirmar que a ferramenta só permite selecionar esse comentário e enviar a única resposta privada demonstrada. Conferir a DM na conta controlada.
6. Se o revisor responder, abrir a inbox e confirmar que a conversa fica disponível para atendimento humano. Não esperar sequência automática.

Antes de enviar instruções, confirmar no painel Meta qual campo aceita credenciais, se a Meta exige conta de teste adicionada ao app e se o reviewer pode completar OAuth sem papel no app. Essas condições são dependentes da UI/processo Meta e não devem ser inventadas para cumprir o formulário.

## Política, retenção e exclusão a apresentar

| Item | Estado a declarar | Evidência local |
| --- | --- | --- |
| Política pública | Publicada em `https://somoskyber.com.br/privacidade/personaflow`; não alegar que a publicação substitui a validação do reviewer. | `docs/STATUS.md` registrou HTTP 200 e o uso da URL no painel em 30/09. |
| Finalidade | Receber interações da conta @somoskyber e permitir atendimento/uma resposta privada de piloto configurada. | Escopo deste documento e `docs/PRODUTO.md`. |
| Conteúdo de mensagens e notas | Até 90 dias desde o recebimento/atualização; depois o conteúdo é redigido, preservando metadados operacionais mínimos. | [RETENTION](RETENTION.md#prazos-e-efeito). |
| Payload bruto de diagnóstico | Até 7 dias, somente depois de processamento; não manter corpo se os campos normalizados bastarem. | [RETENTION](RETENTION.md#prazos-e-efeito). |
| Logs sanitizados | Até 30 dias. A instalação e a inspeção de logs reais ainda são pendentes. | [RETENTION](RETENTION.md#logs-sanitizados). |
| Pedido de exclusão | Exclusão sob solicitação. Contato excluído remove mensagens, notas e jobs pendentes; backup deve reaplicar o journal de exclusões no restore. | [OPERACAO](OPERACAO.md#privacidade-e-retenção). |
| Desautorização e callback Meta | Necessários conforme a configuração Meta escolhida; rotas/callback autenticado ainda não têm prova real. | [META_ONBOARDING](META_ONBOARDING.md#urls-e-vps) e [OPERACAO](OPERACAO.md#privacidade-e-retenção). |

Não declarar ao revisor que dados são anonimizados só porque algum identificador foi hashado. Não dizer que exclusão local apaga a mensagem do Instagram. Não usar uma base legal ou prazo legal que não foi definido pelo responsável jurídico.

## Checklist de evidências antes de abrir a análise

### Escopo e titularidade

- [ ] Captura sanitizada do painel mostrando o app, o caso de uso Instagram Login e as três permissões, sem segredo ou token.
- [x] Confirmação em 01/10 de que @somoskyber é profissional, pública e administrada pelo portfólio Kyber Tech.
- [ ] Decisão documentada: uso próprio permanece elegível ou a mudança irreversível para Provedor de Tecnologia foi aprovada pelo responsável.
- [ ] Nenhuma conta de cliente, cadastro aberto ou função fora do piloto aparece no vídeo, descrição ou instruções.

### Aplicação e OAuth

- [ ] URL HTTPS pública exata de callback acessível, sem redirecionamento indevido, e registrada no painel conforme a configuração escolhida.
- [ ] `state` de uso único, vínculo a sessão e PKCE/callback validados no ambiente real, sem registrar valores secretos no vídeo.
- [ ] Registro sanitizado de `user_id` distinto de `id`, com a identidade profissional conciliada ao evento.
- [ ] Credencial cifrada por conta, expiração registrada e reconexão separada da outra conta.

### Comentário e DM controlados

- [x] Reel orgânico da Kyber escolhido, com ID conferido pela API oficial e pela interface em 01/10.
- [x] Webhook HTTPS validado pelo challenge; um evento real chegou após a assinatura configurada.
- [x] Inscrição de `comments` confirmada por consulta à API e painel em 01/10; `messages` também consta como campo assinado no app, sem automação de resposta.
- [x] Comentário externo controlado `prévia` recebido no Reel escolhido às 02h54 UTC de 01/10; ID registrado sem corpo de cliente.
- [x] Regra de teste restringe conta, Reel, comentário exato, texto aprovado, token, geração, prazo e limite; código e integrações revisados em 01/10.
- [x] Uma DM apareceu na conversa da conta pessoal de Pedro no Instagram Web em 01/10. Captura privada pode compor screencast sanitizado; recebimento por cliente não foi testado.
- [ ] Timeout, rede ou 5xx deixam a intenção como incerta e bloqueiam reenvio automático.

### Privacidade e operação

- [ ] Política pública, termos se exigidos pela UI e instruções de exclusão acessíveis ao revisor.
- [ ] Teste de retenção em banco controlado evidencia 7/90/30 dias sem imprimir conteúdo pessoal.
- [ ] Fluxo de pedido de exclusão, desautorização e restauração com journal revisado antes de dados reais.
- [ ] Log real revisado para confirmar ausência de tokens, códigos OAuth, payloads, cookies e corpo de mensagens.
- [ ] Pausa por conta/receita/conversa e assunção humana impedem automação concorrente.

## Perguntas de verificação antes de decidir por Advanced Access

Registrar a resposta, data, tela e, se existir, código sanitizado. Uma resposta desconhecida não vira “não”.

1. O painel permite concluir o piloto de uma conta própria/gerenciada com Standard Access em Live, incluindo `comments` e `messages`, ou bloqueia um desses campos por Advanced Access?
2. “Adicionar à análise do app” é o único caminho para liberar o scope/campo bloqueado, ou há um fluxo específico de uso próprio para o caso de uso Instagram Login?
3. A opção Provedor de Tecnologia muda somente a identificação do app ou também impõe acesso externo, dados empresariais, verificações periódicas ou obrigações de suporte? Quais campos o painel mostra antes da confirmação irreversível?
4. A verificação empresarial deve usar a Kyber Tech/empresa do Pedro, e essa entidade é a titular correta do app e da política publicada? Esta é uma decisão empresarial, não um campo técnico a preencher por suposição.
5. O painel pede verificação de acesso para o piloto interno, e qual evidência ele aceita para demonstrar operador, conta conectada e destinatário controlado?
6. Para cada permissão, o reviewer precisa de conta Meta, Instagram ou ambas, e como a Meta disponibiliza/aceita a credencial de teste sem ela aparecer no vídeo?
7. A configuração atual do app pede data-deletion callback, deauthorize callback, URL de instrução ou termos adicionais? Quais URLs exatas e verificações de resposta serão exigidas?
8. Depois de Live/Review, que eventos reais são entregues para um comentário e uma resposta de DM de uma conta sem papel no app? Registrar `comments` e `messages` separadamente.
9. O endpoint usado para private reply aceita a combinação atual de versão Graph, conta profissional, escopos e comentário de Reel, e a Meta retorna uma confirmação rastreável sem armazenar conteúdo desnecessário?
10. A revisão permite limitar a demonstração à resposta privada e à inbox, deixando resposta pública, botões, follow gate, links e stories desligados? Se não, por quê cada recurso adicional seria necessário?

## Referências e limites de fonte

As referências primárias para anexar ou abrir durante o preenchimento estão em [FONTES](FONTES.md#meta): overview, App Review, Instagram Login, Private Replies, Messaging, Webhooks, Conversations e caso de uso Instagram. Nesta preparação, a reconsulta pela ferramenta web em 30/09 falhou com 429 na página de App Review e os demais caminhos oficiais não ficaram acessíveis por essa ferramenta. Por isso, os requisitos externos acima preservam a leitura oficial rastreada em 27/09 no repositório e devem ser confrontados com o painel antes da submissão.

Links internos desta página foram verificados em 30/09 contra os arquivos locais existentes. URLs da Meta, o fluxo de review e os rótulos do painel são dependências externas e podem mudar sem alteração deste repositório.

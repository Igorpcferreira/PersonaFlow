# Viabilidade do Instagram

Regras consultadas em **27/09/2026**. Fontes oficiais identificadas em [FONTES](FONTES.md), IDs M1–M9. APIs são viáveis no papel; nenhuma conta, permissão ou mensagem real foi validada nesta sessão.

Complemento da mesma data: [META_ONBOARDING](META_ONBOARDING.md) distingue papéis, publicação e níveis, compara o tutorial e especifica o experimento em duas contas. **D-META-01:** o guia de webhooks M5 exige Live e lista Advanced Access/verificação, inclusive restrição expressa para comments, enquanto M1/M6/M13 descrevem uso próprio com Standard. Não considerar entrega de eventos reais garantida com Standard antes de esclarecer essa divergência por campo/app e executar PF-013. Esta ressalva qualifica as linhas de viabilidade abaixo.

## Caminho principal e requisitos

Usar **Instagram API with Instagram Login**. Exige conta profissional Business ou Creator; não exige Página do Facebook vinculada. Uma conta de uso pessoal pode ser Creator, Business ou consumer: verificar ambas antes de investir. Não há caminho oficial aqui para conta consumer permanecer consumer e usar as funcionalidades propostas. Facebook Login é alternativa para necessidades específicas futuras, com Página vinculada e permissões diferentes; não implementar os dois caminhos no MVP. [M1, M11]

Solicitar `instagram_business_basic`, `instagram_business_manage_comments` e `instagram_business_manage_messages`. A documentação de private replies exige basic + comments; mensagens/conversas exigem basic + messages. Solicitar as três porque o MVP inclui ambos. Não pedir publicação, anúncios ou insights para métricas calculadas pelo próprio produto. Não misturar scopes antigos `business_*` ou os do Facebook Login. [M2–M5]

Fluxo: app Meta configurado → redirect OAuth HTTPS exato → autorização por responsável da conta → troca server-side do código → token longo → assinatura do app nos campos necessários → inscrição de **cada conta** em `subscribed_apps` → evento real de teste. Configurar permissões de acesso a mensagens e papéis/testadores conforme painel. O callback de autorização e o webhook são endpoints distintos. [M4, M5]

Tokens longos têm validade de 60 dias; refresh exige token válido, com pelo menos 24 horas, e permissão basic. Token expirado não é recuperado por refresh: reconectar. Revogação pode ocorrer antes da validade. Armazenar o `expires_in`/vencimento retornado; renovar antecipadamente, sem assumir credencial permanente. [M4]

## Uso próprio, código público e terceiros

| Situação | Condição |
|---|---|
| Duas contas próprias/gerenciadas | Um app operacional, duas conexões. Standard é previsto em M1/M6; porém M5 restringe webhooks. Conferir papéis/aceites, scopes, Live e eventual review; testar eventos reais, inclusive de interlocutor externo, conforme D-META-01 |
| Publicar código e vídeo de demonstração | Não equivale a publicar um app aprovado. Usar dados fictícios e não expor credenciais |
| Outra pessoa instala sua cópia para contas próprias | Ela provisiona seu app e credenciais e valida o próprio acesso; a revisão de Igor não é herdada nem necessária só porque o código é público |
| Outras pessoas conectam contas ao app de Igor | Advanced Access por permissões, App Review e verificação empresarial conforme requisitos da Meta; onboarding público é fase futura |

A documentação de overview exige verificação da empresa para Advanced Access/uso por usuários externos aos papéis aplicáveis. O painel definirá documentos e etapas concretos, ainda desconhecidos. Preparar política de privacidade, exclusão de dados, URLs públicas, identidade da empresa, chamadas bem-sucedidas, instruções de teste e screencast de cada permissão. Não prometer prazo ou aprovação. Verificações recorrentes de uso de dados e alertas do painel fazem parte da operação futura. [M1, M6]

## Matriz de funcionalidades

Esforço relativo: P = pequeno componente local; M = vários componentes; G = integração/estado concorrente. Não são prazos. “Oficial” indica suporte documentado, não acesso concedido.

| Funcionalidade / valor | Suporte e requisitos | Limitações / risco | Esforço | Decisão |
|---|---|---|---|---|
| Inbox e texto manual / alto | Conversations + Send; basic/messages; M3, M7 | Janela 24 h; grupos não suportados; histórico incompleto; risco de duplicar envio | G | MVP |
| Comentário com palavra / alto | Private Replies; basic/comments, webhook comments; M2 | Uma resposta por comentário, até 7 dias; novo comentário é outro evento; inbox ou solicitações conforme relação | M | MVP, post/reel orgânico escolhido |
| Resposta DM por palavra / alto | Send + messages; M3 | Pessoa inicia; 24 h; echo não dispara; concorrência com atendimento | M | MVP |
| Resposta textual a story / médio-alto | Evento messages com `reply_to.story`; M3, M9 | Só texto recebido elegível; não todas as interações; comportamento real pendente | P sobre DM | MVP condicional ao teste |
| Menção em story / médio | Payload `story_mention`; M9 | Contexto e conteúdo variáveis; menção não se confunde com reply textual nem autorização genérica | M | Mostrar contexto se recebido; automação adiada |
| Curtidas, visualizações, votos em story / baixo por ora | Não foi comprovado gatilho oficial adequado a estes fluxos | `story_insights` não é lista de espectadores acionável para DM | G/incerto | Fora; não prometer |
| Pausa e atendimento / alto | Estado local + política de envio | Não para apps externos; envio já em trânsito não é cancelável | M | MVP obrigatório |
| Contatos, nota, aberta/resolvida / médio | Dados locais derivados de conversas | Isolamento, minimização e exclusão; não importar seguidores | P | MVP dentro da inbox |
| Métricas de execução / alto | Contadores locais | Aceito pela API não prova entrega/leitura/conversão | P | MVP |
| Tracking e campanhas organizacionais / incerto | Redirecionamento próprio é possível; não depende de nova permissão Meta | Bots/previews distorcem CTR; domínio, abuso e privacidade | M | Adiar; receitas têm nome e métricas |
| Broadcast, sequência após comentário sem resposta / não necessário | Private reply não abre continuidade por si; M2, M3 | Não há autorização irrestrita de envio; leitura/link não abre janela | G | Fora |
| Human Agent além de 24 h / possível valor | M1 relido confirma resposta humana em até 7 dias; M3/M6 indicam recurso | Habilitação/revisão no app precisam ser confirmadas; jamais usar para automação | M | Adiar; MVP bloqueia envio API após 24 h |
| Opção de seguir antes do link / incerto | Usuário solicitou em 27/09/2026; M16 documenta `is_user_follow_business` no User Profile | Exige consentimento de perfil; comentário sozinho não basta; indisponível é unknown; seguir não reabre janela nem autoriza follow-up | M | Prioridade do piloto pendente; prova separada PF-104 antes de habilitar |
| Comentários de Live/anúncios / baixo | Private Replies documenta casos, M2 | Live somente durante transmissão; anúncios têm dependências próprias | G | Fora |

## Regras que mudam o produto

- **Comentário:** usar `recipient.comment_id`, nunca transformar automaticamente o ID do autor em permissão para DM comum. Uma resposta privada não inicia uma sequência. Se o destinatário responder, passa a valer a janela de mensagens. [M2]
- **DM:** 24 horas contadas da última mensagem elegível da pessoa, pelo timestamp do evento; não da entrega tardia do webhook, da resposta do bot ou do carregamento da inbox. Modo manual não estende prazo por si só. [M3]
- **Histórico:** Requests sem atividade há 30 dias não retornam; a documentação de Conversations limita detalhes recuperáveis às 20 mensagens mais recentes, ainda que liste IDs anteriores. Não prometer importação integral. Persistir novos eventos dentro da retenção definida. [M7]
- **Rate limit:** documentação lista 750 private replies/hora/conta para posts/reels, 2 chamadas/segundo/conta para Conversations e limites distintos para Send e mídia. Não usar 750 como limite universal nem meta de crescimento. Reservar margem, observar cabeçalhos/erros e revalidar versão. [M8]
- **Webhooks:** HTTPS público, challenge de verificação e HMAC do corpo original. Inscrever app e contas; Live é requisito documentado, não sinônimo de Advanced Access. Resolver D-META-01 antes de aprovar operação. A documentação geral descreve retries por até 36 h e ressalva diferenças de eventos de mensagens; não depender disso como armazenamento ou garantia de replay. Não há busca histórica de todos os webhooks. [M5]

## Até onde substitui ManyChat

O conjunto proposto cobre entrega de material por comentário, respostas simples por palavra-chave, respostas textuais a stories e atendimento básico. Não cobre todas as automações do ManyChat, CRM, campanhas avançadas, editor visual, catálogo de integrações ou suporte operacional contratado.

Avaliação final requer os fluxos reais do usuário. Usar o piloto para comparar resultado, minutos de manutenção, falhas, custo de infraestrutura e custo da assinatura evitada. Se app/permissões impedirem até os fluxos essenciais, reavaliar antes de construir UI; provedor pago é contingência comercial sujeita a aprovação, não requisito escondido.

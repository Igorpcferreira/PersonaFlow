# Produto e MVP

## Objetivo

Reduzir o trabalho repetitivo de responder pedidos de conteúdo e primeiros contatos comerciais no Instagram, com controle visível sobre o que cada conta envia. O primeiro operador é Igor; as duas contas representam contextos separados: criação de conteúdo e Kyber Tech. Outros desenvolvedores poderão instalar suas próprias cópias. Não haverá cadastro público, cobrança ou administração de clientes na instância inicial.

Substituir o ManyChat é uma hipótese de adequação aos fluxos realmente usados, não promessa de equivalência. Em 27/09/2026 o usuário forneceu um exemplo real da @somoskyber em três prints; ainda faltam exemplos específicos da @igor_cferreira, volume e custo da assinatura. A [matriz de viabilidade](VIABILIDADE.md) separa possibilidade técnica de prioridade.

## Menor produto útil

1. Conectar duas contas profissionais elegíveis, com credenciais próprias e troca de contexto explícita.
2. Inbox por conta: conversas recebidas, leitura, resposta de texto, estados aberta/resolvida e filtro de atendimento manual. Perfil do contato e uma nota simples dentro da conversa; sem CRM separado.
3. Receita **comentário com palavra-chave → uma DM de texto com link**, vinculada a um post ou reel orgânico escolhido.
4. Receita **DM com palavra-chave → resposta de texto**, incluindo resposta textual a story recebida como mensagem, sujeita a validação real desse evento.
5. Pausar automação por conversa, por receita ou por conta; assumir manualmente e retomar explicitamente.
6. Diagnóstico de conexão, eventos, ações pendentes, falhas e métricas operacionais básicas.

Automação nasce em rascunho. Ativação exige conexão saudável, receita válida e contexto de conta visível. Não iniciar pela UI completa: validar primeiro as duas contas e a entrega oficial de eventos.

## Jornadas e exemplos propostos

### Fluxo real informado — @somoskyber

Três capturas do ManyChat enviadas pelo usuário em 27/09/2026 mostram uma automação ativa de comentário em publicações/reels específicos: palavra-chave `site`, resposta pública habilitada com variações, DM inicial sobre prévia de site, botão **“Quero minha prévia”** e, após essa interação, DM com convite e link para WhatsApp. A solicitação de e-mail e o lembrete por link não acessado aparecem desligados. O usuário informou que suas automações geralmente seguem esse padrão, sem fornecer ainda outro fluxo detalhado por conta. As imagens não foram adicionadas ao repositório e não comprovam permissões ou comportamento da API Meta.

O usuário também quer a **opção de pedir que a pessoa siga o perfil antes de receber o link**. O controle aparece nos prints como recurso Pro do ManyChat, desligado no fluxo exibido. É requisito de produto solicitado, com viabilidade e prioridade para o primeiro piloto ainda a confirmar; a verificação técnica depende de consentimento de perfil, status de seguidor consultável e janela de mensagem elegível. Quando o status for desconhecido, não afirmar que a pessoa segue ou não segue. Ver [META_ONBOARDING](META_ONBOARDING.md) e PF-104 no [BACKLOG](BACKLOG.md).

O usuário esclareceu que **ele próprio configurará cada automação pela interface para cada reel**. O produto deve perguntar mídia, palavra-chave e conteúdo das etapas, permitindo editar resposta pública, DM inicial, botão, pedido de seguir e link quando cada recurso estiver validado. O exemplo da @somoskyber não fornece textos ou link padrão do sistema; ver [EXPERIENCIA](EXPERIENCIA.md).

**Criador:** publica um reel com “Comente GUIA para receber o material”. Na conta de conteúdo, seleciona esse reel e escreve “Resposta automática: aqui está o guia: https://example.com/guia”. Uma correspondência dispara uma única resposta privada. A pessoa pode responder e abrir uma conversa; ler ou clicar em um link externo não autoriza uma sequência adicional.

**Kyber Tech:** recebe “ORÇAMENTO” por DM. A receita responde “Resposta automática da Kyber Tech. Que tipo de projeto você precisa?”. Igor assume a conversa; automações dessa conversa param, inclusive ações ainda na fila. Não há qualificação automática em múltiplas etapas no MVP.

**Story:** “Responda GUIA a este story”. A mensagem textual recebida usa a receita de DM; contexto do story aparece quando disponibilizado pela Meta. Uma visualização, curtida ou voto não dispara esse fluxo. Se a validação de stories falhar, a receita de DM continua útil e stories permanecem desabilitados.

**Falha:** token revogado torna a conta “Reconexão necessária”. A outra conta continua operando. Nenhum job troca de credencial ou tenta enviar por outra conta.

## Prioridades e exclusões

P0: conexão, isolamento, ingestão durável, política de envio, inbox/manual e comentário para DM. P1 ainda no MVP: receita DM, organização mínima, métricas e diagnóstico. Stories textuais são extensão da mesma receita, sem motor separado.

A resposta pública e o botão de avanço aparecem no fluxo real informado; a opção de seguir antes do link foi solicitada. Esses passos exigem testes e efeitos externos próprios e ainda não foram incluídos automaticamente no MVP base. A prioridade deles para o primeiro piloto aguarda confirmação; o fluxo simples comentário → DM continua sendo a primeira prova técnica. Adiar sequências gerais, atrasos comerciais, próximos reels e importação de contatos. Tracking próprio só após demonstrar uma decisão que dependa dos cliques; começar com link normal e UTM sem construir redirecionador.

Fora: campanhas em massa, DM para novos seguidores, envio para listas frias, comentários em contas alheias, anúncios, lives, publicação de mídia, métricas gerais de crescimento, editor visual, billing, planos, marketplace, equipes, workspaces, outros canais e IA generativa. Etiquetas podem entrar depois se aberta/resolvida e nota não resolverem a organização. Não armazenar ou servir anexos no MVP; mostrar tipo/contexto e limitação de visualização de forma explícita.

## Sucesso verificável

Metas de piloto propostas, a calibrar com volume real:

- Duas contas operam por 14 dias; nenhum vazamento de dados ou envio pela conta errada.
- Pelo menos 10 casos controlados de comentário e 10 de DM por conta, incluindo casos negativos, antes de divulgar o produto como funcional.
- Eventos aceitos pelo servidor sobrevivem à reinicialização; reentrega de evento e duplo clique não geram nova intenção de envio.
- Nenhum reenvio automático em resultado externo incerto; nenhum envio conhecido fora da janela permitida.
- Para eventos elegíveis sem limitação externa, alvo inicial de 95% das respostas aceitas pela Meta em até 60 segundos. Medir percentis; aceitação não significa leitura ou entrega comprovada.
- Criar uma receita em até cinco minutos e identificar conta, falha e próxima ação sem consultar logs brutos.
- Registrar minutos de atendimento antes/depois e utilidade das conversas geradas. Ganho de seguidores não será atribuído causalmente à automação.

Cancelar ManyChat somente após validar os fluxos prioritários, a continuidade operacional e o custo total. Durante a migração, evitar duas ferramentas respondendo ao mesmo gatilho; verificar roteamento e integrações conectadas antes do piloto.

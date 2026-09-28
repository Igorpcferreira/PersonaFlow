# Experiência de uso

Familiaridade com ManyChat significa inbox reconhecível, navegação previsível e configuração guiada. Não copiar marca, texto, assets ou reproduzir todo o produto. Esta é uma proposta de UX, não validação visual com usuários.

## Estrutura

Barra superior persistente: avatar, rótulo e `@username` da conta, indicador de conexão e botão de pausa global. Menu: **Inbox**, **Automações**, **Resultados**, **Configurações**. Contatos são acessados na conversa, sem outra tela de CRM.

O seletor distingue “Conteúdo” e “Kyber Tech”, com nome e avatar além de cor. Rotas carregam a conta explícita. Ao trocar, limpar seleção de conversa, fechar editor e proteger rascunho não salvo. Não reutilizar destinatário nem resultados de request tardia. Exibir `Enviar como @conta` junto ao botão; não pedir confirmação em cada mensagem rotineira.

## Telas e jornadas

| Tela | Conteúdo e ações essenciais |
|---|---|
| Conexões | Categoria técnica e requisitos, conectar via Instagram, permissões concedidas, username retornado, assinatura de webhook, última entrada e vencimento; reconectar/desconectar |
| Inbox | Lista filtrável aberta/resolvida/manual, busca local, cronologia, estados pendente/aceito/incerto/falhou, nota do contato, janela disponível e assumir/retomar |
| Automações | Lista por conta, receita, rascunho/ativa/pausada, último resultado; criar, editar, simular e ativar |
| Editor de receita | Formulário guiado por conta e post/reel: gatilho, palavras, etapas opcionais, textos, botão e link editáveis; preview, conflitos e explicação da regra |
| Resultados | Eventos elegíveis, correspondências, aceitos, bloqueados, falhas, incertos e tempo de processamento por receita/período |
| Diagnóstico | Conexão expirada, fila atrasada, worker ausente, limites e ações; detalhes sanitizados e código de correlação |

**Conexão:** informar pré-requisitos → OAuth → mostrar identidade efetivamente retornada → associar rótulo → verificar subscription → teste controlado → habilitar receitas. Não presumir que OAuth bem-sucedido significa webhook funcionando. Se conectou conta diferente da esperada, não ativar receitas automaticamente.

**Criar automação:** escolher conta e receita → selecionar o post/reel específico se o gatilho for comentário → preencher palavra ou expressão → responder às perguntas do formulário para montar as etapas: resposta pública opcional, DM de apresentação, botão de avanço, eventual pedido de seguir e mensagem final com link. Cada etapa mostra seus campos de texto e prévia; recursos ainda não validados na Meta ficam indisponíveis para ativação e explicam o motivo, sem fingir que o print do ManyChat prova suporte. Simular exemplos positivos/negativos → revisar conta, mensagem, condições e efeitos externos → ativar. O operador configura cada reel, sem textos fixos no código. O simulador diz “simulação local”, sem enviar mensagem; teste real é ação separada, com conta e destinatário de teste claros.

**Atendimento:** abrir conversa → assumir → fila automática pendente cancelada → digitar/responder → resolver. Retomar automação exige ação explícita; resolver conversa não a retoma escondido. Expirou a janela: composer bloqueado, motivo e orientação para usar o Instagram nativo quando adequado; não sugerir tag de exceção automaticamente.

**Erro:** apresentar “Reconecte esta conta”, “Aguardando limite da Meta”, “Prazo encerrado” ou “Envio com resultado desconhecido”. Evitar mostrar stack trace ou erro bruto. Resultado desconhecido explica que reenviar pode duplicar; uma investigação substitui retry automático. Não chamar mensagem de “entregue” quando há apenas aceitação da API.

**Mensagens sem texto:** exibir tipo e disponibilidade; não omitir silenciosamente áudio/anexo nem fingir transcrição. URLs externas só com tratamento seguro. Mostrar lacuna quando histórico não recuperável; mensagens locais podem ser removidas pela política de retenção.

## Receitas versus editor visual

| Opção | Benefício | Custo | Uso |
|---|---|---|---|
| Receitas + formulário guiado por etapa e reel | Operador escolhe mídia, gatilho, mensagens e passos opcionais sem editar código | Cada passo externo precisa de regra e teste próprios | Escolha para MVP; habilitar passos conforme validação real |
| Formulário com condições/etapas | Evolução intermediária | Crescimento de combinações e migração de versões | Só após fluxos repetidos comprovados |
| Canvas de nós | Visualiza ramificações grandes | Editor, motor, versões, loops, depuração e acessibilidade | Não justificado agora |

Mesmo se houver canvas no futuro, ele deve compilar para contratos e políticas existentes, sem contornar janela ou isolamento. Critério para reabrir: pelo menos três fluxos recorrentes úteis que as receitas não expressem, e capacidade de testar suas ramificações.

## Métricas com interpretação correta

Contar eventos únicos, não tentativas repetidas. “Taxa de aceitação” = intenções aceitas / intenções de envio elegíveis; mostrar também bloqueadas e incertas fora do denominador e totais para evitar esconder falhas. Exibir respondentes após automação apenas quando houver vínculo observável e janela de atribuição definida; não chamar isso de vendas. Clique em link e crescimento de seguidores não entram no MVP.

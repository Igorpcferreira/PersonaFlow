# Prompt para a próxima sessão

Preparado em **28/09/2026**, a pedido do usuário. **Rascunho para copiar e enviar em outro chat; este arquivo não concede autorização nem inicia um goal.** A autorização vigente permanece limitada a PF-010–012. Ao receber o texto abaixo como mensagem do usuário, a próxima sessão deve registrar a nova autorização em PF-003 e atualizar AGENTS, mantendo os limites externos.

O objetivo proposto é um MVP local demonstrável com duas contas fictícias. Os recortes locais de tarefas com dependências externas devem ter registros próprios; a prova real da Meta continua pendente. O estado conferido e as limitações da evidência anterior estão em [HANDOFF](HANDOFF.md).

## Texto para copiar

```text
/goal Implementar e validar o MVP local demonstrável do PersonaFlow, avançando ao máximo no escopo abaixo com qualidade, eficiência e evidências verificáveis.

Trabalhe em C:\Users\user\Documents\AAA_PROGRAMMING\PersonaFlow.

AUTORIZAÇÃO E ESCOPO
Esta mensagem autoriza código, dependências do projeto com versões fixadas, testes, migrações e serviços locais isolados necessários aos recortes locais de PF-014–017, PF-020–026, PF-100 e PF-104, além das correções necessárias na fundação PF-010–012. Não autoriza integração real ou deploy.

Autorizo expressamente desenvolver e demonstrar a interface local com fixtures antes de PF-013. Essa exceção vale apenas para os recortes simulados: não elimina os gates Meta, não comprova viabilidade externa e não conclui critérios que exigem contas reais. Divida tarefas em subtarefas locais com sufixo -L, preservando IDs e pendências dos pais. Registre esta autorização em PF-003 e atualize AGENTS.md e os documentos afetados antes de implementar.

RETOMADA
Leia AGENTS.md → docs/README.md → docs/STATUS.md → docs/HANDOFF.md → docs/BACKLOG.md; depois consulte apenas arquitetura, produto, experiência, desenvolvimento e ADRs pertinentes à entrega atual. Confira arquivos e histórico reais; use git status/diff se houver Git. Preserve alterações existentes e continue o projeto, sem recomeçar o planejamento. Pode inicializar Git local, sem push. Leia os guias pertinentes da versão instalada em node_modules/next/dist/docs/ antes de escrever código Next.js.

PF-010–012 tiveram instalação, lint, tipos, 5 unitários, 4 integrações com PostgreSQL real e build aprovados em 27/09/2026. Reconfirme a base. O teste de recuperação atual recria a instância pg-boss dentro do mesmo processo: acrescente prova de encerramento/reinício de processo e recuperação de job em PostgreSQL real. A exceção simulada atual do worker não prova crash nem ausência de reenvio ambíguo. Reconsulte npm audit e resolva avisos corrigíveis com alterações compatíveis; não aplique downgrade major ou --force cegamente. Registre riscos remanescentes com alcance e motivo.

PRODUTO JÁ ESCLARECIDO
Quero configurar cada automação pela interface, para cada reel: selecionar publicação fictícia, palavras/expressões, resposta pública opcional, DM de apresentação, texto do botão, pedido opcional para seguir e mensagem final com link. Preciso de formulário guiado, prévia, rascunho, edição, simulação e ativação exclusivamente local. Textos e links são configuráveis, sem conteúdo fixo no código. O link pode apontar para WhatsApp; isso não cria integração com esse canal. GitHub foi aceito para login administrativo. Ambas as contas reais foram informadas como “Profissional pública”, mas subtipo, gestão, app e permissões ainda estão pendentes. Essas informações e os textos reais não bloqueiam o desenvolvimento com duas contas fictícias.

EXECUÇÃO EM ENTREGAS PEQUENAS
1. Revalidar a base e corrigir problemas concretos de dependências, configuração, fila e isolamento.
2. PF-014-L: implementar Better Auth conforme ADR-005, sessão persistida, allowlist por ID imutável, logout e proteção CSRF. Configurar o provedor GitHub sem criar app ou conectar conta real; testar com identidade/provedor sintético. A demonstração precisa permitir um operador fictício em modo local explícito, restrito a loopback, e rejeitar esse mecanismo fora desse modo. Não criar bypass de autenticação para produção.
3. PF-015–017-L: contratos OAuth/tokens testados sem rede externa, cifragem/versionamento por conexão, webhook validado nos bytes originais, evento+job atômicos, deduplicação durável, ledger e executor com transporte fake. Provar replay, assinatura inválida, lote com duas contas, falha de banco sem ACK, concorrência, prazo, pausa, limites, reinício e timeout/crash após possível aceite. Resultado ambíguo vira unknown, sem reenvio automático. Não implementar transporte capaz de enviar à Meta nesta etapa.
4. Após validar esses contratos, PF-020–023-L, PF-026-L, PF-100-L e PF-104-L: interface útil em português com troca de conta, inbox persistida, assumir/retomar, envio simulado, diagnóstico e editor por reel. Aplicar isolamento também nas rotas, jobs, caches, rascunhos e respostas tardias. Resposta pública e botão precisam de efeitos idempotentes próprios. Seguir antes do link usa true/false/unknown; erro não equivale a false, unknown não libera o link, consulta ao perfil exige consentimento elegível, seguir sozinho não abre janela e rechecagem exige interação elegível, sem polling ou loops automáticos. Identifique a simulação na interface.
5. Continue com PF-024–025-L: receitas sintéticas de DM/story, PARAR/SAIR, organização e métricas mínimas sem contar retry como novo envio. Só declare story real suportado após prova futura. Não acrescente canvas, CRM completo, SaaS, equipes, billing, tracking, IA ou outros canais.

QUALIDADE E EFICIÊNCIA
Mantenha a arquitetura modular existente, PostgreSQL/Prisma/pg-boss e accountId obrigatório. Use dados sintéticos e migrações apenas após validar o destino local personaflow_*. Prefira testes de propriedades relevantes: isolamento cruzado, acesso sem sessão, deduplicação, atomicidade, concorrência, pausa, revisão da regra, janela e resultado desconhecido. Não use mocks de banco para provar essas garantias. Crie E2E para as jornadas críticas da interface; confira também estados de erro, vazio e carregamento. Downloads de dependências e ferramentas de teste devem ficar no projeto, sem instalação global ou alterações em outros serviços.

Tome decisões rotineiras e reversíveis sem pedir confirmação. Marque uma entrega coerente por vez em andamento, execute, verifique e registre evidências antes de seguir. Não encerre apenas com um plano ou ao finalizar a primeira tarefa. Se faltar ferramenta, credencial, autorização externa ou decisão indispensável, registre o bloqueio, peça somente a intervenção necessária e avance nas partes independentes. Após duas tentativas da mesma abordagem sem progresso, mude a abordagem. Não enfraqueça critérios para declarar sucesso.

CONTEXTO DE VPS
Tenho acesso SSH com senha como root e já entrei na VPS; enviei print com id -u retornando 0 e Ubuntu 24.04.4 LTS. Registre o acesso como disponível ao usuário. Não solicite senha em chat. Capacidade, serviços, proxy, backups e domínio ainda não foram inventariados. Esta informação não amplia a autorização: PF-031, inspeção remota e deploy permanecem fora deste goal local.

LIMITES
Não acesse contas reais, crie aplicativos GitHub/Meta, obtenha credenciais externas, envie mensagens, use scraping/APIs privadas, acesse VPS/DNS/produção, faça deploy/push ou contrate serviços. Consultas à documentação pública e downloads de dependências estão permitidos. Não exponha .env, tokens, chaves ou valores secretos. Não reutilize credenciais de outros projetos nem faça reset ou limpeza destrutiva de dados persistentes. PF-001/002/002-B, D-META-01, PF-013 e pendências externas continuam abertas.

CONCLUSÃO VERIFICÁVEL
O objetivo local só está concluído quando as entregas autorizadas estiverem implementadas e verificadas, com:

- Instalação reproduzível, lint, tipos, unitários relevantes, integração com PostgreSQL real, E2E críticos e build aprovados; configuração inválida falhando sem revelar segredos.
- Demonstração persistente: operador fictício → conta A/B → criar/editar automação por reel → evento sintético assinado → fila → efeito simulado → resultado na inbox/diagnóstico; troca de conta sem vazamento, pausa eficaz, duplicata sem novo efeito, follow true/false/unknown e reinício comprovados.
- Comandos documentados e executados para iniciar/parar web, worker e banco isolados, preparar dados fictícios e repetir a demonstração; nenhum processo de teste deixado sem controle.
- CI atualizado para as verificações pertinentes, distinguindo configuração local e eventual execução remota; não fazer push para disparar CI.
- BACKLOG, STATUS, HANDOFF, DESENVOLVIMENTO e ADRs necessários refletindo artefatos reais, comandos/data/resultados, limitações e próxima ação segura.

Ao terminar, apresente o que funciona, como executar, evidências, riscos e o que ainda depende de mim. Separe validação local, simulação de providers, CI remoto e Meta real. Encerre esta etapa sem avançar automaticamente para integração real ou deploy. Se um critério obrigatório estiver bloqueado ou faltando, mantenha o objetivo incompleto e deixe um handoff concreto.
```

## Uso e limite de continuidade

O comando deve ser enviado pelo usuário no próximo chat, junto ao workspace correto. Um goal pertence à conversa em que é ativado; documentos ajudam a retomar, mas não transferem o estado do goal nem garantem trabalho em segundo plano. Referência: [Using Goals in Codex](https://developers.openai.com/cookbook/examples/codex/using_goals_in_codex), consultada em 28/09/2026.

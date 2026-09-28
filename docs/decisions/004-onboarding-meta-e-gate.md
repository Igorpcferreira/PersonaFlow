# ADR-004 — Um app operacional, duas conexões e gate de eventos reais

Data: 27/09/2026. Estado: adotada no planejamento; execução não autorizada. Complementa ADR-003.

Decisão: um app Meta com Instagram Login para a instalação operacional e duas conexões/consentimentos/tokens/inscrições independentes. Separar apps por ambiente quando necessário, não por rótulo pessoal/empresa. Não misturar Instagram Login e Facebook Login no mesmo app: o guia atual de caso de uso exige apps separados para as duas configurações.

Justificativa: modelo por app/usuário e por conta na documentação, implementação multiconexão no OpenReply e menor trabalho operacional. Secret, quotas/restrições de app e revisão podem afetar ambas; isolamento de dados não elimina esse risco.

Correção do plano anterior: Standard Access para contas próprias é descrito em overview/review, mas não basta para afirmar entrega operacional de todos os webhooks. O guia específico exige Live e lista Advanced Access/verificação empresarial, com restrição expressa para comments. Registrar divergência D-META-01; não escolher a leitura mais conveniente. PF-002-B e PF-013 devem esclarecer requisitos do app/campo e comprovar eventos reais, incluindo audiência sem papel.

Consequência: publicação do app, papéis, scopes e níveis de acesso são gates separados. Review pode bloquear o fluxo próprio e não apenas terceiros. O MVP não começa pela UI completa e não é aprovado por token/GET/Test do painel. Nenhuma mudança na VPS nesta fase.

Botões são diferenciados por tipo; perfil de seguidor exige consentimento e resultado pode ser desconhecido. O usuário solicitou botão configurável e opção de seguir antes do link em 27/09/2026; prioridade do primeiro piloto ainda pendente e implementação exige PF-104/prova Meta real. Isso não altera os gates técnicos. Human Agent tem janela de até sete dias indicada no overview oficial relido, mas habilitação aplicável ao app segue pendente; não habilitar automação com essa tag.

Fontes, matriz de condições e roteiro em [META_ONBOARDING](../META_ONBOARDING.md). Revisar a decisão de acesso quando houver atualização primária ou resultado controlado do painel/contas, preservando a data e limites da evidência.

# ADR-003 — Meta direta e uso próprio primeiro

Data: 27/09/2026. Estado: adotada no planejamento; acesso real pendente.

Decisão: Instagram API with Instagram Login, contas profissionais, basic/comments/messages e app próprio. Começar com Standard Access para contas próprias/gerenciadas conforme documentação. Terceiros usam sua própria instalação/app; onboarding público não faz parte do MVP.

Justificativa: não exige Página vinculada nesse caminho, corresponde ao canal único e evita provedor pago. Provedor opcional como Zernio reduz trabalho de conexão/revisão em alguns cenários, mas introduz custo e diferenças de capacidade. Facebook Login tem requisitos adicionais e não há necessidade comprovada para ele agora.

Consequências: o proprietário assume configuração Meta, validade de tokens e políticas. Publicar o código não distribui permissões nem aprovação. Se o app passar a atender contas externas, planejar Advanced Access, revisão, verificação e privacidade antes de oferecer conexão. Nenhuma expectativa de prazo de aprovação.

MVP aplica janela padrão de mensagens e regra de private reply. Human Agent e broadcasts não são atalhos. Fontes e condições em [VIABILIDADE](../VIABILIDADE.md).

Complemento de 27/09/2026: [ADR-004](004-onboarding-meta-e-gate.md) preserva Instagram Login, mas qualifica a premissa de acesso próprio. Live e nível de acesso são separados; o guia de webhooks lista Advanced Access/verificação e cria divergência com a regra geral de uso próprio. Não considerar review dispensada para todos os fluxos até esclarecer o requisito do app/campo. Um app operacional pode atender as duas contas, com autorizações independentes.

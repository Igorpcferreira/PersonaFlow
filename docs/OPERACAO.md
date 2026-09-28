# Infraestrutura, segurança e publicação

## Levantamento local e limite da inspeção

Em 27/09/2026, o caminho informado `C:\Users\user\Documents\AAA\_PROGRAMMING\vira-anuncio` não existia. A variação evidente `C:\Users\user\Documents\AAA_PROGRAMMING\vira-anuncio` existe. Foram inspecionados metadados/estrutura de `docker-compose.prod.yml`, `docker-compose.yml`, `scripts/deploy.sh`, nomes de variáveis de `scripts/deploy.env`, `.env.production.example` e README. Não foram impressos valores de secrets nem aberta a chave privada.

O Compose de produção declara serviços `db`, `migrate`, `image` e `web`, volumes, healthchecks, restart e referência a loopback. O script usa SSH e Docker Compose e recebe referências `ANUNCIA_SSH`, `ANUNCIA_DIR`, `ANUNCIA_BRANCH` e `ANUNCIA_GIT_REMOTE`. Há diretório SSH e arquivo com nome padrão de chave privada no ambiente. O usuário informado no levantamento de 27/09/2026 era `admin`; a chave não foi testada nem sua correspondência com o host comprovada. O acesso `root` informado posteriormente está registrado abaixo; não comprova o funcionamento dos scripts ou da chave do outro projeto.

Esses arquivos mostram uma convenção local, **não o estado da VPS**. Não houve acesso remoto pelo agente, instalação, deploy, alteração de DNS ou execução dos scripts. Não registrar host, IP ou conteúdo dos arquivos de ambiente na documentação pública. Não executar o deploy do outro projeto para descobrir como funciona.

Pendente: CPU/RAM/disco e folga reais, confirmação do estado do SO, versão de Docker/Compose, portas, proxy em uso, volumes, backups, domínio disponível e carga dos demais serviços. Uma futura inspeção remota, se autorizada, será exclusivamente para inventariar recursos, portas e saúde, com comandos de leitura como `free`, `df`, `docker ps` e estatísticas sem stream; evitar `docker inspect` irrestrito, envs e logs que possam revelar secrets.

## Acesso informado pelo usuário — 28/09/2026

O usuário informou possuir usuário/senha de `root` e já ter conectado por SSH. O print fornecido mostra uma sessão remota, banner Ubuntu 24.04.4 LTS x86_64 e `id -u` retornando `0`. Isso registra o acesso administrativo realizado pelo usuário; não é inspeção remota feita pelo agente nem autorização para executar PF-031 ou deploy. A senha não foi fornecida ou armazenada; IP, hostname e print não foram copiados à documentação.

O banner também indicava atualizações disponíveis e reinício solicitado. Esse estado não foi conferido ao vivo. Não foram executadas atualizações ou reinícios. Capacidade, serviços existentes, proxy, backups e domínio continuam sem inventário, e a autorização vigente permanece local.

## Topologia e capacidade propostas

Uma instalação Docker Compose com nome exclusivo `personaflow`, volumes, rede, banco e usuário próprios. Web e worker usam a mesma imagem identificada por commit/digest; PostgreSQL em rede privada sem porta pública. Web só em loopback ou rede interna do proxy existente. Expor HTTPS pelo proxy já usado, após descobrir qual é; não instalar outro disputando 80/443.

Estimativa de planejamento para duas contas e até 1.000 eventos/dia, sem mídia armazenada: reservar aproximadamente 1–2 GiB de RAM para o conjunto e 10–20 GiB de disco inicial para banco, logs, imagens e margem. Alvo de VPS com pelo menos 2 vCPU e 4 GiB totais **não é aprovação de capacidade** quando há outros projetos; medir consumo e folga. Builds podem exigir mais memória; preferir imagem construída em CI ou ambiente separado.

Limitar memória/CPU, logs e pools por serviço; manter margem de pelo menos 25% no host como hipótese inicial. Não compartilhar volumes/usuário de banco do vira-anuncio. Compartilhar o proxy pode fazer sentido; compartilhar credenciais não.

## Deploy, atualização e rollback futuros

1. Autorizar janela e alvo concretos; inventariar host e confirmar backup/restauração e espaço.
2. Construir imagem imutável após CI. Gerar configuração exclusiva, sem valores em Git; validar Compose sem imprimir resolução de secrets.
3. Subir banco e aplicação em ambiente de teste isolado. Usar migrations versionadas, rodadas por tarefa única com credencial de migração, não durante build nem em cada réplica.
4. Antes de produção, salvar dump cifrado e versão anterior da imagem/configuração; drenar envios do worker, mantendo ingestão durável quando possível.
5. Aplicar migração compatível, atualizar web/worker, validar health, conexão, idade da fila e fluxo controlado. Integrar hostname/TLS somente com autorização de produção.
6. Falha de aplicação: voltar imagem anterior se schema compatível. Migrações seguem expandir/migrar/contrair; não prometer rollback automático de migração destrutiva. Restore de banco exige incidente, autorização e reconciliação dos envios posteriores ao backup.

Nunca usar limpeza global de Docker, `down -v`, reinício do proxy sem verificar configuração ou upgrade de banco compartilhado como parte do deploy deste projeto.

## Backups e recuperação

Proposta: dump diário cifrado, cópia fora da VPS, 7 diários e 4 semanais; testar restauração mensal em ambiente isolado. Objetivos iniciais RPO ≤24 h e RTO ≤4 h, sujeitos a ensaio e volume. Snapshot no mesmo host não é backup suficiente.

Incluir schema/dados, ledger de envios, jobs necessários, configuração de versão e referências de secrets. Guardar chave de criptografia separada do dump, com recuperação controlada; backup de token cifrado sem chave não restaura operação. Não salvar chave e dump juntos em Git.

**Restore não significa retomar envios imediatamente.** Restaurar com envio desabilitado; eventos após o backup podem já ter gerado mensagens na Meta. Reconciliar IDs e intervalos, marcar resultados desconhecidos e impedir replay automático. Esse risco existe mesmo com fila transacional. Melhorar RPO com backup incremental/WAL apenas se a perda potencial justificar manutenção adicional.

## Segurança

TLS, cookies HttpOnly/Secure/SameSite, proteção CSRF/origin nas ações, sessão com expiração e revogação, rate limit de login e nenhuma inscrição pública. GitHub OAuth identifica operador; Instagram OAuth conecta contas. MFA na conta do provedor é recomendação operacional, não substitui autorização no servidor.

OAuth Instagram: state aleatório de uso único, com validade curta e vínculo à sessão/intenção de conexão. Redirect exato, troca server-side, rejeição de replay e conta inesperada. Criptografia autenticada dos tokens, nonce aleatório, versão de chave e rotação; secrets separados do banco. Validar scopes antes de habilitar recursos.

Webhook: corpo original, assinatura, limites de tamanho, validação estrutural e deduplicação. Não confiar só em verify token do GET. A chave de assinatura deve corresponder ao app configurado, sem tentar secrets de projetos alheios.

Logs estruturados com IDs de correlação, conta e classe de erro; remover tokens, códigos OAuth, cookies, URLs com secrets e texto de DM. Não incluir payload inválido em log. Métricas globais de saúde não expõem contatos. Acesso à base só pela rede interna; usuário de runtime sem privilégio de DDL quando viável. Não consumir URLs de anexos arbitrariamente no backend: isso introduz SSRF e armazenamento fora do escopo.

Health público mínimo, sem configuração; detalhes só para operador. Alertar worker sem heartbeat por 2 minutos, idade da fila >5 minutos, disco >80%, token perto de expirar, falhas de backup e aumento de erros. Limiares são hipóteses do piloto. Painel não basta se ninguém o abre: antes de produção, escolher canal de alerta existente ou email operacional, sem contratar serviço por padrão.

## Privacidade e retenção

DMs, identificadores e notas são dados pessoais. Auto-hospedagem não elimina obrigações. A operação da Kyber Tech não deve ser presumida como tratamento exclusivamente particular. Definir finalidade, base legal, aviso de privacidade, canal de atendimento aos titulares, medidas de segurança e processo de exclusão; não presumir consentimento universal por alguém comentar. Referência: [LGPD, arts. 4, 6, 7, 15–18 e 46](https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709.htm), consulta 27/09/2026.

Proposta técnica, não prazo legal: payload bruto de diagnóstico por até 7 dias com acesso restrito; conteúdo de mensagens/notas por 90 dias; logs sanitizados por 30 dias; agregados sem identificação por 12 meses. Confirmar com necessidades reais e política antes do piloto. Reduzir ou eliminar payload bruto quando campos normalizados bastarem.

Manter chaves mínimas de deduplicação sem conteúdo pelo tempo necessário para impedir replay e respeitar supressão, com prazo/base documentados; hash de ID não é automaticamente anonimização. Após purgar ledger, eventos antigos não podem voltar a ser elegíveis só por faltar registro: checar data original e política de ingestão.

Excluir contato remove mensagens, notas e jobs pendentes correspondentes; desconectar conta suspende envios e remove credenciais, seguindo escolha explícita de exclusão dos dados locais. Implementar instruções/callback de exclusão e desautorização exigidos pela configuração Meta escolhida, com verificação de autenticidade. Exclusão local não apaga automaticamente mensagens no Instagram. Backups expiram conforme retenção; journal mínimo de exclusões deve ser reaplicado em restore para não ressuscitar dados. Verificar também termos Meta, transferências e regras de incidentes aplicáveis antes do uso real. [M10 em FONTES](FONTES.md)

## Custos e sustentabilidade

Faixas abaixo são **reservas orçamentárias**, não cotações de fornecedores nem preços verificados. Não contratar nada nesta etapa.

| Item | Estimativa / hipótese |
|---|---|
| VPS existente | Incremental R$0 se houver folga; custo total já contratado desconhecido e deve ser alocado ao projeto |
| Capacidade adicional | Reserva R$40–120/mês caso a medição indique necessidade; cotar antes de aprovar |
| Domínio | R$0 incremental com subdomínio disponível; reserva R$40–100/ano se precisar comprar |
| Backup externo | Reserva R$5–30/mês para baixo volume; custo depende de armazenamento, tráfego e provedor |
| TLS | Sem compra de certificado usando emissor ACME; renovação e operação continuam necessárias |
| Alertas/email | R$0–20/mês como reserva; preferir canal existente; não confundir email operacional com novo canal do produto |
| Meta direta | Não foi identificada cobrança por DM nas páginas consultadas; não é garantia de gratuidade futura nem elimina aprovação/limites |
| Zernio, IA, banco/Redis gerenciados | Não necessários na opção principal; não incluídos no orçamento |
| Manutenção | Hipótese 2–4 h/mês após estabilização, além de incidentes e mudanças da Meta; multiplicar pelo valor/hora do usuário |

Com VPS suficiente e subdomínio existente: reserva incremental típica de R$5–50/mês, mais manutenção; pode ser menor com recursos já contratados. Com expansão: adicionar a cotação de capacidade. Comparar `assinatura evitada − gastos incrementais − valor do tempo` antes de concluir economia. Não há dados suficientes para calcular retorno real.

## Publicação

Repositório público deve conter licença escolhida, atribuições upstream, exemplo de configuração com placeholders, instruções de instalação e limitações verificadas. Antes do primeiro push: revisão de arquivos e histórico por secrets; `.env*` reais, dumps, mídia, logs e fixtures reais excluídos. Se houver vazamento, revogar/rotacionar; apagar do último commit não basta.

Esta entrega só documenta os nomes futuros: `DATABASE_URL`, `APP_BASE_URL`, `SESSION_SECRET`, `ADMIN_GITHUB_ID`, `AUTH_GITHUB_ID`, `AUTH_GITHUB_SECRET`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `WEBHOOK_VERIFY_TOKEN`, `TOKEN_ENCRYPTION_KEY`, `META_GRAPH_API_VERSION`, `SEND_ENABLED`. Um `.env.example` executável será criado junto ao validador de configuração em PF-010; não há runtime para consumi-lo agora. Nunca usar prefixo público em secret.

O complemento [META_ONBOARDING](META_ONBOARDING.md) acrescenta referências `META_APP_ID` e `META_WEBHOOK_APP_SECRET` para distinguir identidade do app e finalidade da chave de assinatura. Não presumir igualdade com Instagram app ID/secret; identificar origem no painel e comprovar HMAC. Tokens de acesso são por conexão, cifrados no banco. As URLs de OAuth, webhook, desautorização e exclusão do guia são planejadas, ainda inexistentes. Um futuro experimento HTTPS mínimo na VPS também exige autorização específica e isolamento; não está liberado por esta documentação.

Vídeos e screenshots do portfólio usam conta de demonstração/dados sintéticos. Mostrar claramente testes simulados, testes Meta reais e limitações. Não publicar telas de tokens, painel de secrets, DMs de clientes ou endereços da VPS.

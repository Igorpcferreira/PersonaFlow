# ADR-002 — Estado durável em PostgreSQL

Data: 27/09/2026; evidências atualizadas em 28/09. Estado: adotada; transação, webhook sintético e ledger/executor fake validados em PF-011-R/PF-016/017-L com PostgreSQL 16 real. Fluxos/UI e transporte Meta real permanecem em suas tarefas.

Decisão: um monólito modular, web e worker da mesma imagem, PostgreSQL + pg-boss. AccountId obrigatório, FKs compostas, ledger de intenções e unicidade independente da retenção de jobs. Sem workspaces ou Redis inicial.

Justificativa: envios precisam sobreviver à requisição e a reinícios; jobs no banco permitem transação com o evento e removem uma dependência operacional. Fila em memória não entrega durabilidade. BullMQ é madura e presente no upstream, mas acrescenta Redis e coordenação entre dois armazenamentos. Fila caseira parece pequena e acumula leases, retry e recuperação.

Consequências: testar adaptador e versões, controlar crescimento e pool do banco. Fila não garante envio externo exatamente uma vez. Resultado ambíguo fica `unknown` sem retry cego; há troca explícita de disponibilidade por menor risco de duplicidade. Controle manual serializa a reserva de envios; ação já em trânsito não é cancelável.

Implementação local confirmada: lock de conta antes de conversa; intenção e job na mesma transação; private/public/button/DM/manual/link com chaves de negócio independentes. Intenção guarda revisão/controle/geração e prazo. Reserva persiste tentativa antes da chamada fake, conta unknown no orçamento e revalida política. Manutenção de pending com falha anterior ao envio comprovada e sending órfão usa o ledger; pg-boss continua responsável pelos jobs. Sending abandonado vira unknown terminal. Crash de filho após aceite fake persistido e retomada por outro PID comprovados sem segunda chamada; 30 integrações aprovadas. Não comprova idempotência ou entrega Meta reais.

Reabrir com incompatibilidade demonstrada, saturação medida ou necessidade real de escala. Não adicionar broker, cache ou banco por conta preventivamente. Contratos em [ARQUITETURA](../ARQUITETURA.md).

PF-023/026-L: decisão de receita, mensagem normalizada, intenção e job compartilham transação. Reconexão/revogação/expiração fictícia cancelam pendentes antigos na transação da conexão/conta, mantendo sending/unknown. Diagnóstico consulta estado de negócio e jobs por accountId, sem token/ciphertext e sem retry de unknown; heartbeat é observação com validade de 30 s, não garantia de disponibilidade. Quota alterada preserva reservas da janela; testes PostgreSQL A/B e E2E completos aprovados.

# ADR-002 — Estado durável em PostgreSQL

Data: 27/09/2026. Estado: adotada; integração transacional Prisma 7.10.0/pg-boss 12.35.0 validada localmente em PF-011 com PostgreSQL 16 real. Demais fluxos da arquitetura continuam planejados.

Decisão: um monólito modular, web e worker da mesma imagem, PostgreSQL + pg-boss. AccountId obrigatório, FKs compostas, ledger de intenções e unicidade independente da retenção de jobs. Sem workspaces ou Redis inicial.

Justificativa: envios precisam sobreviver à requisição e a reinícios; jobs no banco permitem transação com o evento e removem uma dependência operacional. Fila em memória não entrega durabilidade. BullMQ é madura e presente no upstream, mas acrescenta Redis e coordenação entre dois armazenamentos. Fila caseira parece pequena e acumula leases, retry e recuperação.

Consequências: testar adaptador e versões, controlar crescimento e pool do banco. Fila não garante envio externo exatamente uma vez. Resultado ambíguo fica `unknown` sem retry cego; há troca explícita de disponibilidade por menor risco de duplicidade. Controle manual serializa a reserva de envios; ação já em trânsito não é cancelável.

Reabrir com incompatibilidade demonstrada, saturação medida ou necessidade real de escala. Não adicionar broker, cache ou banco por conta preventivamente. Contratos em [ARQUITETURA](../ARQUITETURA.md).

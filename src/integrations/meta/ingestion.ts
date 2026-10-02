import type { PgBoss } from 'pg-boss';
import type { Prisma } from '../../generated/prisma/client';
import type { Database } from '../../shared/db';
import { lockAccount } from '../../shared/account-lock';
import { enqueueEventJob } from '../../jobs/queue';
import { InvalidWebhook, parseSignedWebhook, readWebhookBytes, type CanonicalEvent, type WebhookApp } from './webhook';

export async function persistWebhookBatch(db: Database, boss: PgBoss, app: WebhookApp, events: CanonicalEvent[]) {
  return db.$transaction(async (tx) => {
    const accounts = await tx.instagramAccount.findMany({ where: { professionalId: { in: [...new Set(events.map((event) => event.professionalId))] } }, orderBy: { id: 'asc' } });
    for (const account of accounts) await lockAccount(tx, account.id);
    const current = await tx.instagramAccount.findMany({ where: { id: { in: accounts.map((account) => account.id) } }, include: { credential: true } });
    const byProfessional = new Map(current.map((account) => [account.professionalId, account]));
    let inserted = 0, duplicate = 0, ignored = 0;
    for (const event of events) {
      if (app.kind === 'meta' && event.professionalId !== app.pilotProfessionalId) { ignored += 1; continue; }
      const account = byProfessional.get(event.professionalId);
      if (!account || account.webhookAppAlias !== app.alias || account.webhookGeneration !== account.connectionGeneration ||
          !account.webhookFields.includes(event.field) || !account.credential || account.credential.revokedAt ||
          account.credential.generation !== account.connectionGeneration) { ignored += 1; continue; }
      const payload = { actorId: event.actorId, text: event.text, mediaId: event.mediaId, echo: event.echo, buttonPayload: event.buttonPayload };
      const created = await tx.inboundEvent.createMany({ data: [{ accountId: account.id, externalId: event.externalId,
        kind: event.kind, generation: account.connectionGeneration, occurredAt: event.occurredAt, payload: payload as Prisma.InputJsonValue }], skipDuplicates: true });
      if (!created.count) { duplicate += 1; continue; }
      const stored = await tx.inboundEvent.findUniqueOrThrow({ where: { accountId_externalId: { accountId: account.id, externalId: event.externalId } } });
      await enqueueEventJob(tx, boss, account.id, stored.id);
      inserted += 1;
    }
    return { inserted, duplicate, ignored };
  }, { timeout: 15_000 });
}

// O response de sucesso só é construído após o commit confirmado. Não há provider no caminho do ACK.
export async function handleWebhookPost(request: Request, db: Database, boss: PgBoss, app: WebhookApp) {
  try {
    if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw new InvalidWebhook();
    const parsed = parseSignedWebhook(app, await readWebhookBytes(request), request.headers.get('x-hub-signature-256'));
    const result = await persistWebhookBatch(db, boss, app, parsed.events);
    return Response.json(app.kind === 'synthetic' ? { simulation: true, ...result, ignored: result.ignored + parsed.ignored } : { received: true },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error instanceof InvalidWebhook ? 'Webhook recusado.' : 'Persistência indisponível; reentrega necessária.' }, {
      status: error instanceof InvalidWebhook ? 400 : 503, headers: { 'Cache-Control': 'no-store' },
    });
  }
}

import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';

const db = createPrisma();
afterAll(() => db.$disconnect());

function child(queue: string, mode: string) {
  return spawn(process.execPath, ['--import', 'tsx', resolve('tests/helpers/process-worker.ts'), queue, mode], {
    env: process.env, stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
  });
}

function message(proc: ChildProcess, type: string): Promise<{ jobId: string; pid: number }> {
  return new Promise((resolveMessage, reject) => {
    const timer = setTimeout(() => done(new Error(`Processo filho não confirmou ${type}.`)), 20_000);
    const onExit = () => done(new Error('Processo filho terminou antes da confirmação.'));
    const onMessage = (value: unknown) => {
      if (value && typeof value === 'object' && 'type' in value && value.type === type &&
          'jobId' in value && typeof value.jobId === 'string' && 'pid' in value && typeof value.pid === 'number') {
        done(undefined, { jobId: value.jobId, pid: value.pid });
      }
    };
    function done(error?: Error, value?: { jobId: string; pid: number }) {
      clearTimeout(timer);
      proc.off('message', onMessage);
      proc.off('exit', onExit);
      if (error) reject(error); else resolveMessage(value!);
    }
    proc.on('message', onMessage);
    proc.on('exit', onExit);
  });
}

async function terminate(proc: ChildProcess) {
  if (proc.exitCode !== null || proc.signalCode !== null) return;
  const exited = once(proc, 'exit');
  proc.kill('SIGKILL');
  await exited;
}

it('PF-011-R: encerra processo após claim e outro PID recupera o job expirado em PostgreSQL', async () => {
  const account = await db.instagramAccount.create({ data: {
    label: 'Reinício sintético', professionalId: `process-${randomUUID()}`,
  } });
  const event = await db.inboundEvent.create({ data: { accountId: account.id, externalId: randomUUID() } });
  const queue = `process-${randomUUID()}`;
  const boss = createBoss();
  let first: ChildProcess | undefined;
  let second: ChildProcess | undefined;
  await boss.start();
  try {
    await boss.createQueue(queue, { expireInSeconds: 2, retryLimit: 2, retryDelay: 0 });
    const jobId = await boss.send(queue, { accountId: account.id, eventId: event.id });
    first = child(queue, 'crash');
    const claimed = await message(first, 'claimed');
    expect(claimed.jobId).toBe(jobId);
    await terminate(first);
    expect(first.exitCode !== null || first.signalCode !== null).toBe(true);
    expect((await db.inboundEvent.findUniqueOrThrow({ where: {
      accountId_id: { accountId: account.id, id: event.id },
    } })).processedAt).toBeNull();

    second = child(queue, 'recover');
    const recovered = await message(second, 'processed');
    expect(recovered.pid).not.toBe(claimed.pid);
    expect(recovered.jobId).toBe(jobId);
    expect((await db.inboundEvent.findUniqueOrThrow({ where: {
      accountId_id: { accountId: account.id, id: event.id },
    } })).processedAt).not.toBeNull();
    const rows = await db.$queryRawUnsafe<{ retrycount: number }[]>(
      'SELECT retry_count AS retrycount FROM pgboss.job WHERE id = $1::uuid', jobId,
    );
    expect(rows[0].retrycount).toBeGreaterThan(0);
  } finally {
    if (first) await terminate(first);
    if (second) await terminate(second);
    await boss.stop();
  }
}, 45_000);

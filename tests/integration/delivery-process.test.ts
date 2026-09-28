import { spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { afterAll, expect, it } from 'vitest';
import { createPrisma } from '../../src/shared/db';
import { createBoss } from '../../src/jobs/queue';
import { createIntent, DELIVERY_QUEUE } from '../../src/modules/delivery/ledger';
import { deliveryFixture } from '../helpers/delivery-fixture';

const db = createPrisma();
afterAll(() => db.$disconnect());
function message(child: ChildProcess, type: string) {
  return new Promise<{ pid: number; status?: string; calls?: number }>((done, reject) => {
    const timer = setTimeout(() => finish(new Error('Processo não confirmou etapa esperada.')), 20_000);
    const exit = () => finish(new Error('Processo encerrou antes da confirmação.'));
    const receive = (value: unknown) => {
      if (value && typeof value === 'object' && 'type' in value && value.type === type && 'pid' in value) finish(undefined, value as { pid: number });
    };
    function finish(error?: Error, value?: { pid: number }) {
      clearTimeout(timer); child.off('message', receive); child.off('exit', exit);
      if (error) reject(error); else done(value!);
    }
    child.on('message', receive); child.on('exit', exit);
  });
}
async function terminate(child?: ChildProcess) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  const exit = once(child, 'exit'); child.kill('SIGKILL'); await exit;
}
it('PF-017-L: mata PID após aceite fake persistido; outro PID marca unknown sem segunda chamada', async () => {
  const f = await deliveryFixture(db);
  const boss = createBoss();
  let first: ChildProcess | undefined, second: ChildProcess | undefined;
  await boss.start();
  try {
    await boss.createQueue(DELIVERY_QUEUE);
    const intent = await createIntent(db, boss, { accountId: f.account.id, conversationId: f.conversation.id, eventId: f.event.id,
      automationId: f.automation.id, source: 'automatic', effect: 'private_reply', body: { text: 'Crash sintético' } });
    const start = (mode: string) => spawn(process.execPath, ['--import', 'tsx', resolve('tests/helpers/delivery-process.ts'), f.account.id, intent.id, mode], {
      env: { ...process.env, PERSONAFLOW_TEST_TOKEN_KEY: f.key.toString('hex') }, stdio: ['ignore', 'ignore', 'ignore', 'ipc'], windowsHide: true,
    });
    first = start('crash');
    const accepted = await message(first, 'accepted');
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id, intentId: intent.id } })).toBe(1);
    await terminate(first);
    expect((await db.deliveryIntent.findUniqueOrThrow({ where: { accountId_id: { accountId: f.account.id, id: intent.id } } })).status).toBe('sending');
    await new Promise((done) => setTimeout(done, 350));
    second = start('recover');
    const recovered = await message(second, 'recovered');
    expect(recovered.pid).not.toBe(accepted.pid);
    expect(recovered.status).toBe('unknown'); expect(recovered.calls).toBe(0);
    expect(await db.syntheticEffect.count({ where: { accountId: f.account.id, intentId: intent.id } })).toBe(1);
    expect(await db.deliveryAttempt.count({ where: { accountId: f.account.id, intentId: intent.id } })).toBe(1);
    expect((await db.deliveryAttempt.findFirstOrThrow({ where: { accountId: f.account.id, intentId: intent.id } })).status).toBe('unknown');
  } finally { await terminate(first); await terminate(second); await boss.stop(); }
}, 45_000);

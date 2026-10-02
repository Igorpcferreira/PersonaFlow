import { describe, expect, it } from 'vitest';
import { parseRetentionCommand, retentionLogLine } from '../../src/jobs/retention';

const pilotAccountId = '11111111-1111-4111-8111-111111111111';
const env = { META_INSTAGRAM_PILOT_ACCOUNT_ID: pilotAccountId };

describe('gate operacional de retenção', () => {
  it('mantém simulação como padrão e exige confirmação separada para redigir', () => {
    expect(parseRetentionCommand(['--account-id', pilotAccountId], env)).toEqual({
      accountId: pilotAccountId, expectedPilotAccountId: pilotAccountId, execute: false,
    });
    expect(() => parseRetentionCommand(['--account-id', pilotAccountId, '--execute'], env))
      .toThrow('PERSONAFLOW_RETENTION_EXECUTE=confirm');
    expect(parseRetentionCommand(['--account-id', pilotAccountId, '--execute'], {
      ...env, PERSONAFLOW_RETENTION_EXECUTE: 'confirm',
    })).toEqual({ accountId: pilotAccountId, expectedPilotAccountId: pilotAccountId, execute: true });
  });

  it('recusa argumento desconhecido e escopo diferente da conta piloto', () => {
    expect(() => parseRetentionCommand(['--execute'], env)).toThrow('--account-id');
    expect(() => parseRetentionCommand(['--account-id', pilotAccountId, '--now'], env)).toThrow('Uso:');
  });

  it('registra somente escopo, modo e contagens sanitizadas', () => {
    expect(retentionLogLine({ accountId: pilotAccountId, dryRun: true, messages: 2, notes: 1, deliveryIntents: 3, inboundEvents: 4 }))
      .toBe(JSON.stringify({
        event: 'retention.completed', accountId: pilotAccountId, dryRun: true,
        redactions: { messages: 2, notes: 1, deliveryIntents: 3, inboundEvents: 4 },
      }));
  });
});

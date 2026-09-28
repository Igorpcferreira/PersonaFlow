'use client';
import { useEffect, useRef, useState } from 'react';
import type { SequenceView } from '@/modules/automations/sequence-contract';
import { fetchJSON } from './inbox-panel';

const stateLabels: Record<string, string> = { waiting: 'Aguardando interação no botão', consent_required: 'Consentimento necessário para consultar o perfil',
  follow_false: 'Ainda não segue · aguardando nova interação', follow_unknown: 'Leitura desconhecida · link retido', unavailable: 'Fluxo indisponível após mudança de controle, conexão ou receita',
  link_pending: 'Link na fila da simulação', link_sending: 'Link em trânsito', link_accepted: 'Link aceito pela simulação', link_unknown: 'Link incerto · não será reenviado',
  link_rejected: 'Link falhou · não será reenviado', link_blocked: 'Link bloqueado · inicie um novo fluxo', link_canceled: 'Link cancelado', link_expired: 'Prazo do link encerrado' };
type List = { accountId: string; sequences: SequenceView[] };
const deliveryLabels: Record<string, string> = { pending: 'Na fila', sending: 'Em trânsito', accepted: 'Aceito pela simulação',
  unknown: 'Incerto · não será reenviado', rejected: 'Falhou na simulação', canceled: 'Cancelado', blocked: 'Bloqueado', expired: 'Prazo encerrado' };
function SequenceCard({ accountId, run, refresh }: { accountId: string; run: SequenceView; refresh: () => Promise<void> }) {
  const [profile, setProfile] = useState(run.profileFixture);
  const [consent, setConsent] = useState(false);
  const [lastRequest, setLastRequest] = useState<{ id: string; consent: boolean } | null>(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => { const controller = new AbortController(); lifetime.current = controller; return () => controller.abort(); }, []);
  async function act(action: 'profile' | 'interact', replay = false) {
    setBusy(true); setError(''); setNotice('');
    try {
      const request = replay && lastRequest ? lastRequest : { id: crypto.randomUUID(), consent };
      const response = await fetch(`/api/accounts/${accountId}/sequences`, { method: 'POST', signal: lifetime.current?.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'profile' ? { action, runId: run.id, state: profile } : { action, runId: run.id, consent: request.consent, clientRequestId: request.id }) });
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? 'Ação de sequência indisponível.');
      if (action === 'interact') setLastRequest(request);
      setNotice(action === 'profile' ? 'Perfil fictício alterado. A janela e os pedidos continuam iguais; simule uma nova interação para consultar.' :
        result.duplicate ? 'Interação repetida sem novo efeito.' : 'Interação fictícia assinada recebida. Atualize a sequência para acompanhar.');
      await refresh();
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Sequência indisponível.'); }
    finally { setBusy(false); }
  }
  return <article className="sequence-card" data-run-id={run.id}><h3>{run.automationName}</h3><p>{stateLabels[run.state] ?? 'Estado indisponível'}</p>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    <p className="muted">Apresentação: {deliveryLabels[run.introductionStatus ?? ''] ?? 'Indisponível'} · botão: {deliveryLabels[run.buttonStatus ?? ''] ?? 'Indisponível'}</p>
    {run.followRequired && <><label>Estado fictício do perfil<select aria-label="Estado fictício do perfil" value={profile} disabled={busy} onChange={(event) => setProfile(event.target.value as SequenceView['profileFixture'])}>
      <option value="true">Segue · true</option><option value="false">Não segue · false</option><option value="unknown">Desconhecido · unknown</option><option value="error">Erro de leitura · unknown</option></select></label>
      <button className="secondary" disabled={busy} onClick={() => void act('profile')}>Definir perfil fictício</button>
      <p className="muted">Fixture salva: {run.profileFixture === 'true' ? 'Segue' : run.profileFixture === 'false' ? 'Não segue' : run.profileFixture === 'error' ? 'Erro de leitura' : 'Desconhecida'}</p>
      <label className="checkbox"><input type="checkbox" checked={consent} disabled={busy} onChange={(event) => setConsent(event.target.checked)} /> Simular consentimento nesta interação para consultar o perfil</label>
      <p className="muted">Última leitura: {run.followState === 'true' ? 'Segue' : run.followState === 'false' ? 'Não segue' : 'Desconhecida'} · consultas elegíveis: {run.profileChecks}</p></>}
    <div className="control-actions"><button disabled={busy || !run.canInteract} onClick={() => void act('interact')}>Simular nova interação no botão</button>
      {lastRequest && <button className="secondary" disabled={busy} onClick={() => void act('interact', true)}>Repetir mesma interação</button>}</div>
    <p className="muted">A interação percorre webhook/fila/worker. Sem polling ou consultas por alteração do perfil; unknown nunca libera link.</p>
  </article>;
}
export default function SequencesPanel({ accountId }: { accountId: string }) {
  const [data, setData] = useState<List | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    fetchJSON<List>(`/api/accounts/${accountId}/sequences`, controller.signal).then((result) => {
      if (result.accountId !== accountId || result.sequences.some((run) => run.accountId !== accountId)) throw new Error();
      if (!controller.signal.aborted) setData(result);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar as sequências.'); });
    return () => controller.abort();
  }, [accountId]);
  async function refresh() {
    const result = await fetchJSON<List>(`/api/accounts/${accountId}/sequences`, lifetime.current?.signal);
    if (result.accountId !== accountId || result.sequences.some((run) => run.accountId !== accountId)) throw new Error();
    setData(result);
  }
  return <section className="panel" id="sequences"><div className="section-title"><h2>Sequências com botão · fictícias</h2>
    <button className="secondary" disabled={busy} onClick={() => { setBusy(true); setError(''); void refresh().catch(() => setError('Não foi possível atualizar as sequências.')).finally(() => setBusy(false)); }}>Atualizar sequências</button></div>
    {error && <p role="alert" className="error">{error}</p>}{!data ? <p role="status">Aguardando sequências…</p> : !data.sequences.length ? <p>Nenhuma sequência com botão iniciada nesta conta.</p> :
      <div className="sequence-list">{data.sequences.map((run) => <SequenceCard key={run.id} accountId={accountId} run={run} refresh={refresh} />)}</div>}
  </section>;
}

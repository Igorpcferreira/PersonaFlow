'use client';
import { useEffect, useRef, useState } from 'react';
import type { AccountDiagnostics } from '@/modules/accounts/diagnostic-contract';
import { fetchJSON } from './inbox-panel';

const connectionLabels = { connected: 'Conectada à simulação', expired: 'Expirada · reconecte esta conta', revoked: 'Revogada · reconecte esta conta', unavailable: 'Indisponível · reconecte esta conta' };
const jobLabels: Record<string, string> = { created: 'Na fila', retry: 'Aguardando tentativa segura', active: 'Em processamento', failed: 'Falhou' };
const date = (value: string | null) => value ? new Date(value).toLocaleString('pt-BR') : 'Sem registro';
export default function DiagnosticsPanel({ accountId }: { accountId: string }) {
  const [data, setData] = useState<AccountDiagnostics | null>(null);
  const [quota, setQuota] = useState('30');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    fetchJSON<AccountDiagnostics>(`/api/accounts/${accountId}/diagnostics`, controller.signal).then((result) => {
      if (result.accountId !== accountId) throw new Error();
      if (!controller.signal.aborted) { setData(result); setQuota(String(result.limit.quota)); }
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar o diagnóstico.'); });
    return () => controller.abort();
  }, [accountId]);
  async function refresh() {
    const result = await fetchJSON<AccountDiagnostics>(`/api/accounts/${accountId}/diagnostics`, lifetime.current?.signal);
    if (result.accountId !== accountId) throw new Error();
    setData(result); setQuota(String(result.limit.quota));
  }
  async function act(action: string) {
    setBusy(true); setError(''); setNotice('');
    try {
      if (action !== 'inspect') {
        const response = await fetch(`/api/accounts/${accountId}/diagnostics`, { method: 'POST', signal: lifetime.current?.signal,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...(action === 'limit' ? { quota: Number(quota) } : {}) }) });
        const result = await response.json();
        if (!response.ok) throw new Error(result.error ?? 'Ação de diagnóstico indisponível.');
        setNotice(result.inFlight ? 'Ação local confirmada. Um envio já reservado pode estar em trânsito.' : 'Ação local confirmada somente nesta conta.');
      }
      await refresh();
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Diagnóstico indisponível.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" id="diagnostics"><div className="section-title"><h2>Diagnóstico</h2><button className="secondary" disabled={busy} onClick={() => void act('inspect')}>Atualizar diagnóstico</button></div>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data ? <p role="status">Aguardando diagnóstico…</p> : <>
      <div className="diagnostic-grid"><article><h3>Conexão fictícia</h3><p>{connectionLabels[data.connection.status]}</p><p>Expiração: {date(data.connection.expiresAt)}</p>
        <p>Inscrição de eventos: {data.connection.subscriptionCurrent ? 'Atual' : 'Indisponível ou desatualizada'}</p><p>Geração: {data.connection.generation}</p>
        <div className="control-actions"><button className="secondary" disabled={busy} onClick={() => void act('reconnect')}>Reconectar ficticiamente</button>
          <button className="secondary" disabled={busy || !data.connection.refreshEligible} onClick={() => void act('refresh')}>Renovar token fictício</button>
          <button className="secondary" disabled={busy} onClick={() => void act('expire')}>Simular expiração</button><button className="secondary" disabled={busy} onClick={() => void act('revoke')}>Revogar conexão fictícia</button></div>
        <p className="muted">Renovação disponível após 24 horas de emissão. Reconectar invalida pendentes antigos.</p></article>
      <article><h3>Worker e fila</h3><p>Worker: {data.worker.state === 'active' ? 'Heartbeat recente' : data.worker.state === 'stale' ? 'Heartbeat atrasado' : 'Sem heartbeat'}</p><p>Último heartbeat: {date(data.worker.seenAt)}</p>
        <p>Entradas por processar: {data.queue.unprocessed} · idade mais antiga: {data.queue.oldestInboundAgeSeconds ?? 0} s</p>
        <p>Intenções na fila: {data.queue.pending} · idade mais antiga: {data.queue.oldestPendingAgeSeconds ?? 0} s</p><p>Em trânsito: {data.queue.sending}</p>
        {data.queue.jobs.map((job) => <p className="muted" key={`${job.name}:${job.state}`}>{job.name === 'inbound-event' ? 'Entrada' : 'Envio fictício'} · {jobLabels[job.state] ?? 'Estado indisponível'} · {job.count} · {job.oldestAgeSeconds ?? 0} s</p>)}</article>
      <article><h3>Pausa e limite local</h3><p>{data.paused ? 'Conta pausada · novos envios bloqueados' : 'Conta em operação fictícia'}</p>
        <button className="secondary" disabled={busy} onClick={() => void act(data.paused ? 'resume' : 'pause')}>{data.paused ? 'Retomar conta' : 'Pausar conta'}</button>
        <p>Reservas neste minuto: {data.limit.used} / {data.limit.quota}</p><p>Próxima janela: {date(data.limit.resetsAt)}</p><p>Cooldown: {data.limit.cooldownUntil ? date(data.limit.cooldownUntil) : 'Sem espera adicional'}</p>
        <label>Limite fictício por minuto<input type="number" min={1} max={30} value={quota} disabled={busy} onChange={(event) => setQuota(event.target.value)} /></label><button className="secondary" disabled={busy} onClick={() => void act('limit')}>Aplicar limite fictício</button>
        <p className="muted">Retomar não reativa pendentes cancelados. Limite da demonstração; não representa a quota da Meta.</p></article>
      <article><h3>Resultados que exigem atenção</h3><p>Incertos: {data.results.unknown} · falhas: {data.results.rejected} · bloqueados: {data.results.blocked}</p>
        {data.results.unknown > 0 && <p className="error">Pedidos incertos são terminais e não serão reenviados automaticamente.</p>}
        {data.results.uncertain.map((intent) => <p key={intent.id} className="muted">Pedido {intent.id.slice(0, 8)} · {date(intent.createdAt)}</p>)}</article></div>
      <p className="muted">Diagnóstico desta conta em {date(data.checkedAt)}. Atualize para obter uma nova leitura; todos os efeitos são sintéticos.</p>
    </>}
  </section>;
}

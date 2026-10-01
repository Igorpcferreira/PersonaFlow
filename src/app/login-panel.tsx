'use client';

import { useEffect, useState } from 'react';
import { AccountChooser } from './account-shell';

type PilotStatus = { prepared: boolean; connected: boolean; subscribed: boolean; sendingEnabled: boolean };

function ProductionPilot() {
  const [status, setStatus] = useState<PilotStatus | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/meta/pilot-status', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        if (!controller.signal.aborted) setStatus(await response.json() as PilotStatus);
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, []);
  return <div className="pilot-status" aria-label="Estado da conta Kyber">
    <h2>@somoskyber</h2>
    {error ? <p role="alert">Não foi possível consultar a conexão. Recarregue esta página.</p> : !status ?
      <p role="status">Consultando a conexão…</p> : <>
        <p>Instagram: {status.connected ? 'conectado' : status.prepared ? 'aguardando sua autorização' : 'preparação pendente'}.</p>
        <p>Comentários: {status.subscribed ? 'assinatura confirmada' : 'assinatura ainda não confirmada'}.</p>
        <p>Modo de envio: {status.sendingEnabled ? 'habilitado (entrega ainda depende de verificação)' : 'desligado'}.</p>
        {status.prepared && !status.connected && <a href="/api/meta/oauth/start">Conectar @somoskyber ao PersonaFlow</a>}
      </>}
  </div>;
}

export default function LoginPanel() {
  const [operator, setOperator] = useState<string | null>(null);
  const [mode, setMode] = useState<'local-demo' | 'production' | 'locked'>('locked');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/operator', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (response.ok) {
          const body = await response.json();
          setOperator(body.name);
          setMode(body.mode);
        } else if (response.status === 401) {
          const body = await response.json() as { mode?: 'local-demo' | 'production' | 'locked' };
          if (body.mode) setMode(body.mode);
        } else setError('Não foi possível consultar a sessão.');
        if (new URLSearchParams(window.location.search).has('error')) setError('O login não foi concluído. Tente novamente.');
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível consultar a sessão.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function act(action: 'sign-in/social' | 'sign-out') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'sign-out' ? {} : {
          provider: mode === 'production' ? 'github' : 'local-demo', callbackURL: '/', errorCallbackURL: '/?login=error',
        }),
      });
      if (!response.ok) throw new Error('Ação indisponível.');
      if (action === 'sign-out') setOperator(null);
      else {
        const result = await response.json();
        const destination = new URL(result.url);
        if (mode === 'production' ? destination.origin !== 'https://github.com' : destination.origin !== window.location.origin) throw new Error('Destino inválido.');
        window.location.assign(destination);
      }
    } catch {
      setError('Não foi possível concluir a ação. Confira a configuração e tente novamente.');
    } finally { setBusy(false); }
  }

  return <section className="login-card" aria-busy={loading || busy}>
    <span className="badge">{mode === 'production' ? 'Acesso de operador' : mode === 'local-demo' ? 'Simulação local' : 'Acesso indisponível'}</span>
    <h1>PersonaFlow</h1>
    <p className="intro">Um espaço para configurar e acompanhar as suas automações.</p>
    {loading ? <p role="status">Consultando sessão…</p> : operator ? <>
      <p>Olá, {operator}. Sua sessão está ativa.</p>
      {mode === 'local-demo' ? <AccountChooser /> : <><ProductionPilot /><p className="muted">O painel de conversas e automações ainda não está habilitado para a conta real.</p></>}
      <button disabled={busy} onClick={() => void act('sign-out')}>{busy ? 'Saindo…' : 'Sair'}</button>
    </> : <>
      {mode === 'production' ? <><p>Entre com a conta GitHub autorizada para administrar o acesso.</p><button disabled={busy} onClick={() => void act('sign-in/social')}>{busy ? 'Redirecionando…' : 'Entrar com GitHub'}</button></> : mode === 'local-demo' ? <><p>Entre com a identidade fictícia para explorar o ambiente local.</p><button disabled={busy} onClick={() => void act('sign-in/social')}>{busy ? 'Entrando…' : 'Entrar como operador fictício'}</button></> : <p className="muted">Configure um modo de autenticação válido para entrar.</p>}
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

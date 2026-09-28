'use client';

import { useEffect, useState } from 'react';

export default function LoginPanel() {
  const [operator, setOperator] = useState<string | null>(null);
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
        } else if (response.status !== 401) setError('Não foi possível consultar a sessão local.');
        if (new URLSearchParams(window.location.search).has('error')) setError('O login local não foi concluído. Tente novamente.');
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível consultar a sessão local.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  async function act(action: 'sign-in/social' | 'sign-out') {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(`/api/auth/${action}`, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'sign-out' ? {} : {
          provider: 'local-demo', callbackURL: '/', errorCallbackURL: '/?login=error',
        }),
      });
      if (!response.ok) throw new Error('Ação indisponível.');
      if (action === 'sign-out') setOperator(null);
      else {
        const result = await response.json();
        const destination = new URL(result.url);
        if (destination.origin !== window.location.origin) throw new Error('Destino inválido.');
        window.location.assign(destination);
      }
    } catch {
      setError('Não foi possível concluir a ação. Inicie a demonstração local e tente novamente.');
    } finally { setBusy(false); }
  }

  return <section className="login-card" aria-busy={loading || busy}>
    <span className="badge">Simulação local</span>
    <h1>PersonaFlow</h1>
    <p className="intro">Um espaço para configurar e acompanhar as suas automações.</p>
    {loading ? <p role="status">Consultando sessão…</p> : operator ? <>
      <p>Olá, {operator}. Sua sessão está ativa.</p>
      <p className="muted">As contas e os fluxos fictícios estão em desenvolvimento. Esta demonstração não envia mensagens reais.</p>
      <button disabled={busy} onClick={() => void act('sign-out')}>{busy ? 'Saindo…' : 'Sair'}</button>
    </> : <>
      <p>Entre com a identidade fictícia para explorar o ambiente local.</p>
      <button disabled={busy} onClick={() => void act('sign-in/social')}>{busy ? 'Entrando…' : 'Entrar como operador fictício'}</button>
      <p className="muted">Login GitHub real ainda indisponível nesta etapa.</p>
    </>}
    {error && <p className="error" role="alert">{error}</p>}
  </section>;
}

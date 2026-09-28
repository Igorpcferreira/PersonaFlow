'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import Link from 'next/link';

export type AccountSummary = { id: string; label: string; pausedAt: string | null };
export function AccountChooser() {
  const [accounts, setAccounts] = useState<AccountSummary[] | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/accounts', { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!controller.signal.aborted) setAccounts(data.accounts);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar as contas. Recarregue para tentar novamente.'); });
    return () => controller.abort();
  }, []);
  return <div className="account-chooser">
    <h2>Escolha uma conta</h2>
    <p className="muted">Cada conta tem sua própria inbox e suas automações.</p>
    {error ? <p role="alert" className="error">{error}</p> : accounts === null ? <p role="status">Carregando contas…</p> : accounts.length === 0 ?
      <p>Nenhuma conta fictícia preparada. Inicie a demonstração local.</p> : <div className="account-cards">{accounts.map((account) =>
        <Link prefetch={false} className="account-card" key={account.id} href={`/accounts/${account.id}`}><strong>{account.label}</strong><span>{account.pausedAt ? 'Pausada' : 'Abrir conta'} →</span></Link>)}</div>}
  </div>;
}

function subscribeDraft(changed: () => void) {
  window.addEventListener('storage', changed); window.addEventListener('personaflow-draft', changed);
  return () => { window.removeEventListener('storage', changed); window.removeEventListener('personaflow-draft', changed); };
}
function AccountView({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState('');
  const draft = useSyncExternalStore(subscribeDraft, () => localStorage.getItem(`personaflow:${accountId}:composer`) ?? '', () => '');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/accounts/${accountId}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (!controller.signal.aborted) setAccount(data.account);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar esta conta. Recarregue para tentar novamente.'); });
    return () => controller.abort();
  }, [accountId]);
  return <main className="workspace">
    <header className="workspace-header"><Link className="brand" href="/">PersonaFlow</Link><span className="badge">Simulação local</span><Link href="/">Trocar conta</Link></header>
    {error ? <p role="alert" className="error">{error}</p> : !account ? <p role="status">Carregando conta…</p> : <>
      <h1>{account.label}</h1><p className="muted">Ambiente fictício. Todos os efeitos ficam nesta demonstração.</p>
      <nav className="workspace-nav" aria-label="Seções da conta"><a href="#inbox">Inbox</a><a href="#automations">Automações</a><a href="#diagnostics">Diagnóstico</a></nav>
      <section className="panel" id="inbox"><h2>Inbox</h2><p>Nenhuma conversa recebida nesta conta.</p>
        <label>Rascunho de mensagem<textarea value={draft} maxLength={2000} onChange={(event) => { localStorage.setItem(`personaflow:${accountId}:composer`, event.target.value); window.dispatchEvent(new Event('personaflow-draft')); }} /></label>
        <p className="muted">Selecione uma conversa para enviar. Seu rascunho fica nesta conta.</p>
      </section>
      <section className="panel" id="automations"><h2>Automações</h2><p>Nenhuma automação configurada nesta conta.</p></section>
      <section className="panel" id="diagnostics"><h2>Diagnóstico</h2><p>{account.pausedAt ? 'Conta pausada.' : 'Conta fictícia disponível.'}</p></section>
    </>}
  </main>;
}
// A identidade do componente cancela requests/estado ao trocar de conta; nada escolhe a primeira conta para escrever.
export default function AccountShell({ accountId }: { accountId: string }) { return <AccountView key={accountId} accountId={accountId} />; }

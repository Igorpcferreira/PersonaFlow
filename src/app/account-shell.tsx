'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import InboxPanel from './inbox-panel';
import AutomationsPanel from './automations-panel';
import DiagnosticsPanel from './diagnostics-panel';
import SequencesPanel from './sequences-panel';

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

function AccountView({ accountId }: { accountId: string }) {
  const [account, setAccount] = useState<AccountSummary | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/accounts/${accountId}`, { cache: 'no-store', signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      const data = await response.json();
      if (data.account.id !== accountId) throw new Error();
      if (!controller.signal.aborted) setAccount(data.account);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar esta conta. Recarregue para tentar novamente.'); });
    return () => controller.abort();
  }, [accountId]);
  return <main className="workspace">
    <header className="workspace-header"><Link className="brand" href="/">PersonaFlow</Link><span className="badge">Simulação local</span><Link href="/">Trocar conta</Link></header>
    {error ? <p role="alert" className="error">{error}</p> : !account ? <p role="status">Carregando conta…</p> : <>
      <div className="workspace-frame">
        <aside className="workspace-sidebar" aria-label="Conta e navegação">
          <div className="sidebar-account"><span className="sidebar-caption">Conta selecionada</span><strong>{account.label}</strong><span className="sidebar-state">{account.pausedAt ? 'Automações pausadas' : 'Ambiente de teste'}</span></div>
          <nav className="workspace-nav" aria-label="Seções da conta"><a href="#inbox">Conversas</a><a href="#automations">Automações</a><a href="#sequences">Sequências</a><a href="#diagnostics">Diagnóstico</a></nav>
          <p className="sidebar-note">Nenhuma mensagem desta demonstração chega ao Instagram.</p>
        </aside>
        <div className="workspace-content">
          <div className="workspace-intro"><div><p className="workspace-kicker">Painel da conta</p><h1>{account.label}</h1></div><p>Configure respostas, acompanhe conversas e confira o estado da conta.</p></div>
          <InboxPanel key={`inbox:${accountId}`} accountId={accountId} />
          <AutomationsPanel key={`automations:${accountId}`} accountId={accountId} />
          <SequencesPanel key={`sequences:${accountId}`} accountId={accountId} />
          <DiagnosticsPanel key={`diagnostics:${accountId}`} accountId={accountId} />
        </div>
      </div>
    </>}
  </main>;
}
// A identidade do componente cancela requests/estado ao trocar de conta; nada escolhe a primeira conta para escrever.
export default function AccountShell({ accountId }: { accountId: string }) { return <AccountView key={accountId} accountId={accountId} />; }

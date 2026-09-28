'use client';
import { useEffect, useRef, useState } from 'react';
import { useDraft } from './use-draft';

export type ConversationSummary = { id: string; accountId: string; control: string; status: string; lastEligibleInboundAt: string | null;
  contact: { igScopedUserId: string; suppressedAt: string | null }; messages: { body: string | null; kind: string }[] };
export type InboxMessage = { id: string; accountId: string; body: string | null; direction: string; kind: string; echo: boolean; occurredAt: string };
export type OutgoingIntent = { id: string; accountId: string; body: { text: string; link?: string; button?: { title: string } }; effect: string; source: string; status: string; reason: string | null; createdAt: string };
export type ThreadData = { conversation: Omit<ConversationSummary, 'messages'> & { controlVersion: number; note: string | null }; windowOpen: boolean; messages: InboxMessage[]; intents: OutgoingIntent[]; nextCursor: string | null; partialHistory: boolean };
const statusLabels: Record<string, string> = { pending: 'Na fila da simulação', sending: 'Simulando envio', accepted: 'Aceito pela simulação',
  rejected: 'Falhou na simulação', unknown: 'Incerto · não será reenviado', blocked: 'Bloqueado', canceled: 'Cancelado', expired: 'Prazo encerrado' };
const effectLabels: Record<string, string> = { private_reply: 'Resposta privada fictícia', public_reply: 'Resposta pública fictícia',
  button: 'Botão fictício', automatic_dm: 'DM automática fictícia', link: 'Link fictício', manual: 'Envio manual fictício' };
export async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Solicitação indisponível.');
  return response.json() as Promise<T>;
}

export function Thread({ accountId, conversationId, onChange }: { accountId: string; conversationId: string; onChange?: () => Promise<void> }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState('accepted');
  const [notice, setNotice] = useState('');
  const [draft, saveDraft] = useDraft(accountId, conversationId);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    fetchJSON<ThreadData>(`/api/accounts/${accountId}/inbox/${conversationId}`, controller.signal).then((result) => {
      if (result.conversation.accountId !== accountId || result.conversation.id !== conversationId) throw new Error();
      if (!controller.signal.aborted) setData(result);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar a conversa.'); });
    return () => controller.abort();
  }, [accountId, conversationId]);
  async function older() {
    if (!data?.nextCursor) return;
    setBusy(true);
    try {
      const result = await fetchJSON<ThreadData>(`/api/accounts/${accountId}/inbox/${conversationId}?cursor=${data.nextCursor}`, lifetime.current?.signal);
      setData({ ...result, messages: [...result.messages, ...data.messages] });
    } catch { setError('Não foi possível carregar as mensagens anteriores.'); }
    finally { setBusy(false); }
  }
  async function refresh() {
    const result = await fetchJSON<ThreadData>(`/api/accounts/${accountId}/inbox/${conversationId}`, lifetime.current?.signal);
    if (result.conversation.accountId !== accountId || result.conversation.id !== conversationId) throw new Error();
    setData(result);
  }
  async function act(action: 'assume' | 'resume' | 'send') {
    setBusy(true); setError(''); setNotice('');
    try {
      let payload: Record<string, unknown> = { action };
      if (action === 'send') {
        const key = `personaflow:${accountId}:${conversationId}:manual-request`;
        const fingerprint = JSON.stringify({ text: draft, outcome });
        let previous: { fingerprint: string; id: string } | null = null;
        try { previous = JSON.parse(localStorage.getItem(key) ?? 'null'); } catch { /* Sem pedido anterior. */ }
        const id = previous?.fingerprint === fingerprint ? previous.id : crypto.randomUUID();
        localStorage.setItem(key, JSON.stringify({ fingerprint, id }));
        payload = { action, text: draft, clientRequestId: id, simulationOutcome: outcome };
      }
      const response = await fetch(`/api/accounts/${accountId}/inbox/${conversationId}`, { method: 'POST', signal: lifetime.current?.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Ação local indisponível.');
      if (action === 'send') {
        saveDraft(''); localStorage.removeItem(`personaflow:${accountId}:${conversationId}:manual-request`);
        setNotice('Pedido confirmado. Atualize a conversa para acompanhar o resultado fictício.');
      }
      else setNotice(result.control.inFlight ? 'Controle atualizado. Um envio já reservado pode estar em trânsito.' : action === 'assume' ? 'Conversa assumida; pendentes automáticos cancelados.' : 'Automação retomada para novas entradas.');
      await refresh();
      await onChange?.();
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Ação local indisponível.'); }
    finally { setBusy(false); }
  }
  const windowOpen = data?.windowOpen ?? false;
  const timeline = data ? [
    ...data.messages.map((message) => ({ type: 'message' as const, at: message.occurredAt, value: message })),
    ...data.intents.map((intent) => ({ type: 'intent' as const, at: intent.createdAt, value: intent })),
  ].sort((left, right) => left.at.localeCompare(right.at) || left.value.id.localeCompare(right.value.id)) : [];
  return <div className="thread">
    <h3>Conversa com visitante fictício</h3>
    <p className="muted">Histórico parcial: apenas entradas recebidas nesta demonstração.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data ? <p role="status">Carregando conversa…</p> : <>
      {data.nextCursor && <button className="secondary" disabled={busy} onClick={() => void older()}>Carregar anteriores</button>}
      <div className="control-actions">
        <button className="secondary" disabled={busy} onClick={() => void (data.conversation.control === 'manual' ? act('resume') : act('assume'))}>{data.conversation.control === 'manual' ? 'Retomar automação' : 'Assumir conversa'}</button>
        <button className="secondary" disabled={busy} onClick={() => { setBusy(true); void refresh().catch(() => setError('Não foi possível atualizar a conversa.')).finally(() => setBusy(false)); }}>Atualizar conversa</button>
        <span className="badge">{data.conversation.control === 'manual' ? 'Controle manual' : 'Automático'}</span>
      </div>
      <div className="messages">{timeline.map((item) => item.type === 'message' ? (() => { const message = item.value; return <article key={message.id} className={`message ${message.direction}`}>
        <span className="message-meta">{message.echo ? 'Echo · saída identificada' : message.kind === 'comment' ? 'Comentário' : message.kind === 'story' ? 'Resposta a story · fictícia' : 'Entrada'} · {new Date(message.occurredAt).toLocaleString('pt-BR')}</span>
        <p>{message.body ?? 'Mensagem sem texto · conteúdo indisponível'}</p>
      </article>; })() : <article key={item.value.id} className={`message outbound delivery-${item.value.status}`}>
        <span className="message-meta">{effectLabels[item.value.effect] ?? 'Automação fictícia'} · {new Date(item.at).toLocaleString('pt-BR')}</span>
        <p>{item.value.body.text}</p><strong className="delivery-status">{statusLabels[item.value.status] ?? 'Estado indisponível'}</strong>
      </article>)}</div>
      <label>Rascunho de mensagem<textarea value={draft} disabled={busy} maxLength={2000} onChange={(event) => saveDraft(event.target.value)} /></label>
      <div className="manual-send"><label>Resultado fictício<select aria-label="Resultado fictício" value={outcome} onChange={(event) => setOutcome(event.target.value)} disabled={busy}>
        <option value="accepted">Aceito pela simulação</option><option value="timeout">Aceite com resposta perdida · incerto</option><option value="rejected">Falha confirmada</option>
      </select></label><button disabled={busy || !draft.trim() || !windowOpen || data.conversation.control !== 'manual'} onClick={() => void act('send')}>Enviar simulado</button></div>
      <p className="muted">{!windowOpen ? 'Janela de DM encerrada. É necessária uma nova interação elegível.' : data.conversation.control !== 'manual' ? 'Assuma a conversa para enviar uma mensagem.' : 'Envio fictício dentro da janela de 24 horas, conferida no servidor.'}</p>
      {data.intents.some((intent) => intent.status === 'unknown') && <p className="error">Há um resultado incerto nesta conversa. A simulação não reenviará esse pedido.</p>}
    </>}
  </div>;
}
export default function InboxPanel({ accountId }: { accountId: string }) {
  const [list, setList] = useState<ConversationSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState('');
  const [receipt, setReceipt] = useState('');
  const [draft, saveDraft] = useDraft(accountId);
  const lifetime = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    fetchJSON<{ conversations: ConversationSummary[]; nextCursor: string | null }>(`/api/accounts/${accountId}/inbox`, controller.signal).then((result) => {
      if (result.conversations.some((conversation) => conversation.accountId !== accountId)) throw new Error();
      if (!controller.signal.aborted) { setList(result.conversations); setCursor(result.nextCursor); }
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar a inbox.'); });
    return () => controller.abort();
  }, [accountId, version]);
  async function simulate() {
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/accounts/${accountId}/simulate-event`, { method: 'POST', signal: lifetime.current?.signal, headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'message', text, externalId: crypto.randomUUID() }) });
      if (!response.ok) throw new Error();
      setReceipt('Mensagem fictícia recebida. Aguarde um momento e atualize a inbox.');
    } catch { setError('Não foi possível receber a mensagem fictícia.'); }
    finally { setBusy(false); }
  }
  async function more() {
    if (!cursor) return;
    try {
      const result = await fetchJSON<{ conversations: ConversationSummary[]; nextCursor: string | null }>(`/api/accounts/${accountId}/inbox?cursor=${cursor}`, lifetime.current?.signal);
      setList([...(list ?? []), ...result.conversations]); setCursor(result.nextCursor);
    } catch { setError('Não foi possível carregar mais conversas.'); }
  }
  async function reloadList() {
    const result = await fetchJSON<{ conversations: ConversationSummary[]; nextCursor: string | null }>(`/api/accounts/${accountId}/inbox`, lifetime.current?.signal);
    setList(result.conversations); setCursor(result.nextCursor);
  }
  return <section className="panel" id="inbox">
    <div className="section-title"><h2>Inbox</h2><button className="secondary" onClick={() => { setError(''); setVersion((value) => value + 1); }}>Atualizar inbox</button></div>
    <details className="simulation-controls"><summary>Receber mensagem fictícia</summary>
      <label>Mensagem fictícia<input value={text} maxLength={2000} onChange={(event) => setText(event.target.value)} /></label>
      <button disabled={busy || !text.trim()} onClick={() => void simulate()}>{busy ? 'Recebendo…' : 'Simular entrada de DM'}</button>
      {receipt && <p role="status">{receipt}</p>}
    </details>
    {error && <p role="alert" className="error">{error}</p>}
    {list === null ? <p role="status">Carregando inbox…</p> : list.length === 0 ? <>
      <p>Nenhuma conversa recebida nesta conta.</p><label>Rascunho de mensagem<textarea maxLength={2000} value={draft} onChange={(event) => saveDraft(event.target.value)} /></label>
      <p className="muted">Selecione uma conversa para enviar. Seu rascunho fica nesta conta.</p>
    </> : <div className="inbox-grid"><div className="conversation-list">{list.map((conversation) =>
      <button key={conversation.id} className={`conversation-item ${selected === conversation.id ? 'selected' : ''}`} onClick={() => setSelected(conversation.id)}>
        <strong>Visitante fictício</strong><span>{conversation.messages[0]?.body ?? 'Conteúdo indisponível'}</span><small>{conversation.control === 'manual' ? 'Manual' : 'Automático'} · {conversation.status === 'resolved' ? 'Resolvida' : 'Aberta'}</small>
      </button>)}{cursor && <button className="secondary" onClick={() => void more()}>Mais conversas</button>}</div>
      {selected ? <Thread key={`${accountId}:${selected}:${version}`} accountId={accountId} conversationId={selected} onChange={reloadList} /> : <p className="muted">Selecione uma conversa para abrir o histórico.</p>}
    </div>}
  </section>;
}

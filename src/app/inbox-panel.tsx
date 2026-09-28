'use client';
import { useEffect, useRef, useState } from 'react';
import { useDraft } from './use-draft';

export type ConversationSummary = { id: string; accountId: string; control: string; status: string; lastEligibleInboundAt: string | null;
  contact: { igScopedUserId: string; suppressedAt: string | null }; messages: { body: string | null; kind: string }[] };
export type InboxMessage = { id: string; accountId: string; body: string | null; direction: string; kind: string; echo: boolean; occurredAt: string };
export type ThreadData = { conversation: Omit<ConversationSummary, 'messages'> & { controlVersion: number; note: string | null }; messages: InboxMessage[]; nextCursor: string | null; partialHistory: boolean };
export async function fetchJSON<T>(url: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', signal });
  if (!response.ok) throw new Error('Solicitação indisponível.');
  return response.json() as Promise<T>;
}

export function Thread({ accountId, conversationId }: { accountId: string; conversationId: string }) {
  const [data, setData] = useState<ThreadData | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
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
  return <div className="thread">
    <h3>Conversa com visitante fictício</h3>
    <p className="muted">Histórico parcial: apenas entradas recebidas nesta demonstração.</p>
    {error && <p role="alert" className="error">{error}</p>}
    {!data ? <p role="status">Carregando conversa…</p> : <>
      {data.nextCursor && <button className="secondary" disabled={busy} onClick={() => void older()}>Carregar anteriores</button>}
      <div className="messages">{data.messages.map((message) => <article key={message.id} className={`message ${message.direction}`}>
        <span className="message-meta">{message.echo ? 'Echo · saída identificada' : message.kind === 'comment' ? 'Comentário' : message.kind === 'story' ? 'Resposta a story · fictícia' : 'Entrada'} · {new Date(message.occurredAt).toLocaleString('pt-BR')}</span>
        <p>{message.body ?? 'Mensagem sem texto · conteúdo indisponível'}</p>
      </article>)}</div>
      <label>Rascunho de mensagem<textarea value={draft} maxLength={2000} onChange={(event) => saveDraft(event.target.value)} /></label>
      <p className="muted">{data.conversation.lastEligibleInboundAt ? 'Interação recebida nesta conversa.' : 'Comentário sozinho não abre a janela de DM.'}</p>
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
      {selected ? <Thread key={`${accountId}:${selected}:${version}`} accountId={accountId} conversationId={selected} /> : <p className="muted">Selecione uma conversa para abrir o histórico.</p>}
    </div>}
  </section>;
}

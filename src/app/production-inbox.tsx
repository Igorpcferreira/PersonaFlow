'use client';

import { useCallback, useEffect, useState } from 'react';

type Conversation = {
  id: string;
  status: string;
  control: string;
  lastActivityAt: string;
  messages: { body: string | null; kind: string }[];
};
type Thread = {
  conversation: { id: string; note: string | null; status: string; control: string };
  messages: { id: string; body: string | null; direction: string; kind: string; occurredAt: string }[];
  intents: { id: string; status: string; createdAt: string }[];
  partialHistory: boolean;
};

function when(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}

export default function ProductionInbox() {
  const [items, setItems] = useState<Conversation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/meta/pilot-inbox', { cache: 'no-store' });
      if (!response.ok) throw new Error();
      const data = await response.json() as { conversations: Conversation[] };
      setItems(data.conversations);
    } catch { setError('Não foi possível consultar as conversas.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/meta/pilot-inbox', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json() as { conversations: Conversation[] };
        if (!controller.signal.aborted) setItems(data.conversations);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível consultar as conversas.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    fetch(`/api/meta/pilot-inbox?conversationId=${encodeURIComponent(selected)}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        const data = await response.json() as Thread;
        if (!controller.signal.aborted) setThread(data);
      })
      .catch(() => { if (!controller.signal.aborted) setError('Não foi possível abrir a conversa.'); });
    return () => controller.abort();
  }, [selected]);

  return <section className="production-inbox" aria-label="Conversas da Kyber">
    <div className="production-inbox-header"><div><h2>Conversas da Kyber</h2><p>Leitura das entradas registradas. Responda pelo <a href="https://www.instagram.com/direct/inbox/" target="_blank" rel="noopener noreferrer">Instagram</a> enquanto o painel de envio está desligado.</p></div>
      <button className="secondary" onClick={() => void refresh()} disabled={loading}>Atualizar</button></div>
    {error && <p className="error" role="alert">{error}</p>}
    {loading && <p role="status">Consultando conversas…</p>}
    {!loading && !items.length && <p className="muted">Nenhuma conversa registrada nesta conta.</p>}
    {!!items.length && <div className="production-inbox-grid">
      <div className="production-inbox-list" aria-label="Lista de conversas">{items.map((item) =>
        <button key={item.id} className={`production-inbox-item${selected === item.id ? ' selected' : ''}`}
          onClick={() => { setError(''); setThread(null); setSelected(item.id); }}>
          <strong>{item.messages[0]?.kind === 'comment' ? 'Comentário' : 'Conversa'} · {when(item.lastActivityAt)}</strong>
          <span>{item.messages[0]?.body ?? 'Conteúdo indisponível'}</span>
          <small>{item.control === 'manual' ? 'Atendimento humano' : item.status === 'resolved' ? 'Concluída' : 'A acompanhar'}</small>
        </button>)}</div>
      <div className="production-inbox-thread">{!selected ? <p className="muted">Abra uma conversa para ver o histórico registrado.</p> : !thread ?
        <p role="status">Abrindo conversa…</p> : <>
          <h3>Histórico registrado</h3>
          {thread.partialHistory && <p className="muted">O histórico pode estar incompleto; confira a conversa no Instagram antes de agir.</p>}
          {thread.messages.map((message) => <article className={`production-inbox-message ${message.direction}`} key={message.id}>
            <small>{message.direction === 'outbound' ? 'Kyber' : 'Pessoa'} · {when(message.occurredAt)}</small>
            <p>{message.body ?? 'Conteúdo indisponível'}</p>
          </article>)}
          {thread.intents.length > 0 && <p className="muted">Envio registrado: {thread.intents.at(-1)?.status === 'accepted' ? 'aceito pela Meta; esta tela não confirma recebimento' : thread.intents.at(-1)?.status}. Confira a entrega no Instagram.</p>}
          {thread.conversation.note && <p className="production-inbox-note"><strong>Nota:</strong> {thread.conversation.note}</p>}
        </>}</div>
    </div>}
  </section>;
}

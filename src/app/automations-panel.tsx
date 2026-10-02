'use client';
import { useEffect, useRef, useState } from 'react';
import { emptyRecipe, matchingTerm, textReply, type RecipeConfig, type RecipeTrigger } from '@/modules/automations/recipe';
import { fetchJSON } from './inbox-panel';

type Automation = { id: string; accountId: string; name: string; trigger: RecipeTrigger; mediaId: string | null; status: string; revision: number; config: RecipeConfig };
type Data = { automations: Automation[]; reels: { id: string; title: string }[]; capabilities: { publicReply: boolean; button: boolean; follow: boolean } };
export default function AutomationsPanel({ accountId }: { accountId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [selected, setSelected] = useState<Automation | null>(null);
  const [name, setName] = useState('');
  const [mediaId, setMediaId] = useState('');
  const [trigger, setTrigger] = useState<RecipeTrigger>('comment');
  const [config, setConfig] = useState<RecipeConfig>({ ...emptyRecipe });
  const [terms, setTerms] = useState('');
  const [comment, setComment] = useState('');
  const [lastEvent, setLastEvent] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const lifetime = useRef<AbortController | null>(null);
  const dirty = selected ? name !== selected.name || trigger !== selected.trigger || (mediaId || null) !== selected.mediaId || JSON.stringify({ ...config, terms: terms.split(/\n|,/).map((term) => term.trim()).filter(Boolean) }) !== JSON.stringify(selected.config) : true;
  useEffect(() => {
    const controller = new AbortController(); lifetime.current = controller;
    fetchJSON<Data>(`/api/accounts/${accountId}/automations`, controller.signal).then((result) => {
      if (result.automations.some((rule) => rule.accountId !== accountId)) throw new Error();
      if (!controller.signal.aborted) setData(result);
    }).catch(() => { if (!controller.signal.aborted) setError('Não foi possível carregar as automações.'); });
    return () => controller.abort();
  }, [accountId]);
  function edit(automation: Automation | null) {
    setSelected(automation); setName(automation?.name ?? ''); setMediaId(automation?.mediaId ?? '');
    setTrigger(automation?.trigger ?? 'comment');
    setConfig(automation?.config ?? { ...emptyRecipe }); setTerms(automation?.config.terms.join('\n') ?? '');
    setError(''); setNotice(''); setLastEvent(null);
  }
  const change = <K extends keyof RecipeConfig>(key: K, value: RecipeConfig[K]) => setConfig((current) => ({ ...current, [key]: value }));
  async function perform(action: 'save' | 'activate' | 'pause') {
    setBusy(true); setError(''); setNotice('');
    try {
      const value = { name, trigger, mediaId: trigger === 'comment' ? mediaId : null, config: { ...config, terms: terms.split(/\n|,/).map((term) => term.trim()).filter(Boolean) } };
      const endpoint = `/api/accounts/${accountId}/automations${selected ? `/${selected.id}` : ''}`;
      const body = selected ? { action, revision: selected.revision, ...(action === 'save' ? { value } : {}) } : value;
      const response = await fetch(endpoint, { method: 'POST', signal: lifetime.current?.signal, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Não foi possível atualizar a automação.');
      if (result.automation.accountId !== accountId) throw new Error('Contexto de conta indisponível.');
      edit(result.automation);
      setNotice(action === 'save' ? 'Rascunho salvo. Confira a prévia antes de ativar.' : action === 'activate' ? 'Automação ativa somente na simulação local.' : 'Automação pausada; pendentes cancelados.');
      setData(await fetchJSON<Data>(`/api/accounts/${accountId}/automations`, lifetime.current?.signal));
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Não foi possível concluir a ação.'); }
    finally { setBusy(false); }
  }
  async function simulate(replay = false) {
    if (!selected) return;
    setBusy(true); setError(''); setNotice('');
    try {
      const externalId = replay && lastEvent ? lastEvent : crypto.randomUUID();
      const response = await fetch(`/api/accounts/${accountId}/simulate-event`, { method: 'POST', signal: lifetime.current?.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind: selected.trigger, text: comment, ...(selected.mediaId ? { mediaId: selected.mediaId } : {}), externalId }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? 'Simulação indisponível.');
      setLastEvent(externalId); setNotice(result.duplicate ? 'Evento repetido: nenhum novo pedido será criado.' : `${selected.trigger === 'comment' ? 'Comentário' : 'Texto'} fictício recebido. Atualize a inbox para acompanhar o resultado.`);
    } catch (error) { if (!lifetime.current?.signal.aborted) setError(error instanceof Error ? error.message : 'Simulação indisponível.'); }
    finally { setBusy(false); }
  }
  return <section className="panel" id="automations">
    <div className="section-title"><h2>Automações</h2><button className="secondary" disabled={busy} onClick={() => edit(null)}>Nova automação</button></div>
    {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
    {!data ? <p role="status">Carregando automações…</p> : <>
      {data.automations.length === 0 ? <p>Nenhuma automação configurada nesta conta.</p> : <div className="rule-list">{data.automations.map((rule) =>
        <button className="secondary" key={rule.id} disabled={busy} onClick={() => edit(rule)}>{rule.name} · {rule.status === 'active' ? 'Ativa' : rule.status === 'draft' ? 'Rascunho' : 'Pausada'}</button>)}</div>}
      <div className="recipe-grid"><fieldset className="recipe-fields" disabled={busy} aria-label="Campos da automação">
        <label>Nome da automação<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} /></label>
        <label>Gatilho fictício<select aria-label="Gatilho fictício" value={trigger} onChange={(event) => {
          const value = event.target.value as RecipeTrigger; setTrigger(value); setMediaId(''); setLastEvent(null);
          if (value !== 'comment') setConfig((current) => ({ ...current, publicReplyEnabled: false, buttonEnabled: false, followRequired: false }));
        }}><option value="comment">Comentário por reel</option><option value="message">Mensagem de DM</option><option value="story">Resposta textual a story</option></select></label>
        {trigger === 'comment' && <label>Reel fictício<select aria-label="Reel fictício" value={mediaId} onChange={(event) => setMediaId(event.target.value)}><option value="">Selecione um reel</option>{data.reels.map((reel) => <option key={reel.id} value={reel.id}>{reel.title}</option>)}</select></label>}
        <label>Palavras ou expressões<textarea value={terms} maxLength={2000} onChange={(event) => setTerms(event.target.value)} placeholder="Uma por linha ou separadas por vírgula" /></label>
        <p className="muted">Palavras inteiras; maiúsculas e espaços são normalizados. Acentos são preservados.</p>
        <label>{trigger === 'comment' ? 'DM de apresentação' : 'Resposta textual'}<textarea aria-label={trigger === 'comment' ? 'DM de apresentação' : 'Resposta textual'} value={config.introduction} maxLength={2000} onChange={(event) => change('introduction', event.target.value)} /></label>
        {trigger === 'comment' && <>
        <label className="checkbox"><input type="checkbox" checked={config.publicReplyEnabled} onChange={(event) => change('publicReplyEnabled', event.target.checked)} /> Resposta pública opcional</label>
        {config.publicReplyEnabled && <label>Texto da resposta pública<textarea value={config.publicReply} maxLength={1500} onChange={(event) => change('publicReply', event.target.value)} /></label>}
        <label className="checkbox"><input type="checkbox" checked={config.buttonEnabled} onChange={(event) => change('buttonEnabled', event.target.checked)} /> Usar botão para continuar</label>
        {config.buttonEnabled && <label>Texto do botão<input value={config.buttonTitle} maxLength={80} onChange={(event) => change('buttonTitle', event.target.value)} /></label>}
        <label className="checkbox"><input type="checkbox" checked={config.followRequired} onChange={(event) => change('followRequired', event.target.checked)} /> Pedir para seguir antes do link</label>
        {config.followRequired && <label>Pedido para seguir<textarea value={config.followPrompt} maxLength={2000} onChange={(event) => change('followPrompt', event.target.value)} /></label>}
        </>}
        <label>{trigger === 'comment' && !config.buttonEnabled ? 'Mensagem adicional (opcional)' : 'Mensagem final'}<textarea value={config.finalMessage} maxLength={2000} onChange={(event) => change('finalMessage', event.target.value)} /></label>
        <label>{trigger === 'comment' && !config.buttonEnabled ? 'Link (opcional)' : 'Link final'}<input value={config.link} maxLength={2000} type="url" onChange={(event) => change('link', event.target.value)} placeholder="https://" /></label>
        <div className="control-actions"><button disabled={busy} onClick={() => void perform('save')}>Salvar rascunho</button>
          <button className="secondary" disabled={busy || !selected || dirty || selected.status === 'active'} onClick={() => void perform('activate')}>Ativar localmente</button>
          <button className="secondary" disabled={busy || !selected || selected.status !== 'active'} onClick={() => void perform('pause')}>Pausar automação</button></div>
      </fieldset><aside className="recipe-preview"><h3>{trigger === 'comment' ? 'Prévia da sequência' : 'Prévia da resposta textual'}</h3>
        {trigger !== 'comment' ? <><p>{textReply(config) || 'Sua resposta aparecerá aqui.'}</p><p className="muted">Final e link são opcionais. PARAR/SAIR cancelam automações futuras para este contato. Story somente fictícia.</p></> : <><p>{config.introduction || 'Sua apresentação aparecerá aqui.'}</p>
        {config.publicReplyEnabled && <p>Resposta pública: {config.publicReply || 'Preencha o texto.'}</p>}
        {config.buttonEnabled && <span className="badge">{config.buttonTitle || 'Texto do botão'}</span>}
        {config.followRequired && <p>{config.followPrompt || 'Preencha o pedido para seguir.'}</p>}
        {(config.finalMessage || config.buttonEnabled) && <p>{config.finalMessage || 'Sua mensagem final aparecerá aqui.'}</p>}{(config.link || config.buttonEnabled) && <p className="preview-link">{config.link || 'Seu link aparecerá aqui.'}</p>}
        {!config.buttonEnabled && <p className="muted">Uma única resposta privada. Mensagem adicional e link são opcionais; sem resposta da pessoa, o fluxo para aqui.</p>}
        </>}
        <label>{trigger === 'comment' ? 'Comentário para simular' : 'Texto para simular'}<input value={comment} maxLength={2000} disabled={busy} onChange={(event) => setComment(event.target.value)} /></label>
        <p className="muted">{comment ? matchingTerm(comment, terms.split(/\n|,/)) ? 'Uma palavra da receita foi encontrada.' : 'Nenhuma palavra da receita foi encontrada.' : 'Teste uma palavra ou expressão da sua receita.'}</p>
        <button disabled={busy || !selected || dirty || !comment.trim()} onClick={() => void simulate()}>{trigger === 'comment' ? 'Simular comentário assinado' : trigger === 'message' ? 'Simular DM assinada' : 'Simular story assinada'}</button>
        {lastEvent && <button className="secondary" disabled={busy} onClick={() => void simulate(true)}>Repetir mesmo evento</button>}
        <p className="muted">Simulação identificada; apenas efeitos fictícios. Salvar edição devolve a receita a rascunho e cancela pendentes antigos.</p>
      </aside></div>
    </>}
  </section>;
}

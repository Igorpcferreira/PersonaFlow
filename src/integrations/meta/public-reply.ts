import type { MetaPrivateReplyOptions, MetaPrivateReplyResult } from './private-reply';

type Config = { graphVersion: string; professionalId: string; accessToken: string; approvedText: string };
type Command = { professionalId: string; commentExternalId: string; text: string };

/** One bounded public reply. Ambiguous results must never be retried automatically. */
export async function sendMetaPublicReply(config: Config, command: Command,
  options: MetaPrivateReplyOptions = {}): Promise<MetaPrivateReplyResult> {
  if (!/^v[1-9]\d*\.\d+$/.test(config.graphVersion) || !/^[1-9]\d*$/.test(config.professionalId) ||
      !config.accessToken || !config.approvedText) return { kind: 'confirmed_before_send', reason: 'invalid_configuration' };
  if (command.professionalId !== config.professionalId) return { kind: 'confirmed_before_send', reason: 'professional_account_mismatch' };
  if (!/^[1-9]\d*$/.test(command.commentExternalId)) return { kind: 'confirmed_before_send', reason: 'invalid_comment_external_id' };
  if (command.text !== config.approvedText) return { kind: 'confirmed_before_send', reason: 'text_not_approved' };
  const timeoutMs = options.timeoutMs ?? 5_000;
  if (!Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30_000)
    return { kind: 'confirmed_before_send', reason: 'invalid_configuration' };
  const request = options.fetch ?? globalThis.fetch;
  if (typeof request !== 'function') return { kind: 'confirmed_before_send', reason: 'invalid_configuration' };
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await request(`https://graph.instagram.com/${config.graphVersion}/${command.commentExternalId}/replies`, {
      method: 'POST', headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ message: command.text }), signal: controller.signal,
    });
    if (response.status >= 400 && response.status < 500) return { kind: 'rejected', reason: 'http_4xx', status: response.status };
    if (response.status >= 500) return { kind: 'ambiguous', reason: 'http_5xx', status: response.status };
    if (response.status < 200 || response.status >= 300) return { kind: 'ambiguous', reason: 'unexpected_http_status', status: response.status };
    const length = response.headers.get('content-length');
    if (length && Number(length) > 4096) return { kind: 'ambiguous', reason: 'response_too_large', status: response.status };
    const reader = response.body?.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    if (reader) {
      try {
        while (true) {
          if (controller.signal.aborted) throw new DOMException('Tempo excedido.', 'AbortError');
          const part = await reader.read();
          if (part.done) break;
          size += part.value.byteLength;
          if (size > 4096) { await reader.cancel(); return { kind: 'ambiguous', reason: 'response_too_large', status: response.status }; }
          chunks.push(part.value);
        }
      } finally { reader.releaseLock(); }
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
    const raw = new TextDecoder().decode(bytes);
    let id: string | null = null;
    try { const parsed: unknown = JSON.parse(raw); if (parsed && typeof parsed === 'object' && 'id' in parsed && typeof parsed.id === 'string') id = parsed.id; }
    catch { /* 2xx is acceptance even without an ID in the body. */ }
    return { kind: 'accepted', status: response.status, messageId: id };
  } catch {
    return timedOut || controller.signal.aborted ? { kind: 'ambiguous', reason: 'timeout' } :
      { kind: 'ambiguous', reason: 'network_after_request' };
  } finally { clearTimeout(timer); }
}

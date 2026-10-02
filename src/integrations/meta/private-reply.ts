const DEFAULT_TIMEOUT_MS = 5_000;
const MAX_RESPONSE_BYTES = 4_096;
const graphVersionPattern = /^v[1-9]\d*\.\d+$/;
const metaIdPattern = /^[1-9]\d*$/;

export interface MetaPrivateReplyConfig {
  /** Graph API version fixed for this installation, for example `v24.0`. */
  readonly graphVersion: string;
  /** Instagram professional account ID, never a username or an internal account ID. */
  readonly professionalId: string;
  /** Token scoped to the same professional account. It is never logged or returned. */
  readonly accessToken: string;
  /** The only message body this narrowly scoped transport may deliver. */
  readonly approvedText: string;
}

export interface MetaPrivateReplyCommand {
  /** Must exactly match `config.professionalId`; this prevents cross-account sends. */
  readonly professionalId: string;
  /** Meta's external comment ID, not a commenter or conversation ID. */
  readonly commentExternalId: string;
  /** Must exactly match `config.approvedText`; no interpolation or formatting occurs here. */
  readonly text: string;
}

export type MetaPrivateReplyResult =
  | { readonly kind: 'accepted'; readonly status: number; readonly messageId: string | null }
  | { readonly kind: 'confirmed_before_send'; readonly reason: 'invalid_configuration' | 'professional_account_mismatch' | 'invalid_comment_external_id' | 'text_not_approved' }
  | { readonly kind: 'rejected'; readonly reason: 'http_4xx'; readonly status: number }
  | { readonly kind: 'ambiguous'; readonly reason: 'timeout' | 'network_after_request' | 'http_5xx' | 'unexpected_http_status' | 'response_too_large'; readonly status?: number };

export interface MetaPrivateReplyOptions {
  readonly fetch?: typeof fetch;
  readonly timeoutMs?: number;
  /** Restricted experiment on an explicitly selected test comment, never a retry. */
  readonly button?: { readonly title: string; readonly url: string };
}

function validConfiguration(config: MetaPrivateReplyConfig) {
  return graphVersionPattern.test(config.graphVersion) && metaIdPattern.test(config.professionalId) &&
    config.accessToken.length > 0 && config.approvedText.length > 0;
}

function validTimeout(timeoutMs: number) {
  return Number.isSafeInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= 30_000;
}

async function readBoundedResponse(response: Response, signal: AbortSignal): Promise<{ tooLarge: boolean; text: string }> {
  const declaredLength = response.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_RESPONSE_BYTES) return { tooLarge: true, text: '' };
  if (!response.body) return { tooLarge: false, text: '' };

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      if (signal.aborted) throw new DOMException('Tempo excedido.', 'AbortError');
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();
        return { tooLarge: true, text: '' };
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return { tooLarge: false, text: new TextDecoder().decode(bytes) };
}

function messageIdFrom(body: string): string | null {
  if (!body) return null;
  try {
    const parsed: unknown = JSON.parse(body);
    if (typeof parsed === 'object' && parsed !== null && 'message_id' in parsed && typeof parsed.message_id === 'string') return parsed.message_id;
  } catch {
    // A successful HTTP response is still an acceptance; the body is optional evidence only.
  }
  return null;
}

/**
 * Sends one already-authorized private reply through the official Instagram Graph endpoint.
 *
 * This module deliberately has no runtime/configuration lookup, persistence, retries, or logs.
 * A network failure after fetch begins, a timeout, and a 5xx remain ambiguous because delivery
 * might have reached Meta. Callers must record that terminal state and must not retry it here.
 */
export async function sendMetaPrivateReply(config: MetaPrivateReplyConfig, command: MetaPrivateReplyCommand,
  options: MetaPrivateReplyOptions = {}): Promise<MetaPrivateReplyResult> {
  if (!validConfiguration(config)) return { kind: 'confirmed_before_send', reason: 'invalid_configuration' };
  if (command.professionalId !== config.professionalId) return { kind: 'confirmed_before_send', reason: 'professional_account_mismatch' };
  if (!metaIdPattern.test(command.commentExternalId)) return { kind: 'confirmed_before_send', reason: 'invalid_comment_external_id' };
  if (command.text !== config.approvedText) return { kind: 'confirmed_before_send', reason: 'text_not_approved' };
  if (options.button && (options.button.title !== 'Pedir minha prévia' ||
      options.button.url !== 'https://somoskyber.com.br/suaprevia'))
    return { kind: 'confirmed_before_send', reason: 'invalid_configuration' };

  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!validTimeout(timeoutMs)) return { kind: 'confirmed_before_send', reason: 'invalid_configuration' };
  const request = options.fetch ?? globalThis.fetch;
  if (typeof request !== 'function') return { kind: 'confirmed_before_send', reason: 'invalid_configuration' };

  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  try {
    const response = await request(`https://graph.instagram.com/${config.graphVersion}/${config.professionalId}/messages`, {
      method: 'POST',
      headers: { authorization: `Bearer ${config.accessToken}`, 'content-type': 'application/json' },
      body: JSON.stringify({ recipient: { comment_id: command.commentExternalId }, message: options.button
        ? { attachment: { type: 'template', payload: { template_type: 'button',
          text: command.text.replace(/\nhttps:\/\/somoskyber\.com\.br\/suaprevia$/, '').replace('toque no link', 'toque no botão'),
          buttons: [{ type: 'web_url', title: options.button.title, url: options.button.url }] } } }
        : { text: command.text } }),
      signal: controller.signal,
    });
    if (response.status >= 400 && response.status < 500) return { kind: 'rejected', reason: 'http_4xx', status: response.status };
    if (response.status >= 500) return { kind: 'ambiguous', reason: 'http_5xx', status: response.status };
    if (response.status < 200 || response.status >= 300) return { kind: 'ambiguous', reason: 'unexpected_http_status', status: response.status };
    const bounded = await readBoundedResponse(response, controller.signal);
    if (bounded.tooLarge) return { kind: 'ambiguous', reason: 'response_too_large', status: response.status };
    return { kind: 'accepted', status: response.status, messageId: messageIdFrom(bounded.text) };
  } catch {
    return timedOut || controller.signal.aborted
      ? { kind: 'ambiguous', reason: 'timeout' }
      : { kind: 'ambiguous', reason: 'network_after_request' };
  } finally {
    clearTimeout(timer);
  }
}

const idPattern = /^[1-9]\d*$/;
const versionPattern = /^v[1-9]\d*\.\d+$/;

export type MetaSubscriptionConfig = { graphVersion: string; professionalId: string; accessToken: string };
export type MetaSubscriptionResult = { confirmed: boolean; reason: 'confirmed' | 'rejected' | 'ambiguous' | 'unverified' };

/** Subscription is never treated as confirmed from POST alone; GET must show comments. */
export async function subscribeMetaComments(config: MetaSubscriptionConfig, request: typeof fetch = fetch): Promise<MetaSubscriptionResult> {
  if (!versionPattern.test(config.graphVersion) || !idPattern.test(config.professionalId) || !config.accessToken)
    return { confirmed: false, reason: 'rejected' };
  const endpoint = `https://graph.instagram.com/${config.graphVersion}/${config.professionalId}/subscribed_apps`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5_000);
  try {
    const post = await request(endpoint, { method: 'POST', headers: { authorization: `Bearer ${config.accessToken}`,
      'content-type': 'application/x-www-form-urlencoded' }, body: 'subscribed_fields=comments', signal: controller.signal });
    if (!post.ok) return { confirmed: false, reason: post.status >= 500 ? 'ambiguous' : 'rejected' };
    const get = await request(endpoint, { method: 'GET', headers: { authorization: `Bearer ${config.accessToken}` }, signal: controller.signal });
    if (!get.ok) return { confirmed: false, reason: get.status >= 500 ? 'ambiguous' : 'unverified' };
    // Limit parsing; never log provider response, token, or user content.
    const raw = await get.text();
    if (raw.length > 8_192) return { confirmed: false, reason: 'unverified' };
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null || !('data' in data) || !Array.isArray(data.data))
      return { confirmed: false, reason: 'unverified' };
    const confirmed = data.data.some((item: unknown) => typeof item === 'object' && item !== null &&
      'subscribed_fields' in item && Array.isArray(item.subscribed_fields) && item.subscribed_fields.includes('comments'));
    return { confirmed, reason: confirmed ? 'confirmed' : 'unverified' };
  } catch { return { confirmed: false, reason: 'ambiguous' }; }
  finally { clearTimeout(timer); }
}

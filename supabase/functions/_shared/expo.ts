/**
 * Minimal Expo Push API client. No runtime-specific APIs (only fetch), so it runs in Deno and Bun.
 *   send:        POST {base}/send          at most 100 messages per request
 *   getReceipts: POST {base}/getReceipts   at most 1000 ids per request
 * https://docs.expo.dev/push-notifications/sending-notifications/
 */
export const DEFAULT_EXPO_PUSH_API = 'https://exp.host/--/api/v2/push';
export const SEND_BATCH = 100;
export const RECEIPT_BATCH = 1000;

export type ExpoMessage = {
  to: string;
  title: string;
  body: string;
  sound?: 'default' | null;
  data?: Record<string, unknown>;
  channelId?: string;
};

export type ExpoError = { status: 'error'; message?: string; details?: { error?: string } };
export type ExpoTicket = { status: 'ok'; id: string } | ExpoError;
export type ExpoReceipt = { status: 'ok' } | ExpoError;

export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** The token is gone for good (app uninstalled, token rotated): stop using it. */
export function isDeviceGone(r: ExpoTicket | ExpoReceipt | undefined): boolean {
  return r?.status === 'error' && r.details?.error === 'DeviceNotRegistered';
}

function headers(accessToken?: string): HeadersInit {
  const h: Record<string, string> = { Accept: 'application/json', 'Content-Type': 'application/json' };
  if (accessToken) h.Authorization = `Bearer ${accessToken}`;
  return h;
}

async function post(url: string, body: unknown, accessToken?: string): Promise<unknown> {
  const res = await fetch(url, { method: 'POST', headers: headers(accessToken), body: JSON.stringify(body) });
  const text = await res.text();
  if (!res.ok) throw new Error(`expo ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text);
}

/** One request, ≤100 messages. Tickets come back in message order. Throws on transport errors. */
export async function sendPush(base: string, messages: ExpoMessage[], accessToken?: string): Promise<ExpoTicket[]> {
  if (messages.length > SEND_BATCH) throw new Error(`sendPush: ${messages.length} > ${SEND_BATCH}`);
  const json = (await post(`${base}/send`, messages, accessToken)) as { data?: ExpoTicket[] };
  if (!Array.isArray(json.data) || json.data.length !== messages.length) {
    throw new Error(`expo send: expected ${messages.length} tickets`);
  }
  return json.data;
}

/** One request, ≤1000 ids. Ids Expo has no receipt for yet are simply absent. */
export async function getReceipts(
  base: string,
  ids: string[],
  accessToken?: string,
): Promise<Record<string, ExpoReceipt>> {
  if (ids.length > RECEIPT_BATCH) throw new Error(`getReceipts: ${ids.length} > ${RECEIPT_BATCH}`);
  const json = (await post(`${base}/getReceipts`, { ids }, accessToken)) as { data?: Record<string, ExpoReceipt> };
  return json.data ?? {};
}

/**
 * push-dispatch — every minute (pg_cron). Claims due 'push' jobs (written by ops.notify) and
 * sends them through the Expo Push API.
 *   * type turned off by the user        -> settled, not sent
 *   * inside the user's quiet hours       -> deferred to the end of quiet hours (never dropped)
 *   * no live device (push denied, web)   -> settled; the in-app inbox row already exists
 *   * Expo transport error                -> ops.fail (retry with backoff, dead letter after 5)
 * Tickets are recorded in ops.push_receipts for push-receipts to poll. A DeviceNotRegistered
 * ticket invalidates the token immediately.
 */
import { notificationCopy, type NotificationType } from '../../../src/lib/push/copy.ts';
import { chunk, type ExpoMessage, isDeviceGone, SEND_BATCH, sendPush } from '../_shared/expo.ts';
import { expoConfig, serveJob } from '../_shared/job.ts';

const CLAIM_LIMIT = 500;

type Job = { id: string; payload: { user_id: string; type: NotificationType; ref: string; data?: Record<string, unknown> } };
type Outgoing = { jobId: string; deviceId: string; message: ExpoMessage };

serveJob('push-dispatch', async (sql) => {
  const { base, accessToken } = expoConfig();
  const worker = `push-dispatch:${crypto.randomUUID()}`;
  const jobs = (await sql`select id, payload from ops.claim('push', ${CLAIM_LIMIT}, ${worker})`) as unknown as Job[];
  const stats = { claimed: jobs.length, sent: 0, disabled: 0, deferred: 0, no_device: 0, failed: 0, gone: 0 };

  const outgoing: Outgoing[] = [];
  const settle: string[] = [];
  for (const job of jobs) {
    const { user_id, type, data } = job.payload;
    const [state] = await sql`
      select exists (select 1 from public.users where id = ${user_id}) as user_exists,
             ops.notification_enabled(${user_id}, ${type}::public.notification_type) as enabled,
             ops.in_quiet_hours(${user_id}, now()) as quiet,
             ops.quiet_hours_end(${user_id}, now()) as quiet_end`;
    if (!state.user_exists || !state.enabled) {
      stats.disabled++;
      settle.push(job.id);
      continue;
    }
    if (state.quiet) {
      stats.deferred++;
      await sql`select ops.defer(${job.id}, ${state.quiet_end})`;
      continue;
    }
    const devices = await sql`
      select id, push_token from public.devices where user_id = ${user_id} and invalidated_at is null`;
    if (devices.length === 0) {
      stats.no_device++;
      settle.push(job.id);
      continue;
    }
    const copy = notificationCopy(type, data ?? {});
    for (const d of devices) {
      outgoing.push({
        jobId: job.id,
        deviceId: d.id,
        message: { to: d.push_token, title: copy.title, body: copy.body, sound: 'default', data: { type, ref: job.payload.ref } },
      });
    }
  }

  const failedJobs = new Map<string, string>();
  for (const batch of chunk(outgoing, SEND_BATCH)) {
    let tickets;
    try {
      tickets = await sendPush(base, batch.map((o) => o.message), accessToken);
    } catch (e) {
      for (const o of batch) failedJobs.set(o.jobId, e instanceof Error ? e.message : String(e));
      continue;
    }
    for (let i = 0; i < batch.length; i++) {
      const o = batch[i];
      const t = tickets[i];
      if (t.status === 'ok') {
        stats.sent++;
        await sql`insert into ops.push_receipts (ticket_id, job_id, device_id) values (${t.id}, ${o.jobId}, ${o.deviceId})
                  on conflict (ticket_id) do nothing`;
      } else {
        await sql`insert into ops.push_receipts (job_id, device_id, status, error, message, checked_at)
                  values (${o.jobId}, ${o.deviceId}, 'error', ${t.details?.error ?? null}, ${t.message ?? null}, now())`;
        if (isDeviceGone(t)) stats.gone++;
        await sql`select ops.device_failed(${o.deviceId}, ${isDeviceGone(t)})`;
      }
    }
  }

  for (const id of new Set([...settle, ...outgoing.map((o) => o.jobId)])) {
    const err = failedJobs.get(id);
    if (err) {
      stats.failed++;
      await sql`select ops.fail(${id}, ${err})`;
    } else {
      await sql`select ops.complete(${id})`;
    }
  }
  return stats;
});

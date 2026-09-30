/**
 * push-receipts — every 15 minutes (pg_cron). Polls Expo for the delivery receipts of pending
 * tickets. DeviceNotRegistered invalidates the token; any error counts a device failure.
 * Tickets with no receipt after 24h are marked expired. Body: { min_age_seconds?: number }
 * (default 900: Expo recommends waiting ~15 minutes before asking).
 */
import { chunk, getReceipts, isDeviceGone, RECEIPT_BATCH } from '../_shared/expo.ts';
import { expoConfig, serveJob } from '../_shared/job.ts';

serveJob('push-receipts', async (sql, body) => {
  const { base, accessToken } = expoConfig();
  const minAge = Math.max(0, Number(body.min_age_seconds ?? 900) || 0);
  const pending = await sql`
    select id, ticket_id, device_id, created_at from ops.push_receipts
     where status = 'pending' and ticket_id is not null
       and created_at <= now() - make_interval(secs => ${minAge})
     order by created_at limit 5000`;
  const stats = { checked: pending.length, ok: 0, error: 0, gone: 0, expired: 0 };

  for (const batch of chunk([...pending], RECEIPT_BATCH)) {
    const receipts = await getReceipts(base, batch.map((r) => r.ticket_id), accessToken);
    for (const r of batch) {
      const receipt = receipts[r.ticket_id];
      if (!receipt) {
        if (Date.now() - new Date(r.created_at).getTime() > 24 * 3600 * 1000) {
          stats.expired++;
          await sql`update ops.push_receipts set status = 'expired', checked_at = now() where id = ${r.id}`;
        }
        continue;
      }
      if (receipt.status === 'ok') {
        stats.ok++;
        await sql`update ops.push_receipts set status = 'ok', checked_at = now() where id = ${r.id}`;
        continue;
      }
      stats.error++;
      const gone = isDeviceGone(receipt);
      if (gone) stats.gone++;
      await sql`update ops.push_receipts
                   set status = 'error', error = ${receipt.details?.error ?? null},
                       message = ${receipt.message ?? null}, checked_at = now()
                 where id = ${r.id}`;
      if (r.device_id) await sql`select ops.device_failed(${r.device_id}, ${gone})`;
    }
  }
  return stats;
});

/**
 * token-cleanup — weekly (pg_cron, Sundays 04:00 UTC). Prunes invalidated, stale (270 days) and
 * repeatedly failing push tokens; trims old receipts and run logs. Logic: ops.cleanup_push_tokens.
 */
import { serveJob } from '../_shared/job.ts';

serveJob('token-cleanup', async (sql) => {
  const [{ removed }] = await sql`select ops.cleanup_push_tokens() as removed`;
  return { removed };
});

# Social app

This is a social platform that optimizes for joy and genuine connection instead of attention.
This repo is the first vertical slice: sign up, create a profile, post an image, see a feed, like it.

## Prerequisites

- [bun](https://bun.sh)
- Docker (or Colima) for the local Supabase stack
- Expo Go on your phone (for testing on a physical device)

## Setup

```bash
bun install
bunx supabase start
bun run db:reset
cp .env.example .env
```

Fill `EXPO_PUBLIC_SUPABASE_ANON_KEY` in `.env` with the anon key printed by `bunx supabase status`.
Then start the app:

```bash
bunx expo start
```

### Physical device

The phone cannot reach `127.0.0.1` on your Mac. Set `EXPO_PUBLIC_SUPABASE_URL` in `.env` to the
Mac's LAN IP (for example `http://192.168.x.x:54321`), keep the phone on the same Wi-Fi, restart
`bunx expo start`, and scan the QR code in Expo Go.

### Logging in

Login is by email one-time code. Codes arrive in Mailpit at <http://127.0.0.1:54324>. The seed users
(`alice`, `bob`, `minnie`, `carol`, `dave` at `@example.com`) also log in via OTP. Date of birth is
required on the sign-in screen.

### Hosted projects and media

- Hosted Supabase projects need the OTP email templates from `supabase/templates` set in the
  dashboard (Authentication > Email Templates) so emails carry the 6-digit code. Local dev picks
  them up from `supabase/config.toml`.
- The `media` storage bucket is private. Images are stored by path and shown through short-lived
  signed URLs (1 hour), resolved per page in the feed and profile.

## Scripts

| Script              | What it does                                   |
| ------------------- | ---------------------------------------------- |
| `bun run start`     | Start the Expo dev server                      |
| `bun run typecheck` | `tsc --noEmit`                                 |
| `bun run lint`      | `expo lint` (ESLint, Expo config + Prettier)   |
| `bun run format`    | `prettier --write .`                           |
| `bun run db:types`  | Regenerate `src/lib/db/types.ts` from local DB |
| `bun run db:test`   | Run the database (pgTAP) tests                 |
| `bun run db:reset`  | Reset the local DB (migrations + seed)         |
| `bun run test:push` | Push pipeline test: functions + DB + stub Expo |

## Push notifications and scheduled jobs

- Jobs: `ops.job_queue` (idempotent enqueue, retry with backoff, dead letter) and `ops.job_runs`
  (run log). pg_cron calls the Edge Functions `push-dispatch` (every minute), `push-receipts`
  (every 15 min) and `token-cleanup` (weekly) through pg_net.
- Local: `bunx supabase functions serve`, then `bun scripts/setup-local-cron.ts` once after each
  `db reset` (stores the local URL and service-role key in Vault; without it cron runs are logged
  as `skipped`). Inspect: `select * from ops.job_runs order by id desc limit 20;`
- **Push needs an EAS project id.** Run `bunx eas-cli init` once (free Expo account). It writes
  `extra.eas.projectId`; until then the app skips push registration with a dev warning and
  everything arrives through the in-app banner. Android push needs a development build
  (`bunx eas-cli build --profile development`); iOS works in Expo Go. Web never gets push.
- Hosted (later, not done yet): set Vault secrets `project_url` and `service_role_key`, optionally
  function secrets `EXPO_ACCESS_TOKEN`, and deploy the three functions.

## Docs

Design docs live in [`docs/`](docs/), starting with
[`docs/brief-milestone-1.md`](docs/brief-milestone-1.md).

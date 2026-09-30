# Launch readiness — the gaps that get expensive late

From Colin, 2026-09-29. Ranked by how costly each is to discover late. The
"Status" column is where the codebase actually stands today.

| # | Gap | Status today | Blocking launch? |
|---|---|---|---|
| 1 | **Cold start.** Home is empty by design on day one; Discover is nearly empty; nobody to gift. Who are the first 50 creators, and why do they come before an audience exists? (Skyler is the obvious seed, which makes her audience the seed; they need a reason to move beyond loyalty.) | Not started. A launch-design problem, not a code problem. Empty states exist (Home points to Discover; Discover ends). | **Yes.** Needs a written plan before launch. |
| 2 | **Creator onboarding and payouts.** Stripe Connect signup, identity verification, tax forms, bank account; 1099-K issuance, backup withholding, international creators. | Not built (money out of scope). Schema only: `payout_accounts`, `payouts`, immutable `creator_terms`. | Yes, for any creator earnings. |
| 3 | **Reporting and moderation queue.** Report button, a queue you can see, remove content, suspend accounts; CSAM hash matching plus NCMEC reporting. | Schema and access rules only: `reports`, `moderation_decisions`, `appeals` (72-hour due date). No UI, no hash matching. US law requires providers to report apparent CSAM they become aware of to NCMEC (18 U.S.C. § 2258A). Scanning isn't mandated, but it's the only practical way to become aware at scale. | **Yes.** Minimum set before any public users. |
| 4 | **Notifications.** Push infrastructure, preferences, per-type opt-outs. On-thesis: "come back, people you return to are live." Off-thesis: "someone you don't know posted." | Schema only: `devices`, `notifications`. Nothing sends. | Soft yes: it's the whole return loop. |
| 5 | **Search.** Find a specific person by username. | Trigram index on `profiles.username` exists. No UI or API. | **Yes.** Table stakes. Profile pages (`/u/<username>`) are being built now. |
| 6 | **Account lifecycle.** Data export (GDPR/CCPA), recovery when email is lost, username change, and creator deletion with pending balance (needs an unwind path). | Username change works (edit profile). Deletion cascades, and wrongly deletes messages in retained minor threads (known gap; should anonymise). No export, no recovery, no balance unwind. | Yes, for export and deletion correctness. |
| 7 | **Analytics on ourselves.** Retention, drop-off, real-device errors, reel-player stutter on hardware we don't own; crash reporting and privacy-respecting product analytics. | None. There's a dev-only perf overlay (`EXPO_PUBLIC_PERF_OVERLAY`). | Yes, or we debug blind. |
| 8 | **Support inbox.** The AI-support plan assumes an inbox exists. | None. A confused user has no way to reach us. | Yes. |
| 9 | **Legal documents.** Terms of Service and Privacy Policy, required for App Store submission. These are unusual: closed-loop coins, immutable creator terms, no retroactive changes. They're contractual commitments and need a lawyer. | None. | **Yes** (App Store). |
| 10 | **Offline and failure states** mid-scroll, mid-upload, mid-stream. | Largely done: shared error mapper, 20 s timeouts, offline banner with refetch on reconnect, resumable uploads with Cancel/Retry, stale-session handling, error boundaries. Live streaming failure states don't exist yet, because live isn't built. | Mostly covered. |

## Also outstanding from earlier decisions
- Messages tab (deferred by Colin), built on migration 010's rules.
- Refused message requests can reveal a recipient is a minor (product call; see migration 010 header).
- True video duration needs a server-side probe (Edge Function); today the client-reported duration is enforced.
- Currency name and product name are both pending (trademark); one edit each in `src/config/brand.ts`.
- Live delivery requirements: `docs/live-delivery.md`.

# Infrastructure Cost Model

Prices checked 2026-09-29. Video providers change rates; re-verify before
committing to annual plans.

---

## The one decision that matters

**Do not use a managed per-minute video provider for the main feed.**

Cloudflare Stream bills $0.001 per delivered viewer-minute regardless of bitrate.
Mobile-first short video runs 0.8-1.5 Mbps, so a minute is ~9 MB. You are paying a
4K price for a 480p product.

Cloudflare R2 charges **zero egress**. Storage is $0.015/GB/month. Run your own
ffmpeg transcode, write HLS segments to R2, serve them directly.

| Delivered minutes/mo | Managed (Stream) | R2 self-packaged |
| -------------------- | ---------------- | ---------------- |
| 100,000              | $100             | ~$2              |
| 2,250,000            | $2,250           | ~$8              |
| 22,500,000           | $22,500          | ~$60             |

Cost to build the pipeline: roughly 3-5 days. ffmpeg → HLS is a solved problem with
well-trodden recipes. Do it before launch, not after the first invoice.

**Caveat:** R2's zero-egress is the product promise, not a loophole, and it is
Cloudflare's main competitive wedge. It is unlikely to change, but it is a single
point of dependency — keep the storage layer behind an interface so a move to
Bunny (~$0.005/GB) or Backblaze+Fastly is a config change, not a rewrite.

---

## Phase 0 — building (now until first outside user)

Everything here is free or one-time.

| Item                                                  | Cost     |
| ----------------------------------------------------- | -------- |
| All application code, Postgres, RLS                   | $0       |
| Supabase Free (500 MB DB, 1 GB storage, 50k MAU auth) | $0       |
| Expo + EAS free tier                                  | $0       |
| GitHub                                                | $0       |
| Cloudflare DNS + CDN                                  | $0       |
| Push notifications (Expo / FCM)                       | $0       |
| OpenAI moderation endpoint                            | $0       |
| LiveKit Build tier (5,000 participant-min/mo)         | $0       |
| Domain                                                | ~$12/yr  |
| **Total to build**                                    | **~$12** |

You can build and test this entire application for the price of a domain name.

---

## Phase 1 — launch prerequisites (one-time / fixed)

| Item                     | Cost        | Notes                                                       |
| ------------------------ | ----------- | ----------------------------------------------------------- |
| Apple Developer Program  | $99/yr      | Required. Personal name works until you incorporate         |
| Google Play Developer    | $25 once    |                                                             |
| LLC formation (Michigan) | ~$50        | Required before Stripe Connect                              |
| Registered agent         | $0-125/yr   | Can be yourself at your own address                         |
| Supabase Pro             | $25/mo      | Get this before real users — free tier has no daily backups |
| **Fixed monthly floor**  | **~$35/mo** |                                                             |

---

## Phase 2 — variable costs, and what drives them

Ranked by how fast they grow.

### 1. Video delivery — dominates everything

R2 path: storage only. `stored_GB × $0.015`. A library of 50,000 thirty-second
clips at 3 renditions is roughly 500 GB → **$7.50/month**, serving unlimited views.

Transcode compute: one $40/month VM (or Hetzner at ~$15) handles thousands of
clips/day with ffmpeg. Scale horizontally when the queue backs up.

### 2. Live streaming — the one that can outrun revenue

Live is harder because packaging happens in real time. Two options:

**Managed (Cloudflare Stream Live):** $0.001/viewer-min + $0.005/min recorded.
Simple, ships in a day. One creator streaming 3h/day to 300 average concurrent
viewers costs **~$1,650/month** — against which you earn 30% of their gifts. That
creator must pull >$5,500/month in gifts just to break you even.

**Self-hosted (MediaMTX or SRS → HLS → R2):** RTMP ingest on a VM, segment to R2,
serve with free egress. ~$40-80/month for the ingest box, near-zero delivery.
Higher ops burden, ~10s latency.

**Recommendation:** launch on managed Stream Live for speed, with a **hard trigger
at $300/month** — when the live bill crosses it, migrate to self-hosted. Write the
abstraction now so the migration is a day, not a quarter.

LiveKit stays in the picture for the interactive layer only: host, co-hosts, and
invited guests. That's a handful of participants, covered by the free tier for a
long time. Mass viewers never touch WebRTC.

### 3. Payments

| Item                                  | Rate                 |
| ------------------------------------- | -------------------- |
| Stripe processing                     | 2.9% + $0.30         |
| Stripe Connect payouts                | $0.25/payout + 0.25% |
| Stripe Identity (age/ID verification) | ~$1.50/check         |

The $0.30 fixed fee is why coin bundles must start around $4.99 — a $0.99 bundle
loses 33% to fixed fees alone. Price bundles at $4.99 / $9.99 / $24.99 / $49.99.

Verification is once per user, not recurring. 1,000 verified creators ≈ $1,500
one-time.

### 4. Moderation

Tiered, so the expensive layer is rare:

| Layer                                             | Cost                              |
| ------------------------------------------------- | --------------------------------- |
| Regex + hash + homoglyph normalization            | $0, self-hosted                   |
| Small embedding classifier                        | ~$0.0001/1k messages, self-hosted |
| LLM escalation (ambiguous middle, <2% of traffic) | ~$0.15/1k escalations             |
| CSAM hash matching (NCMEC / Thorn)                | free for qualifying platforms     |

At a million messages a month this lands under $20 if the tiering is right. It only
gets expensive if you route everything to an LLM — don't.

### 5. AI support agent

~$0.01-0.03 per resolved ticket. Negligible until you have real volume, and it
displaces headcount that would cost far more.

---

## Modeled monthly totals

Assumes R2 self-packaged video, managed live until the trigger.

|                       | 500 users   | 5,000 users    | 50,000 users     |
| --------------------- | ----------- | -------------- | ---------------- |
| Supabase              | $25         | $25            | $100-400         |
| R2 storage            | $2          | $8             | $60              |
| Transcode VM          | $15         | $40            | $150             |
| Live (managed → self) | $30         | $300 → migrate | $200 self-hosted |
| Moderation            | $2          | $15            | $120             |
| Support AI            | $1          | $10            | $80              |
| Stripe fees           | in revenue  | in revenue     | in revenue       |
| **Total**             | **~$75/mo** | **~$400/mo**   | **~$1,000/mo**   |

Compare the managed-video equivalents: ~$600, ~$3,500, and ~$28,000.

---

## The uncomfortable part

At a 70/30 split with no ads, platform revenue is roughly 30% of gross gifting. To
cover $400/month in infrastructure you need ~$1,350/month in gifts flowing through
the platform. At 5,000 users that means about 2% of users spending $13/month —
achievable, but not automatic, and it will lag your infrastructure costs by
months.

Three consequences worth deciding on now:

1. **The R2 decision isn't optional.** On managed video the same user base needs
   ~$12,000/month in gifting to break even. That is the difference between a
   business and a hobby with a bill.
2. **Live is the loss leader.** It drives gifting but costs the most to serve.
   Self-host it earlier than feels comfortable.
3. **Runway, not profit, is the v1 goal.** Budget ~$1,200 for the first year all
   in. That is genuinely affordable. The trap isn't the first year — it's
   month 14 on a managed video bill.

# Community Policy v0.1

**Governing principle:** You may feel anything. You may not attack a person.

Every rule below is an application of that sentence. If a situation isn't covered,
decide it by asking whether a human being is being attacked — not by whether the
content is negative, uncomfortable, or sad.

---

## What this policy is not

**It is not a positivity requirement.** Sadness, anger, grief, fear, failure, and
despair are permitted everywhere on this platform, without restriction, without
reach penalty, and without a warning interstitial.

This is deliberate and it is not negotiable. A platform that filters negative
sentiment silences the people who most need to be heard. Someone saying "I
relapsed," "I'm not okay," or "my dad died and I don't know how to do this" is
using this platform exactly as intended.

**Sentiment is not harm. Cruelty is harm.** Cruelty has a target. A mood does not.

**Corollary for engineering:** no classifier, ranker, or automated system may take
any action on negative sentiment alone. Sentiment may never be an input to reach
decisions. This is enforced in code review, not by convention.

---

## The four tiers

Every message, comment, caption, and live-chat line resolves to exactly one tier.

### GREEN — send it

Default. No friction, no logging, no review.

Includes, explicitly and without exception:

- Any expression of the speaker's own pain, anger, grief, failure, or despair
- Criticism of ideas, institutions, companies, products, or public figures acting
  in public roles
- Disagreement, argument, and strong disagreement
- Discussion of hard subjects: death, illness, addiction, abuse, poverty, loss
- Profanity that isn't aimed at a person (18+ rooms; softened in general rooms)
- In-group language between people who have opted into it (see Trusted Circles)

**Never downgrade a GREEN because it is sad.** If the model is uncertain between
"someone is in pain" and "someone is being cruel," it resolves GREEN and routes a
wellbeing offer, not a moderation action.

### YELLOW — reflect it back, let them decide

The message is shown back to the sender with a prompt. They may send it anyway.

> "This might land harder than you mean it to. Send as is, or reword?"

Triggers:

- Insults or contempt aimed at a person, without slurs or threats
- Pile-on patterns: many users converging on one target in a short window
- Mockery of an appearance, voice, body, disability, or accent
- Sexualized commentary about an adult who did not invite it

**Design rules:**

- The user can always send. This tier is a mirror, not a gate.
- Sending after a YELLOW is not a violation and carries no penalty by itself.
- Rate of YELLOW-overrides is a behavioral signal, retained 30 days, used only for
  escalation review — never for reach.
- Never tell the recipient a YELLOW occurred.

### ORANGE — rephrase required to send

The message does not transmit in its current form. The sender is told what tripped
it and may edit and resend freely, as many times as they want.

> "We can't send this as written — it targets someone directly. Reword it and
> it'll go through."

Triggers:

- Slurs targeting a protected characteristic, used as an attack
- Sustained targeted harassment of a specific person
- Sexual commentary directed at any user in a room they didn't consent to
- Encouraging others to target a specific person
- Doxxing-adjacent content: real name, workplace, school, or location of someone
  who didn't share it

**Design rules:**

- Always name what tripped it. "This violates our guidelines" is the TikTok
  failure and is forbidden in our copy.
- Editing and resending is always available. No cooldown, no strike, no lockout.
- The point is correction, not punishment. Someone who rephrases has fully
  resolved the matter and it is closed.

### RED — blocked, logged, actioned

Does not send. Account action follows. Human review within 24h, no exceptions.

Triggers:

- Credible threats of violence against a person
- Any sexual content involving a minor — immediate permanent ban and NCMEC report
- Encouragement of suicide or self-harm directed at another person
- Coordinated harassment campaigns
- Content depicting real violence against real people
- Attempts to move a minor off-platform or into private contact

**RED is never automated to a permanent ban except for CSAM.** Everything else
gets a human before the account is terminated.

---

## Tier modifiers

### What belongs here, and what doesn't

**There is no 18+ tier.** One standard applies everywhere. A mature tier would have
split the community, raised the app's age rating, triggered state age-verification
regimes, and pulled the culture toward content we don't want to host.

| In                                               | Out                                      |
| ------------------------------------------------ | ---------------------------------------- |
| Profanity, uncensored language                   | Sexual content, nudity                   |
| Dark humor, gallows humor                        | Anything sexualizing a minor, ever       |
| Grief, anger, despair, failure, fear             | Cruelty toward a person                  |
| Death, illness, addiction, abuse, poverty        | Threats, doxxing, coordinated harassment |
| Criticism of ideas, institutions, public figures | Attacks on a person for who they are     |
| Disagreement and argument, including heated      | Encouraging self-harm in anyone          |
| Alcohol and cannabis, where legal                | Gambling content, and games of chance    |

**In** means GREEN. Send it, no prompt, no reach penalty, no interstitial.

**Out** means it does not transmit — ORANGE if the person can rewrite it and try
again, RED if it's the kind of thing there's no acceptable rewrite of. The tier
definitions above say which is which.

Two entries earn a note:

- **Dark humor is In.** Heavy subject matter handled with levity is not cruelty.
  People process grief by joking about it, and a platform that prompts on gallows
  humor reads as humorless rather than kind.
- **Sexual content is Out at every age.** This is an App Store requirement, not a
  values judgment, and it is not waivable at any tier or by any verification.

**Consequence: more minors will use this platform, not fewer.** Child-safety
architecture is therefore load-bearing rather than peripheral, and the DM and live
restrictions below are the most important rules in this document.

### Creator threshold

Creators set live-chat strictness per stream: **Open / Standard / Protected**.

- Open: YELLOW prompts suppressed, ORANGE and RED still enforced
- Standard: default
- Protected: some GREEN insults promote to YELLOW; new accounts held briefly

A creator can never loosen below ORANGE. Their room, their thresholds — but not
their platform.

### Trusted Circles

Creators pre-approve regulars who bypass YELLOW entirely. ORANGE and RED still
apply. This replaces volunteer moderation: mods supervise a system rather than
reading every line, and they retain instant timeout, ban, and message-removal
powers the automation cannot override.

---

## DMs

**Message requests never display content.** A request shows the sender's profile
only. The body is classified before the request record is created; anything at
ORANGE or above means the request is never created at all. The sender sees it as
sent.

This means harassment cannot be delivered through the request itself, which is the
hole in every accept-first design currently shipping.

**Age-based restriction, absolute:**

- No DMs between an adult and an unconnected minor. Not rate-limited — impossible.
- Minors may DM accounts they follow who follow back, and nothing else.
- Any attempt by an adult to move a minor to another platform is RED plus review.

---

## Age verification

Age verification exists to gate **money and live streaming**, not content. There is
no mature content to unlock.

**We never store identity documents.** A verification provider checks the document
and returns a boolean and a reference token. We persist `age_verified`,
`verified_at`, `provider_ref`. Nothing else. An ID database is a breach liability
with no offsetting benefit.

Tiers, cheapest first:

1. Self-declared DOB — general access
2. Age estimation, selfie-based, no document — going live
3. Document verification — payouts, high-value gifting, estimation failures

Gating:

| Capability                       | Requires                  |
| -------------------------------- | ------------------------- |
| Watch, post, comment             | self-declared DOB         |
| Go live                          | 18+ verified              |
| Send gifts above daily threshold | 18+ verified              |
| Receive gifts                    | 18+ verified + payout KYC |
| DM an unconnected account        | 18+ verified, both sides  |

Live streaming is 18+ only. A minor broadcasting video to strangers is the
highest-risk surface any social platform operates, and the mitigations available
to us are not sufficient to run it safely. This is not revisited without outside
child-safety counsel.

---

## Appeals

- Every enforcement action states the specific reason and the specific content.
- Appeal is one tap from the notification.
- **72-hour SLA, published, tracked in `appeals.due_by`.**
- A human reviews every appeal of an automated decision. A machine never upholds a
  machine.
- Overturn rate is published quarterly. A rising rate is our failure, not the
  users'.

---

## Reach and ranking

**Never a permitted reason to limit reach:**

- Negative sentiment
- Discussion of difficult subjects
- Low engagement alone
- Criticism of this platform
- Unreviewed automated classifier output

**Permitted, and always disclosed to the creator with reason and duration:**

- ORANGE or RED enforcement on the content itself
- Verified duplicate or reposted content
- Confirmed engagement manipulation
- Account age ramp — capped at 14 days, applies once

Every limitation writes a `reach_events` row with a plain-language explanation
the creator sees. If we can't write the sentence, we don't apply the limit.

A fixed share of every feed is reserved for creators below the discovery
threshold, unconditionally. Merit ranking without an entry point is just
incumbency.

---

## Support escalation

AI handles first contact and is **disclosed as AI**. We do not pass automation off
as a person.

Always human on first touch, never AI-resolved:

1. Money — chargebacks, missing payouts, split disputes
2. Appeals of any moderation decision
3. Anything touching self-harm — immediate, no triage
4. Law enforcement and legal process

Problem frequency is tracked across tickets. Recurring issues are engineering
defects and get routed to the backlog, not answered repeatedly.

---

## Amendment

This policy is versioned. Changes take effect on a future date and never apply
retroactively to content already posted or enforcement already served. Diffs are
published. Same commitment as creator payout terms, same reason.

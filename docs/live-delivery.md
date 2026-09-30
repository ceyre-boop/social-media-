# Live delivery quality — requirements (Colin, 2026-09-29)

Not built yet. Live streaming is out of scope until a future milestone. This is
the contract that milestone builds against. It revises the live section of
`# Infrastructure Cost Model.md`.

## Non-negotiable

1. **Adaptive bitrate ladder.** One upload from the creator; the server transcodes
   to 1080p / 720p / 540p / 360p. The viewer's player measures its own bandwidth
   and switches renditions at segment boundaries. This is ~80% of perceived
   live quality. A single passthrough bitrate is exactly the setup that lags.
2. **Edge delivery.** Ingest near the creator, deliver from a point of presence
   near each viewer. Jitter, not raw bandwidth, causes stutter.
3. **Broadcaster-side upload adaptation (ours to build — no provider does it).**
   The creator app watches its upload socket and lowers its own encode bitrate
   when the connection degrades, so the stream *softens* instead of *freezing*.
   Encoder settings: hardware encoding, CBR, B-frames off, short keyframe interval.
   If only one live-quality item gets built, it's this one.
4. **Low-latency segments + adaptive jitter buffer.** LL-HLS with partial
   segments (2–5 s latency, not the 15–30 s of 6 s HLS segments), with a player
   jitter buffer tuned for network variance.

## Revised provider decision

- **Managed live (Cloudflare Stream Live) provides 1, 2 and 4 on day one.** Start
  there.
- The cost model's "$300/month → self-host" trigger is still right on cost, but
  self-hosting means building the ladder and CDN fan-out ourselves: 3–4
  renditions of transcoding plus edge distribution. That's real infrastructure,
  not a $40 VM. **Budget to stay on managed live longer than the cost model
  implies**, or budget properly for the self-hosted equivalent. Never self-host a
  single-bitrate passthrough.
- Item 3 is required whichever provider is chosen.

## Same lesson for reels (VOD)

Reels currently upload and play one ~1.5 Mbps 720p MP4. The planned
ffmpeg → HLS → R2 pipeline should also emit a small ladder (for example 720p /
540p / 360p) so weak connections get a softer picture instead of a stall.

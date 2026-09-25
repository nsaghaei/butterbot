# First social milestone and continuation

**Implemented in frozen v18, build `2026-09-25.18`; 275/275 offline tests passed.** Butterbot and Pip are visible independent robots. The real model-driven two-turn conversation passed, including waiting for a moving partner's existing activity and pausing/resuming during speech. This is the first duo milestone; the broader social simulation remains unfinished.

## Implemented behavior

Butterbot has an ivory/teal shell and Pip a peach/coral shell. Both have their own personality, needs, goals, clock and private memory. Cast buttons select the active panel and request recipient; clicking a robot inspects that target without switching the acting character. Both robots' named thought/speech bubbles remain visible. Fresh server scenes use `duo`; saved casts are respected and reset keeps the current cast.

`socialize(target)` requires another actual Garden brain. Printed followers do not qualify. A request can wait for the partner's noncritical self-directed activity and its verification to finish. It does not override another user's task or critical needs. Laya then accepts or declines; waiting is not acceptance.

A Garden-owned session coordinates reservations, clear approach, mutual facing and nearby delivery. Gemma generates two short turns, one per robot, through the shared model scheduler. Each receives its own core and editable memory, verified surroundings and only already delivered dialogue. It cannot read the partner's private memories or script their reply. Generated words are labeled as proposals; each speaker's memory edits commit only after actual timed delivery.

Inference and availability waiting earn no social participation. Both speaking/listening intervals must complete nearby before mutual effects apply once. Reward uses at most ten seconds of shared participation: social +4 and fun +0.6 per rewarded second, bounded by need limits. Transcript, duration, participation and actual before/after values remain recorded.

Pause preserves the active session and excludes paused wall time from phase deadlines. Reassignment, removal, separation, timeout or generation failure cancels it. Stale jobs fail rather than remaining stuck in `socializing`. Reload cancels unfinished sessions and replans; completed evidence remains without replaying effects. Model slots are shared across reset so stale requests cannot create overlapping inference.

## Actual live evidence

- **v16, cycle 176 failed:** acceptance and approach occurred, but pausing during the first line invalidated participant revisions. Resuming canceled the session with zero fully delivered turns/effects and left an orphaned job.
- **v17, cycle 177 failed:** approach to Pip verified, but Pip had started a self-directed walk. The subsequent socialize action failed availability before creating a pair; it did not demonstrate the pause fix.
- **v18, cycle 178 passed:** replayed “Go chat with Pip about your favorite things in this garden.” Waiting began at 4862.60; Pip's walk verified at 4865.73; invitation accepted at 4866.02. Butterbot delivered 5.48 seconds, including a deliberate pause at 2.0167 seconds and UI resume; Pip delivered six seconds. Both lines completed at 4886.4. Actual participation was 11.48 seconds; capped rewards applied social +40 and fun +6 to both once. Gemma verified the sole plan step at 4890.48, with no errors, retries or navigation recoveries.
- Desktop robots/bubbles and the 375 × 812 mobile layout were visually checked; browser console had zero errors. Pip's panel showed 74.8% accept / 25.2% decline and one memory from its delivered line.
- **v18, cycle 179 passed a stationary handoff:** pickup → approach → give of the Orange Tulip, all 3/3 steps verified. Pip finished its requested walk before the handoff. This does not establish moving-recipient gifting.

See [PLAYTESTS.md](PLAYTESTS.md) for the full history. Raw exports and saves stay ignored and local.

## Continuation

1. **Gift reservations and consent.** Existing physical give can fail when a recipient leaves the 2 m range, and can fill their hands during their own pickup job. Coordinate recipient availability, free hands and transfer ownership through cancellation-safe reservations. Add recipient acceptance before claiming consent or relationship meaning; repeat live moving/busy-recipient tests.
2. **Conversation endings.** The current two-turn exchange can finish with an unanswered question. Improve closure before adding longer turn-taking, more participants or relationships. Do not credit undelivered words or model waiting as social success.
3. **Logs and presentation.** Invitation choices/probabilities, generated turns and delivered transcript cards are distinct, but repeated lifecycle records can be clearer and less noisy. Continue mobile and overlapping-bubble review.
4. **Recovery and memory.** Broaden real-model cancellation, critical-need, reset and reload checks. Preserve unrelated user work and exactly-once effects. Continue semantic memory curation without automatically deleting distinct or opposite facts.

## Implementation map

- `garden.mjs`, `server-v2.mjs`: independent brains, cast persistence, shared scheduling, pause/reset and public state.
- `social-jobs.mjs`: waiting, invitation, approach/facing, delivery, participation, effects and cancellation.
- `actions.mjs`, `autonomy.mjs`, `providers.mjs`: grounded social plans/options, acceptance and private per-speaker generation.
- `work/ui-main.mjs`, `web-next/avatars.js`: both avatars, selection, gestures, bubbles, transcript/model cards and waiting status.
- `tests/social-*.test.mjs`, `tests/ui-cast.test.mjs`, `tests/avatar-rig.test.mjs`: offline coverage; live evidence above remains separate.

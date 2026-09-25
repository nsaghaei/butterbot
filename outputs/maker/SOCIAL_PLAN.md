# First social milestone and continuation

**Current checkpoint: frozen v21, build `2026-09-25.21`; 315/315 offline tests passed.** Butterbot and Pip have grounded two-turn conversations and consented physical gifts. v21's exact completed-gift replay and live “Reflect on the gift you just gave to Pip” request both correctly described the successful exchange; the live think step and independent audit passed without error/retry. This addresses the recorded stale-narration case without guaranteeing every generated reflection. Eating/held-object presentation, handoff continuity and the broader social simulation remain unfinished.

## Implemented behavior

Butterbot has an ivory/teal shell and Pip a peach/coral shell. Both have their own personality, needs, goals, clock and private memory. Cast buttons select the active panel and request recipient; clicking a robot inspects that target without switching the acting character. Both robots' named thought/speech bubbles remain visible. Fresh server scenes use `duo`; saved casts are respected and reset keeps the current cast.

`socialize(target)` requires another actual Garden brain. Printed followers do not qualify. A request can wait for the partner's noncritical self-directed activity and its verification to finish. It does not override another user's task or critical needs. Laya then accepts or declines; waiting is not acceptance.

A Garden-owned session coordinates reservations, clear approach, mutual facing and nearby delivery. Gemma generates two short turns, one per robot, through the shared model scheduler. Each receives its own core and editable memory, verified surroundings and only already delivered dialogue. It cannot read the partner's private memories or script their reply. Generated words are labeled as proposals; each speaker's memory edits commit only after actual timed delivery.

Inference and availability waiting earn no social participation. Both speaking/listening intervals must complete nearby before mutual effects apply once. Reward uses at most ten seconds of shared participation: social +4 and fun +0.6 per rewarded second, bounded by need limits. Transcript, duration, participation and actual before/after values remain recorded.

Pause preserves the active session and excludes paused wall time from phase deadlines. Reassignment, removal, separation, timeout or generation failure cancels it. Stale jobs fail rather than remaining stuck in `socializing`. Reload cancels unfinished sessions and replans; completed evidence remains without replaying effects. Model slots are shared across reset so stale requests cannot create overlapping inference.

Gifts use the same paired-session infrastructure with `kind:'gift'`: wait for an eligible recipient, request its Laya acceptance, reserve both participants, approach and perform a 1.4-second give/receive gesture. Temporary hands occupied by the recipient's current eligible job do not cause premature refusal; that job and its audit finish before free hands are checked. An occupied ready recipient is rejected without a forced drop. Actual contact transfers owner/carrier once; its evidence remains distinct from later gesture completion, including cancellation after contact. Giving does not invent conversation rewards or relationship changes. The UI shows gift consent probabilities, waiting/handoff status and physical evidence; character switching locks requests until both the API acknowledgment and matching state update arrive.

Reflection now prioritizes current goal, verified steps and ownership over historical failures and old inspections. A lifecycle/evidence check rejects output generated across a changed stage, step, job or completed outcome, then requests a fresh reflection. Full editable memory remains available. Gift cards remove exact duplicate proof text; broader lifecycle presentation still needs polish.

## Actual live evidence

- **v16, cycle 176 failed:** acceptance and approach occurred, but pausing during the first line invalidated participant revisions. Resuming canceled the session with zero fully delivered turns/effects and left an orphaned job.
- **v17, cycle 177 failed:** approach to Pip verified, but Pip had started a self-directed walk. The subsequent socialize action failed availability before creating a pair; it did not demonstrate the pause fix.
- **v18, cycle 178 passed:** replayed “Go chat with Pip about your favorite things in this garden.” Waiting began at 4862.60; Pip's walk verified at 4865.73; invitation accepted at 4866.02. Butterbot delivered 5.48 seconds, including a deliberate pause at 2.0167 seconds and UI resume; Pip delivered six seconds. Both lines completed at 4886.4. Actual participation was 11.48 seconds; capped rewards applied social +40 and fun +6 to both once. Gemma verified the sole plan step at 4890.48, with no errors, retries or navigation recoveries.
- Desktop robots/bubbles and the 375 × 812 mobile layout were visually checked; browser console had zero errors. Pip's panel showed 74.8% accept / 25.2% decline and one memory from its delivered line.
- **v18, cycle 179 passed a stationary handoff:** pickup → approach → give of the Orange Tulip, all 3/3 steps verified. Pip finished its requested walk before the handoff. This does not establish moving-recipient gifting.
- **v19, Pip cycle 10 passed a consented gift:** “Give the Orange Tulip to Butterbot.” Acceptance was 80.7% versus 19.3% decline, context 350/362. Contact at 4927.05 and 1.42146 m transferred owner/carrier pip → actor once; the 1.4-second gesture and Gemma audit completed. The later Butterbot cycle 181 request failed while Pip temporarily held food during its own eating job; preserve that failure.
- **v20, cycle 182 passed the failed-save replay:** “Give the Orange Tulip to Pip after Pip finishes the current activity.” Pip finished eating, leaving four servings, and its audit verified before invitation. Acceptance was 87.93% versus 12.07%, context 330/362. Paused at 0.6667/1.4 seconds before contact, with zero transfers and donor-held ownership; UI Resume continued. Contact at 4968.2667 and 1.627823 m transferred actor → pip once; gesture completed at 4968.9333 and Gemma verified at 4973.45. No error/retry or fabricated social reward.
- v20 give/receive poses were checked; the 375 × 812 gift-result layout fit without horizontal overflow and browser console had zero errors. A reflection at 4978.9 still falsely described waiting to present the already-transferred gift. Engine evidence is correct; generated narration needs grounding.
- **v21 replay and live reflection passed:** the exact paused completed-gift source replay took 5.472 seconds and described the tulip in Pip's hands, with successful-exchange speech, a gift memory and a chat suggestion. Live cycle 183 then accepted a 4.744-second reflection, added one experience (memory 6 → 7), and verified the think step at 4994.2333 without error/retry. Pip also completed its flowerbed walk and reflected appropriately. Tulip ownership/carrier remained Pip; the game was saved/paused. Robot bodies and card cleanup were checked with zero captured console errors. Mobile was not rerun for this small change.

See [PLAYTESTS.md](PLAYTESTS.md) for the full history. Raw exports and saves stay ignored and local.

## Continuation

1. **Reflection follow-through and physical presentation.** v21 passed the recorded stale-gift case; broaden memory/reflection checks and retain the v20 failure as a regression. A confirmed eating defect raises a held flower while consuming an unheld bowl; a v22 worker is addressing it, not a shipped v21 fix. Gift rendering still shifts about 29.7 cm on the next frame at the tested spacing; the receive alias worsens it.
2. **Conversation endings.** The current two-turn exchange can finish with an unanswered question. Improve closure before adding longer turn-taking, more participants or relationships. Do not credit undelivered words or model waiting as social success.
3. **Logs and presentation.** Invitation choices/probabilities, generated turns and delivered transcript cards are distinct. v21 removes exact duplicate gift-proof text, but repeated lifecycle records can be clearer and less noisy. Continue mobile and overlapping-bubble review.
4. **Recovery and memory.** Consent and the tested busy-recipient/pause cases now work. Broaden other busy/occupied jobs, decline, cancellation before/after gift contact, critical-need, reset and reload checks. Preserve unrelated user work and exactly-once ownership/effects. Continue semantic memory curation without automatically deleting distinct or opposite facts. Relationships and a full sleep cycle remain future work.

## Implementation map

- `garden.mjs`, `server-v2.mjs`: independent brains, cast persistence, shared scheduling, pause/reset and public state.
- `social-jobs.mjs`: chat/gift waiting, invitation, reservations, approach/facing, delivery/contact evidence, effects and cancellation.
- `actions.mjs`, `autonomy.mjs`, `providers.mjs`: grounded social plans/options, acceptance and private per-speaker generation.
- `work/ui-main.mjs`, `web-next/avatars.js`: both avatars, confirmed selection, give/receive gestures, bubbles, transcript/gift/model cards and waiting status.
- `tests/social-*.test.mjs`, `tests/ui-cast.test.mjs`, `tests/avatar-rig.test.mjs`: offline coverage; live evidence above remains separate.

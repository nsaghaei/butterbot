# First social milestone

This is continuation work, not a claim that conversation is implemented. Finish the single-character navigation and object playtests before enabling companions.

## Two visible, independent robots

Start with Butterbot and Pip, with distinct shell colors, existing core personalities, needs, private memory caches, and selectable panels. Persist the cast explicitly. The current `ensemble` option creates three physical actors, but the browser creates only Butterbot's avatar; enabling that flag alone would leave invisible companions. Update both the UI builder source and generated browser files.

## A real conversation job

Add `socialize(target)` for another actual `Garden.brains` participant. A printed follower with a physical controller is not yet a conversational brain. Laya chooses initiation from grounded choices, and the available partner's Laya accepts or declines. Preserve active user work and critical need priorities.

Keep a Garden-owned pair session with an ID, participant IDs/revisions, phase, delivered turns, elapsed participation, and an exactly-once completion flag. Reserve both participants together after acceptance. Navigate to a clear point about two meters apart, stop, face each other, and validate proximity throughout.

Generate two brief Gemma turns, one per robot, through the existing single-Gemma scheduler. Supply the speaker's core, own relevant memories, verified surroundings, and already delivered conversation. Inference waiting is not social participation. Deliver each line with a speaking/listening gesture; only then apply that speaker's bounded memory edits. Show both robots' speech, including the unselected participant.

After both nearby speaking/listening intervals finish, record the shared outcome and apply social recovery to both once. Keep the transcript and actual need changes inspectable in the debugging UI. Existing `give` already transfers a real object; recipient decisions and social meaning can build on this session system later.

## Cancellation and persistence

Reassignment, critical need interruption, removal, separation, timeout, reset, or generation failure releases both participants. Guard every response with session and participant revisions. The provider's global abort ownership must not cancel unrelated work. Restore unfinished sessions as canceled; retain completed evidence without replaying effects.

## Implementation boundaries

- `garden.mjs`: pair lifecycle, independent brains, fair scheduler, cast/save/restore.
- `social-jobs.mjs` (new): approach, facing, delivered turns, timing, cancellation.
- `actions.mjs`, `autonomy.mjs`: grounded plans, valid partner offers, social goals.
- `providers.mjs`: bounded conversation schema, per-speaker grounding and diagnostics.
- `needs.mjs`: mutual recovery tied to actual session completion.
- `server-v2.mjs`: deliberate two-robot startup/reset and persisted cast.
- `work/ui-main.mjs`, `web-next/avatars.js`: both avatars, distinct palettes, visible dialogue and selection; rebuild browser output.

Regression checks must prove private memory grounding, real navigation/facing, no fulfillment while waiting for inference, exactly-once mutual effects, cancellation/stale-response rejection, and no duplicate effects after restore. Then play the real model-driven interaction before expanding the cast or adding more social actions.

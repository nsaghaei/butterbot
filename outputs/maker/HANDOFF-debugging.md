# Debugging checkpoint

Diagnostics are shipped in **frozen v21, build `2026-09-25.21`**. The full source suite passed **315/315 tests**. The recorded stale-gift reflection passed both its exact real-Gemma replay and a separate live think/audit request after adding lifecycle/evidence checks and a temporal reflection frame. [PLAYTESTS.md](PLAYTESTS.md) preserves the original v20 failure and distinguishes these successes from broader unfinished work.

## Available evidence

- `diagnostics.mjs` builds a detached, read-only report of the selected character's full plan/current step, goal, job, physics, held objects, needs, memory, verification evidence and last user request. It also includes actor summaries, the object catalog, outstanding provider requests, up to 30 recent records by default, 30 failure reasons and a 50-entry timeline drawn from all brains. Exact logged prompts, construction code, snapshots and probabilities remain in raw records. Reconstructed context is labeled separately.
- `GET /api/debug` returns the report; `GET /api/debug/export` downloads it. The interface's Diagnostics section links both. `/api/state` includes the active/history social-session DTOs; the compact debug report currently exposes social evidence through logged records and the selected job/step rather than a dedicated top-level session section.
- `DiagnosticJournal` appends changed records as JSONL revisions beside `SAVE_FILE`, at `debug/history.jsonl`. Capture runs every 500 ms, including without browser clients, and flushes on save/export/graceful shutdown. The signature index is bounded to 5,000 entries; restored records are deduplicated and reset evidence retained. Incomplete crash lines are preserved. Save requests serialize; a journal error does not prevent attempting the world save.
- `debug.mjs` is read-only by default. `--goal` explicitly submits an objective to the existing selected character and observes that same server; it starts no second model or world. `--out` writes a report and compact observation samples. Use `node debug.mjs --help` for arguments.

## Reading social evidence

`social_model` acceptance records contain Laya's offered accept/decline choices, selected choice and probabilities. Turn-generation records contain the actual speaker input and proposed `value.speech`; generation completion is not delivery. UI cards keep that distinction and preserve full input/output.

Engine `social` records capture waiting, acceptance, delivered transcript and completion/cancellation. Complete sessions retain participation and actual need changes. In v18 cycle 178, both lines delivered for 11.48 seconds of nearby participation, a ten-second reward cap applied social +40/fun +6 to each once, and Gemma verified the single plan step. The deliberate mid-line pause/resume preserved the session. `evidence/v18-verified-conversation.json` is local ignored evidence.

Preserve the failed v16 pause export, `evidence/v16-paused-conversation-failure.json`: zero fully delivered lines/effects and an orphaned job. v17 then failed on moving-partner availability before creating a session. Those attempts did not succeed merely because model text was generated. v18 replayed the failed saved state successfully.

Historical v18 cycle 179 completed a stationary tulip handoff; its audit exposed range/hand conflicts. v19 introduced consent and reservations: Pip cycle 10 passed a gift to Butterbot with 80.7% acceptance, one transfer at 1.42146 m and a complete 1.4-second gesture. A second request failed while Pip temporarily held food during its eating job. Preserve ignored `evidence/v19-consented-gift.json`, `evidence/v19-temporary-hands-failure.json` and the replay save.

v20 cycle 182 replayed that failed save. Pip finished eating at 4962.4167 with four servings remaining; the gift waited through the audit, verified at 4966.60. Acceptance was 87.93% versus 12.07%, context 330/362. Paused at 0.6667/1.4 seconds before contact: transfer count zero and donor-held ownership. After UI Resume, contact at 4968.2667 and 1.627823 m changed owner/carrier actor → pip once. Gesture completed at 4968.9333 and Gemma verified at 4973.45, without error/retry or social reward. Local ignored export: `evidence/v20-verified-waiting-gift.json`.

Gift `social_model` records have `kind:'gift'` and purpose `gift acceptance`; their probabilities describe consent, not a completed transfer. Engine `social` records and `giftEvidence` retain object/giver/recipient IDs, accepted/transferred flags, transfer count/time, before/after owner/carrier/carried/position, contact positions/distance, gesture duration/progress and cancellation reason. Cancellation after contact must preserve the actual transfer proof. Do not infer transfer from acceptance or erase it because a later gesture was interrupted.

At 4978.9, post-completion reflection falsely described Pip still being occupied and Butterbot waiting to present the tulip. The completed plan, actual gift evidence and stale bubble were visible together. This is a narration-grounding defect, not evidence that ownership failed. Both handoff poses and the 375 × 812 gift-result panel were checked; no horizontal overflow or browser-console errors occurred.

## v21 reflection verification

The exact paused completed-gift cycle-182 replay against real Gemma/source v21 completed in 5.472 seconds. The generated thought said the tulip was safely in Pip's hands, with speech about the successful exchange, a gift memory and a chat suggestion. Ignored evidence: `evidence/v21-reflection-replay.json`.

The separate player-UI request “Reflect on the gift you just gave to Pip”, cycle 183, proposed/selected a think step in records 1465/1466. Reflection 1467 was accepted at 4990.7333 after 4.744 seconds and described the completed gift; one memory increased the count from six to seven. Outcome 1468 and independent Gemma audit 1470 completed 1/1 at 4994.2333, without error/retry. The game was saved/paused and Pip still owned/carried the tulip. Robot bodies and exact duplicate gift-card cleanup were visually checked; browser console had zero captured errors. Ignored evidence: `evidence/v21-live-reflection.json`.

Reflection output is discarded when the current lifecycle/completion evidence changes during inference, before applying thoughts, suggestions or memory edits. Its input frame separates current goal, verified steps and actual ownership from historical failures/inspections. These safeguards and two real-model results verify this case, not universal semantic accuracy. No new mobile check is claimed beyond historical v20 coverage.

## Remaining verification and limits

- Broaden current-outcome reflection/memory checks and keep the v20 stale-narration example for regression. Continue gift decline, occupied/busy recipient, cancellation before/after contact, reset/reload and provider-failure checks in isolated worlds, then playtest the integrated single live server. Preserve saves and do not run competing model-driven servers.
- Independently confirmed presentation defects remain: eating raises a held flower while consuming an unheld bowl, and a gift shifts about 29.7 cm on the next frame at the tested spacing. Eating work is underway for v22; the receive alias worsens the gift shift. Neither is fixed by v21 reflection/card changes.
- Improve noisy social lifecycle/model cards and consider a dedicated active-session section in the diagnostic report. Logs from both brains may contain copies of a shared session event; use session and record IDs when interpreting effects.
- Broaden actual HTTP/shutdown checks on the Windows launch mechanism. Hard termination cannot guarantee a final flush; periodic capture and normal save flushing remain the fallback.
- The report cannot recover model text never logged. Polling can miss transitions that occur entirely between captures; bounded recent records are not a complete journal. Later reconstructed context is not the original model input.

Raw diagnostics, private saves, logs and model files stay outside Git. Offline fixture/mock checks establish report behavior; live outcomes must be supported by actual engine records and player-facing inspection.

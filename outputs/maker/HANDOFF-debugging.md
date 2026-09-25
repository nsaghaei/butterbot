# Debugging checkpoint

Diagnostics are shipped in **frozen v25, build `2026-09-25.25`**. The full source suite passed **370/370 tests in 11.118 seconds**. UI Retry reused the verified orange and pickup completed/verified. Pip’s acceptance context then failed at 377/362 tokens before handoff; the game was paused/saved with Butterbot still holding the untouched orange. v26’s recipient-context fix is pending. [PLAYTESTS.md](PLAYTESTS.md) preserves the v24 context failure, v23 meal success and earlier evidence separately.

## v25 — verified Retry and pickup, gift blocked

**Frozen/live v25, build `2026-09-25.25`: 370/370 offline tests passed in 11.118 seconds.** The launcher now selects v25. The actual UI Retry used the identity-guarded `/api/resume`; its paused API snapshot retained original cycle 189, `planIndex:1`, creation `actor-record-1530` and verification `actor-record-1534`. The cycle serial was 190, and the same `item-6` remained among eight entities. UI Resume then continued the live run. Gemma replanned only pickup → give. Actual pickup completed and its independent step-2 audit passed, reaching `planIndex:2`. **The gift then failed before handoff:** Pip’s acceptance context required **377 tokens against 362** (30-token header), while its context included goal “Take a walk to the sunny pad.” and stage `action_plan`. No transfer occurred. Butterbot still held the same `item-6`, with one untouched edible serving; no new object or print was created. The watcher immediately paused/saved. Ignored evidence: `evidence/v25-continued-gift.json`. **The full printed gift did not pass; the v26 recipient-context correction is pending.** The last published checkpoint remains v24 (`398ee7f`, tag `checkpoint-2026-09-25-v24`).

Stale asynchronous self-goal selection rejection and construction-worker failure can no longer overwrite a newer request or spend its construction repair budget. The final suite also includes a regression for the actual UI Retry path.

The source context profile is more concise while retaining the exact goal, full ordered plan, complete object names/positions, offered choices and required facts. Offline checks using the actual failing fixture fit the 362-token state allowance: pickup 334, pickup completion 348, give 339, give completion 358; gift acceptance 357. These fixture checks did not cover the failing live recipient state: acceptance later needed 377/362 tokens. They are not evidence of a completed live gift.

Safe Retry retains authentic verified steps, the original cycle and its records after autonomy or reload, so the already printed `item-6` can be reused rather than printed again. New goals receive a monotonically increasing cycle serial. Stored completion proof is bounded; retry does not fabricate verification.

For rigid gifts such as the orange and tulip, the source contact transition eases the actual object position and rotation into the recipient grip over 0.3 seconds. Ownership still transfers exactly once at contact, and save/restore preserves the bounded transient. Rigid-object regression checks cover the measured 29.7 cm next-frame jump, including reload; receiver hand alignment is not fully solved. This live request failed before handoff, so it did not demonstrate the new transition visually.

## v24 source checks and partial live result

Creation planning now includes a model-selected explicit `edible` boolean. Edibility is required when a later step eats that creation and is valid only for props; legacy omissions normalize from downstream requirements. An edible plan fixes material to food and asks only form, size and detail, preserving later pickup/give requirements without inserting an eat action. Constructed capabilities are still validated.

Reflection schemas now expose the exact IDs in the character’s complete editable memory store (up to 12 entries). Remember uses an empty ID; revise/forget cannot be requested for an empty store. Failed reflections retain generated input/output, timing and usage for diagnostics. These checks constrain references; they do not establish perfect semantic memory curation.

Butterbot cycle 189 retried “Print a small edible orange, pick it up, and give it to Pip.” **Printing passed:** `item-6`, Small Edible Orange, material food, `edible:true`, one untouched serving. The independent print audit passed and `planIndex` reached 1. **The full request failed before pickup:** Laya’s compact state required **371 tokens against a 362-token allowance** (35-token header). No pickup or gift occurred. The game was immediately paused/saved; ignored evidence is `evidence/v24-printed-gift.json`. v25 passed the resumed pickup context and independent audit, then failed recipient acceptance before handoff. The base paused replay save is `saved/before-v24.json`. Keep the independently verified materialization separate from the decision-budget failure. Do not infer a transfer or memory edit from a successful print audit.

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

## v22–v23 food and hand evidence

v22 passed 329/329 offline tests but Pip cycle 13's snack plan omitted dropping the Orange Tulip. Runtime checks rejected eating after approach; Pip consumed **zero** and retained the tulip. Butterbot's separate verified meals were cycle 184 at 5023.733 (bowl 4 → 3) and cycle 185 at 5049.35 (3 → 2), both before v23 restarted. Keep actors/cycles separate when interpreting shared food depletion. Ignored failure export: `evidence/v22-occupied-hands-plan-failure.json`.

v23's UI Retry started Pip cycle 15. Plan 98 generated drop → approach → eat in 4.425 seconds with no rejected plan/repair. Outcomes/audits 100/102 and 104/106 completed drop and approach. Eating began at 5074.85; at progress 0.4722 (1.4167/3 seconds), the pause snapshot showed bowl carrier Pip, `foodHeld:true`, `effectApplied:false`, and tulip `carrier:null` on the ground. The screenshot showed the actual bowl at the mouth and flower on the floor. Ignored mid-action evidence: `evidence/v23-mid-eat.json`.

After UI Resume, eat outcome 108 at 5077.8667 consumed exactly one serving, bowl **2 → 1**, with hunger **20.6268 → 0**, energy **+2**, comfort **+3**, elapsed **3.0167 seconds**. Audit 110 verified 3/3 at 5083.60. Reflection 111 at 5087.4833 described the sweet/refreshing orange after freeing hands and setting the tulip aside. Actual Laya contexts were **350, 345, 305, 327, 305, 330**, all within 362 tokens. At the saved/paused meal endpoint, one serving remained, both hands were free and the ground tulip remained owned by Pip. UI and zero captured console errors were confirmed. Final meal export: `evidence/v23-verified-hands-meal.json`.

The earlier exact-tokenizer audits of critical drop/print/eat(`$step2`) remained within 362 without fact truncation; those offline contexts are not a live printing success. v23's prospective hand validation can request a specific bounded Gemma correction before committing actions, but this live retry passed on its **first** generated plan. Do not describe it as a demonstrated live repair loop or universal planning reliability.

## Additional v23 edible-construction failure

Cycle 187 requested printing a small edible orange, picking it up and giving it to Pip. The plan correctly used `$step1`, but construction selected polymer after a refreshed form question and oblate/small/smooth choices. All three attempts failed food-material validation: “Only food material can be tagged edible; plastic, wood and metal cannot be eaten”. No object, pickup or gift occurred. The edible label was not represented as an explicit creation capability; later pickup/give dependencies did not impose an eat constraint.

The ignored `evidence/v23-edible-material-failure.json` export was captured after selected Butterbot entered self-cycle 188 `action_plan`; examine the preserved failed user request and **cycle-187 records**, not only the current self goal. The game was saved/paused with one food serving and the ground tulip. A subsequent reflection failed with “Memory edit referenced an unknown entry”; its proposed edit must not be counted as accepted.

v24 adds model-selected explicit creation-plan edibility, constrains material to food when required and checks constructed capabilities. The v24 replay verified that edible construction, then failed before pickup because its next decision context exceeded capacity. No forced eat step or keyword-regex inference supplied edibility, and the full printed gift did not succeed. v23's meal success does not cover this failed construction path.

## Remaining verification and limits

- Broaden current-outcome reflection/memory checks and keep the v20 stale-narration example for regression. Continue gift decline, occupied/busy recipient, cancellation before/after contact, reset/reload and provider-failure checks in isolated worlds, then playtest the integrated single live server. Preserve saves and do not run competing model-driven servers.
- Broaden food removal/theft/release, carry failure, unrelated occupied hands, pause/cancellation and depletion checks after the recorded v23 success. Gift rendering still shifts about 29.7 cm on the next frame at the tested spacing; the receive alias worsens it and v23 includes no visual-blend fix.
- Improve noisy social lifecycle/model cards and consider a dedicated active-session section in the diagnostic report. Logs from both brains may contain copies of a shared session event; use session and record IDs when interpreting effects.
- Broaden actual HTTP/shutdown checks on the Windows launch mechanism. Hard termination cannot guarantee a final flush; periodic capture and normal save flushing remain the fallback.
- The report cannot recover model text never logged. Polling can miss transitions that occur entirely between captures; bounded recent records are not a complete journal. Later reconstructed context is not the original model input.

Raw diagnostics, private saves, logs and model files stay outside Git. Offline fixture/mock checks establish report behavior; live outcomes must be supported by actual engine records and player-facing inspection.

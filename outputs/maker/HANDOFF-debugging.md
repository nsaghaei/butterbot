# Debugging checkpoint

Diagnostics are shipped in **frozen v18, build `2026-09-25.18`**. The full source suite passed **275/275 tests**. The first two-robot conversation and a stationary tulip handoff passed real model-driven playtests; [PLAYTESTS.md](PLAYTESTS.md) distinguishes those results from earlier failures and unfinished cases.

## Available evidence

- `diagnostics.mjs` builds a detached, read-only report of the selected character's full plan/current step, goal, job, physics, held objects, needs, memory, verification evidence and last user request. It also includes actor summaries, the object catalog, outstanding provider requests, up to 30 recent records by default, 30 failure reasons and a 50-entry timeline drawn from all brains. Exact logged prompts, construction code, snapshots and probabilities remain in raw records. Reconstructed context is labeled separately.
- `GET /api/debug` returns the report; `GET /api/debug/export` downloads it. The interface's Diagnostics section links both. `/api/state` includes the active/history social-session DTOs; the compact debug report currently exposes social evidence through logged records and the selected job/step rather than a dedicated top-level session section.
- `DiagnosticJournal` appends changed records as JSONL revisions beside `SAVE_FILE`, at `debug/history.jsonl`. Capture runs every 500 ms, including without browser clients, and flushes on save/export/graceful shutdown. The signature index is bounded to 5,000 entries; restored records are deduplicated and reset evidence retained. Incomplete crash lines are preserved. Save requests serialize; a journal error does not prevent attempting the world save.
- `debug.mjs` is read-only by default. `--goal` explicitly submits an objective to the existing selected character and observes that same server; it starts no second model or world. `--out` writes a report and compact observation samples. Use `node debug.mjs --help` for arguments.

## Reading social evidence

`social_model` acceptance records contain Laya's offered accept/decline choices, selected choice and probabilities. Turn-generation records contain the actual speaker input and proposed `value.speech`; generation completion is not delivery. UI cards keep that distinction and preserve full input/output.

Engine `social` records capture waiting, acceptance, delivered transcript and completion/cancellation. Complete sessions retain participation and actual need changes. In v18 cycle 178, both lines delivered for 11.48 seconds of nearby participation, a ten-second reward cap applied social +40/fun +6 to each once, and Gemma verified the single plan step. The deliberate mid-line pause/resume preserved the session. `evidence/v18-verified-conversation.json` is local ignored evidence.

Preserve the failed v16 pause export, `evidence/v16-paused-conversation-failure.json`: zero fully delivered lines/effects and an orphaned job. v17 then failed on moving-partner availability before creating a session. Those attempts did not succeed merely because model text was generated. v18 replayed the failed saved state successfully.

Cycle 179's tulip gift completed three verified steps after Pip had stopped walking. An offline audit found unresolved moving-recipient range loss and hand conflicts with a recipient's own pickup job. Record future reservation/consent and moving-recipient tests separately; the stationary success does not prove them.

## Remaining verification and limits

- Continue cancellation, reset/reload, provider-failure and concurrent-recipient checks in isolated worlds, then playtest the integrated single live server. Preserve saves and do not run competing model-driven servers.
- Improve noisy social lifecycle/model cards and consider a dedicated active-session section in the diagnostic report. Logs from both brains may contain copies of a shared session event; use session and record IDs when interpreting effects.
- Broaden actual HTTP/shutdown checks on the Windows launch mechanism. Hard termination cannot guarantee a final flush; periodic capture and normal save flushing remain the fallback.
- The report cannot recover model text never logged. Polling can miss transitions that occur entirely between captures; bounded recent records are not a complete journal. Later reconstructed context is not the original model input.

Raw diagnostics, private saves, logs and model files stay outside Git. Offline fixture/mock checks establish report behavior; live outcomes must be supported by actual engine records and player-facing inspection.

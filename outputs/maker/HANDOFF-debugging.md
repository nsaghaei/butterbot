# Debugging checkpoint

Implemented, but not deployed to the frozen live release:

- `diagnostics.mjs`: `buildDebugReport(world)` takes a read-only engine snapshot. It includes the full current plan, step, goal, current physics and held objects, object catalog, outstanding provider requests, last 30 complete records, failure reasons and a 50-event timeline. Exact logged prompts, construction code, request snapshots and probabilities are preserved. Reconstructed context is explicitly distinguished from the original decision snapshot.
- `diagnostics.mjs`: `DiagnosticJournal` asynchronously serializes append-only JSONL writes. Pending-to-accepted changes produce new revisions. It deduplicates restored records, bounds the signature index to 5,000 entries, retains evidence across scene resets, and preserves incomplete crash lines. No inference calls are made.
- `server-v2.mjs`: adds `GET /api/debug` and downloadable `GET /api/debug/export`. The journal lives beside the shared `SAVE_FILE` at `debug/history.jsonl`, captures every 500 ms even without browser clients, and flushes on save/export/graceful shutdown. Save requests serialize so a goal submitted during autosave is saved afterward. A journal error does not prevent attempting the primary world save.
- `debug.mjs`: a read-only CLI by default. An explicit `--goal` submits a goal to the existing selected character, then polls the same server until completion, failure, supersession or timeout. It does not start another server or model. `--out` exports the report and compact observation samples. `--help` documents usage.
- `tests/diagnostics.test.mjs`: eight offline tests for complete, detached evidence; report bounds; journal revision ordering, deduplication, restart, reset, bounded index and crash-line preservation; read-only CLI; explicit-goal failure capture; timeout/supersession and argument validation.

## Validation

`node --test tests/diagnostics.test.mjs`: **8 passed, 0 failed**. Tests use fixture world data and mocked HTTP. No live goals, model calls, scene mutations, deployment or Git operations were performed.

## Remaining verification

Before the GitHub hold, `tests/object-jobs.test.mjs` was also saved with eight passing real manual-mode Garden tests covering pickup/drop timing, bounded throws, actual push displacement, gift transfer/revalidation, food depletion and persistence, pause, and impossible actions. No model or live-server calls were made. The older timed-eating assertion in `tests/agents.test.mjs` remains to be migrated.

- Run the whole repository test suite after the other agents' changes are integrated.
- Add or perform isolated HTTP endpoint integration checks for the actual server and verify graceful shutdown behavior on the target Windows launch mechanism. Hard process termination cannot guarantee a final flush; the normal 500 ms capture and 20-second save flush remain active.
- Include both new modules when freezing the next release, with the existing shared save path preserved.
- After explicit user authorization to reproduce a goal, use the CLI against the existing game and review the exported report and journal. No real print failure has been reproduced by this subtask.

All added imports are present. No dependency installation is required. The read-only report cannot recover model text that providers never logged; it preserves the full records currently available from the engine. Context captured only after an event may describe the later stage and is labeled accordingly. Journaling is polling-based, so changes that occur and disappear entirely between two captures are not separately represented.

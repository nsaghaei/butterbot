# Development handoff

Initial checkpoint saved September 25, 2026. The user has resumed the broader Sims-like game goal: fix regressions first, then polish and repeatedly playtest the single-character experience before expanding the cast.

## Baseline and working source

- `outputs/maker/releases/v6` is frozen; the launcher selects it. Its prior offline verification passed 60 tests.
- `outputs/maker` is newer source, labeled build `2026-09-25.7`. It has not been deployed or fully integrated.
- Preserve existing saves. Use isolated worlds and separate save paths for tests. Never overwrite a running frozen release.
- UI work and the single-character needs foundation are in progress. Multi-character feature expansion has not started.

## Fix milestone after the checkpoint

All **97/97 tests pass**. Fixed the two old assertions with timed eating and explicit fixture capability checks. Added real-server debug/read-only/export/save/shutdown verification, seven capability regressions and five goal-reliability regressions. New instructions preserve held objects; commit-time validation failures no longer bypass error handling; failed user requests persist in `lastUserGoal`; review context includes descriptions and truthful physical-versus-visual verification wording. The rotated printer uses shared perception/navigation/physics coordinates from `environment-layout.mjs`. No live release has been replaced yet.

## Already implemented in v6

Single human character; articulated physical rig and assisted walking; basic hunger/energy/fun autonomy; finite food; user objectives; generated ordered plans; valid Laya choices; recorded action outcomes; Gemma step verification; bounded retries; mutable memories; object metadata and inspection; local observation; exact decision-token budgeting; bounded construction compiler and repairs; physical object interactions; persistence; model-provider scheduling; adjustable smooth-scrolling activity feeds; visible decision probabilities; purple printer cards; scene reset.

## New source changes

Read the scoped handoffs before editing overlapping files:

- [Object capabilities](outputs/maker/HANDOFF-attributes.md): strict metadata, physical limits, valid object actions, richer perception.
- [Physics and poses](outputs/maker/HANDOFF-physics.md): actual throws, pushes, gifts, resource removal, progress-driven poses and bilateral printer typing.
- [Debugging](outputs/maker/HANDOFF-debugging.md): read-only reports, durable journal and optional goal-reproduction CLI.
- Root integration: `object-jobs.mjs` times pickup/drop/throw/push/give/eat; Garden advances those jobs; providers request object attributes and permit food material; proposed-object descriptions enter review context. Combined integration still requires verification.
- `tests/object-jobs.test.mjs` adds eight passing real manual-mode regressions for timing, throws, pushes, gifts, food depletion/save, pauses, and impossible actions.

## Known issues and remaining goals

1. **Printing reliability.** The v6 repeated-step loop is fixed: completion choices preserve successful action evidence and request verification. The latest real flower request still failed after Laya declined a valid design. Do not report it as printed.
2. **Review grounding.** Text grounding and the empty failure suffix are fixed and tested. Still playtest actual model review behavior and generated object fidelity; preserve real choices.
3. **User-goal visibility.** Saved `lastUserGoal` now retains the unfinished request and explanation. The UI status/retry presentation is in progress.
4. **Timed actions.** Timing, range, ownership, force, actual effects and food persistence now pass offline checks. Still verify physical pose timing and complete plans during gameplay.
5. **Capability coverage.** Seven dedicated tests cover explicit action plan requirements, capabilities, controllers, ownership, force, recipients and persistence. Current tokenizer tests pass; expand stress coverage as needs and objects grow.
6. **UI polish.** Color-code verification, thinking, action and observation cards without changing their format or printer purple. Reduce the bottom inset that clips a long printer card header. Remove consumed objects from rendering and guard asynchronous loads across scene resets.
7. **Printer feedback.** Align the bilateral typing pose with a visible keyboard/screen. Add a quiet accepted-prompt double bell with gesture unlock, mute, and no historical replay.
8. **Neighborhood scene.** Move the printer to the left fence and rotate it 90 degrees inward; remove square floor tiles; add a bright street backdrop and decorative passing cars. Use shared physics/perception/visual layout coordinates.
9. **Life needs.** Add grounded hygiene, comfort and social needs, with usable bed, shower, bench and finite food resources. Fulfillment requires real actions. Add distinct characters and conversations after single-character playtests pass.
10. **Cognition and gameplay.** Preserve flexible Gemma planning/reflection/memory and valid Laya choices. Prevent repeated verification or idle alternatives from trapping goals. Play as a user through movement, object use, printing and multi-step requests; inspect actual failures through diagnostics.
11. **Portability.** Remove machine-specific fallback paths, specify a compatible Laya/Python installation, and verify clean-clone setup. Model weights and runtimes are not included.

## Verification recorded

- Frozen v6: previously 60/60 offline tests passed.
- New physics: 8/8 new tests and 15/15 existing core tests passed in isolation.
- New diagnostics: 8/8 offline tests and syntax checks passed.
- Timed object jobs: 8/8 manual-mode tests passed.
- New capabilities: syntax and focused mock checks passed; dedicated coverage pending.
- Initial combined checkpoint: 82/84 tests passed, with two obsolete assumptions in `tests/agents.test.mjs`.
- Current fix milestone: `node --test tests/*.test.mjs` passes **97/97**. No live goals were submitted for this milestone; model-driven playtesting follows visual integration.

## Resume order

1. Work forward from this checkpoint in new commits.
2. Integrate actions, capabilities and debugging; fix meaningful failing regressions; check context budgets.
3. Polish the single-character UI, printer and physical scene together, then freeze a new release.
4. Playtest real model-driven goals and recovery using debug reports. Avoid competing model test servers.
5. Add usable need accommodations, then a small cast with different personalities, social needs, gifting and grounded conversations.
6. Repeat regression checks and user-style playtests; record verified outcomes and remaining issues here.

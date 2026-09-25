# Development handoff

Checkpoint requested September 25, 2026, before beginning the broader Sims-like game goal. Feature work is on hold for this push.

## Baseline and working source

- `outputs/maker/releases/v6` is frozen; the launcher selects it. Its prior offline verification passed 60 tests.
- `outputs/maker` is newer source, labeled build `2026-09-25.7`. It has not been deployed or fully integrated.
- Preserve existing saves. Use isolated worlds and separate save paths for tests. Never overwrite a running frozen release.
- The next UI, life-needs, and social expansion was paused before implementation.

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
2. **Review grounding.** Remove the empty `failed .` suffix, include the real design description, and distinguish physical checks from unverified appearance. Preserve actual model choices.
3. **User-goal visibility.** Retain the unfinished user request and explanation when autonomous goals resume after failure.
4. **Timed actions.** Update the legacy eating test, which assumed immediate consumption. Verify range, ownership, bounded force, actual effects, plan advancement and depleted-food persistence.
5. **Capability coverage.** Add comprehensive metadata/action tests and explicit throw/push/give/drop plan coverage. Support approaching real controllers without generated designs. Recheck token budgets after richer metadata.
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
- Combined source checkpoint: `node --test tests/*.test.mjs` ran 84 tests; **82 passed, 2 failed**. Both failures are in `tests/agents.test.mjs`: the finite-food test assumes immediate eating rather than stepping the new timed job; the reflection/capabilities test expects `/unavailable/` while invalid fixture actions now report `This fixture only supports approach and inspection`. Update those assertions meaningfully and rerun. No live goals were submitted for this push.

## Resume order

1. Work forward from this checkpoint in new commits.
2. Integrate actions, capabilities and debugging; fix meaningful failing regressions; check context budgets.
3. Polish the single-character UI, printer and physical scene together, then freeze a new release.
4. Playtest real model-driven goals and recovery using debug reports. Avoid competing model test servers.
5. Add usable need accommodations, then a small cast with different personalities, social needs, gifting and grounded conversations.
6. Repeat regression checks and user-style playtests; record verified outcomes and remaining issues here.

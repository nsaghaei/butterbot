# Development handoff

Current live release: September 25, 2026, **frozen v15**, build `2026-09-25.15`. Continue the user's broader Sims-like goal by making the single character reliable and expressive before expanding the cast. The long tulip story now passes every physical action and audit, and an impossible eating request is rejected immediately. Remaining UI/memory polish and broader edge tests are listed below. No companions are enabled; the social simulation remains unfinished.

## Release and evidence

- `outputs/maker/start.ps1` defaults to `releases/v15`. Frozen application directories must not be overwritten. The last reported pushed checkpoint is v11 commit `424c7bc`, pending the next root-owned commit/push.
- **213/213 offline tests passed for v15.** Live cycle 174 completed the exact long tulip request: pickup → carry to `(-2,3)` → throw toward `(0,3)` at `2 m/s` → approach the actual landed item → pickup → carry to `(2,3)` → place. All **7/7 engine actions and seven Gemma audits passed**, with no `not_verified`, error or navigation recovery. Initial approach was unnecessary because the object was already nearby.
- First plan proposal was at simulation time `4700.6667`, first physical completion at `4703.1`, final result at `4747.8667`: 47.20 simulation seconds from proposal to completion. Final immutable release evidence was `(2, 0.6825, 3)`, `carried:false`, `carrier:null`; the object subsequently settled near `(2.0062, 0.5614, 2.9574)`.
- Cycle 175, “Eat the park bench”, produced one unsupported activity plan, a precise wood/`edible:false` explanation and zero actions. It stopped immediately rather than retrying three times.
- The v15 browser console error list was empty; successful placement and refusal cards were visible. Reflections over cycles 174/175 consolidated 12 memories to eight, with some duplicates still present. The refused request's empty plan row misleadingly retains “Gemma is preparing the plan”; fix this in working source after the checkpoint.
- Local export `outputs/maker/evidence/v15-object-sequence.json` remains ignored. Preserve it as evidence without committing private diagnostics.
- **208/208 offline tests passed for v14**, but its live cycle 173 failed after five completed engine jobs and four verified steps. Gemma rejected the successful approach to the landed flower at roughly 1.5 m object distance despite arrival at the selected safe endpoint. Verbose verifier error prose then overflowed Laya's remaining context budget. The story did not complete in v14.
- **202/202 offline tests passed for v13.** Replay of the original pre-v12 save with its old reclining height completed the same cycle-170 walk/walk/rest request, 4/4 steps in 40.55 simulation seconds, with zero navigation recoveries or replans. All four actual action outcomes completed.
- Orange Tulip stayed at `(2.28953, 0.23981, 2.49450)` without launching. The rest center was approximately `y=0.87`, heading `π`, above the actual mattress and facing the pillow; the screenshot was verified. Rest added 27 energy points to reach 90.32, with comfort capped at 100.
- The second v13 run, cycle 171, requested pickup of Orange Tulip `item-1`, carrying to `(-2,3)`, a gentle throw toward `(0,3)` at `2 m/s`, retrieval, and placement at `(2,3)`. Gemma generated eight steps, but **no action executed**: “Objective and essential decision facts exceed checkpoint capacity; no facts were silently truncated”. This is a failed long-request playtest, separate from the successful restore replay.
- v14 addressed the initial capacity/throw-guidance problem, but exposed the false approach audit above. v15's full seven-action run is the successful follow-up; preserve both failures as historical evidence.
- **196/196 offline tests passed for v12.** Live cycle 170 completed “Walk to (6,8), then walk to (6,2), then rest on the Garden daybed.” All 4/4 steps completed in 68.10 simulation seconds, but two navigation recoveries were required while leaving a restored bed. Bed rest restored 27 energy points.
- A subsequent three-waypoint route around the bed verified. Ground destination dots matched panel markers, and the pillow-facing rest pose was checked visually.
- After resume, the existing Orange Tulip launched. Replaying the exact backup reproduced an unstable restored limb rig striking it. Do not report v12 as a clean pass or infer that completion text proves restoration physics is sound.
- Local reproduction evidence remains ignored: export `outputs/maker/evidence/v12-navigation-playtest.json` and backup named `v12-after-navigation-diagnostic.json`. Preserve these local inputs for replay; do not add private saves or exports to Git.
- **176/176 offline tests passed for v11.** Live cycle 168 completed “Wash at garden shower, then sit on park bench, then rest on garden daybed.” All six approach/use steps were verified in 88.17 simulation seconds.
- Recorded six-second effects: wash hygiene `79.90875 → 100` and comfort `+6`; sitting energy `+3` and comfort `+24`; bed rest energy `+27` and comfort capped at `100`.
- After that user request, Laya selected autonomous rest at the daybed, Gemma planned its approach/use, and the action succeeded with energy `40.58 → 67.58`.
- The v11 browser console had zero errors. The robot remained visually cohesive while reclining, and the recorded need-delta card was visible. Its arrival heading made it lie across the bed; the pillow-facing orientation was subsequently checked in v12.
- **162/162 offline tests passed for v10.** Bed and bench offline checks pass; this is not proof of complete live model-driven use.
- The v10 live wash → sit → bed-rest request verified shower approach and a six-second wash, restoring hygiene from approximately 77 to 100. The next planned move targeted the bench center `(2, -5)`, inside its collision shape, and failed with `planIndex=2`. That full request did not complete, and its live bench/bed interactions were not reached.
- The offline robot pose check covered ten activities over 1,051 sampled frames. It does not substitute for live physical interaction and visual review.
- **147/147 offline tests passed** for the previous v9 checkpoint.
- Live v9 completed the exact request **walk to (-4, 5) → dance → observe**. Critical hunger interrupted the request; the character printed and ate food, then resumed and verified all three requested steps.
- Live v9 also completed the explicit request **print one small edible orange, then eat it**: print → pickup of the printed object → eat. The first generated design passed, the physical object was consumed, and hunger decreased.
- The ivory-and-teal robot was visually checked while typing at the printer: connected joints, articulated body and screen face. The browser console had zero errors during that check.
- [PLAYTESTS.md](outputs/maker/PLAYTESTS.md) preserves exact outcomes, earlier failures, and checks still needed. These successful runs do not establish universal model reliability.

Preserve saves. Test in isolated worlds with separate save files. Do not run a second model-driven world competing for the local services, or source and frozen servers sharing a save.

## Implemented foundation

One robot character, Butterbot; six decaying needs; finite food; user and autonomous goals; ordered plans; feasible Laya choices and real probabilities; authoritative outcomes and Gemma step verification; bounded repairs; persistence; model scheduling; mutable memories; object metadata/inspection and local observation; exact decision-token budgeting; generated construction in a bounded compiler; physical object interactions; diagnostics. Only the old default name Agent Wobble migrates to Butterbot; custom names are preserved.

Objects expose validated mass, size and capabilities. Timed pickup/drop/throw/push/give/eat enforce range, ownership, lifting/force limits and food depletion. Generated food must be validated as edible food; names alone confer no capability. Prop mass now permits light objects down to 0.02 kg. Printer plans retain creation references so later steps act on the actual printed object.

The UI includes independent smooth activity/memory feeds with an initially equal adjustable split, semantic card colors, persistent failed-request status/retry, pause/resume, a small-screen collapsible panel, click-object information and action requests, colored destinations matching movement entries, and stale/consumed-object cleanup. The printer sits against the left fence with a keyboard, screen and muted-by-choice accepted-prompt double bell. The continuous lawn, neighborhood buildings and passing cars are scenery.

## Added in v14 and v15

- Compact decision contexts preserve the full objective, ordered plan, current step and every world-object name/position. The v14 context work passed 48 captured/physical-stage cases using the actual tokenizer; the later full suites were 208 tests for v14 and 213 for v15. Full raw context remains available in diagnostics.
- [execution-evidence.mjs](outputs/maker/execution-evidence.mjs) supplies the engine's exact completion criteria and a cloned action-time record to Gemma. Navigation shares a 0.18 m endpoint tolerance. Approach means reaching the chosen clear point beside the target, not an invented stricter distance to its center.
- Approach jobs/outcomes retain the actual selected navigation destination instead of unused `(0,0)` parameters; completed routes are marked arrived. `objectAtCompletion` captures immutable ownership and position, including the placement release point. Later settling does not undo a valid recorded release.
- Verifier prose and inference errors are separated from authoritative engine blockers. Compact retry status is used only when successful evidence matches the current step and cycle; full explanations remain recorded. This does not hide a failed action or convert a rejected audit into success.
- Coverage includes [verification-contract.test.mjs](outputs/maker/tests/verification-contract.test.mjs) and [decision-context-capacity.test.mjs](outputs/maker/tests/decision-context-capacity.test.mjs). Live success above is separate from the offline suite.

## Fixed in v13; first live replay passed

- Limb rigs restore in the saved posture, collider-support queries reflect current state immediately, and bed support selects the actual mattress rather than the wooden frame. The original saved-scene replay passed without the v12 launch or navigation recoveries.
- The old failing v12 diagnostic was preserved before restoring the original test scene. Keep the failure evidence and compare actual physical outcomes when extending regression coverage.

## Added in v12

- Bed rest can align toward the pillow rather than retain its approach heading. The v12 screenshot verifies that orientation, while the live route still needed recovery when leaving a restored bed.
- Reflection receives the full compact memory store (`id`, `kind`, `text` for every entry), not only three recalled texts. Recalled IDs remain relevance hints. Generated memories are kept out of the separately labeled authoritative-facts section.
- Gemma is instructed to revise/forget redundant paraphrases using exact IDs, preserving distinct facts, quantities, negation and subjective kinds. The memory engine retains exact-only normalization; it does not automatically delete semantic near-duplicates. Focused coverage is in [reflection-memory.test.mjs](outputs/maker/tests/reflection-memory.test.mjs).

## Added in v11

- Physical destination queries use the actual character capsule and current colliders. Planning validation and execution-time validation both reject occupied walking destinations. The check establishes destination occupancy, not a complete route planner.
- Object approaches select a clear ground point within interaction reach beside furniture instead of a fixed offset that can fall inside the object's geometry. Provider guidance asks for `approach(target)` when interacting with furniture.
- A blocked move/approach/place can request at most two Gemma repairs per goal, preserving the verified prefix. Records retain the failure and current blocker; unsuccessful actions are not credited as progress. The repair count and failure context persist through save/restore and need interruption/resumption.
- Implementation lives in `physics.mjs` (`groundMoveDestination`, `interactionApproach`), `actions.mjs` (plan/commit checks), `garden.mjs` (bounded recovery/persistence), and `providers.mjs` (grounded instructions). Existing `needs.mjs` and `autonomy.mjs` supply the need/action foundation.
- Focused regression files: [navigation destinations](outputs/maker/tests/navigation-destination.test.mjs), [provider grounding](outputs/maker/tests/navigation-grounding.test.mjs), [furniture approaches](outputs/maker/tests/interaction-approach.test.mjs), [navigation recovery](outputs/maker/tests/navigation-recovery.test.mjs), and [posture transitions](outputs/maker/tests/posture-transition.test.mjs). These are part of the 176-test checkpoint; the live rerun is separate evidence.

## Added in v10

- Energy, hunger, fun, hygiene, comfort and social need decay with actual simulation time. Successful physical actions apply bounded fulfillment once, using actual duration. Social cannot be fulfilled without another real nearby character; the default game remains single-character.
- The starter daybed, bench, shower and six-serving orange bowl are authored, usable objects. A saved installation marker adds the starter set once to older saves and preserves depletion/removal on subsequent restores. Reset intentionally restores the starter set.
- Bench and bed interactions require six seconds of stable supported use. Washing requires a verified tray/outlet, physical approach beneath the outlet, six seconds of water and cleanup on interruption/cancellation. Bed recovery remains a timed action, not a sleep-cycle simulation.
- Laya selects autonomous goals from grounded engine proposals; Gemma supplies the validated plan. The engine chooses critical-need interruptions, which also enter Gemma planning and ordinary Laya action selection. No proposal itself fulfills a need.
- `job.needFulfillment` and `action_outcome.needFulfillment` retain `{kind, elapsed, before, after}`. Completed action cards render only recorded deltas; hunger decreases count as improvements. Tooltips reveal before/after values and elapsed action time. Raw diagnostics retain full precision.
- Use-action records retain `use`, allowing specific captions even on failures. Reflections use the shorter “Thought” label. The Diagnostics panel links the existing debug session and export endpoints.
- Character navigation now uses a small downward bias when grounded and accumulated gravitational acceleration while airborne, replacing the earlier constant downward movement.

## Reliability changes through v9

- Completed steps retain their verified prefix during plan repair. A requested action and its prerequisites constrain selection so unrelated options do not repeatedly derail the plan.
- A plan-owned print step completes from actual materialization. Pickup, placement and use are separate steps linked to the created entity.
- New instructions preserve held objects. Execution-time validation failures become recorded failures. Failed user requests remain in `lastUserGoal` while autonomy continues.
- Critical need interruptions preserve and resume user work. Live v8 demonstrated rest interruption/resume; v9 demonstrated food creation/eating followed by exact user-plan resumption.
- Coordinate guidance no longer hardcodes the misleading example copied in the failed v8 request. The v9 exact-coordinate rerun passed.
- Light food, food-material planning and construction schema constraints were corrected. Both autonomous and explicit user orange-printing/eating runs passed in v9 without design repair.
- Repeated `remember` operations with the same kind and normalized identical text refresh the existing memory ID and recency instead of consuming a slot. Opposite/different facts, explicit revise/forget semantics and protected personality remain distinct. Five focused memory tests passed as part of the checkpoint work. Pre-existing duplicate IDs are not bulk-migrated.
- Construction prompts require self-contained Three.js meshes with real geometry/materials. Rejected source and its exact error feed bounded repairs. This does not guarantee visual resemblance to a requested object.

## Important interfaces and limits

- `environment-layout.mjs` is the shared printer layout for rendering, perception, navigation and physics. Avoid independent printer coordinates.
- Object-menu buttons submit ordinary character requests through `/api/objective`, using the current object ID/name and current available actions. They are not a direct action executor. Pause/resume uses `/api/control`.
- Movement records expose `jobStart` and `destination`; the UI matches `cycle + jobStart` with the active job for stable colors. Ordinary labels use a target name or “marked spot”; expanded diagnostics retain coordinates.
- Need-effect records are authoritative action effects at fulfillment time, not changes since action start. Do not reconstruct them from current need bars or nominal rates: intervening decay and clamping change those values. `/api/debug` preserves full records and the active job; `/api/debug/export` downloads them.
- Inspection descriptions and observation are engine metadata, not camera vision. All essential object names/positions must fit Laya's exact 512-token budget or fail explicitly.
- Mutable character memories are generated fiction with a 12-entry LRU limit; personality is separate. Rigid physics plus navigation provide assisted movement. Soft-body coupling is one-way and colliders approximate geometry.
- The local debug CLI is read-only by default; `--goal` explicitly submits work. Raw diagnostics, saved games, weights and runtimes are not committed.

Scoped earlier implementation notes: [object capabilities](outputs/maker/HANDOFF-attributes.md), [physics](outputs/maker/HANDOFF-physics.md), [debugging](outputs/maker/HANDOFF-debugging.md). Their checkpoint-specific “pending” statements may predate this integrated release; use current source, tests and this playtest record to establish status.

## Remaining work

1. **Polish the refused-plan status.** A blocked request with no plan still displays “Gemma is preparing the plan” in the collapsible row. Show a truthful blocked/refused state. Keep frozen v15 unchanged and rebuild a future release after source validation.
2. **Complete accommodation edge checks.** Check pause/cancellation, return to normal movement, starter installation, finite-food depletion/save/restore and reset semantics. v11's browser-console check passed; the full set of interaction poses and edge cases still needs review.
3. **Broader single-character playtests.** Exercise longer print/use plans, impossible requests, interrupted work, resource depletion, duplicate-memory retention, save/restore, and recovery after real model failures. Memory consolidation worked in the recorded v15 run but is not perfected; duplicates remain. Check outcomes rather than completion prose.
4. **Animation and layout review.** Review robot walking, carrying, throwing, eating, resting and typing from multiple angles; compare narrow and desktop layouts, object menus, destination colors and scrolling. One successful printer screenshot is not exhaustive visual QA.
5. **Portability.** Replace development-machine fallbacks, document a compatible Laya/Python installation and verify clean-clone setup. Model environments and weights are not bundled.
6. **Expand the cast only after the single-character loop holds up.** Follow [SOCIAL_PLAN.md](outputs/maker/SOCIAL_PLAN.md) for two visible independent robots, accepted paired conversations, actual participation and exactly-once mutual effects. It is a plan, not completed gameplay. The social bar and existing multi-actor plumbing do not mean companions are enabled. A full sleep cycle also remains unimplemented.

## Continue safely

Run `node --test tests/*.test.mjs` from `outputs/maker` for the current source, with the exact tokenizer configured. Rebuild UI via `node work/build-ui.cjs` at the root. Keep prior frozen applications immutable. Freeze a new version only after meaningful regressions pass, preserve the save, then run player-style tests against that single live release and update this record with actual results.

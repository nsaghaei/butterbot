# Gameplay verification

These are observations from the actual local game using Gemma and Laya. Offline regressions are separate: **v11 passed 176/176; v10 passed 162/162; v9 passed 147/147**. Saved scenes, prompts and raw diagnostic exports stay outside Git.

## September 25, 2026 — frozen v11

Build `2026-09-25.11` is live. Physical capsule checks reject occupied walking destinations at planning and commit time, furniture approaches select clear ground, and runtime route failures allow two bounded remaining-plan repairs while retaining verified steps and the persisted repair budget.

| Check | Current evidence |
| --- | --- |
| Full offline regression suite. | **176/176 passed.** Includes destination occupancy, clear furniture approach, posture and navigation-recovery coverage. |
| “Wash at garden shower, then sit on park bench, then rest on garden daybed.” | **Completed, all 6/6 steps verified, cycle 168, 88.17 simulation seconds.** Gemma planned approach/wash → approach/sit → approach/rest. Each use lasted six seconds. Wash changed hygiene `79.90875 → 100` (clamped) and comfort `+6`. Sitting changed energy `+3`, comfort `+24`. Bed rest changed energy `+27`, with comfort capped at `100`. |
| Autonomous activity after user completion. | **Completed.** Laya chose rest at the Garden daybed; Gemma supplied approach/use steps. Bed rest succeeded, changing energy approximately `40.58 → 67.58`. |
| Browser and visual review. | **Zero browser-console errors.** The robot remained cohesive while reclining and the recorded need-delta card was visible. Known visual issue: arrival heading is retained, so it lies across the bed instead of along the pillow axis. Bed alignment is a v12 follow-up, not a completed v11 fix. |

These are successful runs of the tested requests; they do not establish general pathfinding or complete social gameplay. The game still runs one character.

## September 25, 2026 — frozen v10

Build `2026-09-25.10` introduces the starter daybed, bench, shower and six finite orange servings; six decaying needs; physically timed fulfillment; grounded self-goal planning; save migration/depletion preservation; and recorded need deltas in the UI.

| Check | Current evidence |
| --- | --- |
| Full offline regression suite. | **162/162 passed.** This includes passing bed/bench offline checks, which do not establish successful live model-driven use. |
| Robot pose checks. | Offline check covered ten activities and 1,051 sampled frames. Live interaction appearance still needs review. |
| Combined wash → sit → bed-rest request. | **Failed after two verified steps.** Shower approach and the six-second wash succeeded. Hygiene rose from approximately 77 to 100 with a recorded engine need effect. The next Gemma step tried to move to `(2, -5)`, inside the bench, and hit a route failure at `planIndex=2`. Live bench and bed use were not reached. |
| Robot and starter furniture view. | Rendered coherently in the initial v10 view. Final browser-console review and the full set of interaction poses remain pending. |
| Starter save upgrade, depletion and reset. | Offline suite passed; a live depletion/reload/reset result has not yet been recorded. Reloading must preserve finite servings and removed objects; reset should restore the starter layout. |

The default game still has one character. A decaying social bar is not a successful social interaction, and bed recovery does not establish a sleep cycle.

The v11 checkpoint adds destination/approach validation and bounded remaining-plan repair for this failure; its independent verification is recorded above.

## September 25, 2026 — frozen v9

Tests used the existing game at `http://127.0.0.1:8790/` through the player UI and its real local models. No second model-driven world was used for these runs.

| Player request / check | Observed result |
| --- | --- |
| Walk to (-4, 5), then dance, then observe your surroundings. | **Completed, 3/3 steps verified.** Critical hunger at 100 interrupted the request. The character printed an Edible Orange (`item-2`); the first generated design passed and Laya approved PRINT. Eating removed the physical food and reduced hunger from 100 to 75. The character resumed the user request, walked to the exact requested destination, danced for four seconds, and observed for two seconds. All requested steps were verified complete. |
| Print one small edible orange and then eat it. | **Completed, 3/3 steps, cycle 154.** Plan: print → pickup `$step1` → eat `$step1`. The first generated Small Edible Orange design passed without a repair loop. Physical `item-3` was created and consumed; hunger fell from approximately 78 to 53. The run took approximately 83 simulation seconds. |
| Robot visual and browser check. | The ivory-and-teal robot appeared cohesive at the printer, with connected articulated joints, a screen face and a typing pose. The browser console reported zero errors during the check. This was not an exhaustive review of every pose or viewport. |
| Mobile layout at 375 × 667. | **Passed the checked layout.** Collapsing activity preserved the composer and playable garden without overflow. Other viewport sizes and expanded interactions still need broader review. |

These runs verify the tested exact-destination prompt fix, critical-need interruption/resumption, light edible construction, food material/schema handling, printed-object references and physical consumption. They do not prove that every generated design, plan or recovery path succeeds.

## September 25, 2026 — frozen v8

| Player request / check | Observed result | Follow-up |
| --- | --- | --- |
| Carry the already-held tulip to (2, 3), then place it. | **Completed.** The held object was carried to the destination and placed. | Continue longer object-use and save/restore tests. |
| Walk to the sunny pad, dance, then observe. | **Completed.** Critical rest interrupted the plan; the character rested, resumed, danced and observed. | Hunger interruption/resumption subsequently passed in v9. |
| Walk to the exact destination (-4, 5), then dance, then observe. | **Failed during planning.** A hardcoded prompt example was copied as (-2, 5), replacing the requested coordinate. | Source prompt corrected; exact (-4, 5) rerun passed in v9. |
| Print a small edible orange, then eat it. | **Failed during construction/planning.** The generated 0.15 kg fruit conflicted with the old 0.2 kg minimum; prop/store planning also blocked the intended food flow. | Lowered prop minimum to 0.02 kg and corrected food planning/schema constraints. Autonomous and explicit user versions passed in v9. |

## September 25, 2026 — frozen v7

The saved scene was backed up before deployment. Tests used the player composer at port 8790; diagnostics came from that same running server.

| Player request | Observed result | Required fix at the time |
| --- | --- | --- |
| Walk to (2, 3), then dance, then observe your surroundings. | Gemma made the correct three-step plan. Walking succeeded and was verified. Laya repeatedly selected an unrelated sunny-pad walk instead of dancing. Replanning restarted completed work; the action budget eventually failed the request. | Offer the current plan step and prerequisites; preserve verified steps during repair. |
| Print a small orange flower. | Gemma generated an Orange Tulip, Laya approved PRINT, and physical `item-1` appeared. The subsequent collection menu offered waiting; Laya selected it three times and falsely reported that creation had failed. | Complete plan-owned printing after materialization; represent pickup/placement/use as separate steps. |
| Pick up the Orange Tulip (item-1), carry it to (2, 3), then put it down. | Pickup succeeded and the object remained held. Laya wandered into unrelated inspection. The proposed remaining move/drop plan was rejected because pickup was absent despite having succeeded. | Validate the remaining plan together with its verified prefix. |

The left-fence printer, keyboard/screen, continuous lawn, neighborhood houses, passing cars and differentiated activity-card colors rendered without browser errors. The narrow layout left too little world space, and the old human avatar showed separated body segments. Responsive UI changes followed in v8; a cohesive robot replaced the old avatar in v9. The game was paused after the v7 tests with the flower held. None of these three v7 requests is recorded as fully successful.

## Remaining verification

Align bed-rest orientation in the next release and complete the outstanding accommodation edge checks, then continue player-style runs for longer creation/use sequences, impossible physical requests, depleted resources, save/restore continuity, repeated inspections without memory flooding, and recovery after rejected model output. Review robot walking, carrying, resting, eating, throwing and typing, plus narrow/desktop layouts, object menus and matching movement colors. The v9 mobile pass is a baseline; repeat it after layout changes. Judge physical effects and recorded evidence, not completion text alone.

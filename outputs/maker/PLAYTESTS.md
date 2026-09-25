# Gameplay verification

These are observations from the actual local game using Gemma and Laya. Offline regressions are separate: **v18 passed 275/275; v17 266/266; v16 252/252; v15 213/213; v14 208/208; v13 202/202; v12 196/196; v11 176/176; v10 162/162; v9 147/147**. Saved scenes, prompts and raw diagnostic exports stay outside Git.

## September 25, 2026 — frozen v18

Build `2026-09-25.18` is the current live release. **275/275 offline tests passed in 8.44 seconds.** Butterbot and Pip are both visible independent robots. This verifies the first duo milestone, not the full social simulation.

| Check | Observed result |
| --- | --- |
| “Go chat with Pip about your favorite things in this garden.” | **Passed, cycle 178, 1/1 plan step verified.** Replayed the v17 failed save with Pip still walking. Gemma proposed `socialize`. Waiting began at 4862.60; Pip's existing walk was audited successfully at 4865.73; Laya accepted at 4866.02. Both approached and faced each other. No errors, retries or navigation recoveries occurred. |
| Mid-speech pause/resume. | **Passed.** Butterbot's line lasted 5.48 seconds. A deliberate API pause at 2.0167 seconds into it, followed by the actual UI Resume, preserved the session. Pip then delivered a six-second reply. Both complete transcript turns were recorded at 4886.4. |
| Actual social effects and final audit. | **11.48 seconds actual nearby participation.** The ten-second reward cap gave each robot social +40 and fun +6 once. Inference/availability waiting earned no reward. Gemma verified completion at 4890.48. The game was saved and paused afterward. |
| Desktop, mobile and selected character panel. | Robots and speech bubble looked cohesive. At **375 × 812**, cast controls, needs, goal, feeds, memory and composer fit; normal viewport was restored. Browser console had **zero errors**. Selecting Pip showed **74.8% accept / 25.2% decline** and one memory from its delivered line. |
| “Pick up the Orange Tulip (item-1), carry it over to Pip, and give it to Pip.” | **Passed, cycle 179, 3/3 steps verified:** pickup → approach → give. Pip finished its requested walk before the handoff, then self-planned eating. This verifies a **stationary recipient** only. |
| Moving-recipient gift audit. | **Unfinished.** An offline audit found that a moving recipient can leave the 2 m transfer range, and a gift can fill hands during the recipient's own pickup job. Reservation and recipient-consent work remains necessary; the stationary live success does not establish moving-gift reliability. |

Local ignored evidence: `evidence/v18-verified-conversation.json`. The current two-turn conversation can end on an unanswered question; longer exchanges, relationships, consensual gifts and clearer lifecycle records remain continuation work. See [SOCIAL_PLAN.md](SOCIAL_PLAN.md).

## September 25, 2026 — frozen v17

**266/266 offline tests passed**, but the real conversation attempt failed.

| Check | Observed result |
| --- | --- |
| Same chat request, cycle 177. | **Failed availability race.** Approach to Pip succeeded and was verified while Pip started a self-directed walk. The following socialize action failed because Pip was unavailable. No pair session was created, so this attempt did not demonstrate the pause fix live. |

v18 added waiting for a noncritical self-directed partner activity and its audit, then replayed this saved state successfully. Waiting still does not imply acceptance or permit overriding another user's work.

## September 25, 2026 — frozen v16

**252/252 offline tests passed**, but the first real conversation did not complete.

| Check | Observed result |
| --- | --- |
| Same chat request, cycle 176. | Gemma proposed one socialize step and Laya accepted. The robots walked/faced each other; Butterbot's generated line began. Pausing for a screenshot around one second into its six-second delivery bumped participant revisions. Resuming canceled the session as changed participants and left Butterbot's job orphaned in socializing. **Zero fully delivered transcript turns and zero social effects.** |
| Initial visual/browser check. | Both robots and the speaking pose were visible; browser reported zero errors during the initial check. This did not establish session completion or pause safety. |

The ignored export `evidence/v16-paused-conversation-failure.json` preserves this failure. Later changes preserve participant revisions and phase deadlines during pause, finish stale canceled jobs safely, recover orphaned sessions on reload and share model slots across reset. v18 supplies the actual successful mid-speech replay; do not retroactively mark v16 successful.

## September 25, 2026 — frozen v15

Historical build `2026-09-25.15` established the following single-character outcomes. Gemma receives exact engine execution criteria and immutable completion evidence; compact Laya context separates verification prose from real engine blockers.

| Check | Observed result |
| --- | --- |
| Full offline regression suite. | **213/213 passed.** |
| “Pick up the Orange Tulip (item-1), carry it to (-2,3), gently throw it toward (0,3) at 2 m/s, go retrieve it, and place it at (2,3).” | **Passed, cycle 174: 7/7 physical actions and seven successful Gemma audits.** Pickup → move `(-2,3)` → throw toward `(0,3)` at `2 m/s` → approach the actual landed item → pickup → move `(2,3)` → place `(2,3)`. Initial approach was omitted because the object was already nearby. No `not_verified`, error or navigation recovery occurred. |
| Duration and final placement. | First plan proposal `4700.6667`, first physical completion `4703.1`, final result `4747.8667`: **47.20 simulation seconds from plan proposal to completion**. Recorded release was `(2, 0.6825, 3)`, `carried:false`, `carrier:null`. The object settled near `(2.0062, 0.5614, 2.9574)`; later settling did not invalidate the actual release. |
| “Eat the park bench.” | **Correctly rejected, cycle 175.** One unsupported activity plan explained that the wooden bench has `edible:false`. Zero actions and no three-attempt retry loop. |
| Memory curation. | Reflections across cycles 174/175 consolidated **12 entries to eight**. Some duplicates remain; this is useful progress, not perfected semantic memory. |
| Browser and visible cards. | Browser console error list was empty. Successful placement and refusal cards were visually verified. Minor issue: the refused no-plan request still says “Gemma is preparing the plan” in the collapsible plan row. Frozen v15 remains unchanged; later UI source corrected that status text. |

The export `evidence/v15-object-sequence.json` remains local ignored evidence. These historical successes did not complete the broader simulation; the first [social milestone](SOCIAL_PLAN.md) was subsequently verified in v18.

## September 25, 2026 — frozen v14

| Check | Observed result |
| --- | --- |
| Offline regression and context checks. | **208/208 tests passed.** Context development also passed 48 captured/physical-stage cases with the actual tokenizer while retaining the full objective, ordered plan and all object names/positions. |
| Same long tulip story, cycle 173. | **Failed after five successful engine jobs and four verified steps.** Approach, pickup, carry, throw at `2 m/s`, and approach to the actual landed flower all physically completed. Gemma falsely rejected the final approach at roughly 1.5 m object distance despite arrival at its chosen safe endpoint. The verbose rejection then overflowed Laya's available context budget. The remaining pickup/placement did not complete. |

This failure motivated v15's exact 0.18 m endpoint criterion, recorded arrival/destination, immutable object-at-completion evidence and compact retry status only for matching successful current-step evidence. The complete successful rerun is recorded above; the v14 failure remains part of the history.

## September 25, 2026 — frozen v13

Build `2026-09-25.13` replayed the original pre-v12 save, including its old reclining height, after preserving the v12 failure diagnostic.

| Check | Observed result |
| --- | --- |
| Full offline regression suite. | **202/202 passed.** |
| Original-save replay: “Walk to (6,8), then walk to (6,2), then rest on the Garden daybed.” | **Clean pass: 4/4 steps and four actual outcomes completed, cycle 170, 40.55 simulation seconds. Zero navigation recoveries or replans.** |
| Orange Tulip stability. | Stayed at approximately `(2.28953, 0.23981, 2.49450)`; no launch during the original-save replay. |
| Mattress support, orientation and recovery. | Rest center approximately `y=0.87`, heading `π`, above the actual mattress and facing the pillow; screenshot verified. Bed rest added 27 energy points, reaching 90.32; comfort capped at 100. |
| “Pick up the Orange Tulip (item-1), carry it to (-2,3), gently throw it toward (0,3) at 2 m/s, go retrieve it, and place it at (2,3).” | **Failed before any action, cycle 171.** Gemma generated eight plan steps. Laya decision preparation stopped with: “Objective and essential decision facts exceed checkpoint capacity; no facts were silently truncated”. The long object story did not pass. |

The tested restore/support correction passed its reproduction. v14 addressed the initial context capacity and throw/retrieval guidance but exposed a false approach audit; v15 subsequently completed the full object sequence. Social gameplay was not enabled in this historical release; see the later v18 milestone above.

## September 25, 2026 — frozen v12, mixed result

Build `2026-09-25.12` produced a mixed result. Passing regressions and completed goals did not prevent the restoration defect below.

| Check | Observed result |
| --- | --- |
| Full offline regression suite. | **196/196 passed.** This does not establish stable restored physics in the observed live scene. |
| “Walk to (6,8), then walk to (6,2), then rest on the Garden daybed.” | **Completed 4/4 steps, cycle 170, 68.10 simulation seconds**, but required **two navigation recoveries** while leaving a restored bed. Bed rest added 27 energy points. This was not an uninterrupted clean run. |
| Subsequent three-waypoint route around the bed. | **Verified.** Ground destination dots matched the right-panel markers. |
| Rest orientation. | Pillow-facing bed rest was visually verified. This confirms the checked orientation, not the absence of support or restore defects. |
| Existing Orange Tulip after resume. | **Failed physical stability check.** The tulip launched; replaying the exact backup reproduced the restored limb rig destabilizing and striking it. |

The diagnostic export `evidence/v12-navigation-playtest.json` and backup named `v12-after-navigation-diagnostic.json` remain local ignored evidence. This failure prompted v13's posture-aware rig restoration, immediate collider-support queries and mattress selection; the independent replay result is recorded above.

The [first social milestone](SOCIAL_PLAN.md) remains future continuation work after single-character stability; companions are not enabled by this release.

## September 25, 2026 — frozen v11

Build `2026-09-25.11` introduced physical capsule checks that reject occupied walking destinations at planning and commit time, clear furniture approaches, and two bounded remaining-plan repairs after route failures while retaining verified steps and the persisted repair budget.

| Check | Current evidence |
| --- | --- |
| Full offline regression suite. | **176/176 passed.** Includes destination occupancy, clear furniture approach, posture and navigation-recovery coverage. |
| “Wash at garden shower, then sit on park bench, then rest on garden daybed.” | **Completed, all 6/6 steps verified, cycle 168, 88.17 simulation seconds.** Gemma planned approach/wash → approach/sit → approach/rest. Each use lasted six seconds. Wash changed hygiene `79.90875 → 100` (clamped) and comfort `+6`. Sitting changed energy `+3`, comfort `+24`. Bed rest changed energy `+27`, with comfort capped at `100`. |
| Autonomous activity after user completion. | **Completed.** Laya chose rest at the Garden daybed; Gemma supplied approach/use steps. Bed rest succeeded, changing energy approximately `40.58 → 67.58`. |
| Browser and visual review. | **Zero browser-console errors.** The robot remained cohesive while reclining and the recorded need-delta card was visible. Known visual issue: arrival heading is retained, so it lies across the bed instead of along the pillow axis. Bed-pillow and bench-front orientation are v12 follow-ups, not completed v11 fixes. |

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

Continue moving/busy-recipient gift reservations and consent; the v18 handoff used a stationary recipient. Improve two-turn conversation closure and noisy lifecycle records, then broaden real-model reassignment, critical-need, separation, timeout, reset/reload and provider-failure checks. Preserve unrelated user work and apply effects once. Continue accommodation edge checks, resource depletion, longer creation/use plans, memory consolidation and remaining poses/viewports. The recorded v18 mobile and pause/resume checks are successful baselines, not exhaustive coverage. Judge physical effects and recorded evidence, not generated completion text alone.

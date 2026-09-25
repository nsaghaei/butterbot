# Butterbot

A local, experimental life simulation where you give a character an objective and watch it plan, choose actions, remember observations, and interact with a physical world.

The current game is **Maker Garden**: Butterbot and Pip, a garden, and a printer that constructs objects from generated Three.js geometry. The larger goal is an expressive Sims-like neighborhood with useful memories, meaningful needs, distinct personalities, and creative solutions to player requests. That broader game is unfinished.

## Current checkpoint

The launcher selects **frozen v23**, build `2026-09-25.23`. **340/340 offline tests passed.** Retrying Pip’s preserved snack request produced the correct first Gemma plan: drop the tulip → approach the orange bowl → eat. All three steps and independent audits completed. A mid-eating pause confirmed that Pip actually carried the bowl, the tulip was on the ground and no serving had yet been consumed. After UI Resume, exactly one serving was eaten, bowl **2 → 1**, with hunger **20.6268 → 0**, energy **+2** and comfort **+3**.

The runtime now requires actual held food and rejects unrelated occupied hands or invalidated food/carry state. The planner checks prospective hand use before actions and returns specific corrections to Gemma; the engine does not insert a scripted drop. This first-plan live pass verifies the tested snack case, not every generated plan. The screenshot showed the bowl at Pip’s mouth and flower on the floor; the completed paused UI was confirmed and the browser console had zero captured errors.

A second v23 request, “Print a small edible orange, pick it up, and give it to Pip”, **failed**. The plan correctly referenced the future printed object, but construction selected polymer and all three attempts were rejected because only food material can be edible. No object materialized and no pickup or gift occurred. Edibility was not carried into construction constraints when later steps required only pickup/give. A subsequent reflection also failed with “Memory edit referenced an unknown entry”. Explicit creation-capability planning and these remaining checks are v24 work, not shipped v23 fixes.

Historical v20 gift verification passed with **87.93% accept / 12.07% decline**. Contact occurred at 1.628 m and changed owner/carrier from Butterbot to Pip; giving invented no social reward. Both give/receive arm poses were checked while paused. This fixes v19's failure when a recipient temporarily held food during its own eating action. The browser console had zero errors. The actual 375 × 812 gift-result view fit cast, needs, goal, cards, memory and composer without horizontal overflow.

Earlier v18 completed the first two-robot conversation, including waiting for Pip's walk and pausing mid-speech: 11.48 seconds of actual participation, with capped social `+40` and fun `+6` applied to each once. v15 completed the seven-action tulip carry/throw/retrieve/place sequence and rejected “Eat the park bench” before action. These remain historical results. Memory curation improved but duplicates remain; a v20 post-completion reflection falsely described still waiting to present the already-transferred tulip. v21 now puts the current goal, verified steps and ownership ahead of historical failures/inspections, and discards reflection output if lifecycle or completion evidence changes during inference. Broader reflection reliability, natural conversation closure and relationships remain unfinished.

v15 supplies Gemma the engine's exact completion criteria and immutable action-time evidence. Approaching means reaching the selected clear point beside an object, within 0.18 m, rather than touching its center. Placement is checked against the recorded release before gravity settles the object. Compact Laya context preserves the full objective, ordered plan and all object names/positions; full verification prose stays in diagnostics.

Navigation validates destinations against the character capsule at planning and execution, finds clear furniture approaches, and allows two bounded repairs of a blocked route's remaining plan. Verified steps and the repair budget survive save/restore; this is not a general route planner.

The garden has six decaying needs, a starter daybed, bench, physical shower and six finite orange servings, with recovery tied to completed actions and their actual duration.

Earlier verified runs include v11's complete wash → sit → bed-rest request and autonomous follow-on rest, and v9's exact walk/dance/observation and print-orange/eat requests. These remain historical results, not verification of every later change. See [PLAYTESTS.md](outputs/maker/PLAYTESTS.md) for outcomes and [HANDOFF.md](HANDOFF.md) for continuation work.

The foundation includes independent user and autonomous goals, physical object interactions, persistence, bounded construction generation, diagnostics and deduplicated memories. Each robot has its own personality, needs and memory. Reflection receives the complete editable memory store, so Gemma can revise or forget paraphrases without automatic semantic deletion. The needs are energy, hunger, fun, hygiene, comfort and social. The [first social milestone](outputs/maker/SOCIAL_PLAN.md) is implemented and tested; a larger social simulation and full sleep cycle remain future work.

## How it works

**Gemma** proposes ordered plans, thoughts, reflections, memory edits, and construction code. **Laya** chooses from the options offered by the engine. The engine validates capabilities and preconditions, performs physical actions, and records outcomes. Gemma checks the engine evidence before a plan step advances. Model output alone cannot create a successful physical outcome.

Laya selects autonomous goals from grounded proposals; Gemma turns the chosen proposal into a validated plan. Critical needs can interrupt a user request, route through the same planning/action checks, and then resume the preserved request. The daybed and bench require six seconds of supported use. Washing requires reaching the shower tray and spending six seconds beneath the outlet. Need changes appear on completed action cards from recorded before/after values. Resting on a bed is a timed recovery action, not a sleep-cycle simulation.

Objects have names, descriptions, positions, dimensions, weight, and supported interactions such as portable, edible, throwable, giftable, and anchored. An object named “orange” is only edible when its validated capabilities and material permit eating. Inspection and observation use engine metadata, not camera recognition.

Conversation is a physical `socialize` job between actual character brains. Laya accepts or declines an invitation; Gemma writes each speaker's short turn using that speaker's private memory, verified surroundings and already delivered dialogue. Generated words are proposals until timed nearby delivery completes. Waiting for availability or inference gives no social reward. Fresh scenes use two robots; saved casts are respected, and reset keeps the current cast.

Giving uses a paired gift session with recipient acceptance, participant reservations, a physical approach and timed give/receive gesture. A busy recipient can finish its current eligible job and audit before its hands are checked; an occupied ready recipient is rejected without forcing a drop. Transfer evidence records actual ownership and contact separately from gesture completion, including cancellation after contact.

The activity panel keeps offered choices and model probabilities visible. Select Butterbot or Pip with the cast buttons to view that character's goals, needs and memories; sending stays disabled until the selection request and matching state update both arrive. Both robots have distinct colors and named thought/speech bubbles. Thoughts/decisions and memories start at equal height with an adjustable divider and independent scrolling. Cards distinguish printing, planning, verification, actions, observations, conversation, gifts and failures. Invitation cards show accept/decline probabilities; generated speech, delivered transcripts, gift acceptance and physical transfer are labeled separately. A stable destination marker matches the movement entry. On small screens, activity can collapse to give the garden more room. Click an object or robot to inspect it and ask the selected character to perform an available action. **Pause/Resume**, sound mute, persistent failed-request retry, and **Reset everything** are available. Reset clears generated objects, goals and mutable memories and restores the starter layout. Save upgrades install starter objects once; reloading preserves food depletion.

The neighborhood backdrop, passing cars, and printer feedback are visual presentation. Generated construction code runs inside a bounded QuickJS worker without host filesystem or network access. Motion combines navigation control and articulated physics; it is assisted rather than unassisted biomechanical locomotion.

## Run locally

Development uses Windows, PowerShell, Node.js, Python, and separate local model services. Model weights, Python environments, Ollama, dependencies, and saved games are not included. Clean-clone model setup is not yet verified.

1. Install JavaScript dependencies:

   ```powershell
   cd outputs/maker
   pnpm install --frozen-lockfile
   ```

2. Provide a Python environment with the compatible `laya` package and Laya checkpoint, then start the adapter:

   ```powershell
   python laya-adapter.py --model C:/models/laya --port 8766
   ```

3. Run Ollama on port **11435** with the configured model installed. The default is `gemma4:12b`; `GENERATOR_MODEL` can select another installed model. There is no reproducible model-environment installer yet.

4. Configure the exact tokenizer and start the frozen application:

   ```powershell
   $env:TOKENIZER_PYTHON = 'C:/path/to/python.exe'
   $env:LAYA_TOKENIZER = 'C:/models/laya/tokenizer/tokenizer.json'
   ./start.ps1
   ```

5. Open **http://127.0.0.1:8790/** and enter a goal in the bottom composer. Start with a short walk, dance, or observation before a construction request.

The launcher starts the selected frozen server in a hidden process, shares `saved/garden-v2.json` and installed dependencies, and refuses a second server on port 8790. It does not install or start model services. Configure tokenizer paths explicitly on another machine; development-machine fallbacks remain in source. Local installation details are in [outputs/maker/README.md](outputs/maker/README.md).

To run working source, first stop the existing game server, then run `node server.mjs` from `outputs/maker`. Never run source and frozen servers against the same save concurrently.

### Configuration

| Variable | Purpose / default |
| --- | --- |
| `LAYA_URL` | Selection adapter, `http://127.0.0.1:8766` |
| `GENERATOR_URL` | Ollama server, `http://127.0.0.1:11435` |
| `GENERATOR_MODEL` | Model name, `gemma4:12b` |
| `TOKENIZER_PYTHON` | Python executable for exact decision-token checks |
| `LAYA_TOKENIZER` | Checkpoint `tokenizer.json` path |
| `PORT` | Source server port, `8790` |
| `SAVE_FILE` | Source save; defaults to `saved/garden-v2.json` |

Unavailable models produce visible failures. Laya's 512-token context is checked with the exact tokenizer. Essential object names and positions are not silently omitted to squeeze an oversized decision into the limit.

## Development and debugging

From `outputs/maker`:

```powershell
node --test tests/*.test.mjs
node debug.mjs --help
node debug.mjs --out debug-report.json
```

Tests use isolated worlds; context tests also need the configured tokenizer. The debug CLI reads the running server without submitting a goal by default. Its optional `--goal` submits an objective. Reports and the local journal preserve actual decisions, inputs, errors, and outcomes. The interface's Diagnostics section provides **Debug session** and **Export debug**, including recorded need effects.

From the repository root, run `node work/build-ui.cjs` to build the browser bundle from `work/ui-scene.mjs` and `work/ui-main.mjs`. After verification, `work/freeze-release.ps1 -Release <new-version>` creates a new frozen release. Existing release directories must never be overwritten. The project does not change PowerShell execution policy.

| Path | Contents |
| --- | --- |
| `outputs/maker/` | Working simulation, adapters, server, compiler and tests |
| `outputs/maker/web-next/` | Browser interface and character rendering |
| `outputs/maker/needs.mjs`, `autonomy.mjs` | Need decay, physical fulfillment, starter objects and grounded goal proposals |
| `outputs/maker/tests/` | Includes capsule destinations, clear furniture approaches, posture transitions and bounded navigation recovery |
| `outputs/maker/execution-evidence.mjs` | Recorded completion evidence and shared navigation tolerance for verification |
| `outputs/maker/social-jobs.mjs` | Paired conversation/gift sessions, actual delivery/transfer, cancellation and effects |
| `outputs/maker/releases/` | Immutable application checkpoints; launcher defaults to v23 |
| `outputs/maker/HANDOFF-*.md` | Scoped implementation notes; some describe earlier checkpoints |
| `work/` | Tracked UI build and release scripts |

Dependencies are pinned in `pnpm-lock.yaml`; bundled Ammo files retain their attribution. Model downloads, installed dependencies, logs, saved scenes, and raw playtest evidence are excluded from Git.

Next, broaden food/hand invalidation, interrupted meal, reflection and memory checks. The held-flower eating case passed in v23 after v22 first blocked it honestly. Gift rendering still shifts the object about 29.7 cm on the next frame at the tested spacing; no new visual blend fixes it. Broader card cleanup, conversation endings, relationships, a full sleep cycle and verified clean-machine installation remain unfinished.

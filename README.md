# Butterbot

A local, experimental life simulation where you give a character an objective and watch it plan, choose actions, remember observations, and interact with a physical world.

The current game is **Maker Garden**: Butterbot and Pip, a garden, and a printer that constructs objects from generated Three.js geometry. The larger goal is an expressive Sims-like neighborhood with useful memories, meaningful needs, distinct personalities, and creative solutions to player requests. That broader game is unfinished.

## Current checkpoint

The launcher selects **frozen v26**, build `2026-09-25.26`. **376/376 offline tests passed in 10.859 seconds.** The last published checkpoint is v25 (`a56231f`, `checkpoint-2026-09-25-v25`). Butterbot and Pip have independent goals, needs and memories; they can move, inspect and handle physical objects, use garden furniture, converse, and offer consented gifts. The printer generates objects whose capabilities are checked before use. This is a playable foundation for the larger Sims-like goal, which remains unfinished.

v26 passed both the continued request and a separate fresh UI request to print a small edible orange, pick it up, and give it to Pip. Retry preserved the original print/pickup proof and transferred the same orange once. The fresh run created exactly one edible orange with one untouched serving, completed **3/3 verified steps**, and gave it to Pip without construction repair. Both browser consoles had zero captured errors. A later post-goal reflection failed JSON parsing; its eight memories stayed unchanged, and the cause remains unproven. The temporary fresh test was closed; the original user garden remains saved/paused. Broader reliability, reflection quality and receiver alignment remain unfinished. See [PLAYTESTS.md](outputs/maker/PLAYTESTS.md), [HANDOFF.md](HANDOFF.md) and the [social milestone](outputs/maker/SOCIAL_PLAN.md) for detailed evidence and continuation work.

## How it works

**Gemma** proposes ordered plans, thoughts, reflections, memory edits, and construction code. **Laya** chooses from the options offered by the engine. The engine validates capabilities and preconditions, performs physical actions, and records outcomes. Gemma checks the engine evidence before a plan step advances. Model output alone cannot create a successful physical outcome.

Each robot has its own personality, complete editable memory store and six needs: energy, hunger, fun, hygiene, comfort and social. Reflection can revise or forget exact memory IDs; generated memories are fictional and semantic curation remains imperfect. The starter layout supplies a daybed, bench, shower and finite orange servings.

Laya selects autonomous goals from grounded proposals; Gemma turns the chosen proposal into a validated plan. Critical needs can interrupt a user request, route through the same planning/action checks, and then resume the preserved request. The daybed and bench require six seconds of supported use. Washing requires reaching the shower tray and spending six seconds beneath the outlet. Need changes appear on completed action cards from recorded before/after values. Resting on a bed is a timed recovery action, not a sleep-cycle simulation.

Navigation checks character clearance at planning and execution, finds furniture approaches and permits bounded repairs while retaining verified progress. Retry preserves authentic completion evidence and existing generated objects. This is assisted movement, not a general route planner.

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
| `outputs/maker/releases/` | Immutable application checkpoints; launcher defaults to v26 |
| `outputs/maker/HANDOFF-*.md` | Scoped implementation notes; some describe earlier checkpoints |
| `work/` | Tracked UI build and release scripts |

Dependencies are pinned in `pnpm-lock.yaml`; bundled Ammo files retain their attribution. Model downloads, installed dependencies, logs, saved scenes, and raw playtest evidence are excluded from Git.

Next, capture raw failed model responses and finish reasons to investigate the post-gift reflection parse error, then broaden decision-context coverage while preserving required facts. Continue food/hand invalidation, interrupted meal, reflection and memory checks. The held-flower eating case passed in v23 after v22 first blocked it honestly. Rigid-gift smoothing passes offline regressions but still needs live handoff review; soft-body node handoff and receiver hand alignment remain unfinished. Broader card cleanup, conversation endings, relationships, a full sleep cycle and verified clean-machine installation remain unfinished.

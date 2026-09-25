# Butterbot

A local, experimental life simulation where you give a character an objective and watch it plan, choose actions, remember observations, and interact with a physical world.

The current game is **Maker Garden**: one character, a garden, and a printer that constructs objects from generated Three.js geometry. The larger goal is an expressive Sims-like neighborhood with useful memories, meaningful needs, distinct personalities, and creative solutions to player requests. That broader game is unfinished.

## Current checkpoint

The launcher selects **frozen v15**, build `2026-09-25.15`. **213/213 offline tests passed.** The full tulip pickup → carry → throw → retrieve → place request completed **all seven physical actions and all seven Gemma audits**, with no errors, rejected audits or navigation recoveries. Retrieval followed the actual landed object; placement recorded its release at the requested point.

“Eat the park bench” was rejected by the first proposed plan with the precise wood/`edible:false` explanation and zero actions. The placement/refusal cards were visually verified and the browser console had no errors. Memory curation reduced 12 entries to eight, although duplicates remain. One UI follow-up: a refused request without a plan still shows “Gemma is preparing the plan” in the collapsed plan row. The broader Sims-like game remains unfinished.

v15 supplies Gemma the engine's exact completion criteria and immutable action-time evidence. Approaching means reaching the selected clear point beside an object, within 0.18 m, rather than touching its center. Placement is checked against the recorded release before gravity settles the object. Compact Laya context preserves the full objective, ordered plan and all object names/positions; full verification prose stays in diagnostics.

Navigation validates destinations against the character capsule at planning and execution, finds clear furniture approaches, and allows two bounded repairs of a blocked route's remaining plan. Verified steps and the repair budget survive save/restore; this is not a general route planner.

The garden has six decaying needs, a starter daybed, bench, physical shower and six finite orange servings, with recovery tied to completed actions and their actual duration.

Earlier verified runs include v11's complete wash → sit → bed-rest request and autonomous follow-on rest, and v9's exact walk/dance/observation and print-orange/eat requests. These remain historical results, not verification of every later change. See [PLAYTESTS.md](outputs/maker/PLAYTESTS.md) for outcomes and [HANDOFF.md](HANDOFF.md) for continuation work.

The foundation includes user and autonomous goals, physical object interactions, persistence, bounded construction generation, diagnostics and deduplicated memories. Reflection receives the complete editable memory store, so Gemma can revise or forget paraphrases without automatic semantic deletion. The needs are energy, hunger, fun, hygiene, comfort and social. Butterbot is still the only active character: social need cannot be fulfilled alone, and distinct neighbors, conversations and a full sleep cycle remain unfinished. The [first social milestone](outputs/maker/SOCIAL_PLAN.md) is a continuation plan, not implemented social gameplay.

## How it works

**Gemma** proposes ordered plans, thoughts, reflections, memory edits, and construction code. **Laya** chooses from the options offered by the engine. The engine validates capabilities and preconditions, performs physical actions, and records outcomes. Gemma checks the engine evidence before a plan step advances. Model output alone cannot create a successful physical outcome.

Laya selects autonomous goals from grounded proposals; Gemma turns the chosen proposal into a validated plan. Critical needs can interrupt a user request, route through the same planning/action checks, and then resume the preserved request. The daybed and bench require six seconds of supported use. Washing requires reaching the shower tray and spending six seconds beneath the outlet. Need changes appear on completed action cards from recorded before/after values. Resting on a bed is a timed recovery action, not a sleep-cycle simulation.

Objects have names, descriptions, positions, dimensions, weight, and supported interactions such as portable, edible, throwable, giftable, and anchored. An object named “orange” is only edible when its validated capabilities and material permit eating. Inspection and observation use engine metadata, not camera recognition.

The activity panel keeps offered choices and model probabilities visible. Thoughts/decisions and memories start at equal height with an adjustable divider and independent scrolling. Cards distinguish printing, planning, verification, actions, observations, and failures. A stable destination marker matches the movement entry. On small screens, activity can collapse to give the garden more room. Click an object to view attributes and ask Butterbot to perform an available action. **Pause/Resume**, sound mute, persistent failed-request retry, and **Reset everything** are available. Reset clears generated objects, goals and mutable memories and restores the starter layout. Save upgrades install starter objects once; reloading preserves food depletion.

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
| `outputs/maker/releases/` | Immutable application checkpoints; launcher defaults to v15 |
| `outputs/maker/HANDOFF-*.md` | Scoped implementation notes; some describe earlier checkpoints |
| `work/` | Tracked UI build and release scripts |

Dependencies are pinned in `pnpm-lock.yaml`; bundled Ammo files retain their attribution. Model downloads, installed dependencies, logs, saved scenes, and raw playtest evidence are excluded from Git.

The next milestone is a reliably useful and expressive single character. Correct the refused-plan status text and broaden persistence, cancellation, memory and object-interaction checks before enabling the planned second character.

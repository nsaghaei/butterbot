# Butterbot

A local, experimental life simulation where you give a character an objective and watch it think, plan, choose actions, and interact with a physical world.

The current game is called **Maker Garden**. Its first character, Agent Wobble, explores a garden, inspects objects, pursues basic needs, and uses a printer to construct objects from generated Three.js geometry. The direction is a small, expressive Sims-like neighborhood with distinct personalities, useful memories, meaningful needs, and creative solutions to player requests.

## Current checkpoint

This is a development checkpoint, **not a finished game**.

- **Frozen release v6** is the last tested baseline. Its 60 offline tests passed before newer work began. The launcher uses this release so unfinished source changes do not affect a running game.
- **Working source** includes newer object capabilities, timed interactions, physical animations, and debugging tools. The checkpoint suite passed **82 of 84 tests**. Two older assertions still expect immediate eating and earlier fixture-error wording; integration and live playtesting remain pending.
- A repeated-step printer loop was fixed in v6. Printing is still not consistently reliable: in the latest observed flower request, a valid design was produced but the character declined the final print decision. That request did **not** create a flower.

See [HANDOFF.md](HANDOFF.md) for known issues, implementation notes, and the ordered continuation plan.

## How it works

**Gemma** proposes multi-step plans, thoughts, reflections, memory edits, and construction code. **Laya** chooses from the options offered by the engine. The engine validates capabilities and preconditions, executes real physical actions, and records outcomes. Gemma verifies completed plan steps before the plan advances.

Objects have names, descriptions, dimensions, weight, and supported interactions. The working source adds explicit capabilities such as edible, portable, throwable, giftable, and anchored. An object called an orange is only edible if its validated capabilities support eating.

The right panel displays the objective and plan, thoughts and decisions, and memories. Decisions show the offered choices and actual model probabilities. The two feeds have an adjustable divider, and printer messages are light purple. **Reset everything** clears the current scene, created objects, goals, and mutable memories.

Perception uses engine metadata rather than camera-based recognition. Character motion combines a navigation controller with articulated physics. Generated construction code executes inside a bounded QuickJS worker without host filesystem or network access.

## Run locally

This checkpoint was developed on Windows with PowerShell, Node.js, Python, and local model services. Model weights, Python environments, Ollama, dependencies, and saved games are not included.

1. Install JavaScript dependencies:

   ```powershell
   cd outputs/maker
   pnpm install --frozen-lockfile
   ```

2. Provide a Python environment with the compatible `laya` package and Laya checkpoint, then start the adapter:

   ```powershell
   python laya-adapter.py --model C:/models/laya --port 8766
   ```

3. Run an Ollama server on port **11435** with the configured Gemma model installed. The current default is `gemma4:12b`; use `GENERATOR_MODEL` for a different installed model name. This checkpoint does not yet provide a reproducible model-environment installer.

4. Configure the exact tokenizer check and start the frozen baseline:

   ```powershell
   $env:TOKENIZER_PYTHON = 'C:/path/to/python.exe'
   $env:LAYA_TOKENIZER = 'C:/models/laya/tokenizer/tokenizer.json'
   powershell -NoProfile -File ./start.ps1
   ```

5. Open **http://127.0.0.1:8790/**. Enter a goal in the bottom composer. Start with a short walk, observation, or dance before trying a longer printing request.

The launcher starts the frozen v6 server in a hidden process and refuses a second launch on the same port. It does not install or start model services. Set the tokenizer variables explicitly on another machine: source code still contains development-machine fallback paths.

To run the newer working source, stop the existing game server, then run `node server.mjs` from `outputs/maker`. Do not run source and frozen servers against the same save simultaneously.

### Configuration

| Variable | Purpose / default |
| --- | --- |
| `LAYA_URL` | Selection adapter, `http://127.0.0.1:8766` |
| `GENERATOR_URL` | Ollama server, `http://127.0.0.1:11435` |
| `GENERATOR_MODEL` | Gemma model name, `gemma4:12b` |
| `TOKENIZER_PYTHON` | Python executable for exact decision-token checks |
| `LAYA_TOKENIZER` | Checkpoint `tokenizer.json` path |
| `PORT` | Source server port, `8790` |
| `SAVE_FILE` | Source save path; defaults to `saved/garden-v2.json` |

Normal operation uses local models. Unavailable models produce visible failures rather than fabricated model output. Exact token checks reject decisions whose essential facts cannot fit the Laya checkpoint's context window.

## Development and debugging

From `outputs/maker`:

```powershell
node --test tests/*.test.mjs
node debug.mjs --help
node debug.mjs --out debug-report.json
```

Tests use isolated worlds. Context tests also require the configured Python tokenizer. The debug CLI requires the newer source server and is read-only by default. Its optional `--goal` submits an objective to the running game. Debug reports and the local journal retain actual decisions, inputs, errors, and outcomes.

From the repository root, rebuild the browser bundle with `node work/build-ui.cjs`. The bundle combines the scene portion of `outputs/maker/web/app.js` with `work/ui-main.mjs`. Freeze a new release after verification using `powershell -NoProfile -File work/freeze-release.ps1 -Release v7`. Existing release directories must never be overwritten.

## Repository layout

| Path | Contents |
| --- | --- |
| `outputs/maker/` | Working simulation, model adapters, server, and compiler |
| `outputs/maker/web-next/` | Current browser interface and character rendering |
| `outputs/maker/tests/` | Physics, planning, memory, perception, and debugging regressions |
| `outputs/maker/releases/v6/` | Frozen baseline used by the launcher |
| `outputs/maker/HANDOFF-*.md` | Agent implementation notes |
| `work/` | Tracked UI build and release scripts |

JavaScript dependencies are pinned in `pnpm-lock.yaml`. Bundled Ammo files retain their third-party attribution. Model downloads, dependencies, logs, saved scenes, and raw playtest evidence are excluded from Git.

## Next milestone

Make one character reliably useful and entertaining: finish object interactions and animation integration, fix remaining printer/planning failures, improve the activity feed, add the printer keyboard and gentle feedback sounds, and playtest real user goals. Then add hygiene, comfort, sleep, and social needs with usable accommodations, followed by distinct neighbors and model-generated conversations. The planned scene redesign moves the printer against the left fence and adds a bright neighborhood backdrop.

# Maker Garden

For the GitHub checkpoint overview, portable configuration, known failures and continuation plan, start with the [repository README](../../README.md) and [handoff](../../HANDOFF.md). The notes below describe the existing development installation; its machine-specific paths must be configured for another computer. The newer source checkpoint passes 82/84 tests; see the handoff for the two pending assertion updates.

Open **http://127.0.0.1:8790/**. Tell Agent Wobble a goal in the bottom composer. The character chooses feasible actions, walks around, inspects objects, uses supported objects, and pursues its own needs between your requests. The printer is one available activity.

Thoughts and decisions share the upper feed; memories have their own lower feed. They start at equal height. Drag the divider to resize them. New entries slide into the fixed feed and smoothly move earlier entries upward when following the latest activity. Scrolling back keeps your reading position; the new-items control returns to the latest entry. Expand a decision to inspect its options and recorded input. **Reset everything**, at the bottom right, clears created objects, goals, and mutable memories and starts a fresh scene with the character and fixed scenery.

## Launch

From this folder, run `powershell -NoProfile -File .\start.ps1`. It starts the frozen `releases/v6` application in a hidden process, using the shared `saved/garden-v2.json` save and this folder's `node_modules`. It declines to start another server if port 8790 is occupied. Logs go to the workspace's `work/maker-v6.log` and `work/maker-v6-error.log`. The script does not install software or start or stop model services.

The existing local services must be available:

- Laya adapter: `http://127.0.0.1:8766`, from `laya-adapter.py`. Its existing Python runtime is `C:/Users/15sag/Documents/Codex/2026-09-23/jevton-laya-local/work/runtime/Scripts/python.exe`; its checkpoint is that project's `work/models/laya`. These are read without changing the earlier project. The same runtime supplies the CPU tokenizer check.
- Ollama: `http://127.0.0.1:11435`, with `gemma4:12b`. The existing portable executable, model files, and service launcher are in this workspace's `work/ollama`, `work/models`, and `work/start-generator.ps1`.
- Node.js and the already installed dependencies in `node_modules`. The launcher finds Node on PATH, with the installed Codex runtime as a fallback.

## What the simulation does

Gemma creates an ordered plan; the objective panel shows its goal and current step. Laya selects from labeled, feasible options. After an engine action succeeds, Laya chooses whether to mark the step done. Gemma verifies the recorded outcome before advancing the step. Asking to reconsider a successful step requests an evidence check; it does not discard the outcome or repeat the physical action. Observe surroundings takes two seconds and reports nearby objects and characters within six meters from engine state. Gemma proposes plans, fictional reflections, and actual Three.js construction code. Generated code runs in a bounded QuickJS worker without filesystem, network, or browser access. Invalid code is rejected and given bounded repair attempts. Printing requires a final Laya review; unsupported actions cannot become successful outcomes merely through generated text.

Each decision receives current character state and the engine's object catalog, including every object's name and position. Close inspection requires approaching the object and spending time observing its description and verified interactions; useful observations can become memories. Descriptions are authored or generated metadata, **not camera-based object recognition**. The checkpoint has a 512-token total limit: exact tokenizer checks report a capacity error when essential facts cannot fit instead of silently dropping object names or positions.

Mutable memories are fictional character records, limited to 12 with least-recently-used eviction. The authored personality remains separate. Rapier rigid bodies and jointed active-ragdoll limbs accompany a navigation controller; this is assisted walking, not unassisted biomechanical locomotion. Ammo supplies soft bodies, rope, and cloth with one-way rigid-to-soft collision proxies. Collider approximations limit shape accuracy. Bed rest restores energy; no sleep-cycle simulation is implemented.

For local verification, run `node --test tests/*.test.mjs` from this folder. These tests do not require concurrent live model inference. Evidence files retain individual runs and rejected attempts; their presence alone does not mean a run passed.


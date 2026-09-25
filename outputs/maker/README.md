# Maker Garden

See the [repository overview](../../README.md), [development handoff](../../HANDOFF.md), and [actual playtests](PLAYTESTS.md). The launcher selects **v15**, build `2026-09-25.15`; **213/213 offline tests passed**. The tulip carry/throw/retrieve/place story completed seven actions and seven Gemma audits, with no errors or navigation recoveries. Eating the wooden bench was rejected before action using `edible:false`. Placement/refusal cards were visually checked and the browser console was error-free. Minor pending polish: a refused request without a plan still shows “Gemma is preparing the plan”.

Open **http://127.0.0.1:8790/** and give **Butterbot**, the single ivory-and-teal robot, a goal in the bottom composer. It plans, selects feasible actions, inspects and uses objects, and pursues needs between requests. The printer is one activity. An old save named Agent Wobble migrates to Butterbot; custom names remain intact.

The starter garden has a daybed, bench, shower and bowl containing six orange servings. Energy, hunger, fun, hygiene, comfort and social need change with simulation time. Sitting/resting require six seconds of physical use; washing requires reaching the tray and six seconds beneath its outlet. Recovery follows actual successful actions, not generated claims. Social need is visible but cannot be fulfilled with only one character. Bed recovery does not implement a sleep cycle.

Thoughts/decisions and memories start at equal height; drag their divider to resize them. Following new entries smoothly moves earlier entries upward. Scrolling back preserves your position; the new-items control returns to the latest entry. Expand decisions to see choices, probabilities, and actual input/output. Small screens have a collapsible activity panel. Click an object for its metadata and current action requests. These buttons ask the character through the normal objective API; they do not bypass its planner.

Use **Pause/Resume** to control simulation time. Failed requests remain visible with **Retry** while autonomy continues. Colored travel markers match movement records. Completed action cards show recorded need changes; tooltips expose before/after values and elapsed action time. Diagnostics offers **Debug session** and **Export debug**. The printer has a keyboard/screen and a quiet accepted-prompt double bell, unlocked by browser interaction and optionally muted. **Reset everything** clears generated objects, goals and mutable memories and restores the starter garden. Older saves receive starter objects once; later reloads preserve consumed servings and removed objects.

## Launch

From this folder, run `powershell -NoProfile -File .\start.ps1`. The script starts frozen `releases/v15` in a hidden process with `saved/garden-v2.json` and this folder's `node_modules`. It refuses a duplicate server on port 8790. Logs go to the repository's `work/maker-v15.log` and `work/maker-v15-error.log`. It does not install software or manage model services.

The existing development installation requires:

- Laya at `http://127.0.0.1:8766`, served by `laya-adapter.py`. Its Python runtime is `C:/Users/15sag/Documents/Codex/2026-09-23/jevton-laya-local/work/runtime/Scripts/python.exe`; the checkpoint is that project's `work/models/laya`. These are read without changing the earlier project. The runtime also supplies the CPU tokenizer check.
- Ollama at `http://127.0.0.1:11435`, with `gemma4:12b`. This repository's existing portable executable, model files, and launcher are in `work/ollama`, `work/models`, and `work/start-generator.ps1`.
- Node.js and installed dependencies. The launcher checks PATH, then the installed Codex runtime.

Configure `TOKENIZER_PYTHON`, `LAYA_TOKENIZER`, and model endpoints for another machine; see the root README. Do not run two application servers against the shared save or compete with a second live model-driven world.

## Grounding and limits

Gemma generates ordered plans, fictional reflections, memory edits, and Three.js construction code. Laya selects autonomous goal proposals and valid action options. Critical need interruptions also receive a Gemma plan before execution, preserving the user plan for resumption. Step verification receives exact engine criteria and recorded completion evidence: an approach reaches a clear point beside the object within 0.18 m, and placement checks the release point before later settling. Throw coordinates indicate aim, not a guaranteed landing point; retrieval follows the actual object. Invalid construction code receives bounded repairs inside a restricted QuickJS worker. Final printing requires a real Laya review; generated text cannot substitute for physical success.

Decisions receive character state and all object names and positions. Compact variants retain the complete objective and ordered plan. Matching successful current-step evidence allows terse retry status; full verifier prose remains in diagnostics instead of masquerading as an engine blocker. Inspection reveals metadata and validated uses; a two-second observation reports nearby objects/characters within six meters. This is **not camera-based recognition**. The 512-token limit uses the exact tokenizer; oversized essential context still fails explicitly.

Objects carry physical dimensions, mass and capability metadata. Eating requires food capabilities; a name is insufficient. Lifting, throwing, pushing, giving and ownership are validated. Mutable memories are fictional character records with 12 slots and least-recently-used eviction. Exact normalized duplicates refresh the existing entry. Reflection receives all editable IDs, kinds and texts for model-selected revision/forgetting. Live v15 reflections consolidated 12 entries to eight, but duplicates remain. Distinct facts, negation, quantities and subjective kinds must remain meaningful; the engine does not fuzzy-delete them. The authored personality remains protected.

Rapier bodies and articulated limbs accompany navigation-assisted movement. Character gravity uses a small grounded downward bias and accumulated airborne acceleration. Ammo soft bodies, rope and cloth use one-way rigid-to-soft collision proxies; colliders approximate generated shapes. The original restored-bed failure passed its v13 replay after posture-aware restore and mattress/support corrections; broader physics and object-interaction testing continues. Distinct neighbors, grounded conversations and a full sleep cycle remain future work; see the [social continuation plan](SOCIAL_PLAN.md). Street traffic is decorative.

Run `node --test tests/*.test.mjs` here for offline verification; exact-token tests need the configured tokenizer. Diagnostic files record individual attempts, including failures. Their presence alone does not mean a playtest passed.

# Object capability checkpoint — 2026-09-25

Stopped feature work at the user's request to prepare a GitHub checkpoint. Changes below are saved in the working source. They have **not been deployed or validated end to end**. No live scene writes, model inference, server starts/stops, or Git commits were made by this agent during this task.

## Files saved

- `object-attributes.mjs` (new): strict capability normalization, legacy entity overrides, readable lifting/capability blockers.
- `design.mjs`: validates attributes and retains normalized attributes after geometry compilation. Prop and breakable mass budgets increased to 250kg; vehicle remains 250kg, character 90kg, other kinds 12kg. Geometry limits are unchanged. Internal `attributeInput` preserves which values the proposal supplied so final defaults can account for actual compiled dimensions; it is not retained in the compiled design.
- `perception.mjs`: object metadata includes actual design mass/dimensions, normalized attributes, possible uses and blocked actions. Fixed fixtures have anchored, nonportable, nonedible capabilities; their fixed collider dimensions are explicit and mass is `null`. Existing inspection and surroundings observation now carry this metadata.
- `actions.mjs`: adds `drop`, `throw`, `push`, and `give`; checks capabilities, lifting/size limits, held ownership, recipients, range, force bounds and destination bounds. Plan validation checks capabilities without requiring future held/proximity state. Feasible actions include physical-operation candidates which are filtered by commit validation. `conciseWorld` includes physical limits, character recipients and readable blockers.

## Interfaces for the other implementation owners

`normalizeAttributes(raw, kind, mass, dimensions?)` returns:

```js
{ portable, anchored, edible, servings, throwable,
  maxThrowSpeed, giftable, pushable }
```

`attributesFor(entity)` expects an entity with `design`, `kind`, and optional runtime `edible`/`servings`. Runtime values override design values, preserving legacy berries and depleted servings. For a design without an entity, call `normalizeAttributes(design.attributes, design.kind, design.mass, design.dimensions)`.

Legacy defaults: prop/breakable/soft are portable only at mass ≤12kg and largest dimension ≤2m. Only portable rigid prop/breakable objects default throwable. Giftable defaults to portable; unanchored prop/breakable/soft/vehicle default pushable. Rope, cloth and fixtures default anchored. Anchoring forces portable/throwable/giftable/pushable false. Edibility is never inferred from a name. Only props can be edible. Servings must be an integer from 0–100, defaulting to one when explicitly edible and zero otherwise. Maximum throw speed defaults to 6m/s and must be 1–10m/s. Unknown attributes, wrong types and inconsistent unsupported capabilities reject.

Action payloads use **flat coordinates**, matching the existing planner:

```js
{action:'drop', target:heldId}
{action:'throw', target:heldId, x, z, speed}
{action:'push', target:objectId, x, z, strength}
{action:'give', target:heldId, recipient:characterId}
```

`validateAction` returns normalized speed/strength. Zero or missing speed becomes `min(6, maxThrowSpeed)`; negative, nonfinite or excessive speeds reject. Zero or missing strength becomes 1; otherwise it must be 1–3. Destinations use existing garden action bounds, x ±10.5 and z ±9.5. Push requires a free unanchored object, mass ≤130kg and actor distance ≤2.7m. Giving requires an existing other character controller within 2m and empty recipient hands. The agreed physics methods are `throwObject(id, actorId, {x,z,speed})`, `pushObject(id, actorId, {x,z,strength})`, and `giftObject(id, actorId, recipientId)`.

All new imports in these owned files resolve. The physics owner has been told to use the entity-shaped `attributesFor` API.

## Checks completed

- `node --check outputs/maker/actions.mjs` passed.
- `node --check outputs/maker/design.mjs` passed.
- A temporary in-memory mock check imported attributes/actions/perception and passed legacy weight/size defaults, anchored overrides, strict boolean validation, berry overrides, the 80kg tree lifting explanation, nonedible rejection and catalog attributes.
- No persistent new test file was created after the stop instruction. No complete suite, compiler worker, physics integration, browser, or real-model checks were run for this capability change.

## Remaining work

1. Integrate and review the other agents' physics operations and root-owned Garden handlers, provider schema, generated food/material rules, state persistence, decision context and UI. This checkpoint alone does not execute the new actions.
2. Add the planned `tests/object-attributes.test.mjs`: type/range rejection, heavy/large/anchored objects, supported food versus decorative food names, finite servings, held ownership, throw bounds, push limits, recipient range/occupied hands and save/restore. Then run existing suites; metadata changes may expose assumptions in older fixtures.
3. `validatePlanCoverage` still only recognizes its earlier action patterns. It does not yet insist that explicit throw/push/give/drop requests appear in a proposed plan.
4. `objectInfo` still returns `null` for controllers without a design; `conciseWorld.characters` exposes those recipients, but planning an explicit approach to such a recipient needs a character-target path. Printed characters already have designs.
5. Review catalog prompt size: `conciseWorld` currently repeats blockers both per object and in `actionBlockers`. Preserve capability facts while fitting the real checkpoint budget; do not silently drop objects.
6. Validate complete compile/material/physics behavior before freezing a release. Preserve the latest shared save and do not overwrite a live user's scene with test fixtures.

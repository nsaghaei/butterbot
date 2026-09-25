# Physics checkpoint

Saved implementation files: `physics.mjs`, `physical-rig.mjs`, and `tests/object-physics.test.mjs`.

## Object interfaces

- `throwObject(id, actorId, {x,z,speed})`: requires a held, throwable rigid prop or breakable object. Launches from its actual grip position at 20 degrees upward. Default speed is min(6, object limit); the limit never exceeds 10m/s. Invalid speed is rejected. Collision filtering excludes character bodies for 0.25 seconds after release, then restores normal collisions.
- `pushObject(id, actorId, {x,z,strength})`: requires a nearby, free, pushable object of at most 130kg. Strength defaults to 1 and accepts 1–3. Applies horizontal impulse min(20, mass × 0.8 × strength); soft nodes receive the equivalent velocity change.
- `giftObject(id, actorId, recipientId)`: requires a held giftable object, another character within 2m, and empty recipient hands. Transfers the physical grip and ownership.
- `remove(id)`: removes the entity and its rigid body, colliders, soft body, articulated rig, vehicle controller, fragments, and owned Ammo proxy resources. Returns false for a missing ID.
- `gripPosition(actor)`: supplies an action-dependent physical hold position.

`object-attributes.mjs` supplies `normalizeAttributes` and `attributesFor`. Physics initializes edible status and finite servings from attributes. Anchored rigid objects use fixed bodies. Heavy, oversized, nonportable, or anchored objects cannot be carried.

## Animation integration

Garden supplies `actor.activity` and `actor.actionProgress` (0–1). Supported physical poses include pick_up, drop, place, throw, push, give, eat, and bilateral printer typing. Progress changes PD targets and joint motor targets; it does not move the visible rig independently of its bodies. Held objects follow matching action-dependent grip positions. Snapshot rig.pose exposes current targets for diagnostics.

Typing hands reach approximately 0.75–0.85m ahead of the actor at 1.4m world height. The scene keyboard and actor approach position must match this reach. Garden must face the actor toward its interaction target and time actual release, transfer, consumption, or impulse to the action animation.

## Completed checks

Eight object-physics tests passed: real bounded ballistic throws, fixed anchors and heavy carry rejection, push impulses, gift transfer, consumed-body removal, soft/fracture/rig resource removal, finite distinct action poses, and alternating two-handed typing. All 15 existing core physics/compiler tests also passed at this checkpoint. Tests used local isolated worlds; they did not call live models or mutate the user's scene.

## Integration follow-up

The legacy agents test for eating expected immediate consumption from three consecutive startAction calls. Eating now has elapsed animation time, so that test must step each job before checking servings. Garden must remove fully consumed resources from both physics and the persisted design registry to prevent resurrection on restore.

Visual QA remains necessary for pose timing, body reach, keyboard alignment, and the resulting animation in the running scene. The rig remains a hybrid of KCC navigation and dynamic PD-driven articulated bodies, not unassisted biomechanical walking.

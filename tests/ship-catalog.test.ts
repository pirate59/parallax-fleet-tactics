import assert from "node:assert/strict";
import test from "node:test";
import { STORY_SHIP_ARCHETYPES, STORY_STARTER_ARCHETYPE } from "../app/shipCatalog.ts";

test("the Hammerhead starts with a reinforced front and vulnerable rear shield", () => {
  assert.equal(STORY_STARTER_ARCHETYPE.id, "hammerhead");
  assert.equal(STORY_STARTER_ARCHETYPE.name, "The Hammerhead");
  assert.equal(STORY_STARTER_ARCHETYPE.callsign, "HM-01");
  assert.deepEqual(STORY_STARTER_ARCHETYPE.shieldCapacity, {
    fore: 184,
    aft: 28,
    port: 78,
    starboard: 78,
    dorsal: 64,
    ventral: 58,
  });
});

test("story archetypes support distinct shielding, weapons, movement, and rendered sizes", () => {
  const archetypes = Object.values(STORY_SHIP_ARCHETYPES);
  assert.equal(new Set(archetypes.map((ship) => ship.id)).size, archetypes.length);
  assert.ok(new Set(archetypes.map((ship) => ship.basicWeapon)).size > 1);
  assert.ok(new Set(archetypes.map((ship) => ship.modelScale)).size > 1);
  assert.ok(new Set(archetypes.map((ship) => ship.maxMove)).size > 1);
  assert.ok(new Set(archetypes.map((ship) => Object.values(ship.shieldCapacity).reduce((sum, value) => sum + value, 0))).size > 1);

  archetypes.forEach((ship) => {
    assert.ok(ship.modelScale > 0);
    assert.ok(ship.hull > 0);
    assert.ok(ship.weaponDamage > 0);
    assert.ok(ship.weaponRange > 0);
  });
});

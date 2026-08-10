import assert from "node:assert/strict";
import test from "node:test";
import {
  ALL_SHIP_ARCHETYPES,
  PROTOTYPE_SHIP_ARCHETYPES,
  STORY_SHIP_ARCHETYPES,
  STORY_STARTER_ARCHETYPE,
  durabilityForArchetype,
  modelScaleForArchetype,
} from "../app/shipCatalog.ts";
import { SHIP_MODEL_PROFILES, shipModelProfileFor } from "../app/shipModels.ts";

test("the Hammerhead starts with a reinforced front and vulnerable rear shield", () => {
  assert.equal(STORY_STARTER_ARCHETYPE.id, "hammerhead");
  assert.equal(STORY_STARTER_ARCHETYPE.name, "The Hammerhead");
  assert.equal(STORY_STARTER_ARCHETYPE.callsign, "HM-01");
  assert.deepEqual(durabilityForArchetype(STORY_STARTER_ARCHETYPE).shields, {
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
  assert.deepEqual(new Set(archetypes.map((ship) => ship.sizeClass)), new Set(["shuttle", "cruiser", "large"]));
  assert.ok(new Set(archetypes.map((ship) => ship.weaponMounts[0].weaponKind)).size > 1);
  assert.ok(new Set(archetypes.map(modelScaleForArchetype)).size > 1);
  assert.ok(new Set(archetypes.map((ship) => ship.maxMove)).size > 1);
  assert.ok(new Set(archetypes.map((ship) => Object.values(durabilityForArchetype(ship).shields).reduce((sum, value) => sum + value, 0))).size > 1);

  archetypes.forEach((ship) => {
    assert.ok(modelScaleForArchetype(ship) > 0);
    assert.ok(durabilityForArchetype(ship).hull > 0);
    assert.ok(ship.weaponDamage > 0);
    assert.ok(ship.weaponRange > 0);
    assert.ok(ship.weaponMounts.length > 0);
  });
});

test("every hull blueprint owns a model identity and valid attachment metadata", () => {
  const archetypes = Object.values(ALL_SHIP_ARCHETYPES);
  assert.equal(archetypes.length, Object.keys(STORY_SHIP_ARCHETYPES).length + Object.keys(PROTOTYPE_SHIP_ARCHETYPES).length);
  assert.equal(new Set(archetypes.map((ship) => ship.id)).size, archetypes.length);
  assert.equal(new Set(archetypes.map((ship) => ship.modelId)).size, archetypes.length);

  archetypes.forEach((ship) => {
    const model = shipModelProfileFor(ship.modelId);
    assert.equal(model.id, ship.modelId);
    assert.equal(Object.keys(model.shieldAnchors).length, 6);
    assert.ok(model.selectionRadius > model.targetRadius);
    ship.weaponMounts.forEach((mount) => {
      assert.ok(model.weaponHardpoints[mount.hardpointId], `${ship.id} is missing ${mount.hardpointId}`);
    });
  });
  assert.equal(Object.keys(SHIP_MODEL_PROFILES).length, archetypes.length);
});

import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  ALL_SHIP_ARCHETYPES,
  SHIP_ARCHETYPES,
  STORY_STARTER_ARCHETYPE,
  durabilityForArchetype,
  modelScaleForArchetype,
} from "../app/shipCatalog.ts";
import { createShipHullGeometry } from "../app/shipGeometry.ts";
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

test("the canonical roster contains the six designed hull roles", () => {
  assert.deepEqual(
    Object.keys(SHIP_ARCHETYPES),
    ["hammerhead", "archer", "hulk", "fighter", "behemoth", "carrier"],
  );
  assert.deepEqual(new Set(Object.values(SHIP_ARCHETYPES).map((ship) => ship.sizeClass)), new Set(["shuttle", "cruiser", "large"]));
  assert.equal(SHIP_ARCHETYPES.archer.weaponMounts[0].weaponKind, "railgun");
  assert.equal(SHIP_ARCHETYPES.hulk.weaponMounts[0].weaponKind, "flak");
  assert.equal(SHIP_ARCHETYPES.fighter.sizeClass, "shuttle");
  assert.equal(durabilityForArchetype(SHIP_ARCHETYPES.fighter).hull, 34);
  assert.equal(SHIP_ARCHETYPES.fighter.maxMove, 11);
  assert.deepEqual(SHIP_ARCHETYPES.behemoth.weaponMounts.map((mount) => mount.weaponKind), ["railgun", "flak"]);
  assert.equal(durabilityForArchetype(SHIP_ARCHETYPES.behemoth).multiplier, 3);
  assert.equal(SHIP_ARCHETYPES.carrier.weaponMounts.length, 0);
  assert.equal(SHIP_ARCHETYPES.carrier.turnEndAbility?.maxActive, 3);
});

test("hull blueprints support distinct shielding, movement, and rendered sizes", () => {
  const archetypes = Object.values(ALL_SHIP_ARCHETYPES);
  assert.equal(new Set(archetypes.map((ship) => ship.id)).size, archetypes.length);
  assert.ok(new Set(archetypes.map(modelScaleForArchetype)).size > 1);
  assert.ok(new Set(archetypes.map((ship) => ship.maxMove)).size > 1);
  assert.ok(new Set(archetypes.map((ship) => Object.values(durabilityForArchetype(ship).shields).reduce((sum, value) => sum + value, 0))).size > 1);

  archetypes.forEach((ship) => {
    assert.ok(modelScaleForArchetype(ship) > 0);
    assert.ok(durabilityForArchetype(ship).hull > 0);
    assert.ok(ship.weaponRange > 0);
  });
});

test("every hull owns valid model attachment metadata", () => {
  const archetypes = Object.values(ALL_SHIP_ARCHETYPES);
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

test("all six hulls build recognisably different procedural geometry", () => {
  const material = new THREE.MeshBasicMaterial();
  const signatures = Object.keys(SHIP_MODEL_PROFILES).map((modelId) => {
    const group = createShipHullGeometry(modelId as keyof typeof SHIP_MODEL_PROFILES, {
      body: material,
      dark: material,
      accent: material,
      glow: material,
    });
    const size = new THREE.Box3().setFromObject(group).getSize(new THREE.Vector3());
    return `${group.children.length}:${size.x.toFixed(2)}:${size.y.toFixed(2)}:${size.z.toFixed(2)}`;
  });

  assert.equal(new Set(signatures).size, 6);
});

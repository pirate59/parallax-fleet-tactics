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
import { SHIP_MODEL_PROFILES, SHIP_MODEL_VARIANTS, shipModelProfileFor } from "../app/shipModels.ts";

test("the Hammerhead starts with a reinforced front and vulnerable rear shield", () => {
  assert.equal(STORY_STARTER_ARCHETYPE.id, "hammerhead");
  assert.equal(STORY_STARTER_ARCHETYPE.name, "The Hammerhead");
  assert.equal(STORY_STARTER_ARCHETYPE.callsign, "HM-01");
  assert.deepEqual(durabilityForArchetype(STORY_STARTER_ARCHETYPE).shields, {
    fore: 184,
    aft: 28,
    port: 92,
    starboard: 92,
    dorsal: 76,
    ventral: 70,
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
  Object.values(SHIP_ARCHETYPES).forEach((ship) => assert.deepEqual(ship.modelVariants, SHIP_MODEL_VARIANTS));
  assert.equal(durabilityForArchetype(SHIP_ARCHETYPES.fighter).hull, 34);
  assert.equal(SHIP_ARCHETYPES.fighter.maxMove, 11);
  assert.deepEqual(SHIP_ARCHETYPES.behemoth.weaponMounts, [
    { id: "flak-1", weaponKind: "flak", hardpointId: "port-forward" },
    { id: "flak-2", weaponKind: "flak", hardpointId: "starboard-forward" },
  ]);
  assert.deepEqual(SHIP_ARCHETYPES.behemoth.passiveTraits, [{
    kind: "autonomous-turret",
    name: "Turrets",
    weaponKind: "cannon",
    hardpointId: "dorsal",
    rangeMultiplier: 0.5,
    damageMultiplier: 1,
    targetPriority: "weakest",
  }]);
  assert.equal(durabilityForArchetype(SHIP_ARCHETYPES.behemoth).multiplier, 3);
  assert.equal(SHIP_ARCHETYPES.carrier.weaponMounts.length, 0);
  assert.equal(SHIP_ARCHETYPES.carrier.turnEndAbility?.maxActive, 3);
  assert.equal(SHIP_ARCHETYPES.carrier.turnEndAbility?.fighterReserve, 9);
  assert.equal(SHIP_ARCHETYPES.carrier.turnEndAbility?.fighterDamageMultiplier, 1.6);
  assert.equal(SHIP_ARCHETYPES.carrier.turnEndAbility?.fighterDurabilityMultiplier, 0.55);
  assert.equal(durabilityForArchetype(SHIP_ARCHETYPES.carrier).hull, 225);
  assert.equal(durabilityForArchetype(SHIP_ARCHETYPES.carrier).multiplier, 1.44);
  assert.equal(durabilityForArchetype(SHIP_ARCHETYPES.carrier).shields.fore, 170);
  assert.equal(SHIP_ARCHETYPES.hammerhead.aiTactics.facingPriority, "expected-threat");
  assert.equal(SHIP_ARCHETYPES.archer.aiTactics.role, "standoff");
  assert.equal(SHIP_ARCHETYPES.fighter.aiTactics.survivalHullRatio, 0);
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

test("every hull has a distinct higher-detail model alongside its classic model", () => {
  const material = new THREE.MeshBasicMaterial();
  const detailedSignatures = Object.keys(SHIP_MODEL_PROFILES).map((modelId) => {
    const typedModelId = modelId as keyof typeof SHIP_MODEL_PROFILES;
    const classic = createShipHullGeometry(typedModelId, {
      body: material,
      dark: material,
      accent: material,
      glow: material,
    }, "classic");
    const detailed = createShipHullGeometry(typedModelId, {
      body: material,
      dark: material,
      accent: material,
      glow: material,
    }, "detailed");
    const size = new THREE.Box3().setFromObject(detailed).getSize(new THREE.Vector3());

    assert.ok(detailed.children.length > classic.children.length, `${modelId} detailed geometry should add surface structure`);
    return `${detailed.children.length}:${size.x.toFixed(2)}:${size.y.toFixed(2)}:${size.z.toFixed(2)}`;
  });

  assert.equal(new Set(detailedSignatures).size, 6);
});

test("every hull has a distinct super graphics model with smoother, denser geometry", () => {
  const material = new THREE.MeshBasicMaterial();
  const superSignatures = Object.keys(SHIP_MODEL_PROFILES).map((modelId) => {
    const typedModelId = modelId as keyof typeof SHIP_MODEL_PROFILES;
    const detailed = createShipHullGeometry(typedModelId, {
      body: material,
      dark: material,
      accent: material,
      glow: material,
    }, "detailed");
    const superModel = createShipHullGeometry(typedModelId, {
      body: material,
      dark: material,
      accent: material,
      glow: material,
    }, "super");
    const size = new THREE.Box3().setFromObject(superModel).getSize(new THREE.Vector3());
    const vertices = superModel.children.reduce((total, child) => {
      if (!(child instanceof THREE.Mesh)) return total;
      return total + (child.geometry.getAttribute("position")?.count ?? 0);
    }, 0);
    const detailedVertices = detailed.children.reduce((total, child) => {
      if (!(child instanceof THREE.Mesh)) return total;
      return total + (child.geometry.getAttribute("position")?.count ?? 0);
    }, 0);

    assert.ok(vertices > detailedVertices, `${modelId} super geometry should be smoother than the detailed hull`);
    return `${superModel.children.length}:${vertices}:${size.x.toFixed(2)}:${size.y.toFixed(2)}:${size.z.toFixed(2)}`;
  });

  assert.equal(new Set(superSignatures).size, 6);
});

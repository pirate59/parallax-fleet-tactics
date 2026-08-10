import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  clampCollisionPosition,
  collisionRadiusFor,
  resolveMovementCollisions,
  type CollisionShip,
} from "../app/collisionEngine.ts";
import type { Shields, Vec3 } from "../app/combatEngine.ts";
import { createPrimaryWeaponMount } from "../app/shipCatalog.ts";

const shieldsAt = (value: number): Shields => ({
  fore: value,
  aft: value,
  port: value,
  starboard: value,
  dorsal: value,
  ventral: value,
});

const makeShip = (id: string, overrides: Partial<CollisionShip> = {}): CollisionShip => ({
  id,
  name: id,
  team: "player",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  shields: shieldsAt(100),
  maxShields: shieldsAt(100),
  hull: 100,
  maxHull: 100,
  weaponRange: 16,
  weaponDamage: 20,
  modelId: "hammerhead",
  modelScale: 1,
  sizeClass: "cruiser",
  archetypeId: "generic-cruiser",
  weaponMounts: [createPrimaryWeaponMount("cannon")],
  ...overrides,
});

const at = (ship: CollisionShip, position: Vec3): CollisionShip => ({ ...ship, position });

test("continuous movement detects crossing flight paths even when endpoints do not overlap", () => {
  const shipA = makeShip("a", { position: [-4, 0, 0] });
  const shipB = makeShip("b", { team: "enemy", position: [4, 0, 0] });
  const result = resolveMovementCollisions(
    [shipA, shipB],
    [at(shipA, [4, 0, 0]), at(shipB, [-4, 0, 0])],
  );

  assert.equal(result.collisions.length, 1);
  assert.equal(result.collisions[0].kind, "ship");
  assert.ok(result.collisions[0].damageToA > 0);
  assert.ok(result.collisions[0].damageToB > 0);
});

test("ships ordered to one endpoint are separated and the lighter hull is displaced farther", () => {
  const large = makeShip("large", {
    modelId: "behemoth",
    modelScale: 1.94,
    sizeClass: "large",
    archetypeId: "behemoth",
    position: [-3, 0, 0],
  });
  const shuttle = makeShip("shuttle", {
    modelId: "fighter",
    modelScale: 0.78,
    sizeClass: "shuttle",
    archetypeId: "fighter",
    team: "enemy",
    position: [3, 0, 0],
  });
  const result = resolveMovementCollisions(
    [large, shuttle],
    [at(large, [0, 0, 0]), at(shuttle, [0, 0, 0])],
  );
  const resolvedLarge = result.ships.find((ship) => ship.id === large.id)!;
  const resolvedShuttle = result.ships.find((ship) => ship.id === shuttle.id)!;
  const largeDisplacement = new THREE.Vector3(...resolvedLarge.position).length();
  const shuttleDisplacement = new THREE.Vector3(...resolvedShuttle.position).length();
  const separation = new THREE.Vector3(...resolvedLarge.position).distanceTo(new THREE.Vector3(...resolvedShuttle.position));

  assert.ok(separation >= collisionRadiusFor(large) + collisionRadiusFor(shuttle) - 0.02);
  assert.ok(shuttleDisplacement > largeDisplacement * 3, "the shuttle should be knocked much farther off course");
  assert.ok(result.collisions[0].damageToB > result.collisions[0].damageToA * 3, "the larger hull should dominate impact damage");
});

test("wrecks remain fixed and undamaged while inflicting only minor contact damage", () => {
  const ship = makeShip("live", { position: [-4, 0, 0] });
  const wreck = makeShip("wreck", {
    team: "enemy",
    hull: 0,
    shields: shieldsAt(0),
    position: [0, 0, 0],
  });
  const result = resolveMovementCollisions(
    [ship, wreck],
    [at(ship, [4, 0, 0]), wreck],
  );
  const resolvedShip = result.ships.find((candidate) => candidate.id === ship.id)!;
  const resolvedWreck = result.ships.find((candidate) => candidate.id === wreck.id)!;
  const collision = result.collisions[0];

  assert.equal(collision.kind, "wreck");
  assert.deepEqual(resolvedWreck.position, wreck.position);
  assert.equal(resolvedWreck.hull, 0);
  assert.ok(collision.damageToA >= 3 && collision.damageToA <= 10);
  assert.ok(resolvedShip.hull === ship.hull, "minor wreck contact should be absorbed by shields in this fixture");
});

test("collision-aware battlefield bounds keep the whole hull inside the grid", () => {
  const carrier = makeShip("carrier", {
    modelId: "carrier",
    modelScale: 1.85,
    sizeClass: "large",
    archetypeId: "carrier",
  });
  const bounded = clampCollisionPosition(carrier, [20, 7, -20], 20, 7);
  const radius = collisionRadiusFor(carrier);

  assert.ok(Math.abs(bounded[0]) <= 20 - radius + 1e-9);
  assert.ok(Math.abs(bounded[2]) <= 20 - radius + 1e-9);
  assert.ok(Math.abs(bounded[1]) < 7);
});


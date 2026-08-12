import assert from "node:assert/strict";
import test from "node:test";
import {
  applyAiMovementAvoidance,
  collisionSafeLaunchPosition,
  type MovementAvoidanceOrder,
  type MovementAvoidanceShip,
} from "../app/movementAvoidanceEngine.ts";
import { passiveWeaponProfilesFor, type Shields, type Vec3 } from "../app/combatEngine.ts";
import { resolveMovementCollisions } from "../app/collisionEngine.ts";
import { CARRIER_FIGHTER_EVASIVE_TRAIT, createPrimaryWeaponMount } from "../app/shipCatalog.ts";

const bounds = { halfLength: 40, halfHeight: 12, halfWidth: 24 };
const shieldsAt = (value: number): Shields => ({
  fore: value,
  aft: value,
  port: value,
  starboard: value,
  dorsal: value,
  ventral: value,
});

function makeShip(id: string, position: Vec3, overrides: Partial<MovementAvoidanceShip> = {}): MovementAvoidanceShip {
  return {
    id,
    name: id,
    team: "enemy",
    controller: "ai",
    position,
    rotation: [0, 0, 0],
    shields: shieldsAt(50),
    maxShields: shieldsAt(50),
    hull: 100,
    maxHull: 100,
    maxMove: 10,
    weaponRange: 20,
    weaponDamage: 10,
    modelId: "hammerhead",
    modelScale: 1,
    sizeClass: "cruiser",
    archetypeId: "generic-cruiser",
    weaponMounts: [createPrimaryWeaponMount("cannon")],
    ...overrides,
  };
}

function makeOrder(destination: Vec3, targetId = "target"): MovementAvoidanceOrder {
  return { destination, targetId, fire: true, mode: "normal" };
}

test("AI deconflicts crossing movement paths before collision resolution", () => {
  const source = [
    makeShip("alpha", [-6, 0, 0]),
    makeShip("beta", [0, 0, -6], { team: "player" }),
  ];
  const orders = {
    alpha: makeOrder([6, 0, 0]),
    beta: makeOrder([0, 0, 6]),
  };
  const intended = source.map((ship) => ({ ...ship, position: [...orders[ship.id as keyof typeof orders].destination] as Vec3 }));

  const avoided = applyAiMovementAvoidance(source, intended, orders, bounds);
  const collision = resolveMovementCollisions(source, avoided.ships, bounds.halfLength, bounds.halfHeight, bounds.halfWidth);

  assert.ok(avoided.avoidedCount >= 1);
  assert.notDeepEqual(avoided.orders.alpha.destination, orders.alpha.destination);
  assert.equal(collision.collisions.length, 0);
});

test("carrier fighters launch outside their carrier collision radius", () => {
  const carrier = makeShip("carrier", [0, 0, 0], {
    modelId: "carrier",
    modelScale: 1.94,
    sizeClass: "large",
    archetypeId: "carrier",
  });
  const fighter = makeShip("fighter", [0, 0, 0], {
    modelId: "fighter",
    modelScale: 0.78,
    sizeClass: "shuttle",
    archetypeId: "fighter",
  });
  const launchPosition = collisionSafeLaunchPosition(carrier, fighter, [1, -0.5, 0.25], bounds);
  const launchedFighter = { ...fighter, position: launchPosition };

  const collision = resolveMovementCollisions([carrier, launchedFighter], [carrier, launchedFighter]);

  assert.equal(collision.collisions.length, 0);
});

test("an explicitly ordered ram is not deconflicted", () => {
  const source = [
    makeShip("hammerhead", [-5, 0, 0], { archetypeId: "hammerhead" }),
    makeShip("target", [0, 0, 0], { team: "player" }),
  ];
  const orders = {
    hammerhead: { ...makeOrder([0, 0, 0], "target"), ramTargetId: "target" },
  };
  const intended = source.map((ship) => ship.id === "hammerhead" ? { ...ship, position: [0, 0, 0] as Vec3 } : ship);

  const avoided = applyAiMovementAvoidance(source, intended, orders, bounds);

  assert.equal(avoided.avoidedCount, 0);
  assert.deepEqual(avoided.orders.hammerhead.destination, [0, 0, 0]);
});

test("carrier fighter spends evasion, changes course, and forfeits its attack", () => {
  const fighter = makeShip("carrier-fighter", [-6, 0, 0], {
    modelId: "fighter",
    modelScale: 0.78,
    sizeClass: "shuttle",
    archetypeId: "fighter",
    spawnedByShipId: "carrier",
    evasiveManeuverAvailable: true,
    passiveTraits: [{ ...CARRIER_FIGHTER_EVASIVE_TRAIT }],
  });
  const obstacle = makeShip("obstacle", [0, 0, 0], { team: "player", controller: "player" });
  const source = [fighter, obstacle];
  const orders = { "carrier-fighter": makeOrder([6, 0, 0], obstacle.id) };
  const intended = [{ ...fighter, position: [6, 0, 0] as Vec3 }, obstacle];

  const avoided = applyAiMovementAvoidance(source, intended, orders, bounds);
  const resultFighter = avoided.ships.find((ship) => ship.id === fighter.id)!;
  const collision = resolveMovementCollisions(source, avoided.ships, bounds.halfLength, bounds.halfHeight, bounds.halfWidth);

  assert.equal(resultFighter.evasiveManeuverAvailable, false);
  assert.deepEqual(avoided.evasiveShipIds, [fighter.id]);
  assert.equal(avoided.orders[fighter.id].fire, false);
  assert.equal(avoided.orders[fighter.id].mode, "normal");
  assert.notDeepEqual(avoided.orders[fighter.id].destination, [6, 0, 0]);
  assert.equal(collision.collisions.length, 0);
  assert.match(avoided.outcomes[0], /attack forfeited/i);
});

test("evasive manoeuvre is a non-weapon passive and cannot be spent twice", () => {
  const fighter = makeShip("spent-fighter", [-6, 0, 0], {
    modelId: "fighter",
    sizeClass: "shuttle",
    spawnedByShipId: "carrier",
    evasiveManeuverAvailable: false,
    passiveTraits: [{ ...CARRIER_FIGHTER_EVASIVE_TRAIT }],
  });
  const obstacle = makeShip("obstacle", [0, 0, 0], { team: "player" });
  const orders = { "spent-fighter": makeOrder([6, 0, 0], obstacle.id) };
  const intended = [{ ...fighter, position: [6, 0, 0] as Vec3 }, obstacle];

  const avoided = applyAiMovementAvoidance([fighter, obstacle], intended, orders, bounds);

  assert.equal(passiveWeaponProfilesFor(fighter).length, 0);
  assert.equal(avoided.evasiveShipIds.length, 0);
  assert.equal(avoided.orders[fighter.id].fire, true);
  assert.equal(avoided.ships.find((ship) => ship.id === fighter.id)?.evasiveManeuverAvailable, false);
});

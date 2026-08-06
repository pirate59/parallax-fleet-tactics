import assert from "node:assert/strict";
import test from "node:test";
import {
  clampShipMovementToRange,
  destinationFromShipMovement,
  shipMovementFromDestination,
  type ManeuverVec3,
  type ShipRelativeMovement,
} from "../app/maneuverEngine.ts";

const closeTo = (actual: number, expected: number) => {
  assert.ok(Math.abs(actual - expected) < 1e-9, `expected ${actual} to be close to ${expected}`);
};

const vectorCloseTo = (actual: ManeuverVec3, expected: ManeuverVec3) => {
  actual.forEach((value, index) => closeTo(value, expected[index]));
};

test("unrotated ships move along their own forward, right, and up axes", () => {
  const position: ManeuverVec3 = [2, 3, 4];
  vectorCloseTo(destinationFromShipMovement(position, [0, 0, 0], { forward: 5, right: 0, up: 0 }), [2, 3, -1]);
  vectorCloseTo(destinationFromShipMovement(position, [0, 0, 0], { forward: 0, right: 2, up: 0 }), [4, 3, 4]);
  vectorCloseTo(destinationFromShipMovement(position, [0, 0, 0], { forward: 0, right: 0, up: 3 }), [2, 6, 4]);
});

test("turning the ship rotates forward and right movement away from the world axes", () => {
  vectorCloseTo(destinationFromShipMovement([0, 0, 0], [0, 90, 0], { forward: 4, right: 0, up: 0 }), [4, 0, 0]);
  vectorCloseTo(destinationFromShipMovement([0, 0, 0], [0, 90, 0], { forward: 0, right: 2, up: 0 }), [0, 0, 2]);
});

test("rolling the ship rotates right and up movement around its nose", () => {
  vectorCloseTo(destinationFromShipMovement([0, 0, 0], [0, 0, 90], { forward: 0, right: 2, up: 0 }), [0, 2, 0]);
  vectorCloseTo(destinationFromShipMovement([0, 0, 0], [0, 0, 90], { forward: 0, right: 0, up: 2 }), [-2, 0, 0]);
});

test("ship-local movement round-trips across pitch, turn, and roll", () => {
  const position: ManeuverVec3 = [-6, 1.5, 8];
  const rotation: ManeuverVec3 = [24, -57, 38];
  const movement: ShipRelativeMovement = { forward: 5.5, right: -2, up: 1.25 };
  const destination = destinationFromShipMovement(position, rotation, movement);
  const recovered = shipMovementFromDestination(position, rotation, destination);

  closeTo(recovered.forward, movement.forward);
  closeTo(recovered.right, movement.right);
  closeTo(recovered.up, movement.up);
});

test("combined axis input is clamped to the upgraded spherical movement range", () => {
  const movement = clampShipMovementToRange({ forward: 3, right: 6.5, up: 0 }, 6.5);
  closeTo(Math.hypot(movement.forward, movement.right, movement.up), 6.5);
  assert.ok(movement.forward > 0);
  assert.ok(movement.right > 0);

  const unchanged = clampShipMovementToRange({ forward: 5.5, right: 2, up: 1 }, 6.5);
  assert.deepEqual(unchanged, { forward: 5.5, right: 2, up: 1 });
});

test("zero movement allowance locks every relative axis", () => {
  assert.deepEqual(
    clampShipMovementToRange({ forward: 4, right: -2, up: 1 }, 0),
    { forward: 0, right: 0, up: 0 },
  );
});

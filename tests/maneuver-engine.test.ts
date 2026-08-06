import assert from "node:assert/strict";
import test from "node:test";
import {
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

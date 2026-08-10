import assert from "node:assert/strict";
import test from "node:test";
import { createFishtankFleet, fishtankActivationOrder } from "../app/fishtankMode.ts";

const template = (index: number) => ({
  id: `template-${index}`,
  name: `Template ${index}`,
  callsign: `T-${index}`,
  className: "Test cruiser",
  team: "player" as const,
  controller: "player" as const,
  color: "#ffffff",
  position: [0, 0, 0] as [number, number, number],
  rotation: [0, 0, 0] as [number, number, number],
  shields: { fore: 10, aft: 10, port: 10, starboard: 10, dorsal: 10, ventral: 10 },
  maxShields: { fore: 10, aft: 10, port: 10, starboard: 10, dorsal: 10, ventral: 10 },
  hull: 100,
  maxHull: 100,
  eliteWeapons: [] as string[],
});

test("Fishtank creates two complete five-ship AI fleets at full strength", () => {
  const fleet = createFishtankFleet(Array.from({ length: 6 }, (_, index) => template(index)), 1);
  const allies = fleet.filter((ship) => ship.team === "ally");
  const enemies = fleet.filter((ship) => ship.team === "enemy");

  assert.equal(fleet.length, 10);
  assert.equal(allies.length, 5);
  assert.equal(enemies.length, 5);
  assert.ok(fleet.every((ship) => ship.controller === "ai"));
  assert.ok(fleet.every((ship) => ship.hull === ship.maxHull));
  assert.ok(fleet.every((ship) => ship.shields.fore === ship.maxShields.fore));
  assert.equal(new Set(fleet.map((ship) => ship.id)).size, 10);
});

test("Fishtank alternates which AI fleet receives first activation", () => {
  assert.deepEqual(fishtankActivationOrder(1).slice(0, 2), ["ally", "enemy"]);
  assert.deepEqual(fishtankActivationOrder(2).slice(0, 2), ["enemy", "ally"]);
});

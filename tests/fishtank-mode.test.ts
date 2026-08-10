import assert from "node:assert/strict";
import test from "node:test";
import {
  FISHTANK_CINEMATIC_TIMINGS,
  FISHTANK_PLANNING_DELAY_MS,
  FISHTANK_RESTART_DELAY_MS,
  createFishtankFleet,
  fishtankActivationOrder,
} from "../app/fishtankMode.ts";
import { FLEET_COLOR_PALETTES } from "../app/fleetPresentation.ts";
import { createPrimaryWeaponMount } from "../app/shipCatalog.ts";

const template = (index: number) => ({
  archetypeId: `hull-${index}`,
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
  weaponMounts: [createPrimaryWeaponMount("cannon")],
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
  assert.ok(allies.every((ship) => FLEET_COLOR_PALETTES.friendly.includes(ship.color as typeof FLEET_COLOR_PALETTES.friendly[number])));
  assert.ok(enemies.every((ship) => FLEET_COLOR_PALETTES.enemy.includes(ship.color as typeof FLEET_COLOR_PALETTES.enemy[number])));
});

test("Fishtank pacing leaves room for cinematic movement and impacts", () => {
  assert.ok(FISHTANK_PLANNING_DELAY_MS >= 1500);
  assert.ok(FISHTANK_RESTART_DELAY_MS >= 5000);
  assert.ok(FISHTANK_CINEMATIC_TIMINGS.movement >= 2500);
  assert.ok(FISHTANK_CINEMATIC_TIMINGS.cameraApproach > FISHTANK_CINEMATIC_TIMINGS.beam);
  assert.ok(FISHTANK_CINEMATIC_TIMINGS.destroyedHold > FISHTANK_CINEMATIC_TIMINGS.impactHold);
});

test("Fishtank alternates which AI fleet receives first activation", () => {
  assert.deepEqual(fishtankActivationOrder(1).slice(0, 2), ["ally", "enemy"]);
  assert.deepEqual(fishtankActivationOrder(2).slice(0, 2), ["enemy", "ally"]);
});

test("successive Fishtank matches rotate through all six hull templates", () => {
  const templates = Array.from({ length: 6 }, (_, index) => template(index));
  const hulls = new Set([
    ...createFishtankFleet(templates, 1),
    ...createFishtankFleet(templates, 2),
  ].map((ship) => ship.archetypeId));

  assert.equal(hulls.size, 6);
});

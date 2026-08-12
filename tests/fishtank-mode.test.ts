import assert from "node:assert/strict";
import test from "node:test";
import {
  FISHTANK_CINEMATIC_TIMINGS,
  FISHTANK_PLANNING_DELAY_MS,
  FISHTANK_RESTART_DELAY_MS,
  createFishtankFleet,
  createFishtankStatusRows,
  fishtankActivationOrder,
} from "../app/fishtankMode.ts";
import { FLEET_COLOR_PALETTES } from "../app/fleetPresentation.ts";
import { createPrimaryWeaponMount } from "../app/shipCatalog.ts";
import {
  FLEET_BATTLEFIELD,
  FLEET_START_SEPARATION,
  FLEET_TEAM_START_X,
  STORY_BATTLEFIELD,
} from "../app/battlefieldConfig.ts";

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
  assert.ok(allies.every((ship) => ship.position[0] === -FLEET_TEAM_START_X && ship.rotation[1] === 90));
  assert.ok(enemies.every((ship) => ship.position[0] === FLEET_TEAM_START_X && ship.rotation[1] === -90));
  assert.equal(enemies[0].position[0] - allies[0].position[0], FLEET_START_SEPARATION);
  assert.deepEqual(
    [FLEET_BATTLEFIELD.length, FLEET_BATTLEFIELD.height, FLEET_BATTLEFIELD.width],
    [STORY_BATTLEFIELD.length * 3, STORY_BATTLEFIELD.height * 2, STORY_BATTLEFIELD.width * 2],
  );
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

test("Fishtank status rows attach only active fighters and expose hull percentages", () => {
  const carrier = { id: "carrier", hull: 150, maxHull: 200 };
  const cruiser = { id: "cruiser", hull: 40, maxHull: 100 };
  const activeFighter = { id: "fighter-1", hull: 15, maxHull: 30, spawnedByShipId: carrier.id };
  const destroyedFighter = { id: "fighter-2", hull: 0, maxHull: 30, spawnedByShipId: carrier.id };
  const replacementFighter = { id: "fighter-3", hull: 30, maxHull: 30, spawnedByShipId: carrier.id };

  const rows = createFishtankStatusRows([carrier, cruiser, activeFighter, destroyedFighter, replacementFighter]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].healthPercentage, 75);
  assert.deepEqual(rows[0].fighters.map(({ fighter }) => fighter.id), [activeFighter.id, replacementFighter.id]);
  assert.deepEqual(rows[0].fighters.map(({ healthPercentage }) => healthPercentage), [50, 100]);
  assert.equal(rows[1].healthPercentage, 40);
});

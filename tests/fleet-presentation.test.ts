import assert from "node:assert/strict";
import test from "node:test";
import { FLEET_COLOR_PALETTES, fleetColorFor } from "../app/fleetPresentation.ts";

test("friendly fleets use blue-green colours and enemies use red-orange colours", () => {
  const friendly = fleetColorFor("player", "hammerhead");
  const allied = fleetColorFor("ally", "carrier");
  const enemy = fleetColorFor("enemy", "hammerhead");

  assert.ok(FLEET_COLOR_PALETTES.friendly.includes(friendly));
  assert.ok(FLEET_COLOR_PALETTES.friendly.includes(allied));
  assert.ok(FLEET_COLOR_PALETTES.enemy.includes(enemy));
  assert.ok(!FLEET_COLOR_PALETTES.friendly.includes(enemy as typeof FLEET_COLOR_PALETTES.friendly[number]));
});

test("fleet colours are deterministic for a ship identity", () => {
  assert.equal(fleetColorFor("enemy", "archer-2"), fleetColorFor("enemy", "archer-2"));
  assert.equal(fleetColorFor("player", "fighter-1"), fleetColorFor("ally", "fighter-1"));
});

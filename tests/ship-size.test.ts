import assert from "node:assert/strict";
import test from "node:test";
import {
  SHIP_SIZE_PROFILES,
  resolveSizedDurability,
  resolveSizedModelScale,
  totalDurabilityMultiplier,
} from "../app/shipSize.ts";
import type { Shields } from "../app/combatEngine.ts";

const baseShields: Shields = {
  fore: 100,
  aft: 50,
  port: 80,
  starboard: 80,
  dorsal: 60,
  ventral: 40,
};

test("size classes apply the agreed hull, shield, visual, and fleet-cost rules", () => {
  const shuttle = resolveSizedDurability(100, baseShields, "shuttle");
  const cruiser = resolveSizedDurability(100, baseShields, "cruiser");
  const large = resolveSizedDurability(100, baseShields, "large");

  assert.equal(shuttle.hull, 50);
  assert.equal(cruiser.hull, 100);
  assert.equal(large.hull, 200);
  assert.equal(shuttle.shields.fore, 50);
  assert.equal(cruiser.shields.fore, 100);
  assert.equal(large.shields.fore, 200);
  assert.deepEqual(
    Object.values(SHIP_SIZE_PROFILES).map((profile) => profile.fleetPointCost),
    [1, 3, 6],
  );
  assert.ok(resolveSizedModelScale(1, "shuttle") < resolveSizedModelScale(1, "cruiser"));
  assert.ok(resolveSizedModelScale(1, "large") > resolveSizedModelScale(1, "cruiser"));
});

test("directional shield proportions survive size scaling", () => {
  const large = resolveSizedDurability(100, baseShields, "large");
  assert.equal(large.shields.fore / large.shields.aft, 2);
  assert.equal(large.shields.port, large.shields.starboard);
});

test("Behemoth's additional 1.5 multiplier stacks on the Large 2x baseline", () => {
  const behemoth = resolveSizedDurability(100, baseShields, "large", 1.5);
  assert.equal(totalDurabilityMultiplier("large", 1.5), 3);
  assert.equal(behemoth.hull, 300);
  assert.equal(behemoth.shields.fore, 300);
});

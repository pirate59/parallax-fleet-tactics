import assert from "node:assert/strict";
import test from "node:test";
import { applyCarrierFighterCombatProfile, applyCarrierLaunches, isDisposableCarrierFighter, type CarrierCapableShip } from "../app/carrierEngine.ts";
import type { Shields } from "../app/combatEngine.ts";
import type { ShipTurnEndAbility } from "../app/shipCatalog.ts";

const ability: ShipTurnEndAbility = {
  kind: "launch-fighter",
  fighterArchetypeId: "fighter",
  maxActive: 3,
  fighterReserve: 9,
  fighterDamageMultiplier: 1.6,
  fighterDurabilityMultiplier: 0.55,
  launchOffsets: [[0, 0, 1]],
};

const shieldsAt = (value: number): Shields => ({
  fore: value,
  aft: value,
  port: value,
  starboard: value,
  dorsal: value,
  ventral: value,
});

type TestShip = CarrierCapableShip & { team: "ally" | "enemy" };

const carrier = (overrides: Partial<TestShip> = {}): TestShip => ({
  id: "carrier",
  name: "Carrier",
  hull: 100,
  team: "ally",
  fighterReserveRemaining: ability.fighterReserve,
  turnEndAbility: ability,
  ...overrides,
});

const createFighter = (source: TestShip, sequence: number): TestShip => ({
  id: `${source.id}-fighter-${sequence}`,
  name: `${source.name} Wing-${sequence}`,
  hull: 20,
  team: source.team,
  spawnedByShipId: source.id,
});

test("a living carrier launches one AI fighter per completed turn", () => {
  const first = applyCarrierLaunches([carrier()], createFighter);
  const second = applyCarrierLaunches(first.ships, createFighter);

  assert.equal(first.launches.length, 1);
  assert.equal(first.ships.length, 2);
  assert.equal(second.launches.length, 1);
  assert.equal(second.ships.at(-1)?.id, "carrier-fighter-2");
  assert.equal(second.ships.find((ship) => ship.id === "carrier")?.fighterReserveRemaining, 7);
});

test("carrier fighters receive the glass-cannon combat profile", () => {
  const tuned = applyCarrierFighterCombatProfile({
    hull: 34,
    maxHull: 34,
    shields: shieldsAt(20),
    maxShields: shieldsAt(20),
    weaponDamage: 22,
  }, ability);

  assert.equal(tuned.hull, 19);
  assert.equal(tuned.maxHull, 19);
  assert.equal(tuned.shields.fore, 11);
  assert.equal(tuned.maxShields.aft, 11);
  assert.equal(tuned.weaponDamage, 35);
});

test("carrier launch bays stop at three active fighters", () => {
  let ships: TestShip[] = [carrier()];
  for (let turn = 0; turn < 5; turn += 1) ships = applyCarrierLaunches(ships, createFighter).ships;

  assert.equal(ships.filter((ship) => ship.spawnedByShipId === "carrier" && ship.hull > 0).length, 3);
  assert.equal(ships.length, 4);
  assert.equal(ships.find((ship) => ship.id === "carrier")?.fighterReserveRemaining, 6);
});

test("carrier launch reserves stop after nine fighters for the battle", () => {
  let ships: TestShip[] = [carrier()];
  let launches = 0;
  for (let turn = 0; turn < 12; turn += 1) {
    const result = applyCarrierLaunches(ships, createFighter);
    launches += result.launches.length;
    ships = result.ships.map((ship) => ship.spawnedByShipId ? { ...ship, hull: 0 } : ship);
  }

  assert.equal(launches, 9);
  assert.equal(ships.find((ship) => ship.id === "carrier")?.fighterReserveRemaining, 0);
});

test("a destroyed fighter frees capacity while a destroyed carrier cannot launch", () => {
  let ships: TestShip[] = [carrier()];
  for (let turn = 0; turn < 3; turn += 1) ships = applyCarrierLaunches(ships, createFighter).ships;
  ships = ships.map((ship) => ship.id === "carrier-fighter-1" ? { ...ship, hull: 0 } : ship);
  const replacement = applyCarrierLaunches(ships, createFighter);
  assert.equal(replacement.launches[0]?.fighterId, "carrier-fighter-4");
  assert.equal(replacement.ships.some((ship) => ship.id === "carrier-fighter-1"), false);
  assert.equal(replacement.ships.filter(isDisposableCarrierFighter).length, 3);

  const destroyed = applyCarrierLaunches([carrier({ hull: 0 })], createFighter);
  assert.equal(destroyed.launches.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import { applyCarrierLaunches, type CarrierCapableShip } from "../app/carrierEngine.ts";
import type { ShipTurnEndAbility } from "../app/shipCatalog.ts";

const ability: ShipTurnEndAbility = {
  kind: "launch-fighter",
  fighterArchetypeId: "fighter",
  maxActive: 3,
  launchOffsets: [[0, 0, 1]],
};

type TestShip = CarrierCapableShip & { team: "ally" | "enemy" };

const carrier = (overrides: Partial<TestShip> = {}): TestShip => ({
  id: "carrier",
  name: "Carrier",
  hull: 100,
  team: "ally",
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
});

test("carrier launch bays stop at three active fighters", () => {
  let ships: TestShip[] = [carrier()];
  for (let turn = 0; turn < 5; turn += 1) ships = applyCarrierLaunches(ships, createFighter).ships;

  assert.equal(ships.filter((ship) => ship.spawnedByShipId === "carrier" && ship.hull > 0).length, 3);
  assert.equal(ships.length, 4);
});

test("a destroyed fighter frees capacity while a destroyed carrier cannot launch", () => {
  let ships: TestShip[] = [carrier()];
  for (let turn = 0; turn < 3; turn += 1) ships = applyCarrierLaunches(ships, createFighter).ships;
  ships = ships.map((ship) => ship.id === "carrier-fighter-1" ? { ...ship, hull: 0 } : ship);
  const replacement = applyCarrierLaunches(ships, createFighter);
  assert.equal(replacement.launches[0]?.fighterId, "carrier-fighter-4");

  const destroyed = applyCarrierLaunches([carrier({ hull: 0 })], createFighter);
  assert.equal(destroyed.launches.length, 0);
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  AI_RECRUIT_CONTROL,
  canToggleFriendlyControl,
  isDirectCommandShip,
  isFleetCommitReady,
  retainStoryPlayerFleet,
  type FleetControlShip,
} from "../app/fleetControl.ts";

const makeShip = (id: string, overrides: Partial<FleetControlShip> = {}): FleetControlShip => ({
  id,
  team: "player",
  controller: "player",
  hull: 100,
  ...overrides,
});

test("story recruits default to the player fleet under Standard AI control", () => {
  const recruit = makeShip("recruit", { ...AI_RECRUIT_CONTROL });

  assert.equal(recruit.team, "player");
  assert.equal(recruit.controller, "ai");
  assert.equal(recruit.aiDoctrine, "standard");
  assert.equal(isDirectCommandShip(recruit), false);
});

test("AI doctrine persists through story fleet cleanup and next-gate preparation", () => {
  const hammerhead = makeShip("hammerhead");
  const recruit = makeShip("recruit", { controller: "ai", aiDoctrine: "defensive" });
  const enemy = makeShip("enemy", { team: "enemy", controller: "ai" });
  const prepared = retainStoryPlayerFleet(structuredClone([hammerhead, recruit, enemy]));

  assert.deepEqual(prepared.map((ship) => ship.id), [hammerhead.id, recruit.id]);
  assert.equal(prepared[1].controller, "ai");
  assert.equal(prepared[1].aiDoctrine, "defensive");
});

test("AI recruits do not add drafts or staging requirements", () => {
  const hammerhead = makeShip("hammerhead");
  const recruit = makeShip("recruit", { controller: "ai", aiDoctrine: "standard" });
  const ships = [hammerhead, recruit];

  assert.equal(isFleetCommitReady(ships, new Set(), () => true), false);
  assert.equal(isFleetCommitReady(ships, new Set([hammerhead.id]), () => true), true);
  assert.equal(isFleetCommitReady(ships, new Set([hammerhead.id]), () => false), false);
});

test("an AI-only surviving player fleet can commit a turn", () => {
  const destroyedHammerhead = makeShip("hammerhead", { hull: 0 });
  const recruit = makeShip("recruit", { controller: "ai", aiDoctrine: "aggressive" });

  assert.equal(isFleetCommitReady([destroyedHammerhead, recruit], new Set(), () => false), true);
  assert.equal(isFleetCommitReady([destroyedHammerhead], new Set(), () => true), false);
});

test("friendly ships can switch control except for the locked story flagship", () => {
  const hammerhead = makeShip("hammerhead");
  const recruit = makeShip("recruit", { controller: "ai" });
  const alliedCarrier = makeShip("carrier", { team: "ally", controller: "ai" });
  const enemy = makeShip("enemy", { team: "enemy", controller: "ai" });

  assert.equal(canToggleFriendlyControl(hammerhead, hammerhead.id), false);
  assert.equal(canToggleFriendlyControl(recruit, hammerhead.id), true);
  assert.equal(canToggleFriendlyControl(alliedCarrier, hammerhead.id), true);
  assert.equal(canToggleFriendlyControl(enemy, hammerhead.id), false);
});

test("manually controlled allied-team ships add a staging requirement", () => {
  const hammerhead = makeShip("hammerhead");
  const alliedCarrier = makeShip("carrier", { team: "ally", controller: "player" });
  const ships = [hammerhead, alliedCarrier];

  assert.equal(isFleetCommitReady(ships, new Set([hammerhead.id]), () => true), false);
  assert.equal(isFleetCommitReady(ships, new Set([hammerhead.id, alliedCarrier.id]), () => true), true);
});

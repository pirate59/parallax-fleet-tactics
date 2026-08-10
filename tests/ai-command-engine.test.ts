import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  chooseAiTarget,
  generateAiCommandOrder,
  shipConditionScore,
  type AiCommandShip,
} from "../app/aiCommandEngine.ts";
import type { Shields } from "../app/combatEngine.ts";
import { createPrimaryWeaponMount } from "../app/shipCatalog.ts";

const shieldsAt = (value: number): Shields => ({
  fore: value,
  aft: value,
  port: value,
  starboard: value,
  dorsal: value,
  ventral: value,
});

const makeShip = (id: string, overrides: Partial<AiCommandShip> = {}): AiCommandShip => ({
  id,
  name: id,
  team: "player",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  shields: shieldsAt(100),
  maxShields: shieldsAt(100),
  hull: 100,
  maxHull: 100,
  maxMove: 5,
  maxTurn: 60,
  maxPitch: 40,
  maxRoll: 90,
  weaponRange: 20,
  weaponDamage: 10,
  modelId: "hammerhead",
  modelScale: 1,
  weaponMounts: [createPrimaryWeaponMount("cannon")],
  ...overrides,
});

test("combat condition weighs hull more heavily than average shielding", () => {
  const healthy = makeShip("healthy");
  const damagedHull = makeShip("damaged-hull", { hull: 20 });
  const depletedShields = makeShip("depleted-shields", { shields: shieldsAt(0) });

  assert.equal(shipConditionScore(healthy), 1);
  assert.equal(shipConditionScore(damagedHull), 0.48);
  assert.equal(shipConditionScore(depletedShields), 0.65);
  assert.ok(shipConditionScore(damagedHull) < shipConditionScore(depletedShields));
});

test("aggressive doctrine prioritises a vulnerable target over a nearer healthy one", () => {
  const ally = makeShip("ally");
  const healthyNear = makeShip("healthy-near", { team: "enemy", position: [0, 0, -5] });
  const vulnerableFar = makeShip("vulnerable-far", {
    team: "enemy",
    position: [0, 0, -15],
    hull: 10,
    shields: shieldsAt(0),
  });

  assert.equal(chooseAiTarget(ally, [ally, healthyNear, vulnerableFar], "aggressive")?.id, vulnerableFar.id);
});

test("healthy aggressive AI uses Focus Fire against a vulnerable target already in solution", () => {
  const ally = makeShip("ally", { aiDoctrine: "aggressive" });
  const target = makeShip("target", {
    team: "enemy",
    position: [0, 0, -8],
    hull: 10,
    maxHull: 100,
    shields: shieldsAt(0),
  });
  const order = generateAiCommandOrder(ally, [ally, target]);

  assert.ok(order);
  assert.equal(order.mode, "focus-fire");
  assert.equal(order.fire, true);
  assert.deepEqual(order.destination, ally.position);
});

test("damaged defensive AI doubles movement to retreat and keeps weapons safe", () => {
  const ally = makeShip("ally", {
    hull: 20,
    shields: shieldsAt(0),
    aiDoctrine: "defensive",
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -6] });
  const order = generateAiCommandOrder(ally, [ally, target]);

  assert.ok(order);
  assert.equal(order.mode, "extra-move");
  assert.equal(order.fire, false);
  assert.ok(order.destination[2] > ally.position[2], "retreat should move away from a target on the negative Z axis");
  assert.ok(new THREE.Vector3(...order.destination).distanceTo(new THREE.Vector3(...ally.position)) <= ally.maxMove * 2 + 1e-9);
});

test("defensive AI finds a legal 3D retreat instead of stalling at a grid corner", () => {
  const ally = makeShip("ally", {
    position: [20, 0, 20],
    hull: 20,
    shields: shieldsAt(0),
    aiDoctrine: "defensive",
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, 0] });
  const order = generateAiCommandOrder(ally, [ally, target]);

  assert.ok(order);
  const origin = new THREE.Vector3(...ally.position);
  const destination = new THREE.Vector3(...order.destination);
  assert.equal(order.mode, "extra-move");
  assert.ok(origin.distanceTo(destination) > 1, "edge retreat should make meaningful progress");
  assert.ok(destination.distanceTo(new THREE.Vector3(...target.position)) >= origin.distanceTo(new THREE.Vector3(...target.position)) - 0.01);
});

test("Standard doctrine changes stance as the own-ship and target conditions change", () => {
  const healthy = makeShip("healthy", { aiDoctrine: "standard" });
  const vulnerable = makeShip("vulnerable", {
    team: "enemy",
    position: [0, 0, -8],
    hull: 10,
    shields: shieldsAt(0),
  });
  const damaged = makeShip("damaged", {
    hull: 15,
    shields: shieldsAt(0),
    aiDoctrine: "standard",
  });
  const strong = makeShip("strong", { team: "enemy", position: [0, 0, -8] });

  assert.equal(generateAiCommandOrder(healthy, [healthy, vulnerable])?.mode, "focus-fire");
  assert.equal(generateAiCommandOrder(damaged, [damaged, strong])?.mode, "extra-move");
});

test("standard AI orders stay inside movement, rotation, and battlefield limits", () => {
  const ally = makeShip("ally", { position: [18, 6, 18], rotation: [5, 35, -4] });
  const target = makeShip("target", { team: "enemy", position: [-18, -6, -18] });
  const order = generateAiCommandOrder(ally, [ally, target], "standard");

  assert.ok(order);
  const travel = new THREE.Vector3(...order.destination).distanceTo(new THREE.Vector3(...ally.position));
  assert.ok(travel <= ally.maxMove + 1e-9);
  assert.ok(Math.abs(order.turn) <= ally.maxTurn);
  assert.ok(Math.abs(order.pitch) <= ally.maxPitch);
  assert.ok(Math.abs(order.roll) <= ally.maxRoll);
  assert.ok(Math.abs(order.destination[0]) <= 20);
  assert.ok(Math.abs(order.destination[1]) <= 7);
  assert.ok(Math.abs(order.destination[2]) <= 20);
});

test("AI never selects friendly, destroyed, or missing targets", () => {
  const ally = makeShip("ally");
  const friendly = makeShip("friendly", { position: [0, 0, -2] });
  const wreck = makeShip("wreck", { team: "enemy", position: [0, 0, -3], hull: 0 });

  assert.equal(chooseAiTarget(ally, [ally, friendly, wreck], "standard"), undefined);
  assert.equal(generateAiCommandOrder(ally, [ally, friendly, wreck], "standard"), null);
});

test("equal target scores use stable lexical IDs independent of input order", () => {
  const ally = makeShip("ally");
  const alpha = makeShip("alpha", { team: "enemy", position: [0, 0, -8] });
  const beta = makeShip("beta", { team: "enemy", position: [0, 0, -8] });

  assert.equal(chooseAiTarget(ally, [ally, beta, alpha], "standard")?.id, alpha.id);
  assert.equal(chooseAiTarget(ally, [alpha, ally, beta], "standard")?.id, alpha.id);
});

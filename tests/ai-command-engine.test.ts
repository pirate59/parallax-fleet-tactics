import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "three";
import {
  carrierWingTargetAssignments,
  chooseAiTarget,
  generateAiCommandOrder,
  shipConditionScore,
  type AiCommandShip,
} from "../app/aiCommandEngine.ts";
import type { Shields } from "../app/combatEngine.ts";
import { SHIP_ARCHETYPES, createPrimaryWeaponMount, createWeaponMount } from "../app/shipCatalog.ts";

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
  sizeClass: "cruiser",
  archetypeId: "generic-cruiser",
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

test("carrier-launched fighters override defensive orders with disposable aggression", () => {
  const fighter = makeShip("carrier-fighter", {
    modelId: "fighter",
    spawnedByShipId: "carrier",
    aiDoctrine: "defensive",
    aiTactics: { role: "interceptor", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 },
  });
  const target = makeShip("target", {
    team: "enemy",
    position: [0, 0, -8],
    hull: 8,
    shields: shieldsAt(0),
  });

  const order = generateAiCommandOrder(fighter, [fighter, target], "defensive");
  assert.ok(order);
  assert.equal(order.mode, "focus-fire");
  assert.equal(order.fire, true);
});

test("damaged carrier fighters focus fire whenever their target is in solution", () => {
  const fighter = makeShip("carrier-fighter", {
    modelId: "fighter",
    spawnedByShipId: "carrier",
    hull: 1,
    shields: shieldsAt(0),
    aiDoctrine: "defensive",
    aiTactics: { role: "interceptor", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 },
  });
  const healthyTarget = makeShip("healthy-target", { team: "enemy", position: [0, 0, -8] });

  const order = generateAiCommandOrder(fighter, [fighter, healthyTarget], "defensive");
  assert.equal(order?.mode, "focus-fire");
  assert.equal(order?.fire, true);
});

test("carrier fighters prefer a firing attack run over sprinting just outside range", () => {
  const fighter = makeShip("carrier-fighter", {
    modelId: "fighter",
    spawnedByShipId: "carrier",
    maxMove: 5,
    aiTactics: { role: "interceptor", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 },
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -23] });

  const order = generateAiCommandOrder(fighter, [fighter, target]);
  assert.equal(order?.mode, "normal");
  assert.equal(order?.fire, true);
  assert.ok((order?.destination[2] ?? 0) < -4.5);
});

test("fighters from one carrier share and retain a single overwhelm target", () => {
  const fighterProfile = { role: "interceptor", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 } as const;
  const fighterA = makeShip("fighter-a", {
    modelId: "fighter",
    position: [-6, 0, 0],
    spawnedByShipId: "carrier",
    aiTactics: fighterProfile,
  });
  const fighterB = makeShip("fighter-b", {
    modelId: "fighter",
    position: [6, 0, 0],
    spawnedByShipId: "carrier",
    aiTactics: fighterProfile,
  });
  const targetA = makeShip("target-a", { team: "enemy", position: [-6, 0, -9] });
  const targetB = makeShip("target-b", { team: "enemy", position: [6, 0, -9], hull: 55 });
  const fleet = [fighterA, fighterB, targetA, targetB];

  const assignments = carrierWingTargetAssignments(fleet);
  assert.ok(assignments[fighterA.id]);
  assert.equal(assignments[fighterA.id], assignments[fighterB.id]);
  const orders = [fighterA, fighterB].map((fighter) => generateAiCommandOrder(
    fighter,
    fleet,
    "standard",
    20,
    7,
    { forcedTargetId: assignments[fighter.id] },
  ));
  assert.ok(orders.every((order) => order?.targetId === assignments[fighterA.id]));

  const rememberedFleet = fleet.map((ship) => ship.id.startsWith("fighter-") ? { ...ship, lastTargetId: targetB.id } : ship);
  const rememberedAssignments = carrierWingTargetAssignments(rememberedFleet);
  assert.equal(rememberedAssignments[fighterA.id], targetB.id);
  assert.equal(rememberedAssignments[fighterB.id], targetB.id);

  const destroyedTargetFleet = rememberedFleet.map((ship) => ship.id === targetB.id ? { ...ship, hull: 0 } : ship);
  const fallbackAssignments = carrierWingTargetAssignments(destroyedTargetFleet);
  assert.equal(fallbackAssignments[fighterA.id], targetA.id);
  assert.equal(fallbackAssignments[fighterB.id], targetA.id);
});

test("carrier wings ignore disposable enemies while core targets remain", () => {
  const fighter = makeShip("fighter-a", { spawnedByShipId: "carrier", position: [0, 0, 0] });
  const carrier = makeShip("carrier", { weaponMounts: [], position: [20, 0, 20] });
  const enemyFighter = makeShip("enemy-fighter", { team: "enemy", spawnedByShipId: "enemy-carrier", position: [0, 0, -5] });
  const enemyCore = makeShip("enemy-core", { team: "enemy", position: [0, 0, -12] });

  assert.equal(carrierWingTargetAssignments([fighter, carrier, enemyFighter, enemyCore])[fighter.id], enemyCore.id);
});

test("carrier wings intercept disposable fighters with an imminent carrier attack", () => {
  const fighter = makeShip("fighter-a", { spawnedByShipId: "carrier", position: [0, 0, 0] });
  const carrier = makeShip("carrier", { weaponMounts: [], position: [0, 0, -2] });
  const enemyFighter = makeShip("enemy-fighter", {
    team: "enemy",
    spawnedByShipId: "enemy-carrier",
    position: [0, 0, -8],
    rotation: [0, 0, 0],
    lastTargetId: carrier.id,
  });
  const enemyCore = makeShip("enemy-core", { team: "enemy", position: [0, 0, -14] });

  assert.equal(carrierWingTargetAssignments([fighter, carrier, enemyFighter, enemyCore])[fighter.id], enemyFighter.id);
});

test("standard Hammerhead faces the hostile most likely to shoot it", () => {
  const hammerhead = makeShip("hammerhead", {
    maxTurn: 60,
    aiTactics: { role: "bow-tank", preferredRangeRatio: 0.62, facingPriority: "expected-threat", survivalHullRatio: 0.5 },
  });
  const vulnerableTarget = makeShip("vulnerable", {
    team: "enemy",
    position: [0, 0, -8],
    rotation: [0, 180, 0],
    hull: 10,
    shields: shieldsAt(0),
    weaponDamage: 5,
  });
  const incomingThreat = makeShip("threat", {
    team: "enemy",
    position: [8, 0, 0],
    rotation: [0, -90, 0],
    weaponDamage: 40,
  });

  const order = generateAiCommandOrder(hammerhead, [hammerhead, vulnerableTarget, incomingThreat], "standard");
  assert.ok(order);
  assert.equal(order.targetId, vulnerableTarget.id, "weapon targeting should still favour the vulnerable ship");
  assert.equal(order.turn, hammerhead.maxTurn, "reinforced bow should turn as far as possible toward the expected shooter");
});

test("standard standoff ships close using normal movement so their guns remain active", () => {
  const archer = makeShip("archer", {
    modelId: "archer",
    maxMove: 6,
    weaponRange: 20,
    weaponMounts: [createWeaponMount("railgun")],
    aiTactics: { role: "standoff", preferredRangeRatio: 0.82, facingPriority: "weapon-target", survivalHullRatio: 0.52 },
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -70] });

  const order = generateAiCommandOrder(archer, [archer, target], "standard", 100, 20);
  assert.ok(order);
  assert.equal(order.mode, "normal");
  assert.equal(order.fire, true);
  assert.ok(order.destination[2] < archer.position[2]);
});

test("a damaged non-fighter retreats with guns active until destruction becomes imminent", () => {
  const damaged = makeShip("damaged", {
    hull: 75,
    aiTactics: { role: "brawler", preferredRangeRatio: 0.62, facingPriority: "weapon-target", survivalHullRatio: 0.48 },
  });
  const target = makeShip("target", {
    team: "enemy",
    position: [0, 0, -6],
    rotation: [0, 180, 0],
    weaponDamage: 5,
  });

  const order = generateAiCommandOrder(damaged, [damaged, target], "standard");
  assert.ok(order);
  assert.equal(order.mode, "normal");
  assert.equal(order.fire, true);
  assert.ok(order.destination[2] > damaged.position[2]);
});

test("fighters do not switch to survival-only movement after hull damage", () => {
  const fighter = makeShip("fighter", {
    modelId: "fighter",
    hull: 15,
    shields: shieldsAt(0),
    aiTactics: { role: "interceptor", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 },
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -6] });

  const order = generateAiCommandOrder(fighter, [fighter, target], "standard");
  assert.ok(order);
  assert.equal(order.mode, "normal");
  assert.equal(order.fire, true);
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
    position: [18.5, 0, 18.5],
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

test("carrier fighters with a shared target reserve separate attack lanes", () => {
  const fighterProfile = { role: "interceptor", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 } as const;
  const fighterA = makeShip("wing-a", {
    modelId: "fighter",
    modelScale: 0.78,
    sizeClass: "shuttle",
    archetypeId: "fighter",
    position: [-1, 0, 0],
    spawnedByShipId: "carrier",
    aiTactics: fighterProfile,
  });
  const fighterB = makeShip("wing-b", {
    modelId: "fighter",
    modelScale: 0.78,
    sizeClass: "shuttle",
    archetypeId: "fighter",
    position: [1, 0, 0],
    spawnedByShipId: "carrier",
    aiTactics: fighterProfile,
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -30] });
  const fleet = [fighterA, fighterB, target];
  const first = generateAiCommandOrder(fighterA, fleet, "aggressive", 40, 10, { forcedTargetId: target.id });
  assert.ok(first);
  const second = generateAiCommandOrder(fighterB, fleet, "aggressive", 40, 10, {
    forcedTargetId: target.id,
    reservedDestinations: { [fighterA.id]: first.destination },
  });
  assert.ok(second);

  const separation = new THREE.Vector3(...first.destination).distanceTo(new THREE.Vector3(...second.destination));
  assert.ok(separation > 1.1, "fighters should fan out instead of stacking on one endpoint");
});

test("small AI steers its flight path away from a nearby capital ship", () => {
  const fighter = makeShip("fighter", {
    modelId: "fighter",
    modelScale: 0.78,
    sizeClass: "shuttle",
    archetypeId: "fighter",
    position: [0, 0, 0],
    aiTactics: { role: "interceptor", preferredRangeRatio: 0.5, facingPriority: "weapon-target", survivalHullRatio: 0 },
  });
  const capital = makeShip("capital", {
    modelId: "behemoth",
    modelScale: 1.94,
    sizeClass: "large",
    archetypeId: "behemoth",
    position: [0, 0, -5],
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -30] });
  const order = generateAiCommandOrder(fighter, [fighter, capital, target], "aggressive", 40, 10, { forcedTargetId: target.id });
  assert.ok(order);
  assert.ok(Math.abs(order.destination[0]) > 0.5 || Math.abs(order.destination[1]) > 0.5, "avoidance should create a lateral or vertical lane around the capital ship");
});

test("healthy Hammerhead AI deliberately uses its reinforced hull for a close ram", () => {
  const hammerhead = makeShip("hammerhead", {
    archetypeId: "hammerhead",
    sizeClass: "cruiser",
    maxMove: 5,
    aiTactics: { role: "bow-tank", preferredRangeRatio: 0.62, facingPriority: "expected-threat", survivalHullRatio: 0.5 },
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -5] });
  const order = generateAiCommandOrder(hammerhead, [hammerhead, target], "standard");
  assert.ok(order);
  assert.equal(order.mode, "normal");
  assert.equal(order.ramTargetId, target.id);
  assert.ok(new THREE.Vector3(...order.destination).distanceTo(new THREE.Vector3(...target.position)) < 0.1);
});

test("standard Behemoth advances into its twin flak engagement range", () => {
  const archetype = SHIP_ARCHETYPES.behemoth;
  const behemoth = makeShip("behemoth", {
    archetypeId: archetype.id,
    modelId: archetype.modelId,
    sizeClass: archetype.sizeClass,
    weaponRange: archetype.weaponRange,
    weaponDamage: archetype.weaponDamage,
    weaponMounts: archetype.weaponMounts,
    maxMove: archetype.maxMove,
    maxTurn: archetype.maxTurn,
    maxPitch: archetype.maxPitch,
    maxRoll: archetype.maxRoll,
    aiTactics: archetype.aiTactics,
  });
  const target = makeShip("target", { team: "enemy", position: [0, 0, -20] });
  const order = generateAiCommandOrder(behemoth, [behemoth, target], "standard");

  assert.ok(order);
  assert.equal(order.mode, "normal");
  assert.equal(order.fire, true);
  assert.ok(order.destination[2] < -1, "the Behemoth should close instead of holding rail-gun distance");
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

test("AI respects separate fleet-map length and width boundaries", () => {
  const ally = makeShip("ally", { position: [58, 13, 38] });
  const target = makeShip("target", { team: "enemy", position: [-58, -13, -38] });
  const order = generateAiCommandOrder(ally, [ally, target], "standard", 60, 14, {
    battlefieldWidthHalf: 40,
  });

  assert.ok(order);
  assert.ok(Math.abs(order.destination[0]) <= 60);
  assert.ok(Math.abs(order.destination[1]) <= 14);
  assert.ok(Math.abs(order.destination[2]) <= 40);
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

test("role fits provide the expected default mission orders", async () => {
  const { defaultAiMissionFor } = await import("../app/aiCommandEngine.ts");
  const fitted = (id: string) => {
    const archetype = SHIP_ARCHETYPES[id as keyof typeof SHIP_ARCHETYPES];
    return makeShip(id, {
      archetypeId: archetype.id,
      modelId: archetype.modelId,
      sizeClass: archetype.sizeClass,
      aiTactics: archetype.aiTactics,
    });
  };

  assert.equal(defaultAiMissionFor(fitted("fighter")), "interception");
  assert.equal(defaultAiMissionFor(fitted("archer")), "bombing");
  assert.equal(defaultAiMissionFor(fitted("carrier")), "defense");
  assert.equal(defaultAiMissionFor(fitted("hammerhead")), "assault");
});

test("mission orders change target priorities independently from doctrine", () => {
  const ally = makeShip("ally", { aiDoctrine: "standard" });
  const fighter = makeShip("fighter", {
    team: "enemy",
    sizeClass: "shuttle",
    modelId: "fighter",
    position: [0, 0, -8],
    spawnedByShipId: "carrier",
  });
  const carrier = makeShip("carrier", {
    team: "enemy",
    sizeClass: "large",
    modelId: "carrier",
    position: [0, 0, -10],
    weaponMounts: [],
    fighterReserveRemaining: 9,
    turnEndAbility: { kind: "launch-fighter", fighterArchetypeId: "fighter", maxActive: 3, fighterReserve: 9, fighterDamageMultiplier: 1.6, fighterDurabilityMultiplier: 0.55, launchOffsets: [[0, 0, 1]] },
    aiTactics: { role: "carrier", defaultMission: "defense", preferredRangeRatio: 0.9, facingPriority: "expected-threat", survivalHullRatio: 0.62 },
  });
  const fleet = [ally, fighter, carrier];

  assert.equal(chooseAiTarget(ally, fleet, "standard", "interception")?.id, fighter.id);
  assert.equal(chooseAiTarget(ally, fleet, "standard", "bombing")?.id, carrier.id);
});

test("critical shared risk overrides aggressive doctrine for a damaged non-fighter", () => {
  const damaged = makeShip("damaged", {
    hull: 32,
    shields: shieldsAt(0),
    aiDoctrine: "aggressive",
    aiMission: "assault",
    aiTactics: { role: "brawler", defaultMission: "defense", preferredRangeRatio: 0.62, facingPriority: "weapon-target", survivalHullRatio: 0.48 },
  });
  const enemies = [1, 2, 3].map((index) => makeShip(`enemy-${index}`, {
    team: "enemy",
    position: [index * 2, 0, -6],
    weaponDamage: 38,
    lastTargetId: damaged.id,
  }));
  const order = generateAiCommandOrder(damaged, [damaged, ...enemies], "aggressive");

  assert.equal(order?.mode, "extra-move");
  assert.equal(order?.fire, false);
});

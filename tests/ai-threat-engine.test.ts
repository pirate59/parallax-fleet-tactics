import assert from "node:assert/strict";
import test from "node:test";
import { assessFleetRisk, rankEnemyThreats, threatBandFor, type AiThreatShip } from "../app/aiThreatEngine.ts";
import type { Shields } from "../app/combatEngine.ts";
import { createPrimaryWeaponMount, createWeaponMount } from "../app/shipCatalog.ts";

const shieldsAt = (value: number): Shields => ({
  fore: value,
  aft: value,
  port: value,
  starboard: value,
  dorsal: value,
  ventral: value,
});

const makeShip = (id: string, overrides: Partial<AiThreatShip> = {}): AiThreatShip => ({
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
  weaponRange: 20,
  weaponDamage: 20,
  modelId: "hammerhead",
  modelScale: 1,
  sizeClass: "cruiser",
  archetypeId: "hammerhead",
  weaponMounts: [createPrimaryWeaponMount("cannon")],
  aiTactics: { role: "bow-tank", defaultMission: "assault", preferredRangeRatio: 0.62, facingPriority: "expected-threat", survivalHullRatio: 0.5 },
  ...overrides,
});

test("threat ranking separates danger to an individual ship from danger to its fleet", () => {
  const subject = makeShip("subject", { sizeClass: "shuttle", modelId: "fighter" });
  const closeFlak = makeShip("close-flak", {
    team: "enemy",
    position: [0, 0, -4],
    weaponDamage: 35,
    weaponMounts: [createWeaponMount("flak")],
    sizeClass: "large",
    modelId: "behemoth",
    aiTactics: { role: "heavy-platform", defaultMission: "assault", preferredRangeRatio: 0.7, facingPriority: "expected-threat", survivalHullRatio: 0.5 },
  });
  const distantCarrier = makeShip("distant-carrier", {
    team: "enemy",
    position: [0, 0, -30],
    weaponMounts: [],
    sizeClass: "large",
    modelId: "carrier",
    fighterReserveRemaining: 9,
    turnEndAbility: { kind: "launch-fighter" },
    aiTactics: { role: "carrier", defaultMission: "defense", preferredRangeRatio: 0.9, facingPriority: "expected-threat", survivalHullRatio: 0.62 },
  });

  const threats = rankEnemyThreats(subject, [subject, distantCarrier, closeFlak]);
  const flakAssessment = threats.find((entry) => entry.enemy.id === closeFlak.id)!;
  const carrierAssessment = threats.find((entry) => entry.enemy.id === distantCarrier.id)!;
  assert.ok(flakAssessment.threatToShip > carrierAssessment.threatToShip);
  assert.ok(carrierAssessment.strategicValue > 0.5);
});

test("fleet risk detects an outnumbered formation and uses stable threat bands", () => {
  const subject = makeShip("subject", { hull: 45, shields: shieldsAt(10) });
  const enemies = [1, 2, 3].map((index) => makeShip(`enemy-${index}`, {
    team: "enemy",
    position: [index * 2, 0, -6],
    rotation: [0, 0, 0],
    weaponDamage: 38,
    lastTargetId: subject.id,
  }));
  const risk = assessFleetRisk(subject, [subject, ...enemies]);

  assert.ok(risk.subjectRisk >= 0.78);
  assert.ok(risk.strengthBalance < 0);
  assert.equal(threatBandFor(risk.subjectRisk), "critical");
  assert.equal(risk.primaryThreat?.enemy.id, "enemy-1");
});

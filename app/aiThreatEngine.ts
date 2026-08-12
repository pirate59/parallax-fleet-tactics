import * as THREE from "three";
import {
  SHIELD_FACES,
  passiveWeaponProfilesFor,
  shotSolutionForWeapon,
  weaponProfilesFor,
  type CombatShip,
} from "./combatEngine.ts";
import type { AiTacticalProfile } from "./aiTactics.ts";
import type { ShipSizeClass } from "./shipSize.ts";

export type AiThreatShip = CombatShip & {
  maxMove?: number;
  sizeClass?: ShipSizeClass;
  archetypeId?: string;
  aiTactics?: AiTacticalProfile;
  lastTargetId?: string;
  fighterReserveRemaining?: number;
  turnEndAbility?: { kind: "launch-fighter" };
};

export type ThreatBand = "low" | "guarded" | "high" | "critical";

export type EnemyThreatAssessment<T extends AiThreatShip = AiThreatShip> = {
  enemy: T;
  distance: number;
  threatToShip: number;
  threatToFleet: number;
  vulnerability: number;
  strategicValue: number;
  hasFiringSolution: boolean;
  targetingSubject: boolean;
};

export type FleetRiskAssessment<T extends AiThreatShip = AiThreatShip> = {
  subjectRisk: number;
  fleetRisk: number;
  strengthBalance: number;
  primaryThreat?: EnemyThreatAssessment<T>;
};

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
const ratio = (value: number, maximum: number) => clamp01(value / Math.max(1, maximum));

const hostileTo = (subject: AiThreatShip, candidate: AiThreatShip) =>
  subject.team === "enemy" ? candidate.team !== "enemy" : candidate.team === "enemy";

export function threatConditionScore(ship: AiThreatShip) {
  const hull = ratio(ship.hull, ship.maxHull);
  const shields = SHIELD_FACES.reduce(
    (sum, face) => sum + ratio(ship.shields[face], ship.maxShields[face]),
    0,
  ) / SHIELD_FACES.length;
  return hull * 0.65 + shields * 0.35;
}

function remainingBuffer(ship: AiThreatShip) {
  const averageShield = SHIELD_FACES.reduce((sum, face) => sum + ship.shields[face], 0) / SHIELD_FACES.length;
  return Math.max(1, ship.hull + averageShield * 0.55);
}

function strategicValueFor(ship: AiThreatShip) {
  const sizeValue = ship.sizeClass === "large" ? 0.24 : ship.sizeClass === "cruiser" ? 0.12 : 0.03;
  const carrierValue = ship.aiTactics?.role === "carrier" || ship.turnEndAbility?.kind === "launch-fighter" ? 0.42 : 0;
  const platformValue = ship.aiTactics?.role === "heavy-platform" ? 0.24 : 0;
  const reserves = ratio(ship.fighterReserveRemaining ?? 0, 9) * 0.12;
  return clamp01(sizeValue + carrierValue + platformValue + reserves);
}

function matchupPressure(enemy: AiThreatShip, subject: AiThreatShip) {
  const weapons = weaponProfilesFor(enemy);
  const hasFlak = weapons.some((weapon) => weapon.weaponKind === "flak");
  const enemyIsInterceptor = enemy.aiTactics?.role === "interceptor" || Boolean(enemy.spawnedByShipId);
  const subjectIsCapital = subject.sizeClass === "large" || subject.aiTactics?.role === "carrier";
  if (subject.sizeClass === "shuttle" && hasFlak) return 1;
  if (subjectIsCapital && enemyIsInterceptor) return 0.72;
  if (enemy.sizeClass === "large" && subject.sizeClass === "cruiser") return 0.66;
  return 0.42;
}

function fleetStrength(ships: readonly AiThreatShip[]) {
  return ships.reduce((sum, ship) => {
    if (ship.hull <= 0) return sum;
    const weapons = [...weaponProfilesFor(ship), ...passiveWeaponProfilesFor(ship)];
    const firepower = weapons.reduce((weaponSum, weapon) => weaponSum + weapon.damage, 0);
    const mobility = Math.min(1.4, (ship.maxMove ?? 5) / 5);
    return sum + remainingBuffer(ship) * 0.45 + firepower * 0.8 + mobility * 18 + strategicValueFor(ship) * 45;
  }, 0);
}

/**
 * Ranks every living hostile by danger to one ship and to its whole fleet.
 * Values are normalized so orders and doctrines can share the same risk scale.
 */
export function rankEnemyThreats<T extends AiThreatShip>(subject: T, ships: readonly T[]): EnemyThreatAssessment<T>[] {
  const friendlies = ships.filter((ship) => ship.hull > 0 && !hostileTo(subject, ship));
  const averageFriendlyBuffer = friendlies.length
    ? friendlies.reduce((sum, ship) => sum + remainingBuffer(ship), 0) / friendlies.length
    : remainingBuffer(subject);

  return ships
    .filter((enemy) => enemy.id !== subject.id && enemy.hull > 0 && hostileTo(subject, enemy))
    .map((enemy) => {
      const weapons = [...weaponProfilesFor(enemy), ...passiveWeaponProfilesFor(enemy)];
      const distance = new THREE.Vector3(...enemy.position).distanceTo(new THREE.Vector3(...subject.position));
      const maximumRange = Math.max(...weapons.map((weapon) => weapon.range), 1);
      const totalDamage = weapons.reduce((sum, weapon) => sum + weapon.damage, 0);
      const lockedDamage = weapons
        .filter((weapon) => shotSolutionForWeapon(enemy, subject, weapon).valid)
        .reduce((sum, weapon) => sum + weapon.damage, 0);
      const rangePressure = 1 - clamp01(distance / (maximumRange * 1.3));
      const targetingSubject = enemy.lastTargetId === subject.id;
      const intentPressure = targetingSubject ? 1 : lockedDamage > 0 ? 0.72 : rangePressure * 0.42;
      const volleyPressure = clamp01((lockedDamage || totalDamage * rangePressure * 0.45) / remainingBuffer(subject));
      const fleetVolleyPressure = clamp01(totalDamage / Math.max(1, averageFriendlyBuffer * 0.8));
      const condition = threatConditionScore(enemy);
      const strategicValue = strategicValueFor(enemy);
      const threatToShip = clamp01(
        volleyPressure * 0.34
        + rangePressure * 0.2
        + intentPressure * 0.18
        + condition * 0.12
        + matchupPressure(enemy, subject) * 0.16,
      );
      const threatToFleet = clamp01(
        fleetVolleyPressure * 0.36
        + condition * 0.2
        + strategicValue * 0.28
        + rangePressure * 0.1
        + Math.min(1, (enemy.maxMove ?? 5) / 10) * 0.06,
      );
      return {
        enemy,
        distance,
        threatToShip,
        threatToFleet,
        vulnerability: 1 - condition,
        strategicValue,
        hasFiringSolution: lockedDamage > 0,
        targetingSubject,
      };
    })
    .sort((left, right) =>
      Math.max(right.threatToShip, right.threatToFleet) - Math.max(left.threatToShip, left.threatToFleet)
      || left.enemy.id.localeCompare(right.enemy.id),
    );
}

export function assessFleetRisk<T extends AiThreatShip>(subject: T, ships: readonly T[]): FleetRiskAssessment<T> {
  const threats = rankEnemyThreats(subject, ships);
  const subjectRisk = threats.slice(0, 3).reduce((risk, entry, index) => risk + entry.threatToShip / (index + 1), 0);
  const fleetRisk = threats.slice(0, 4).reduce((risk, entry, index) => risk + entry.threatToFleet / (index + 1), 0);
  const friendlyShips = ships.filter((ship) => ship.hull > 0 && !hostileTo(subject, ship));
  const enemyShips = ships.filter((ship) => ship.hull > 0 && hostileTo(subject, ship));
  const friendlyStrength = fleetStrength(friendlyShips);
  const enemyStrength = fleetStrength(enemyShips);
  return {
    subjectRisk: clamp01(subjectRisk),
    fleetRisk: clamp01(fleetRisk),
    strengthBalance: (friendlyStrength - enemyStrength) / Math.max(1, friendlyStrength + enemyStrength),
    primaryThreat: threats[0],
  };
}

export function threatBandFor(score: number): ThreatBand {
  if (score >= 0.78) return "critical";
  if (score >= 0.56) return "high";
  if (score >= 0.32) return "guarded";
  return "low";
}

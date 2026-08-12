import * as THREE from "three";
import {
  SHIELD_FACES,
  shieldFaceForHit,
  shotSolutionForWeapon,
  weaponProfilesFor,
  type CombatShip,
  type Vec3,
} from "./combatEngine.ts";
import { fireStateForMode, movementLimitFor, type FlightMode } from "./orderRules.ts";
import {
  type AiMissionOrder,
  type AiTacticalProfile,
  type AiTacticalRole,
} from "./aiTactics.ts";
import { assessFleetRisk, rankEnemyThreats, type EnemyThreatAssessment } from "./aiThreatEngine.ts";
import {
  clampCollisionPosition,
  collisionMassFor,
  collisionRadiusFor,
  isPersistentWreck,
} from "./collisionEngine.ts";
import type { ShipSizeClass } from "./shipSize.ts";
import type { ShipTurnEndAbility } from "./shipCatalog.ts";

export type AiDoctrine = "aggressive" | "standard" | "defensive";

export type AiCommandShip = CombatShip & {
  maxMove: number;
  maxTurn: number;
  maxPitch: number;
  maxRoll: number;
  aiDoctrine?: AiDoctrine;
  aiMission?: AiMissionOrder;
  aiTactics?: AiTacticalProfile;
  archetypeId?: string;
  sizeClass?: ShipSizeClass;
  spawnedByShipId?: string;
  lastTargetId?: string;
  fighterReserveRemaining?: number;
  turnEndAbility?: ShipTurnEndAbility;
};

export type AiCommandOrder = {
  destination: Vec3;
  turn: number;
  pitch: number;
  roll: number;
  targetId: string;
  fire: boolean;
  mode: FlightMode;
  ramTargetId?: string;
};

export type AiCommandOptions = {
  forcedTargetId?: string;
  mission?: AiMissionOrder;
  reservedDestinations?: Record<string, Vec3>;
  battlefieldWidthHalf?: number;
};

export const AI_DOCTRINE_ORDER: AiDoctrine[] = ["aggressive", "standard", "defensive"];

export const AI_DOCTRINE_RULES: Record<AiDoctrine, {
  label: string;
  shortRule: string;
  description: string;
}> = {
  aggressive: {
    label: "Aggressive",
    shortRule: "PRESS · FINISH",
    description: "Close quickly, prioritise damaged targets, and commit Focus Fire when a kill looks achievable.",
  },
  standard: {
    label: "Standard",
    shortRule: "HULL · ADAPT",
    description: "Fight to the hull's strengths, preserve its preferred range and facing, and protect damaged non-fighters.",
  },
  defensive: {
    label: "Defensive",
    shortRule: "KITE · SURVIVE",
    description: "Prioritise nearby threats and disengage when hull, shielding, or the matchup becomes dangerous.",
  },
};

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const normalizeAngle = (angle: number) => {
  let next = angle % 360;
  if (next > 180) next -= 360;
  if (next < -180) next += 360;
  return next;
};

const ratio = (value: number, maximum: number) => clamp(value / Math.max(1, maximum), 0, 1);

const DEFAULT_TACTICS: AiTacticalProfile = {
  role: "brawler",
  defaultMission: "defense",
  preferredRangeRatio: 0.62,
  facingPriority: "weapon-target",
  survivalHullRatio: 0.48,
};

const ROLE_MISSIONS: Record<AiTacticalRole, AiMissionOrder> = {
  "bow-tank": "assault",
  standoff: "bombing",
  brawler: "defense",
  interceptor: "interception",
  "heavy-platform": "assault",
  carrier: "defense",
};

function tacticsFor(ship: AiCommandShip) {
  return ship.aiTactics ?? DEFAULT_TACTICS;
}

function effectiveDoctrineFor(ship: AiCommandShip, requested: AiDoctrine = ship.aiDoctrine ?? "standard") {
  return ship.spawnedByShipId ? "aggressive" : requested;
}

export function defaultAiMissionFor(ship: AiCommandShip): AiMissionOrder {
  const tactics = tacticsFor(ship);
  return ship.aiMission ?? tactics.defaultMission ?? ROLE_MISSIONS[tactics.role];
}

function effectiveMissionFor(ship: AiCommandShip, requested: AiMissionOrder = defaultAiMissionFor(ship)) {
  return ship.aiMission ?? (ship.spawnedByShipId ? "assault" : requested);
}

export function shipConditionScore(ship: CombatShip) {
  const hullCondition = ratio(ship.hull, ship.maxHull);
  const shieldCondition = SHIELD_FACES.reduce(
    (sum, face) => sum + ratio(ship.shields[face], ship.maxShields[face]),
    0,
  ) / SHIELD_FACES.length;
  return hullCondition * 0.65 + shieldCondition * 0.35;
}

function targetCandidates(ship: AiCommandShip, ships: AiCommandShip[]) {
  return ships.filter((candidate) =>
    candidate.id !== ship.id
    && candidate.hull > 0
    && (ship.team === "enemy" ? candidate.team !== "enemy" : candidate.team === "enemy"),
  );
}

function targetScore(
  ship: AiCommandShip,
  target: AiCommandShip,
  doctrine: AiDoctrine,
  mission: AiMissionOrder,
  assessment: EnemyThreatAssessment<AiCommandShip>,
) {
  const maximumRange = Math.max(...weaponProfilesFor(ship).map((weapon) => weapon.range), 1);
  const distance = new THREE.Vector3(...ship.position).distanceTo(new THREE.Vector3(...target.position));
  const proximity = 1 - clamp(distance / (maximumRange * 1.6), 0, 1);
  const vulnerability = assessment.vulnerability;
  const smallStrikeCraft = target.sizeClass === "shuttle" || Boolean(target.spawnedByShipId) ? 1 : 0;
  const capitalTarget = target.sizeClass === "large" || target.aiTactics?.role === "carrier" ? 1 : 0;
  let missionScore = 0;
  if (mission === "interception") {
    missionScore = smallStrikeCraft * 0.46 + assessment.threatToFleet * 0.25 + proximity * 0.19 + vulnerability * 0.1;
  } else if (mission === "defense") {
    missionScore = assessment.threatToShip * 0.36 + assessment.threatToFleet * 0.34 + proximity * 0.2 + vulnerability * 0.1;
  } else if (mission === "bombing") {
    missionScore = assessment.strategicValue * 0.37 + capitalTarget * 0.24 + assessment.threatToFleet * 0.18 + vulnerability * 0.12 + proximity * 0.09;
  } else {
    missionScore = vulnerability * 0.4 + proximity * 0.27 + assessment.threatToFleet * 0.2 + assessment.threatToShip * 0.13;
  }

  if (ship.spawnedByShipId) return vulnerability * 0.58 + proximity * 0.2 + missionScore * 0.22;
  if (doctrine === "aggressive") return vulnerability * 0.46 + proximity * 0.2 + missionScore * 0.34;
  if (doctrine === "defensive") return assessment.threatToShip * 0.31 + assessment.threatToFleet * 0.25 + proximity * 0.16 + missionScore * 0.28;
  return missionScore * 0.58 + vulnerability * 0.17 + proximity * 0.12 + assessment.threatToFleet * 0.13;
}

export function chooseAiTarget(
  ship: AiCommandShip,
  ships: AiCommandShip[],
  doctrine: AiDoctrine = ship.aiDoctrine ?? "standard",
  mission: AiMissionOrder = defaultAiMissionFor(ship),
) {
  const effectiveDoctrine = effectiveDoctrineFor(ship, doctrine);
  const effectiveMission = effectiveMissionFor(ship, mission);
  const assessments = new Map(rankEnemyThreats(ship, ships).map((entry) => [entry.enemy.id, entry]));
  return targetCandidates(ship, ships)
    .map((target) => ({
      target,
      score: targetScore(ship, target, effectiveDoctrine, effectiveMission, assessments.get(target.id)!),
    }))
    .sort((left, right) => right.score - left.score || left.target.id.localeCompare(right.target.id))[0]?.target;
}

/** Assigns every surviving fighter from one carrier to a single persistent target. */
export function carrierWingTargetAssignments(ships: AiCommandShip[]) {
  const wings = new Map<string, AiCommandShip[]>();
  ships
    .filter((ship) => ship.hull > 0 && ship.spawnedByShipId)
    .forEach((fighter) => {
      const wing = wings.get(fighter.spawnedByShipId!) ?? [];
      wing.push(fighter);
      wings.set(fighter.spawnedByShipId!, wing);
    });

  const assignments: Record<string, string> = {};
  wings.forEach((unsortedWing) => {
    const wing = [...unsortedWing].sort((left, right) => left.id.localeCompare(right.id));
    const allTargets = targetCandidates(wing[0], ships);
    if (!allTargets.length) return;
    const parentCarrier = ships.find((ship) => ship.id === wing[0].spawnedByShipId && ship.hull > 0);
    const coreTargets = allTargets.filter((target) => !target.spawnedByShipId);
    const imminentInterceptors = parentCarrier
      ? allTargets.filter((target) => {
        if (!target.spawnedByShipId) return false;
        const assignedToCarrier = target.lastTargetId === parentCarrier.id
          || chooseAiTarget(target, ships, target.aiDoctrine ?? "aggressive")?.id === parentCarrier.id;
        if (!assignedToCarrier) return false;
        const distance = new THREE.Vector3(...target.position).distanceTo(new THREE.Vector3(...parentCarrier.position));
        const weapons = weaponProfilesFor(target);
        const maximumRange = Math.max(...weapons.map((weapon) => weapon.range), 1);
        return weapons.some((weapon) => shotSolutionForWeapon(target, parentCarrier, weapon).valid)
          || distance <= maximumRange * 1.1;
      })
      : [];
    const targets = imminentInterceptors.length > 0
      ? imminentInterceptors
      : coreTargets.length > 0
        ? coreTargets
        : allTargets;

    const rememberedCounts = new Map<string, number>();
    wing.forEach((fighter) => {
      if (!fighter.lastTargetId || !targets.some((target) => target.id === fighter.lastTargetId)) return;
      rememberedCounts.set(fighter.lastTargetId, (rememberedCounts.get(fighter.lastTargetId) ?? 0) + 1);
    });
    const rememberedTargetId = [...rememberedCounts.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0]?.[0];

    const selectedTarget = targets.find((target) => target.id === rememberedTargetId)
      ?? targets
        .map((target) => {
          const combinedDamage = wing.reduce(
            (sum, fighter) => sum + weaponProfilesFor(fighter).reduce((weaponSum, weapon) => weaponSum + weapon.damage, 0),
            0,
          );
          const averageShield = SHIELD_FACES.reduce((sum, face) => sum + target.shields[face], 0) / SHIELD_FACES.length;
          const overwhelmPotential = clamp(combinedDamage / Math.max(1, target.hull + averageShield), 0, 1.5);
          const groupTargetScore = wing.reduce((sum, fighter) => {
            const assessment = rankEnemyThreats(fighter, ships).find((entry) => entry.enemy.id === target.id)!;
            return sum + targetScore(fighter, target, "aggressive", "assault", assessment);
          }, 0) / wing.length;
          return { target, score: groupTargetScore + overwhelmPotential * 0.38 };
        })
        .sort((left, right) => right.score - left.score || left.target.id.localeCompare(right.target.id))[0]?.target;

    if (!selectedTarget) return;
    wing.forEach((fighter) => { assignments[fighter.id] = selectedTarget.id; });
  });

  return assignments;
}

function likelyAttackersFor(ship: AiCommandShip, ships: AiCommandShip[]) {
  return rankEnemyThreats(ship, ships)
    .map((threat) => {
      const attacker = threat.enemy;
      const weapons = weaponProfilesFor(attacker);
      if (!weapons.length) return null;
      const distance = new THREE.Vector3(...attacker.position).distanceTo(new THREE.Vector3(...ship.position));
      const maximumRange = Math.max(...weapons.map((weapon) => weapon.range), 1);
      const currentlyLockedDamage = weapons
        .filter((weapon) => shotSolutionForWeapon(attacker, ship, weapon).valid)
        .reduce((sum, weapon) => sum + weapon.damage, 0);
      const potentialDamage = weapons.reduce((sum, weapon) => sum + weapon.damage, 0);
      const rangePressure = 1 - clamp(distance / (maximumRange * 1.25), 0, 1);
      const projectedDamage = currentlyLockedDamage || potentialDamage * rangePressure * 0.55;
      if (!threat.targetingSubject && !threat.hasFiringSolution && threat.threatToShip < 0.3) return null;
      const score = threat.threatToShip * 100 + currentlyLockedDamage * 2 + projectedDamage + potentialDamage * 0.2 + rangePressure * 12;
      return { attacker, projectedDamage, score };
    })
    .filter((entry): entry is { attacker: AiCommandShip; projectedDamage: number; score: number } => Boolean(entry))
    .sort((left, right) => right.score - left.score || left.attacker.id.localeCompare(right.attacker.id));
}

function clampDestination(
  ship: AiCommandShip,
  destination: THREE.Vector3,
  mode: FlightMode,
  battlefieldHalf: number,
  battlefieldVerticalHalf: number,
  battlefieldWidthHalf: number,
): Vec3 {
  const origin = new THREE.Vector3(...ship.position);
  destination.set(...clampCollisionPosition(ship, destination, battlefieldHalf, battlefieldVerticalHalf, battlefieldWidthHalf));
  const offset = destination.sub(origin);
  const movementLimit = movementLimitFor(ship.maxMove, mode);
  if (offset.length() > movementLimit) offset.setLength(movementLimit);
  const result = origin.add(offset);
  return [result.x, result.y, result.z];
}

function collisionSafeDestination(
  ship: AiCommandShip,
  ships: AiCommandShip[],
  destination: Vec3,
  mode: FlightMode,
  battlefieldHalf: number,
  battlefieldVerticalHalf: number,
  battlefieldWidthHalf: number,
  reservedDestinations: Record<string, Vec3>,
  ramTargetId?: string,
) {
  let adjusted = new THREE.Vector3(...destination);
  const ownMass = collisionMassFor(ship);
  const obstacles = ships
    .filter((candidate) => candidate.id !== ship.id && (candidate.hull > 0 || isPersistentWreck(candidate)))
    .sort((left, right) => left.id.localeCompare(right.id));

  for (let pass = 0; pass < 2; pass += 1) {
    obstacles.forEach((obstacle) => {
      if (obstacle.id === ramTargetId) return;
      const obstaclePosition = new THREE.Vector3(...(reservedDestinations[obstacle.id] ?? obstacle.position));
      const origin = new THREE.Vector3(...ship.position);
      const travel = adjusted.clone().sub(origin);
      const closestTime = travel.lengthSq() <= 1e-8
        ? 0
        : clamp(obstaclePosition.clone().sub(origin).dot(travel) / travel.lengthSq(), 0, 1);
      const closestPoint = origin.clone().addScaledVector(travel, closestTime);
      const away = closestPoint.clone().sub(obstaclePosition);
      if (away.lengthSq() <= 1e-8) {
        const reference = Math.abs(travel.clone().normalize().dot(new THREE.Vector3(0, 1, 0))) > 0.9
          ? new THREE.Vector3(1, 0, 0)
          : new THREE.Vector3(0, 1, 0);
        away.crossVectors(travel.lengthSq() > 1e-8 ? travel : new THREE.Vector3(0, 0, -1), reference);
      }
      away.normalize();
      const obstacleMass = collisionMassFor(obstacle);
      const largerShipBuffer = obstacle.hull > 0 && obstacleMass > ownMass * 1.05
        ? 0.85 + Math.min(0.65, (obstacleMass / Math.max(1, ownMass) - 1) * 0.12)
        : 0.28;
      const wreckBuffer = obstacle.hull <= 0 ? 0.38 : 0;
      const minimumDistance = collisionRadiusFor(ship) + collisionRadiusFor(obstacle) + largerShipBuffer + wreckBuffer;
      const pathDistance = closestPoint.distanceTo(obstaclePosition);
      const endpointDistance = adjusted.distanceTo(obstaclePosition);
      if (pathDistance >= minimumDistance && endpointDistance >= minimumDistance) return;
      const correction = Math.max(minimumDistance - pathDistance, minimumDistance - endpointDistance, 0) + 0.18;
      adjusted.addScaledVector(away, correction);
      adjusted = new THREE.Vector3(...clampDestination(
        ship,
        adjusted,
        mode,
        battlefieldHalf,
        battlefieldVerticalHalf,
        battlefieldWidthHalf,
      ));
    });
  }
  return [adjusted.x, adjusted.y, adjusted.z] as Vec3;
}

function directionAwayFrom(ship: AiCommandShip, target: AiCommandShip) {
  const away = new THREE.Vector3(...ship.position).sub(new THREE.Vector3(...target.position));
  return away.lengthSq() > 1e-9 ? away.normalize() : new THREE.Vector3(0, 0, 1);
}

function retreatDestination(
  ship: AiCommandShip,
  target: AiCommandShip,
  away: THREE.Vector3,
  distance: number,
  mode: FlightMode,
  battlefieldHalf: number,
  battlefieldVerticalHalf: number,
  battlefieldWidthHalf: number,
) {
  const origin = new THREE.Vector3(...ship.position);
  const targetPosition = new THREE.Vector3(...target.position);
  const startingDistance = origin.distanceTo(targetPosition);
  const reference = Math.abs(away.dot(new THREE.Vector3(0, 1, 0))) > 0.9
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(away, reference).normalize();
  const lift = new THREE.Vector3().crossVectors(side, away).normalize();
  const directions = [
    away,
    side,
    side.clone().multiplyScalar(-1),
    lift,
    lift.clone().multiplyScalar(-1),
    away.clone().add(side).normalize(),
    away.clone().sub(side).normalize(),
    away.clone().add(lift).normalize(),
    away.clone().sub(lift).normalize(),
  ];

  return directions
    .map((direction, index) => {
      const destination = clampDestination(
        ship,
        origin.clone().addScaledVector(direction, distance),
        mode,
        battlefieldHalf,
        battlefieldVerticalHalf,
        battlefieldWidthHalf,
      );
      const destinationVector = new THREE.Vector3(...destination);
      return {
        destination,
        index,
        travel: origin.distanceTo(destinationVector),
        targetDistance: destinationVector.distanceTo(targetPosition),
      };
    })
    .filter((candidate) => candidate.targetDistance >= startingDistance - 0.01)
    .sort((left, right) => right.travel - left.travel || right.targetDistance - left.targetDistance || left.index - right.index)[0];
}

function firingAssessment(ship: AiCommandShip, target: AiCommandShip) {
  const weapons = weaponProfilesFor(ship);
  const validWeapons = weapons.filter((weapon) => shotSolutionForWeapon(ship, target, weapon).valid);
  const projectedDamage = validWeapons.reduce((sum, weapon) => sum + weapon.damage, 0);
  const likelyWeapon = validWeapons[0] ?? weapons[0];
  const likelyShield = likelyWeapon ? target.shields[shieldFaceForHit(target, ship, likelyWeapon)] : 0;
  return {
    hasSolution: validWeapons.length > 0,
    projectedDamage,
    canFinishWithFocus: projectedDamage * 2 >= target.hull + likelyShield,
  };
}

export function generateAiCommandOrder(
  ship: AiCommandShip,
  ships: AiCommandShip[],
  doctrine: AiDoctrine = ship.aiDoctrine ?? "standard",
  battlefieldHalf = 20,
  battlefieldVerticalHalf = 7,
  options: AiCommandOptions = {},
): AiCommandOrder | null {
  const battlefieldWidthHalf = options.battlefieldWidthHalf ?? battlefieldHalf;
  const effectiveDoctrine = effectiveDoctrineFor(ship, doctrine);
  const effectiveMission = effectiveMissionFor(ship, options.mission ?? defaultAiMissionFor(ship));
  const forcedTarget = options.forcedTargetId
    ? targetCandidates(ship, ships).find((candidate) => candidate.id === options.forcedTargetId)
    : undefined;
  const target = forcedTarget ?? chooseAiTarget(ship, ships, effectiveDoctrine, effectiveMission);
  if (!target) return null;

  const tactics = tacticsFor(ship);
  const isFighter = tactics.role === "interceptor";
  const isDisposable = Boolean(ship.spawnedByShipId);
  const ownCondition = shipConditionScore(ship);
  const targetCondition = shipConditionScore(target);
  const assessment = firingAssessment(ship, target);
  const toTarget = new THREE.Vector3(...target.position).sub(new THREE.Vector3(...ship.position));
  const distance = toTarget.length();
  const weapons = weaponProfilesFor(ship);
  const maximumRange = Math.max(...weapons.map((weapon) => weapon.range), 1);
  const targetMaximumRange = Math.max(...weaponProfilesFor(target).map((weapon) => weapon.range), 12);
  const preferredRange = tactics.role === "carrier"
    ? targetMaximumRange * tactics.preferredRangeRatio
    : maximumRange * tactics.preferredRangeRatio;
  const isOutmatched = ownCondition + 0.12 < targetCondition;
  const likelyAttackers = likelyAttackersFor(ship, ships);
  const expectedThreat = likelyAttackers[0]?.attacker;
  const fleetRisk = assessFleetRisk(ship, ships);
  const incomingDamage = likelyAttackers.reduce((sum, entry) => sum + entry.projectedDamage, 0);
  const averageShield = SHIELD_FACES.reduce((sum, face) => sum + ship.shields[face], 0) / SHIELD_FACES.length;
  const hullDamaged = !isFighter && ship.hull < ship.maxHull;
  const remainingBuffer = ship.hull + averageShield * 0.4;
  const imminentDestruction = hullDamaged && (
    ratio(ship.hull, ship.maxHull) <= tactics.survivalHullRatio
    || incomingDamage >= remainingBuffer * 0.55
    || fleetRisk.subjectRisk >= (effectiveDoctrine === "aggressive" ? 0.88 : effectiveDoctrine === "defensive" ? 0.48 : 0.68)
  );
  const canCommitFocus = tactics.facingPriority === "weapon-target"
    || !expectedThreat
    || expectedThreat.id === target.id;
  const ramCapable = !isDisposable
    && !hullDamaged
    && (ship.archetypeId === "hammerhead" || ship.sizeClass === "large");
  const ramTargetPosition = options.reservedDestinations?.[target.id] ?? target.position;
  const ramDistance = new THREE.Vector3(...ship.position).distanceTo(new THREE.Vector3(...ramTargetPosition));
  const rammingOpportunity = ramCapable
    && effectiveMission === "assault"
    && effectiveDoctrine !== "defensive"
    && ownCondition >= 0.58
    && collisionMassFor(ship) >= collisionMassFor(target)
    && ramDistance <= movementLimitFor(ship.maxMove, "normal") + collisionRadiusFor(ship) + collisionRadiusFor(target) * 0.72;

  let mode: FlightMode = "normal";
  if (imminentDestruction && !isDisposable) {
    // Mission and doctrine can accept more or less risk, but non-disposable
    // ships break contact when the shared threat picture predicts a kill.
    mode = "extra-move";
  } else if (effectiveDoctrine === "aggressive") {
    if (isDisposable && assessment.hasSolution) {
      mode = "focus-fire";
    } else if (ownCondition >= 0.38 && assessment.hasSolution && (assessment.canFinishWithFocus || targetCondition < 0.42)) {
      mode = "focus-fire";
    } else if (distance > maximumRange * (isDisposable ? 1.35 : 1.05)) {
      mode = "extra-move";
    }
  } else if (effectiveDoctrine === "defensive") {
    if (ownCondition < 0.72 || isOutmatched || distance < maximumRange * 0.58) mode = "extra-move";
  } else if ((!hullDamaged || !expectedThreat) && ownCondition > 0.66 && assessment.hasSolution && assessment.canFinishWithFocus && canCommitFocus) {
    mode = "focus-fire";
  }
  if (rammingOpportunity) mode = "normal";

  const direction = toTarget.lengthSq() > 1e-9
    ? toTarget.normalize()
    : new THREE.Vector3(0, 0, -1);
  let movementLimit = movementLimitFor(ship.maxMove, mode);
  let movementDirection = direction.clone();
  let movementFraction = 0;
  let selectedDestination: Vec3 | null = null;
  if (rammingOpportunity) {
    movementFraction = 1;
    selectedDestination = clampDestination(
      ship,
      new THREE.Vector3(...ramTargetPosition),
      mode,
      battlefieldHalf,
      battlefieldVerticalHalf,
      battlefieldWidthHalf,
    );
  } else if (mode === "extra-move") {
    const shouldRetreat = effectiveDoctrine === "defensive"
      || imminentDestruction
      || (!isDisposable && !isFighter && (ownCondition < 0.4 || isOutmatched));
    movementDirection = shouldRetreat ? direction.clone().multiplyScalar(-1) : direction;
    movementFraction = shouldRetreat ? 0.88 : 0.9;
    if (shouldRetreat) {
      const retreatTarget = expectedThreat ?? target;
      const retreatDirection = directionAwayFrom(ship, retreatTarget);
      const retreat = retreatDestination(
        ship,
        retreatTarget,
        retreatDirection,
        movementLimit * movementFraction,
        mode,
        battlefieldHalf,
        battlefieldVerticalHalf,
        battlefieldWidthHalf,
      );
      if (retreat && retreat.travel > 0.25) {
        selectedDestination = retreat.destination;
      } else {
        // If every safe escape vector is blocked by the grid edge, keep the
        // weapons available rather than repeating a zero-distance sprint.
        mode = "normal";
        movementLimit = movementLimitFor(ship.maxMove, mode);
        movementFraction = 0;
      }
    }
  } else if (mode === "normal") {
    if (effectiveDoctrine === "aggressive") {
      movementFraction = isDisposable
        ? (distance > maximumRange * 0.25 ? 0.95 : 0.35)
        : (distance > maximumRange * 0.45 ? 0.78 : 0.22);
    }
    if (effectiveDoctrine === "standard") {
      if (hullDamaged) {
        const retreatTarget = expectedThreat ?? target;
        const retreatDirection = directionAwayFrom(ship, retreatTarget);
        const retreat = retreatDestination(
          ship,
          retreatTarget,
          retreatDirection,
          movementLimit * 0.58,
          mode,
          battlefieldHalf,
          battlefieldVerticalHalf,
          battlefieldWidthHalf,
        );
        if (retreat?.travel && retreat.travel > 0.25) selectedDestination = retreat.destination;
      } else {
        const missionPreferredRange = effectiveMission === "bombing"
          ? Math.max(preferredRange, maximumRange * 0.78)
          : effectiveMission === "interception"
            ? Math.min(preferredRange, maximumRange * 0.54)
            : preferredRange;
        const lowerBand = missionPreferredRange * 0.82;
        const upperBand = missionPreferredRange * 1.06;
        if (distance > upperBand) {
          movementDirection = direction;
          movementFraction = clamp((distance - missionPreferredRange) / Math.max(1, movementLimit), 0.22, tactics.role === "standoff" ? 0.7 : 0.62);
        } else if (distance < lowerBand) {
          const retreat = retreatDestination(
            ship,
            target,
            direction.clone().multiplyScalar(-1),
            movementLimit * (tactics.role === "standoff" ? 0.52 : 0.38),
            mode,
            battlefieldHalf,
            battlefieldVerticalHalf,
            battlefieldWidthHalf,
          );
          if (retreat?.travel && retreat.travel > 0.25) selectedDestination = retreat.destination;
        } else {
          const reference = Math.abs(direction.y) > 0.9 ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(0, 1, 0);
          movementDirection = new THREE.Vector3().crossVectors(direction, reference).normalize();
          if (ship.id.length % 2) movementDirection.multiplyScalar(-1);
          movementFraction = tactics.role === "standoff" ? 0.22 : 0.14;
        }
      }
    }
    if (effectiveDoctrine === "defensive") {
      movementDirection = distance < maximumRange * 0.92 ? direction.clone().multiplyScalar(-1) : direction;
      movementFraction = distance < maximumRange * 0.92 ? 0.62 : 0.16;
    }
  }

  const desiredDestination = new THREE.Vector3(...ship.position)
    .addScaledVector(movementDirection, movementLimit * movementFraction);
  const rawDestination = selectedDestination
    ?? clampDestination(ship, desiredDestination, mode, battlefieldHalf, battlefieldVerticalHalf, battlefieldWidthHalf);
  const destination = collisionSafeDestination(
    ship,
    ships,
    rawDestination,
    mode,
    battlefieldHalf,
    battlefieldVerticalHalf,
    battlefieldWidthHalf,
    options.reservedDestinations ?? {},
    rammingOpportunity ? target.id : undefined,
  );
  const facingTarget = effectiveDoctrine === "standard"
    && tactics.facingPriority === "expected-threat"
    && expectedThreat
    ? expectedThreat
    : target;
  const aimDelta = new THREE.Vector3(...facingTarget.position).sub(new THREE.Vector3(...destination));
  const desiredTurn = THREE.MathUtils.radToDeg(Math.atan2(aimDelta.x, -aimDelta.z));
  const desiredPitch = THREE.MathUtils.radToDeg(Math.atan2(aimDelta.y, Math.hypot(aimDelta.x, aimDelta.z)));
  const turn = clamp(normalizeAngle(desiredTurn - ship.rotation[1]), -ship.maxTurn, ship.maxTurn);
  const pitch = clamp(desiredPitch - ship.rotation[0], -ship.maxPitch, ship.maxPitch);
  const rollFactor = isDisposable ? -0.58 : effectiveDoctrine === "aggressive" ? -0.42 : effectiveDoctrine === "defensive" ? 0.46 : -0.18;

  return {
    destination,
    turn,
    pitch,
    roll: clamp(turn * rollFactor, -ship.maxRoll, ship.maxRoll),
    targetId: target.id,
    fire: fireStateForMode(mode, true),
    mode,
    ramTargetId: rammingOpportunity ? target.id : undefined,
  };
}

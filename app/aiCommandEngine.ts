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
import type { AiTacticalProfile } from "./aiTactics.ts";

export type AiDoctrine = "aggressive" | "standard" | "defensive";

export type AiCommandShip = CombatShip & {
  maxMove: number;
  maxTurn: number;
  maxPitch: number;
  maxRoll: number;
  aiDoctrine?: AiDoctrine;
  aiTactics?: AiTacticalProfile;
  archetypeId?: string;
  spawnedByShipId?: string;
  lastTargetId?: string;
};

export type AiCommandOrder = {
  destination: Vec3;
  turn: number;
  pitch: number;
  roll: number;
  targetId: string;
  fire: boolean;
  mode: FlightMode;
};

export type AiCommandOptions = {
  forcedTargetId?: string;
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
  preferredRangeRatio: 0.62,
  facingPriority: "weapon-target",
  survivalHullRatio: 0.48,
};

function tacticsFor(ship: AiCommandShip) {
  return ship.aiTactics ?? DEFAULT_TACTICS;
}

function effectiveDoctrineFor(ship: AiCommandShip, requested: AiDoctrine = ship.aiDoctrine ?? "standard") {
  return ship.spawnedByShipId ? "aggressive" : requested;
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

function targetScore(ship: AiCommandShip, target: AiCommandShip, doctrine: AiDoctrine) {
  const maximumRange = Math.max(...weaponProfilesFor(ship).map((weapon) => weapon.range), 1);
  const distance = new THREE.Vector3(...ship.position).distanceTo(new THREE.Vector3(...target.position));
  const proximity = 1 - clamp(distance / (maximumRange * 1.6), 0, 1);
  const vulnerability = 1 - shipConditionScore(target);
  const threat = clamp(
    (target.weaponDamage * weaponProfilesFor(target).length) / Math.max(1, ship.maxHull * 0.7),
    0,
    1,
  );

  if (doctrine === "aggressive") return vulnerability * 0.58 + proximity * 0.27 + threat * 0.15;
  if (doctrine === "defensive") return proximity * 0.52 + threat * 0.34 + vulnerability * 0.14;
  return proximity * 0.38 + vulnerability * 0.37 + threat * 0.25;
}

export function chooseAiTarget(ship: AiCommandShip, ships: AiCommandShip[], doctrine: AiDoctrine = ship.aiDoctrine ?? "standard") {
  const effectiveDoctrine = effectiveDoctrineFor(ship, doctrine);
  return targetCandidates(ship, ships)
    .map((target) => ({ target, score: targetScore(ship, target, effectiveDoctrine) }))
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
    const targets = targetCandidates(wing[0], ships);
    if (!targets.length) return;

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
          const groupTargetScore = wing.reduce((sum, fighter) => sum + targetScore(fighter, target, "aggressive"), 0) / wing.length;
          return { target, score: groupTargetScore + overwhelmPotential * 0.38 };
        })
        .sort((left, right) => right.score - left.score || left.target.id.localeCompare(right.target.id))[0]?.target;

    if (!selectedTarget) return;
    wing.forEach((fighter) => { assignments[fighter.id] = selectedTarget.id; });
  });

  return assignments;
}

function likelyAttackersFor(ship: AiCommandShip, ships: AiCommandShip[]) {
  return targetCandidates(ship, ships)
    .map((attacker) => {
      const predictedTarget = chooseAiTarget(attacker, ships, effectiveDoctrineFor(attacker));
      if (predictedTarget?.id !== ship.id) return null;
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
      const score = currentlyLockedDamage * 2 + projectedDamage + potentialDamage * 0.2 + rangePressure * 12;
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
): Vec3 {
  const origin = new THREE.Vector3(...ship.position);
  destination.set(
    clamp(destination.x, -battlefieldHalf, battlefieldHalf),
    clamp(destination.y, -battlefieldVerticalHalf, battlefieldVerticalHalf),
    clamp(destination.z, -battlefieldHalf, battlefieldHalf),
  );
  const offset = destination.sub(origin);
  const movementLimit = movementLimitFor(ship.maxMove, mode);
  if (offset.length() > movementLimit) offset.setLength(movementLimit);
  const result = origin.add(offset);
  return [result.x, result.y, result.z];
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
  const effectiveDoctrine = effectiveDoctrineFor(ship, doctrine);
  const forcedTarget = options.forcedTargetId
    ? targetCandidates(ship, ships).find((candidate) => candidate.id === options.forcedTargetId)
    : undefined;
  const target = forcedTarget ?? chooseAiTarget(ship, ships, effectiveDoctrine);
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
  const incomingDamage = likelyAttackers.reduce((sum, entry) => sum + entry.projectedDamage, 0);
  const averageShield = SHIELD_FACES.reduce((sum, face) => sum + ship.shields[face], 0) / SHIELD_FACES.length;
  const hullDamaged = !isFighter && ship.hull < ship.maxHull;
  const remainingBuffer = ship.hull + averageShield * 0.4;
  const imminentDestruction = hullDamaged && (
    ratio(ship.hull, ship.maxHull) <= tactics.survivalHullRatio
    || incomingDamage >= remainingBuffer * 0.55
  );
  const canCommitFocus = tactics.facingPriority === "weapon-target"
    || !expectedThreat
    || expectedThreat.id === target.id;

  let mode: FlightMode = "normal";
  if (effectiveDoctrine === "aggressive") {
    if (ownCondition >= 0.38 && assessment.hasSolution && (assessment.canFinishWithFocus || targetCondition < 0.42)) {
      mode = "focus-fire";
    } else if (distance > maximumRange * 1.05) {
      mode = "extra-move";
    }
  } else if (effectiveDoctrine === "defensive") {
    if (ownCondition < 0.72 || isOutmatched || distance < maximumRange * 0.58) mode = "extra-move";
  } else if (imminentDestruction) {
    mode = "extra-move";
  } else if ((!hullDamaged || !expectedThreat) && ownCondition > 0.66 && assessment.hasSolution && assessment.canFinishWithFocus && canCommitFocus) {
    mode = "focus-fire";
  }

  const direction = toTarget.lengthSq() > 1e-9
    ? toTarget.normalize()
    : new THREE.Vector3(0, 0, -1);
  let movementLimit = movementLimitFor(ship.maxMove, mode);
  let movementDirection = direction.clone();
  let movementFraction = 0;
  let selectedDestination: Vec3 | null = null;
  if (mode === "extra-move") {
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
    if (effectiveDoctrine === "aggressive") movementFraction = distance > maximumRange * 0.45 ? 0.78 : 0.22;
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
        );
        if (retreat?.travel && retreat.travel > 0.25) selectedDestination = retreat.destination;
      } else {
        const lowerBand = preferredRange * 0.82;
        const upperBand = preferredRange * 1.06;
        if (distance > upperBand) {
          movementDirection = direction;
          movementFraction = clamp((distance - preferredRange) / Math.max(1, movementLimit), 0.22, tactics.role === "standoff" ? 0.7 : 0.62);
        } else if (distance < lowerBand) {
          const retreat = retreatDestination(
            ship,
            target,
            direction.clone().multiplyScalar(-1),
            movementLimit * (tactics.role === "standoff" ? 0.52 : 0.38),
            mode,
            battlefieldHalf,
            battlefieldVerticalHalf,
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
  const destination = selectedDestination
    ?? clampDestination(ship, desiredDestination, mode, battlefieldHalf, battlefieldVerticalHalf);
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
  const rollFactor = effectiveDoctrine === "aggressive" ? -0.42 : effectiveDoctrine === "defensive" ? 0.46 : -0.18;

  return {
    destination,
    turn,
    pitch,
    roll: clamp(turn * rollFactor, -ship.maxRoll, ship.maxRoll),
    targetId: target.id,
    fire: fireStateForMode(mode, true),
    mode,
  };
}

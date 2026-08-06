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

export type AiDoctrine = "aggressive" | "standard" | "defensive";

export type AiCommandShip = CombatShip & {
  maxMove: number;
  maxTurn: number;
  maxPitch: number;
  maxRoll: number;
  aiDoctrine?: AiDoctrine;
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
    shortRule: "BALANCE · ADAPT",
    description: "Balance target weakness, range, incoming threat, and the wingmate's remaining combat strength.",
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
  return targetCandidates(ship, ships)
    .map((target) => ({ target, score: targetScore(ship, target, doctrine) }))
    .sort((left, right) => right.score - left.score || left.target.id.localeCompare(right.target.id))[0]?.target;
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

function retreatDestination(
  ship: AiCommandShip,
  target: AiCommandShip,
  away: THREE.Vector3,
  distance: number,
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
        "extra-move",
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
): AiCommandOrder | null {
  const target = chooseAiTarget(ship, ships, doctrine);
  if (!target) return null;

  const ownCondition = shipConditionScore(ship);
  const targetCondition = shipConditionScore(target);
  const assessment = firingAssessment(ship, target);
  const toTarget = new THREE.Vector3(...target.position).sub(new THREE.Vector3(...ship.position));
  const distance = toTarget.length();
  const maximumRange = Math.max(...weaponProfilesFor(ship).map((weapon) => weapon.range), 1);
  const isOutmatched = ownCondition + 0.12 < targetCondition;

  let mode: FlightMode = "normal";
  if (doctrine === "aggressive") {
    if (ownCondition >= 0.38 && assessment.hasSolution && (assessment.canFinishWithFocus || targetCondition < 0.42)) {
      mode = "focus-fire";
    } else if (distance > maximumRange * 1.05) {
      mode = "extra-move";
    }
  } else if (doctrine === "defensive") {
    if (ownCondition < 0.72 || isOutmatched || distance < maximumRange * 0.58) mode = "extra-move";
  } else if (ownCondition < 0.34 && (isOutmatched || distance < maximumRange)) {
    mode = "extra-move";
  } else if (ownCondition > 0.66 && assessment.hasSolution && assessment.canFinishWithFocus) {
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
    const shouldRetreat = doctrine === "defensive" || ownCondition < 0.4 || isOutmatched;
    movementDirection = shouldRetreat ? direction.clone().multiplyScalar(-1) : direction;
    movementFraction = shouldRetreat ? 0.88 : 0.9;
    if (shouldRetreat) {
      const retreat = retreatDestination(
        ship,
        target,
        movementDirection,
        movementLimit * movementFraction,
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
    if (doctrine === "aggressive") movementFraction = distance > maximumRange * 0.45 ? 0.78 : 0.22;
    if (doctrine === "standard") {
      movementDirection = distance < maximumRange * 0.48 ? direction.clone().multiplyScalar(-1) : direction;
      movementFraction = distance > maximumRange * 0.78 ? 0.58 : distance < maximumRange * 0.48 ? 0.34 : 0.2;
    }
    if (doctrine === "defensive") {
      movementDirection = distance < maximumRange * 0.92 ? direction.clone().multiplyScalar(-1) : direction;
      movementFraction = distance < maximumRange * 0.92 ? 0.62 : 0.16;
    }
  }

  const desiredDestination = new THREE.Vector3(...ship.position)
    .addScaledVector(movementDirection, movementLimit * movementFraction);
  const destination = selectedDestination
    ?? clampDestination(ship, desiredDestination, mode, battlefieldHalf, battlefieldVerticalHalf);
  const aimDelta = new THREE.Vector3(...target.position).sub(new THREE.Vector3(...destination));
  const desiredTurn = THREE.MathUtils.radToDeg(Math.atan2(aimDelta.x, -aimDelta.z));
  const desiredPitch = THREE.MathUtils.radToDeg(Math.atan2(aimDelta.y, Math.hypot(aimDelta.x, aimDelta.z)));
  const turn = clamp(normalizeAngle(desiredTurn - ship.rotation[1]), -ship.maxTurn, ship.maxTurn);
  const pitch = clamp(desiredPitch - ship.rotation[0], -ship.maxPitch, ship.maxPitch);
  const rollFactor = doctrine === "aggressive" ? -0.42 : doctrine === "defensive" ? 0.46 : -0.18;

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

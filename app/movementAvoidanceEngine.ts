import * as THREE from "three";
import {
  clampCollisionPosition,
  collisionMassFor,
  collisionRadiusFor,
  isPersistentWreck,
  movementPathClearance,
  type CollisionShip,
} from "./collisionEngine.ts";
import { movementLimitFor, type FlightMode } from "./orderRules.ts";
import type { Vec3 } from "./combatEngine.ts";

export type MovementAvoidanceShip = CollisionShip & {
  controller?: "player" | "ai";
  maxMove: number;
  evasiveManeuverAvailable?: boolean;
};

export type MovementAvoidanceOrder = {
  destination: Vec3;
  targetId: string;
  fire: boolean;
  mode: FlightMode;
  ramTargetId?: string;
};

export type MovementAvoidanceResult<TShip extends MovementAvoidanceShip, TOrder extends MovementAvoidanceOrder> = {
  ships: TShip[];
  orders: Record<string, TOrder>;
  outcomes: string[];
  avoidedCount: number;
  evasiveShipIds: string[];
};

type Bounds = {
  halfLength: number;
  halfHeight: number;
  halfWidth: number;
};

const EPSILON = 0.001;

function fallbackDirection(id: string) {
  const seed = [...id].reduce((sum, character) => sum + character.charCodeAt(0), 0);
  const angle = (seed % 360) * Math.PI / 180;
  return new THREE.Vector3(Math.cos(angle), ((seed % 5) - 2) * 0.12, Math.sin(angle)).normalize();
}

export function collisionSafeLaunchPosition(
  carrier: Pick<MovementAvoidanceShip, "id" | "position" | "modelId" | "modelScale">,
  fighter: Pick<MovementAvoidanceShip, "modelId" | "modelScale">,
  desiredPosition: Vec3,
  bounds: Bounds,
) {
  const origin = new THREE.Vector3(...carrier.position);
  const desiredOffset = new THREE.Vector3(...desiredPosition).sub(origin);
  const direction = desiredOffset.lengthSq() > 1e-8
    ? desiredOffset.normalize()
    : fallbackDirection(carrier.id);
  const reference = Math.abs(direction.dot(new THREE.Vector3(0, 1, 0))) > 0.88
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(direction, reference).normalize();
  const lift = new THREE.Vector3().crossVectors(side, direction).normalize();
  const clearance = collisionRadiusFor(carrier) + collisionRadiusFor(fighter) + 0.65;
  const launchDistance = Math.max(clearance, new THREE.Vector3(...desiredPosition).distanceTo(origin));
  const directions = [
    direction,
    direction.clone().add(side).normalize(),
    direction.clone().sub(side).normalize(),
    direction.clone().add(lift).normalize(),
    direction.clone().sub(lift).normalize(),
    side,
    side.clone().multiplyScalar(-1),
    lift,
    lift.clone().multiplyScalar(-1),
    direction.clone().multiplyScalar(-1),
  ];

  return directions.map((candidateDirection, index) => {
    const position = clampCollisionPosition(
      fighter,
      origin.clone().addScaledVector(candidateDirection, launchDistance),
      bounds.halfLength,
      bounds.halfHeight,
      bounds.halfWidth,
    );
    return {
      position,
      index,
      separation: new THREE.Vector3(...position).distanceTo(origin),
    };
  }).sort((left, right) => {
    const leftSafe = left.separation >= clearance - EPSILON;
    const rightSafe = right.separation >= clearance - EPSILON;
    if (leftSafe !== rightSafe) return leftSafe ? -1 : 1;
    if (leftSafe && rightSafe) return left.index - right.index;
    return right.separation - left.separation || left.index - right.index;
  })[0].position;
}

function avoidanceBuffer(ship: MovementAvoidanceShip, obstacle: MovementAvoidanceShip, emergency: boolean) {
  const ownMass = collisionMassFor(ship);
  const obstacleMass = collisionMassFor(obstacle);
  const sizePressure = obstacleMass > ownMass
    ? Math.min(0.9, (obstacleMass / Math.max(ownMass, 0.1) - 1) * 0.16)
    : 0;
  return (emergency ? 0.72 : 0.28) + sizePressure + (isPersistentWreck(obstacle) ? 0.22 : 0);
}

function pathRisk<TShip extends MovementAvoidanceShip, TOrder extends MovementAvoidanceOrder>(
  ship: TShip,
  destination: Vec3,
  sourceById: Map<string, TShip>,
  intendedById: Map<string, TShip>,
  orders: Record<string, TOrder>,
  emergency: boolean,
) {
  const ownOrder = orders[ship.id];
  const start = sourceById.get(ship.id)?.position ?? ship.position;
  const risks = [...intendedById.values()]
    .filter((obstacle) => obstacle.id !== ship.id && (obstacle.hull > 0 || isPersistentWreck(obstacle)))
    .filter((obstacle) => obstacle.id !== ownOrder?.ramTargetId)
    .map((obstacle) => {
      const obstacleStart = sourceById.get(obstacle.id)?.position ?? obstacle.position;
      const clearance = movementPathClearance(
        ship,
        start,
        destination,
        obstacle,
        obstacleStart,
        obstacle.position,
        avoidanceBuffer(ship, obstacle, emergency),
      );
      const actual = movementPathClearance(
        ship,
        start,
        destination,
        obstacle,
        obstacleStart,
        obstacle.position,
      );
      return { obstacle, ...clearance, actualCollision: actual.clearance <= EPSILON };
    })
    .sort((left, right) => left.clearance - right.clearance || left.obstacle.id.localeCompare(right.obstacle.id));
  return {
    risks,
    minimumClearance: risks[0]?.clearance ?? Number.POSITIVE_INFINITY,
    actualCollision: risks.some((risk) => risk.actualCollision),
  };
}

function candidateDestinations(
  ship: MovementAvoidanceShip,
  desiredDestination: Vec3,
  threat: MovementAvoidanceShip,
  sourceById: Map<string, MovementAvoidanceShip>,
  emergency: boolean,
  bounds: Bounds,
) {
  const origin = new THREE.Vector3(...(sourceById.get(ship.id)?.position ?? ship.position));
  const desired = new THREE.Vector3(...desiredDestination);
  const currentTravel = desired.clone().sub(origin);
  const travelDistance = emergency
    ? movementLimitFor(ship.maxMove, "normal") * 0.92
    : currentTravel.length();
  if (travelDistance <= 0.05) return [];

  const base = currentTravel.lengthSq() > 1e-8
    ? currentTravel.normalize()
    : fallbackDirection(ship.id);
  const reference = Math.abs(base.dot(new THREE.Vector3(0, 1, 0))) > 0.88
    ? new THREE.Vector3(1, 0, 0)
    : new THREE.Vector3(0, 1, 0);
  const side = new THREE.Vector3().crossVectors(base, reference).normalize();
  const lift = new THREE.Vector3().crossVectors(side, base).normalize();
  const threatEnd = new THREE.Vector3(...threat.position);
  const away = origin.clone().sub(threatEnd);
  const safeAway = away.lengthSq() > 1e-8 ? away.normalize() : side.clone();
  const directions = [
    base.clone().addScaledVector(side, 0.7).normalize(),
    base.clone().addScaledVector(side, -0.7).normalize(),
    base.clone().addScaledVector(lift, 0.7).normalize(),
    base.clone().addScaledVector(lift, -0.7).normalize(),
    base.clone().addScaledVector(side, 1.35).normalize(),
    base.clone().addScaledVector(side, -1.35).normalize(),
    base.clone().addScaledVector(lift, 1.35).normalize(),
    base.clone().addScaledVector(lift, -1.35).normalize(),
    safeAway.clone(),
    safeAway.clone().add(side).normalize(),
    safeAway.clone().sub(side).normalize(),
    safeAway.clone().add(lift).normalize(),
    safeAway.clone().sub(lift).normalize(),
  ];
  const distanceScales = emergency ? [1, 0.78, 0.58] : [1, 0.82];

  return directions.flatMap((direction, directionIndex) => distanceScales.map((scale, scaleIndex) => {
    const unclamped = origin.clone().addScaledVector(direction, travelDistance * scale);
    const destination = clampCollisionPosition(
      ship,
      unclamped,
      bounds.halfLength,
      bounds.halfHeight,
      bounds.halfWidth,
    );
    return {
      destination,
      index: directionIndex * distanceScales.length + scaleIndex,
      deviation: new THREE.Vector3(...destination).distanceTo(desired),
      travel: new THREE.Vector3(...destination).distanceTo(origin),
    };
  })).filter((candidate) => candidate.travel > 0.2);
}

/**
 * Deconflicts AI flight paths after every ship has committed an order. Explicit
 * ramming targets are excluded; carrier fighters may burn their one-use evasive
 * manoeuvre to break any otherwise-colliding path and automatically hold fire.
 */
export function applyAiMovementAvoidance<
  TShip extends MovementAvoidanceShip,
  TOrder extends MovementAvoidanceOrder,
>(
  sourceShips: TShip[],
  intendedShips: TShip[],
  sourceOrders: Record<string, TOrder>,
  bounds: Bounds,
): MovementAvoidanceResult<TShip, TOrder> {
  const ships = intendedShips.map((ship) => ({ ...ship, position: [...ship.position] as Vec3 })) as TShip[];
  const orders = Object.fromEntries(
    Object.entries(sourceOrders).map(([id, order]) => [id, { ...order, destination: [...order.destination] as Vec3 }]),
  ) as Record<string, TOrder>;
  const sourceById = new Map(sourceShips.map((ship) => [ship.id, ship]));
  const intendedById = new Map(ships.map((ship) => [ship.id, ship]));
  const outcomes: string[] = [];
  const evasiveShipIds: string[] = [];
  let avoidedCount = 0;

  const movers = ships
    .filter((ship) => ship.controller === "ai" && ship.hull > 0 && orders[ship.id])
    .sort((left, right) => collisionMassFor(left) - collisionMassFor(right) || left.id.localeCompare(right.id));

  movers.forEach((ship) => {
    const order = orders[ship.id];
    const currentRisk = pathRisk(ship, ship.position, sourceById, intendedById, orders, false);
    if (currentRisk.minimumClearance > EPSILON) return;

    const hasEvasiveCharge = Boolean(ship.spawnedByShipId && ship.evasiveManeuverAvailable);
    const emergency = hasEvasiveCharge && currentRisk.actualCollision;
    if (!emergency && order.mode === "focus-fire") return;

    const threat = currentRisk.risks[0]?.obstacle;
    if (!threat) return;
    const candidates = candidateDestinations(
      ship,
      order.destination,
      threat,
      sourceById as Map<string, MovementAvoidanceShip>,
      emergency,
      bounds,
    ).map((candidate) => ({
      ...candidate,
      risk: pathRisk(ship, candidate.destination, sourceById, intendedById, orders, emergency),
    })).filter((candidate) => candidate.risk.minimumClearance > EPSILON)
      .sort((left, right) => (
        right.risk.minimumClearance - left.risk.minimumClearance
        || left.deviation - right.deviation
        || right.travel - left.travel
        || left.index - right.index
      ));
    const selected = candidates[0];
    if (!selected) return;

    ship.position = [...selected.destination] as Vec3;
    order.destination = [...selected.destination] as Vec3;
    avoidedCount += 1;

    if (emergency) {
      ship.evasiveManeuverAvailable = false;
      order.mode = "normal";
      order.fire = false;
      evasiveShipIds.push(ship.id);
      outcomes.push(`${ship.name} burned its one-use evasive manoeuvre — collision avoided; attack forfeited.`);
    }
  });

  return { ships, orders, outcomes, avoidedCount, evasiveShipIds };
}

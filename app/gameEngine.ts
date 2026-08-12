import type { BattlefieldBounds } from "./battlefieldConfig.ts";
import { FLEET_BATTLEFIELD } from "./battlefieldConfig.ts";
import { applyCarrierLaunches, type CarrierLaunch } from "./carrierEngine.ts";
import { resolveCombatTurn, type Team, type Vec3 } from "./combatEngine.ts";
import { clampCollisionPosition, resolveMovementCollisions } from "./collisionEngine.ts";
import { applyAiMovementAvoidance } from "./movementAvoidanceEngine.ts";
import { movementLimitFor } from "./orderRules.ts";
import { rememberOrderedTargets } from "./targetMemory.ts";
import {
  cloneGameShips,
  cloneTurnOrders,
  type GameShip,
  type TurnOrder,
  type TurnOrders,
  type TurnResolution,
} from "./gameTypes.ts";
import { createLaunchedFighter } from "./shipFactory.ts";

const clamp = (value: number, minimum: number, maximum: number) =>
  Math.min(maximum, Math.max(minimum, value));

const normalizeAngle = (angle: number) => {
  let next = angle % 360;
  if (next > 180) next -= 360;
  if (next < -180) next += 360;
  return next;
};

export type ResolveTurnInput = {
  turn: number;
  ships: readonly GameShip[];
  orders: TurnOrders;
  bounds?: BattlefieldBounds;
  activationTeamOrder?: Team[];
};

export type FinalizedTurn = {
  ships: GameShip[];
  launches: CarrierLaunch[];
  outcomes: string[];
};

export type ResolvedAndFinalizedTurn = {
  resolution: TurnResolution;
  next: FinalizedTurn;
};

export function clampOrderDestination(
  ship: GameShip,
  destination: Vec3,
  order: Pick<TurnOrder, "mode">,
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
): Vec3 {
  const bounded = clampCollisionPosition(
    ship,
    destination,
    bounds.halfLength,
    bounds.halfHeight,
    bounds.halfWidth,
  );
  const dx = bounded[0] - ship.position[0];
  const dy = bounded[1] - ship.position[1];
  const dz = bounded[2] - ship.position[2];
  const distance = Math.hypot(dx, dy, dz);
  const movementLimit = movementLimitFor(ship.maxMove, order.mode);
  if (distance <= movementLimit || distance <= 1e-9) return bounded;
  const scale = movementLimit / distance;
  return [
    ship.position[0] + dx * scale,
    ship.position[1] + dy * scale,
    ship.position[2] + dz * scale,
  ];
}

/** Applies one submitted order without mutating the ship or order. */
export function endStateForOrder(
  ship: GameShip,
  order: TurnOrder,
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
): GameShip {
  const finalRotation: Vec3 = [
    clamp(ship.rotation[0] + clamp(order.pitch, -ship.maxPitch, ship.maxPitch), -85, 85),
    normalizeAngle(ship.rotation[1] + clamp(order.turn, -ship.maxTurn, ship.maxTurn)),
    normalizeAngle(ship.rotation[2] + clamp(order.roll, -ship.maxRoll, ship.maxRoll)),
  ];
  return {
    ...ship,
    position: clampOrderDestination(ship, order.destination, order, bounds),
    rotation: finalRotation,
  };
}

/**
 * Pure authoritative turn resolver. It calculates simultaneous movement,
 * collision avoidance and impacts, then ordered weapon activations.
 */
export function resolveTurn(input: ResolveTurnInput): TurnResolution {
  const bounds = input.bounds ?? FLEET_BATTLEFIELD;
  const ships = cloneGameShips(input.ships);
  const intendedShips = ships.map((ship) => {
    const order = input.orders[ship.id];
    return ship.hull > 0 && order ? endStateForOrder(ship, order, bounds) : ship;
  });
  const avoidance = applyAiMovementAvoidance(ships, intendedShips, cloneTurnOrders(input.orders), bounds);
  const collision = resolveMovementCollisions(
    ships,
    avoidance.ships,
    bounds.halfLength,
    bounds.halfHeight,
    bounds.halfWidth,
  );
  const combat = resolveCombatTurn(collision.ships, avoidance.orders, {
    ...(input.activationTeamOrder ? { teamOrder: [...input.activationTeamOrder] } : {}),
    preHitFaces: collision.hitFaces,
  });

  return {
    turn: input.turn,
    endShips: cloneGameShips(collision.ships),
    resolvedShips: cloneGameShips(combat.ships),
    orders: cloneTurnOrders(avoidance.orders),
    collisions: collision.collisions,
    shots: combat.shots,
    outcomes: [...avoidance.outcomes, ...collision.outcomes, ...combat.outcomes],
    destroyedIds: [...new Set([...collision.destroyedIds, ...combat.destroyedIds])],
  };
}

/** Applies target memory and end-of-turn carrier launches after playback. */
export function finalizeTurn(
  resolution: TurnResolution,
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
): FinalizedTurn {
  const rememberedShips = rememberOrderedTargets(resolution.resolvedShips, resolution.orders);
  const launched = applyCarrierLaunches(
    cloneGameShips(rememberedShips),
    (carrier, sequence, ability) => createLaunchedFighter(carrier, sequence, ability, bounds),
  );
  const launchOutcomes = launched.launches.map((launch) =>
    `${launch.carrierName} launched ${launch.fighterName} at the end of the turn.`,
  );
  return {
    ships: cloneGameShips(launched.ships),
    launches: launched.launches.map((launch) => ({ ...launch })),
    outcomes: [...launchOutcomes, ...resolution.outcomes],
  };
}

/** Convenience entry point for a future server that does not need animation pauses. */
export function resolveAndFinalizeTurn(input: ResolveTurnInput): ResolvedAndFinalizedTurn {
  const resolution = resolveTurn(input);
  return {
    resolution,
    next: finalizeTurn(resolution, input.bounds),
  };
}

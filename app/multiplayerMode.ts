import { FLEET_BATTLEFIELD, FLEET_TEAM_START_X } from "./battlefieldConfig.ts";
import type { Team, Vec3 } from "./combatEngine.ts";
import { resolveAndFinalizeTurn } from "./gameEngine.ts";
import {
  GAME_RULES_VERSION,
  GAME_STATE_SCHEMA_VERSION,
  cloneGameShips,
  cloneTurnOrders,
  createMatchState,
  type GameShip,
  type MatchState,
  type TurnOrder,
  type TurnOrders,
  type TurnResolution,
} from "./gameTypes.ts";
import { fireStateForMode, movementLimitFor, type FlightMode } from "./orderRules.ts";
import { SHIP_ARCHETYPES } from "./shipCatalog.ts";
import { createShipFromArchetype } from "./shipFactory.ts";

export const MULTIPLAYER_CODE_LENGTH = 6;
export const MULTIPLAYER_POLL_MS = 1200;
export const MULTIPLAYER_FLEET_POINTS = 10;

export type MultiplayerSide = "host" | "guest";
export type MultiplayerMatchStatus = "waiting" | "planning" | "resolving" | "complete";
export type MultiplayerWinner = MultiplayerSide | "draw" | null;

export type MultiplayerView = {
  code: string;
  side: MultiplayerSide;
  status: MultiplayerMatchStatus;
  turn: number;
  hostName: string;
  guestName: string | null;
  opponentJoined: boolean;
  ownSubmitted: boolean;
  opponentSubmitted: boolean;
  winner: MultiplayerWinner;
  state: MatchState;
  lastResolution: TurnResolution | null;
};

export type MultiplayerSession = {
  code: string;
  token: string;
  side: MultiplayerSide;
};

const LEFT_SLOTS: Vec3[] = [
  [-FLEET_TEAM_START_X, 0, -11],
  [-FLEET_TEAM_START_X + 2, -5, -3],
  [-FLEET_TEAM_START_X - 2, 5, 5],
  [-FLEET_TEAM_START_X + 1, 1, 12],
];

const RIGHT_SLOTS: Vec3[] = LEFT_SLOTS.map(([x, y, z]) => [-x, -y, -z]);

const FLEET_BLUEPRINT = [
  { archetypeId: "hammerhead", points: 3, label: "Vanguard" },
  { archetypeId: "archer", points: 3, label: "Longbow" },
  { archetypeId: "hulk", points: 3, label: "Bulwark" },
  { archetypeId: "fighter", points: 1, label: "Dart" },
] as const;

export function createMultiplayerFleet(): GameShip[] {
  const buildSide = (side: MultiplayerSide, team: "player" | "enemy", slots: Vec3[]) =>
    FLEET_BLUEPRINT.map((entry, index) => {
      const archetype = SHIP_ARCHETYPES[entry.archetypeId];
      const prefix = side === "host" ? "AZ" : "CR";
      return createShipFromArchetype(archetype, {
        id: `multiplayer-${side}-${entry.archetypeId}`,
        name: `${entry.label}-${prefix}`,
        callsign: `${prefix}-${String(index + 1).padStart(2, "0")}`,
        className: `${side === "host" ? "Azure" : "Crimson"} ${archetype.className.toLowerCase()}`,
        team,
        controller: "player",
        position: [...slots[index]] as Vec3,
        rotation: [index % 2 ? 4 : -3, side === "host" ? 90 : -90, index % 2 ? -5 : 5],
      });
    });

  return [...buildSide("host", "player", LEFT_SLOTS), ...buildSide("guest", "enemy", RIGHT_SLOTS)];
}

export function createMultiplayerMatchState(code: string): MatchState {
  return createMatchState({
    matchId: code,
    mode: "multiplayer",
    turn: 1,
    phase: "planning",
    ships: createMultiplayerFleet(),
  });
}

export function multiplayerFleetPointTotal() {
  return FLEET_BLUEPRINT.reduce((sum, entry) => sum + entry.points, 0);
}

export function canonicalTeamForSide(side: MultiplayerSide): "player" | "enemy" {
  return side === "host" ? "player" : "enemy";
}

export function sideForCanonicalTeam(team: Team): MultiplayerSide | null {
  if (team === "player") return "host";
  if (team === "enemy") return "guest";
  return null;
}

const perspectiveTeam = (team: Team, side: MultiplayerSide): Team => {
  if (side === "host" || team === "ally") return team;
  return team === "player" ? "enemy" : "player";
};

export function shipsForMultiplayerPerspective(ships: readonly GameShip[], side: MultiplayerSide): GameShip[] {
  return cloneGameShips(ships).map((ship) => {
    const team = perspectiveTeam(ship.team, side);
    return {
      ...ship,
      team,
      controller: team === "enemy" ? "ai" : "player",
    };
  });
}

export function stateForMultiplayerPerspective(state: MatchState, side: MultiplayerSide): MatchState {
  return {
    ...state,
    ships: shipsForMultiplayerPerspective(state.ships, side),
  };
}

export function resolutionForMultiplayerPerspective(
  resolution: TurnResolution | null,
  side: MultiplayerSide,
): TurnResolution | null {
  if (!resolution) return null;
  return {
    ...resolution,
    endShips: shipsForMultiplayerPerspective(resolution.endShips, side),
    resolvedShips: shipsForMultiplayerPerspective(resolution.resolvedShips, side),
    orders: cloneTurnOrders(resolution.orders),
    collisions: resolution.collisions.map((collision) => ({ ...collision })),
    shots: resolution.shots.map((shot) => ({ ...shot })),
    outcomes: [...resolution.outcomes],
    destroyedIds: [...resolution.destroyedIds],
  };
}

const isFiniteVec3 = (value: unknown): value is Vec3 =>
  Array.isArray(value) && value.length === 3 && value.every((entry) => typeof entry === "number" && Number.isFinite(entry));

const VALID_MODES = new Set<FlightMode>(["normal", "focus-fire", "extra-move"]);

/** Validates one side's complete hidden order envelope before it reaches D1. */
export function validateMultiplayerOrders(
  state: MatchState,
  side: MultiplayerSide,
  submitted: unknown,
): TurnOrders {
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    throw new Error("Orders must be an object keyed by ship ID.");
  }
  const source = submitted as Record<string, unknown>;
  const ownTeam = canonicalTeamForSide(side);
  const livingOwnShips = state.ships.filter((ship) => ship.team === ownTeam && ship.hull > 0);
  const livingHostiles = new Set(state.ships.filter((ship) => ship.team !== ownTeam && ship.hull > 0).map((ship) => ship.id));
  const ownIds = new Set(livingOwnShips.map((ship) => ship.id));
  if (Object.keys(source).some((shipId) => !ownIds.has(shipId))) {
    throw new Error("The order envelope contains a ship outside this fleet.");
  }

  const orders: TurnOrders = {};
  for (const ship of livingOwnShips) {
    const raw = source[ship.id];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Missing orders for ${ship.callsign}.`);
    }
    const order = raw as Partial<TurnOrder>;
    if (!isFiniteVec3(order.destination)) throw new Error(`Invalid destination for ${ship.callsign}.`);
    if (![order.turn, order.pitch, order.roll].every((value) => typeof value === "number" && Number.isFinite(value))) {
      throw new Error(`Invalid orientation for ${ship.callsign}.`);
    }
    if (!order.mode || !VALID_MODES.has(order.mode)) throw new Error(`Invalid flight mode for ${ship.callsign}.`);
    if (typeof order.targetId !== "string" || !livingHostiles.has(order.targetId)) {
      throw new Error(`Invalid target for ${ship.callsign}.`);
    }
    const distance = Math.hypot(
      order.destination[0] - ship.position[0],
      order.destination[1] - ship.position[1],
      order.destination[2] - ship.position[2],
    );
    if (distance > movementLimitFor(ship.maxMove, order.mode) + 0.02) {
      throw new Error(`${ship.callsign} exceeds its movement allowance.`);
    }
    orders[ship.id] = {
      destination: [...order.destination] as Vec3,
      turn: order.turn as number,
      pitch: order.pitch as number,
      roll: order.roll as number,
      targetId: order.targetId,
      fire: fireStateForMode(order.mode, order.fire !== false),
      mode: order.mode,
    };
  }
  return orders;
}

export function resolveMultiplayerTurn(state: MatchState, hostOrders: TurnOrders, guestOrders: TurnOrders) {
  if (state.schemaVersion !== GAME_STATE_SCHEMA_VERSION || state.rulesVersion !== GAME_RULES_VERSION) {
    throw new Error("This match uses an incompatible game rules version.");
  }
  const activationTeamOrder: Team[] = state.turn % 2 === 1
    ? ["player", "enemy", "ally"]
    : ["enemy", "player", "ally"];
  const result = resolveAndFinalizeTurn({
    turn: state.turn,
    ships: state.ships,
    orders: { ...cloneTurnOrders(hostOrders), ...cloneTurnOrders(guestOrders) },
    bounds: FLEET_BATTLEFIELD,
    activationTeamOrder,
  });
  const hostAlive = result.next.ships.some((ship) => ship.team === "player" && ship.hull > 0);
  const guestAlive = result.next.ships.some((ship) => ship.team === "enemy" && ship.hull > 0);
  const winner: MultiplayerWinner = hostAlive && guestAlive ? null : hostAlive ? "host" : guestAlive ? "guest" : "draw";
  const nextState: MatchState = {
    ...state,
    turn: state.turn + 1,
    phase: winner === "draw" ? "draw" : winner ? (winner === "host" ? "victory" : "defeat") : "planning",
    ships: cloneGameShips(result.next.ships),
  };
  return { resolution: result.resolution, nextState, winner };
}

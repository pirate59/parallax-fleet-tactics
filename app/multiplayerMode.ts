import {
  FLEET_BATTLEFIELD,
  multiplayerBattlefieldFor,
  type BattlefieldBounds,
  type MultiplayerMapSize,
} from "./battlefieldConfig.ts";
import {
  AI_DOCTRINE_ORDER,
  carrierWingTargetAssignments,
  defaultAiMissionFor,
  generateAiCommandDecision,
  type AiDoctrine,
} from "./aiCommandEngine.ts";
import { AI_MISSION_ORDER, type AiMissionOrder } from "./aiTactics.ts";
import type { Team, Vec3 } from "./combatEngine.ts";
import type { ShipController } from "./fleetControl.ts";
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
export const MULTIPLAYER_FLEET_SIZE = 5;
export const MULTIPLAYER_TURN_MS = 120_000;
export const MULTIPLAYER_TIMEOUT_TURN_MS = 30_000;
export const MULTIPLAYER_PRESENCE_GRACE_MS = 30_000;

export type MultiplayerSide = "host" | "guest";
export type MultiplayerMatchStatus = "waiting" | "planning" | "resolving" | "complete";
export type MultiplayerWinner = MultiplayerSide | "draw" | null;
export type MultiplayerCompletionReason = "combat" | "concession" | null;
export type MultiplayerPresenceState = "connected" | "checking" | "disconnected";
export type MultiplayerTurnTimer = 60 | 120 | 180;
export type MultiplayerImpactRule = "off" | "standard" | "brutal";
export type MultiplayerWreckRule = "clear" | "persistent";
export type MultiplayerFleetRule = "custom" | "mirrored";
export type MultiplayerMatchSettings = {
  turnTimerSeconds: MultiplayerTurnTimer;
  mapSize: MultiplayerMapSize;
  impactRule: MultiplayerImpactRule;
  wreckRule: MultiplayerWreckRule;
  fleetRule: MultiplayerFleetRule;
};
export type MultiplayerLargeHull = "behemoth" | "carrier";
export type MultiplayerCruiserHull = "hammerhead" | "archer" | "hulk";
export type MultiplayerFleetSelection = {
  large: MultiplayerLargeHull;
  cruisers: [MultiplayerCruiserHull, MultiplayerCruiserHull, MultiplayerCruiserHull];
  fighter: "fighter";
};

export const MULTIPLAYER_LARGE_HULLS: MultiplayerLargeHull[] = ["behemoth", "carrier"];
export const MULTIPLAYER_CRUISER_HULLS: MultiplayerCruiserHull[] = ["hammerhead", "archer", "hulk"];
export const DEFAULT_MULTIPLAYER_FLEET: MultiplayerFleetSelection = {
  large: "behemoth",
  cruisers: ["hammerhead", "archer", "hulk"],
  fighter: "fighter",
};

export const DEFAULT_MULTIPLAYER_SETTINGS: MultiplayerMatchSettings = {
  turnTimerSeconds: 120,
  mapSize: "standard",
  impactRule: "standard",
  wreckRule: "persistent",
  fleetRule: "custom",
};

export type MultiplayerShipControl = {
  controller: ShipController;
  aiDoctrine: AiDoctrine;
  aiMission: AiMissionOrder;
};

export type MultiplayerControlSettings = Record<string, MultiplayerShipControl>;

export type MultiplayerView = {
  code: string;
  side: MultiplayerSide;
  status: MultiplayerMatchStatus;
  turn: number;
  hostName: string;
  guestName: string | null;
  opponentJoined: boolean;
  opponentLastSeenAt: number | null;
  settings: MultiplayerMatchSettings;
  ownSubmitted: boolean;
  opponentSubmitted: boolean;
  winner: MultiplayerWinner;
  deadlineAt: number | null;
  lastTurnTimedOut: boolean;
  completionReason: MultiplayerCompletionReason;
  concededBy: MultiplayerSide | null;
  state: MatchState;
  lastResolution: TurnResolution | null;
};

export type MultiplayerSession = {
  code: string;
  token: string;
  side: MultiplayerSide;
};

const sideSlots = (side: MultiplayerSide, bounds: BattlefieldBounds): Vec3[] => {
  const startX = bounds.length / 6;
  const left: Vec3[] = [
    [-startX, 0, -11],
    [-startX + 2, -5, -3],
    [-startX - 2, 5, 5],
    [-startX + 1, 1, 12],
    [-startX + 4, -2, 18],
  ];
  return side === "host" ? left : left.map(([x, y, z]) => [-x, -y, -z]);
};

export function validateMultiplayerMatchSettings(value: unknown): MultiplayerMatchSettings {
  if (value === undefined) return { ...DEFAULT_MULTIPLAYER_SETTINGS };
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose valid host match rules.");
  const source = value as Partial<MultiplayerMatchSettings>;
  if (source.turnTimerSeconds !== 60 && source.turnTimerSeconds !== 120 && source.turnTimerSeconds !== 180) throw new Error("Choose a valid turn timer.");
  if (source.mapSize !== "close" && source.mapSize !== "standard" && source.mapSize !== "wide") throw new Error("Choose a valid map size.");
  if (source.impactRule !== "off" && source.impactRule !== "standard" && source.impactRule !== "brutal") throw new Error("Choose a valid collision rule.");
  if (source.wreckRule !== "clear" && source.wreckRule !== "persistent") throw new Error("Choose a valid wreck rule.");
  if (source.fleetRule !== "custom" && source.fleetRule !== "mirrored") throw new Error("Choose a valid fleet rule.");
  return {
    turnTimerSeconds: source.turnTimerSeconds,
    mapSize: source.mapSize,
    impactRule: source.impactRule,
    wreckRule: source.wreckRule,
    fleetRule: source.fleetRule,
  };
}

export function validateMultiplayerFleetSelection(value: unknown): MultiplayerFleetSelection {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Choose a multiplayer fleet before continuing.");
  const source = value as Partial<MultiplayerFleetSelection>;
  if (!source.large || !MULTIPLAYER_LARGE_HULLS.includes(source.large)) throw new Error("Choose one valid Large ship.");
  if (!Array.isArray(source.cruisers) || source.cruisers.length !== 3 || source.cruisers.some((hull) => !MULTIPLAYER_CRUISER_HULLS.includes(hull))) {
    throw new Error("Choose exactly three valid Cruiser ships.");
  }
  if (source.fighter !== "fighter") throw new Error("The fleet must include one Fighter.");
  return {
    large: source.large,
    cruisers: [...source.cruisers] as MultiplayerFleetSelection["cruisers"],
    fighter: "fighter",
  };
}

const fleetBlueprint = (selection: MultiplayerFleetSelection) => [
  selection.large,
  ...selection.cruisers,
  selection.fighter,
];

function createMultiplayerSideFleet(side: MultiplayerSide, selection: MultiplayerFleetSelection, bounds: BattlefieldBounds): GameShip[] {
  const team = canonicalTeamForSide(side);
  const slots = sideSlots(side, bounds);
  const counts = new Map<string, number>();
  return fleetBlueprint(selection).map((archetypeId, index) => {
      const archetype = SHIP_ARCHETYPES[archetypeId];
      const prefix = side === "host" ? "AZ" : "CR";
      const sequence = (counts.get(archetypeId) ?? 0) + 1;
      counts.set(archetypeId, sequence);
      const duplicateSuffix = sequence > 1 ? `-${sequence}` : "";
      return createShipFromArchetype(archetype, {
        id: `multiplayer-${side}-${archetypeId}${duplicateSuffix}`,
        name: `${archetype.name}-${prefix}${duplicateSuffix}`,
        callsign: `${prefix}-${String(index + 1).padStart(2, "0")}`,
        className: `${side === "host" ? "Azure" : "Crimson"} ${archetype.className.toLowerCase()}`,
        team,
        controller: "player",
        position: [...slots[index]] as Vec3,
        rotation: [index % 2 ? 4 : -3, side === "host" ? 90 : -90, index % 2 ? -5 : 5],
      });
    });
}

export function createMultiplayerFleet(
  hostSelection: MultiplayerFleetSelection = DEFAULT_MULTIPLAYER_FLEET,
  guestSelection: MultiplayerFleetSelection = DEFAULT_MULTIPLAYER_FLEET,
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
): GameShip[] {
  return [
    ...createMultiplayerSideFleet("host", validateMultiplayerFleetSelection(hostSelection), bounds),
    ...createMultiplayerSideFleet("guest", validateMultiplayerFleetSelection(guestSelection), bounds),
  ];
}

export function createMultiplayerMatchState(
  code: string,
  hostSelection: MultiplayerFleetSelection = DEFAULT_MULTIPLAYER_FLEET,
  guestSelection: MultiplayerFleetSelection = DEFAULT_MULTIPLAYER_FLEET,
  settings: MultiplayerMatchSettings = DEFAULT_MULTIPLAYER_SETTINGS,
): MatchState {
  const validatedSettings = validateMultiplayerMatchSettings(settings);
  return createMatchState({
    matchId: code,
    mode: "multiplayer",
    turn: 1,
    phase: "planning",
    ships: createMultiplayerFleet(hostSelection, guestSelection, multiplayerBattlefieldFor(validatedSettings.mapSize)),
  });
}

export function replaceMultiplayerSideFleet(
  state: MatchState,
  side: MultiplayerSide,
  selection: MultiplayerFleetSelection,
  bounds: BattlefieldBounds = FLEET_BATTLEFIELD,
): MatchState {
  const team = canonicalTeamForSide(side);
  return {
    ...state,
    ships: [
      ...state.ships.filter((ship) => ship.team !== team),
      ...createMultiplayerSideFleet(side, validateMultiplayerFleetSelection(selection), bounds),
    ],
  };
}

export function multiplayerFleetSelectionForSide(state: MatchState, side: MultiplayerSide): MultiplayerFleetSelection {
  const team = canonicalTeamForSide(side);
  const fleet = state.ships.filter((ship) => ship.team === team && !ship.spawnedByShipId);
  return validateMultiplayerFleetSelection({
    large: fleet.find((ship) => ship.sizeClass === "large")?.archetypeId,
    cruisers: fleet.filter((ship) => ship.sizeClass === "cruiser").map((ship) => ship.archetypeId),
    fighter: fleet.find((ship) => ship.archetypeId === "fighter")?.archetypeId,
  });
}

export function canonicalTeamForSide(side: MultiplayerSide): "player" | "enemy" {
  return side === "host" ? "player" : "enemy";
}

export function multiplayerTurnDuration(previousTurnTimedOut: boolean, baseTurnSeconds: MultiplayerTurnTimer = 120) {
  return previousTurnTimedOut ? MULTIPLAYER_TIMEOUT_TURN_MS : baseTurnSeconds * 1000;
}

export function multiplayerOpponentPresence(
  opponentJoined: boolean,
  opponentLastSeenAt: number | null,
  now: number,
): MultiplayerPresenceState {
  if (!opponentJoined || opponentLastSeenAt === null) return "checking";
  return now - opponentLastSeenAt <= MULTIPLAYER_PRESENCE_GRACE_MS ? "connected" : "disconnected";
}

export function multiplayerWinnerAfterConcession(side: MultiplayerSide): MultiplayerSide {
  return side === "host" ? "guest" : "host";
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
    const shipSide = sideForCanonicalTeam(ship.team);
    return {
      ...ship,
      team,
      controller: shipSide === side ? ship.controller : "ai",
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
const VALID_DOCTRINES = new Set<AiDoctrine>(AI_DOCTRINE_ORDER);
const VALID_MISSIONS = new Set<AiMissionOrder>(AI_MISSION_ORDER);

export function multiplayerControlsForSide(state: MatchState, side: MultiplayerSide): MultiplayerControlSettings {
  const ownTeam = canonicalTeamForSide(side);
  return Object.fromEntries(
    state.ships
      .filter((ship) => ship.team === ownTeam && ship.hull > 0)
      .map((ship) => [ship.id, {
        controller: ship.controller,
        aiDoctrine: ship.aiDoctrine ?? "standard",
        aiMission: defaultAiMissionFor(ship),
      }]),
  );
}

/** Accepts control choices only for living ships owned by the authenticated commander. */
export function validateMultiplayerControls(
  state: MatchState,
  side: MultiplayerSide,
  submitted: unknown,
): MultiplayerControlSettings {
  if (submitted === undefined) return multiplayerControlsForSide(state, side);
  if (!submitted || typeof submitted !== "object" || Array.isArray(submitted)) {
    throw new Error("Ship control settings must be keyed by ship ID.");
  }
  const source = submitted as Record<string, unknown>;
  const ownTeam = canonicalTeamForSide(side);
  const livingOwnShips = state.ships.filter((ship) => ship.team === ownTeam && ship.hull > 0);
  const ownIds = new Set(livingOwnShips.map((ship) => ship.id));
  if (Object.keys(source).some((shipId) => !ownIds.has(shipId))) {
    throw new Error("The control settings contain a ship outside this fleet.");
  }

  const controls: MultiplayerControlSettings = {};
  for (const ship of livingOwnShips) {
    const raw = source[ship.id];
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
      throw new Error(`Missing control settings for ${ship.callsign}.`);
    }
    const control = raw as Partial<MultiplayerShipControl>;
    if (control.controller !== "player" && control.controller !== "ai") {
      throw new Error(`Invalid control mode for ${ship.callsign}.`);
    }
    if (!control.aiDoctrine || !VALID_DOCTRINES.has(control.aiDoctrine)) {
      throw new Error(`Invalid AI doctrine for ${ship.callsign}.`);
    }
    if (!control.aiMission || !VALID_MISSIONS.has(control.aiMission)) {
      throw new Error(`Invalid AI mission for ${ship.callsign}.`);
    }
    controls[ship.id] = {
      controller: control.controller,
      aiDoctrine: control.aiDoctrine,
      aiMission: control.aiMission,
    };
  }
  return controls;
}

export function applyMultiplayerControls(
  state: MatchState,
  settings: MultiplayerControlSettings,
): MatchState {
  return {
    ...state,
    ships: cloneGameShips(state.ships).map((ship) => {
      const control = settings[ship.id];
      return control ? { ...ship, ...control } : ship;
    }),
  };
}

/** Generates deterministic AI orders when a commander's turn deadline expires. */
export function multiplayerTimeoutOrders(
  state: MatchState,
  side: MultiplayerSide,
  settings: MultiplayerMatchSettings = DEFAULT_MULTIPLAYER_SETTINGS,
): TurnOrders {
  const bounds = multiplayerBattlefieldFor(settings.mapSize);
  const ownTeam = canonicalTeamForSide(side);
  const orders: TurnOrders = {};
  const wingTargets = carrierWingTargetAssignments(state.ships);
  state.ships
    .filter((ship) => ship.team === ownTeam && ship.hull > 0)
    .forEach((ship) => {
      const reservedDestinations = Object.fromEntries(
        Object.entries(orders).map(([id, order]) => [id, order.destination]),
      );
      const decision = generateAiCommandDecision(
        ship,
        state.ships,
        ship.aiDoctrine ?? "standard",
        bounds.halfLength,
        bounds.halfHeight,
        {
          forcedTargetId: ship.spawnedByShipId && defaultAiMissionFor(ship) === "assault"
            ? wingTargets[ship.id]
            : undefined,
          reservedDestinations,
          battlefieldWidthHalf: bounds.halfWidth,
        },
      );
      if (decision) orders[ship.id] = decision.order;
    });
  return orders;
}

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

export function resolveMultiplayerTurn(
  state: MatchState,
  hostOrders: TurnOrders,
  guestOrders: TurnOrders,
  settings: MultiplayerMatchSettings = DEFAULT_MULTIPLAYER_SETTINGS,
) {
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
    bounds: multiplayerBattlefieldFor(settings.mapSize),
    activationTeamOrder,
    collisionDamageMultiplier: settings.impactRule === "off" ? 0 : settings.impactRule === "brutal" ? 1.5 : 1,
    wrecksPersist: settings.wreckRule === "persistent",
  });
  const nextShips = settings.wreckRule === "persistent"
    ? result.next.ships
    : result.next.ships.filter((ship) => ship.hull > 0);
  const hostAlive = nextShips.some((ship) => ship.team === "player" && ship.hull > 0);
  const guestAlive = nextShips.some((ship) => ship.team === "enemy" && ship.hull > 0);
  const winner: MultiplayerWinner = hostAlive && guestAlive ? null : hostAlive ? "host" : guestAlive ? "guest" : "draw";
  const nextState: MatchState = {
    ...state,
    turn: state.turn + 1,
    phase: winner === "draw" ? "draw" : winner ? (winner === "host" ? "victory" : "defeat") : "planning",
    ships: cloneGameShips(nextShips),
  };
  return { resolution: result.resolution, nextState, winner };
}

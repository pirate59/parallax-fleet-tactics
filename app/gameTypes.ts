import type { AiDoctrine } from "./aiCommandEngine.ts";
import type { AiTacticalProfile } from "./aiTactics.ts";
import type { CombatShotEvent, Shields, Team, Vec3 } from "./combatEngine.ts";
import type { MovementCollisionEvent } from "./collisionEngine.ts";
import type { ShipController } from "./fleetControl.ts";
import type { FlightMode } from "./orderRules.ts";
import type { ShipModelId, ShipModelVariant } from "./shipModels.ts";
import type { ShipPassiveTrait, ShipTurnEndAbility, WeaponMount } from "./shipCatalog.ts";
import type { ShipSizeClass } from "./shipSize.ts";

export const GAME_STATE_SCHEMA_VERSION = 1;
export const GAME_RULES_VERSION = 1;

export type GameMode = "story" | "skirmish" | "endless" | "hardcore" | "fishtank";
export type GamePhase = "planning" | "executing" | "victory" | "defeat";

/** Complete serializable state for one deployed ship. */
export type GameShip = {
  id: string;
  name: string;
  callsign: string;
  className: string;
  team: Team;
  controller: ShipController;
  aiDoctrine?: AiDoctrine;
  color: string;
  position: Vec3;
  rotation: Vec3;
  shields: Shields;
  maxShields: Shields;
  hull: number;
  maxHull: number;
  maxMove: number;
  maxTurn: number;
  maxPitch: number;
  maxRoll: number;
  weaponRange: number;
  weaponDamage: number;
  archetypeId: string;
  modelId: ShipModelId;
  modelVariants: readonly ShipModelVariant[];
  sizeClass: ShipSizeClass;
  durabilityMultiplier: number;
  modelScale: number;
  weaponMounts: WeaponMount[];
  passiveTraits?: ShipPassiveTrait[];
  aiTactics: AiTacticalProfile;
  turnEndAbility?: ShipTurnEndAbility;
  fighterReserveRemaining?: number;
  spawnedByShipId?: string;
  evasiveManeuverAvailable?: boolean;
  lastTargetId?: string;
};

/** Concrete order submitted for a single ship for one turn. */
export type TurnOrder = {
  destination: Vec3;
  turn: number;
  pitch: number;
  roll: number;
  targetId: string;
  fire: boolean;
  mode: FlightMode;
  /** Set only by AI that has deliberately chosen an impact attack. */
  ramTargetId?: string;
};

export type TurnOrders = Record<string, TurnOrder>;

/** Serializable event record used to replay a resolved turn. */
export type TurnResolution = {
  turn: number;
  endShips: GameShip[];
  resolvedShips: GameShip[];
  orders: TurnOrders;
  collisions: MovementCollisionEvent[];
  shots: CombatShotEvent[];
  outcomes: string[];
  destroyedIds: string[];
};

/** Future server-owned match shape; currently also usable by local modes. */
export type MatchState = {
  schemaVersion: typeof GAME_STATE_SCHEMA_VERSION;
  rulesVersion: typeof GAME_RULES_VERSION;
  matchId: string;
  mode: GameMode;
  turn: number;
  phase: GamePhase;
  ships: GameShip[];
};

export function cloneGameShips(ships: readonly GameShip[]): GameShip[] {
  return ships.map((ship) => {
    const {
      aiDoctrine,
      passiveTraits,
      turnEndAbility,
      fighterReserveRemaining,
      spawnedByShipId,
      evasiveManeuverAvailable,
      lastTargetId,
      ...required
    } = ship;
    return {
      ...required,
      shields: { ...ship.shields },
      maxShields: { ...ship.maxShields },
      weaponMounts: ship.weaponMounts.map((mount) => ({ ...mount })),
      modelVariants: [...ship.modelVariants],
      aiTactics: { ...ship.aiTactics },
      position: [...ship.position] as Vec3,
      rotation: [...ship.rotation] as Vec3,
      ...(aiDoctrine !== undefined ? { aiDoctrine } : {}),
      ...(passiveTraits !== undefined
        ? { passiveTraits: passiveTraits.map((trait) => ({ ...trait })) }
        : {}),
      ...(turnEndAbility !== undefined
        ? {
            turnEndAbility: {
              ...turnEndAbility,
              launchOffsets: turnEndAbility.launchOffsets.map((offset) => [...offset] as Vec3),
            },
          }
        : {}),
      ...(fighterReserveRemaining !== undefined ? { fighterReserveRemaining } : {}),
      ...(spawnedByShipId !== undefined ? { spawnedByShipId } : {}),
      ...(evasiveManeuverAvailable !== undefined ? { evasiveManeuverAvailable } : {}),
      ...(lastTargetId !== undefined ? { lastTargetId } : {}),
    };
  });
}

export function cloneTurnOrders(orders: TurnOrders): TurnOrders {
  return Object.fromEntries(Object.entries(orders).map(([shipId, order]) => {
    const { ramTargetId, ...required } = order;
    return [shipId, {
      ...required,
      destination: [...order.destination] as Vec3,
      ...(ramTargetId !== undefined ? { ramTargetId } : {}),
    }];
  }));
}

export function createMatchState(input: Omit<MatchState, "schemaVersion" | "rulesVersion" | "ships"> & { ships: readonly GameShip[] }): MatchState {
  return {
    ...input,
    schemaVersion: GAME_STATE_SCHEMA_VERSION,
    rulesVersion: GAME_RULES_VERSION,
    ships: cloneGameShips(input.ships),
  };
}

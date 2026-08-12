import type { AiDoctrine } from "./aiCommandEngine.ts";
import type { Team } from "./combatEngine.ts";

export type ShipController = "player" | "ai";

export type FleetControlShip = {
  id: string;
  team: Team;
  controller: ShipController;
  aiDoctrine?: AiDoctrine;
  hull: number;
};

export const AI_RECRUIT_CONTROL = {
  controller: "ai",
  aiDoctrine: "standard",
} as const;

export function isDirectCommandShip(ship: FleetControlShip) {
  return ship.controller === "player";
}

export function isFriendlyFleetShip(ship: FleetControlShip) {
  return ship.team !== "enemy";
}

/** Story's stolen flagship remains a permanent player command ship. */
export function canToggleFriendlyControl(ship: FleetControlShip, lockedFlagshipId?: string) {
  return ship.hull > 0
    && isFriendlyFleetShip(ship)
    && ship.id !== lockedFlagshipId;
}

export function retainStoryPlayerFleet<T extends FleetControlShip>(ships: T[]) {
  return ships.filter((ship) => ship.team === "player");
}

export function isFleetCommitReady<T extends FleetControlShip>(
  ships: T[],
  stagedIds: ReadonlySet<string>,
  isOrderValid: (ship: T) => boolean,
) {
  const livingFriendlyFleet = ships.filter((ship) => isFriendlyFleetShip(ship) && ship.hull > 0);
  if (livingFriendlyFleet.length === 0) return false;
  return livingFriendlyFleet
    .filter((ship) => isDirectCommandShip(ship))
    .every((ship) => stagedIds.has(ship.id) && isOrderValid(ship));
}

import type { Team } from "./combatEngine.ts";

export type TargetMemoryShip = {
  id: string;
  team: Team;
  hull: number;
  lastTargetId?: string;
};

type TargetOrder = {
  targetId: string;
};

function isHostileTo(ship: TargetMemoryShip, candidate: TargetMemoryShip) {
  return ship.team === "enemy" ? candidate.team !== "enemy" : candidate.team === "enemy";
}

export function liveHostileTargets<T extends TargetMemoryShip>(ship: T, ships: readonly T[]) {
  return ships.filter((candidate) => candidate.id !== ship.id && candidate.hull > 0 && isHostileTo(ship, candidate));
}

export function preferredTargetId<T extends TargetMemoryShip>(ship: T, ships: readonly T[]) {
  const candidates = liveHostileTargets(ship, ships);
  const remembered = candidates.find((candidate) => candidate.id === ship.lastTargetId);
  return remembered?.id ?? candidates[0]?.id ?? "";
}

export function rememberOrderedTargets<T extends TargetMemoryShip>(
  ships: readonly T[],
  orders: Record<string, TargetOrder | undefined>,
) {
  return ships.map((ship) => {
    const targetId = orders[ship.id]?.targetId;
    return targetId ? { ...ship, lastTargetId: targetId } : ship;
  });
}

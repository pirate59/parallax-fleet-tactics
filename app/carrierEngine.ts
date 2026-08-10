import type { ShipTurnEndAbility } from "./shipCatalog.ts";

export type CarrierCapableShip = {
  id: string;
  name: string;
  hull: number;
  spawnedByShipId?: string;
  turnEndAbility?: ShipTurnEndAbility;
};

export type CarrierLaunch = {
  carrierId: string;
  carrierName: string;
  fighterId: string;
  fighterName: string;
};

/** Applies end-of-turn fighter launches without mutating the resolved fleet. */
export function applyCarrierLaunches<T extends CarrierCapableShip>(
  ships: readonly T[],
  createFighter: (carrier: T, sequence: number, ability: ShipTurnEndAbility) => T,
) {
  const nextShips = [...ships];
  const launches: CarrierLaunch[] = [];

  ships.forEach((carrier) => {
    const ability = carrier.turnEndAbility;
    if (carrier.hull <= 0 || ability?.kind !== "launch-fighter") return;

    const existingFighters = nextShips.filter((ship) => ship.spawnedByShipId === carrier.id);
    const activeFighters = existingFighters.filter((ship) => ship.hull > 0);
    if (activeFighters.length >= ability.maxActive) return;

    const fighter = createFighter(carrier, existingFighters.length + 1, ability);
    nextShips.push(fighter);
    launches.push({
      carrierId: carrier.id,
      carrierName: carrier.name,
      fighterId: fighter.id,
      fighterName: fighter.name,
    });
  });

  return { ships: nextShips, launches };
}

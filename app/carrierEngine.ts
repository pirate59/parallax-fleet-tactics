import type { ShipTurnEndAbility } from "./shipCatalog.ts";
import { SHIELD_FACES, type Shields } from "./combatEngine.ts";

export type CarrierCapableShip = {
  id: string;
  name: string;
  hull: number;
  fighterReserveRemaining?: number;
  spawnedByShipId?: string;
  turnEndAbility?: ShipTurnEndAbility;
};

export type CarrierLaunch = {
  carrierId: string;
  carrierName: string;
  fighterId: string;
  fighterName: string;
};

export const isDisposableCarrierFighter = (ship: CarrierCapableShip) => Boolean(ship.spawnedByShipId);

type CarrierFighterCombatState = {
  hull: number;
  maxHull: number;
  shields: Shields;
  maxShields: Shields;
  weaponDamage: number;
};

/** Applies the carrier bay's glass-cannon profile without changing the base Fighter hull. */
export function applyCarrierFighterCombatProfile<T extends CarrierFighterCombatState>(
  fighter: T,
  ability: ShipTurnEndAbility,
): T {
  const maxHull = Math.max(1, Math.round(fighter.maxHull * ability.fighterDurabilityMultiplier));
  const maxShields = SHIELD_FACES.reduce((scaled, face) => {
    scaled[face] = Math.max(1, Math.round(fighter.maxShields[face] * ability.fighterDurabilityMultiplier));
    return scaled;
  }, {} as Shields);
  return {
    ...fighter,
    hull: maxHull,
    maxHull,
    shields: { ...maxShields },
    maxShields,
    weaponDamage: Math.max(1, Math.round(fighter.weaponDamage * ability.fighterDamageMultiplier)),
  };
}

/** Applies end-of-turn fighter launches without mutating the resolved fleet. */
export function applyCarrierLaunches<T extends CarrierCapableShip>(
  ships: readonly T[],
  createFighter: (carrier: T, sequence: number, ability: ShipTurnEndAbility) => T,
) {
  const nextShips = ships.filter((ship) => !isDisposableCarrierFighter(ship) || ship.hull > 0);
  const launches: CarrierLaunch[] = [];

  ships.forEach((carrier) => {
    const ability = carrier.turnEndAbility;
    if (carrier.hull <= 0 || ability?.kind !== "launch-fighter") return;
    const reserveRemaining = carrier.fighterReserveRemaining ?? ability.fighterReserve;
    if (reserveRemaining <= 0) return;

    const allFighters = ships.filter((ship) => ship.spawnedByShipId === carrier.id);
    const existingFighters = nextShips.filter((ship) => ship.spawnedByShipId === carrier.id);
    const activeFighters = existingFighters.filter((ship) => ship.hull > 0);
    if (activeFighters.length >= ability.maxActive) return;

    const highestSequence = allFighters.reduce((highest, fighter) => {
      const match = fighter.id.match(/-fighter-(\d+)$/);
      return Math.max(highest, match ? Number(match[1]) : 0);
    }, 0);
    const fighter = createFighter(carrier, Math.max(highestSequence, existingFighters.length) + 1, ability);
    const carrierIndex = nextShips.findIndex((ship) => ship.id === carrier.id);
    if (carrierIndex >= 0) {
      nextShips[carrierIndex] = {
        ...nextShips[carrierIndex],
        fighterReserveRemaining: reserveRemaining - 1,
      };
    }
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
